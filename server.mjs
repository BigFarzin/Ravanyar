import "dotenv/config";
import { createServer } from "node:http";
import { readFile, stat, mkdir, unlink, writeFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  randomUUID,
  createHash,
} from "node:crypto";
import pg from "pg";
import { activatePayment } from "./payment-service.mjs";

const PORT = Number(process.env.PORT || 3000);
const ROOT = join(process.cwd(), "public");
const UPLOAD_ROOT = join(process.cwd(), "storage", "products");
const { Pool } = pg;
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://postgres:farzin.n343434@localhost:5432/payesh",
});
const sessions = new Map();
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 8 * 60 * 60 * 1000);
const LOGIN_WINDOW_MS = 60 * 1000;
const LOGIN_MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS || 8);
const rateLimits = new Map();
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB || 500) * 1024 * 1024;
const MAX_JSON_BYTES = Number(process.env.MAX_JSON_MB || 2) * 1024 * 1024;
const q = (text, values = []) => pool.query(text, values);
// Prices in the application database/UI are toman; Bale's payment API uses IRR.
function tomanToRial(amount) {
  const rial = Number(amount) * 10;
  if (!Number.isSafeInteger(rial) || rial < 0)
    throw Object.assign(new Error("مبلغ پرداخت نامعتبر است."), { status: 400 });
  return rial;
}
const BALE_API = process.env.BALE_BOT_TOKEN
  ? `https://tapi.bale.ai/bot${process.env.BALE_BOT_TOKEN}`
  : null;
const BALE_WEBHOOK_PATH = "/api/bale/webhook";
async function baleRequest(method, data) {
  if (!BALE_API) throw new Error("توکن ربات بله تنظیم نشده است.");
  const response = await fetch(`${BALE_API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok)
    throw new Error(
      result.description || "ارسال درخواست پرداخت به بله ناموفق بود.",
    );
  return result.result;
}
async function sendBaleMessage(chatId, text) {
  return baleRequest("sendMessage", {
    chat_id: chatId,
    text,
  });
}
async function baleBotUsername() {
  // Do not rely on a manually typed username: it is easy to confuse a bot's
  // display name with its @username. The token is authoritative.
  const bot = await baleRequest("getMe", {});
  const username = String(bot?.username || "")
    .replace(/^@/, "")
    .trim();
  if (!username) throw new Error("نام کاربری ربات بله از API دریافت نشد.");
  return username;
}
async function handleBalePreCheckout(preCheckout) {
  const payload = String(preCheckout?.invoice_payload || "");
  const match = payload.match(/^rypay:([0-9a-f-]{36})$/i);
  const paymentId = match?.[1];

  let ok = true;
  let errorMessage = "";

  try {
    if (!paymentId) {
      throw new Error("شناسه پرداخت نامعتبر است.");
    }

    if (String(preCheckout?.currency || "").toUpperCase() !== "IRR") {
      throw new Error("ارز پرداخت نامعتبر است.");
    }

    const {
      rows: [payment],
    } = await q(
      `SELECT
         p.*,
         o.user_id,
         o.final_amount,
         ba.chat_id
       FROM payments p
       JOIN orders o ON o.id = p.order_id
       JOIN bale_accounts ba ON ba.user_id = o.user_id
       WHERE p.id = $1`,
      [paymentId],
    );

    if (!payment) {
      throw new Error("پرداخت یافت نشد.");
    }

    if (payment.status !== "pending") {
      throw new Error("این پرداخت دیگر قابل پرداخت نیست.");
    }

    if (payment.bale_payload !== payload) {
      throw new Error("اطلاعات پرداخت معتبر نیست.");
    }

    const expectedAmount = tomanToRial(payment.final_amount);
    const receivedAmount = Number(preCheckout?.total_amount);

    if (receivedAmount !== expectedAmount) {
      throw new Error("مبلغ پرداخت صحیح نیست.");
    }

    if (String(payment.chat_id) !== String(preCheckout?.from?.id)) {
      throw new Error("حساب بله با سفارش مطابقت ندارد.");
    }
  } catch (error) {
    ok = false;
    errorMessage = error.message || "پرداخت قابل تأیید نیست.";
    console.error("Bale pre-checkout error:", error);
  }

  await baleRequest("answerPreCheckoutQuery", {
    pre_checkout_query_id: preCheckout.id,
    ok,
    ...(ok ? {} : { error_message: errorMessage }),
  });
}
async function handleBaleSuccessfulPayment(message) {
  const paid = message?.successful_payment;
  const payload = String(paid?.invoice_payload || "");

  const match = payload.match(/^rypay:([0-9a-f-]{36})$/i);
  const paymentId = match?.[1];

  if (!paymentId) {
    throw new Error("شناسه پرداخت بله نامعتبر است.");
  }

  if (String(paid?.currency || "").toUpperCase() !== "IRR") {
    throw new Error("ارز پرداخت بله نامعتبر است.");
  }

  const {
    rows: [payment],
  } = await q(
    `SELECT p.*, o.user_id, o.final_amount, ba.chat_id
     FROM payments p
     JOIN orders o ON o.id = p.order_id
     JOIN bale_accounts ba ON ba.user_id = o.user_id
     WHERE p.id = $1`,
    [paymentId],
  );

  if (!payment) {
    throw new Error("پرداخت یافت نشد.");
  }

  if (payment.bale_payload !== payload) {
    throw new Error("اطلاعات پرداخت بله معتبر نیست.");
  }

  if (Number(paid.total_amount) !== tomanToRial(payment.final_amount)) {
    throw new Error("مبلغ پرداخت بله صحیح نیست.");
  }

  if (String(payment.chat_id) !== String(message?.chat?.id)) {
    throw new Error("حساب بله با سفارش مطابقت ندارد.");
  }

  const result = await activatePayment(pool, {
    paymentId,
    gateway: "bale",
    authority: paid.telegram_payment_charge_id,
    refId: paid.provider_payment_charge_id || paid.telegram_payment_charge_id,
    balePayload: paid.invoice_payload,
    baleChargeId: paid.telegram_payment_charge_id,
  });
  if (!result.alreadyPaid) {
    await sendBaleMessage(
      message.chat.id,
      "✅ پرداخت با موفقیت انجام شد و اشتراک شما فعال شد.",
    );
  }
}
const schema = `
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY, first_name TEXT NOT NULL DEFAULT 'ثبت‌نشده', last_name TEXT NOT NULL DEFAULT 'ثبت‌نشده',
  national_id VARCHAR(10) NOT NULL UNIQUE, father_name TEXT NOT NULL DEFAULT 'ثبت‌نشده',
  spouse_name TEXT, children_names TEXT, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'personal' CHECK (role IN ('personal','employee','professional','clinic','school','admin')), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS employee_profiles (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  personnel_code TEXT, full_name TEXT, age SMALLINT CHECK(age BETWEEN 15 AND 100), gender TEXT,
  marital_status TEXT, children_count SMALLINT CHECK(children_count >= 0), organizational_unit TEXT, position_title TEXT,
  work_experience_years NUMERIC(5,1) CHECK(work_experience_years >= 0), employment_type TEXT, shift_type TEXT,
  work_status TEXT, work_hours TEXT, family_distance TEXT, shift_change_history TEXT,
  perceived_workload TEXT, occupational_incidents TEXT, absence TEXT, sick_leave TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS spouse_profiles (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name TEXT, age SMALLINT CHECK(age BETWEEN 15 AND 100), education TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS children_profiles (
  id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL, age SMALLINT CHECK(age BETWEEN 0 AND 100), education TEXT, sort_order SMALLINT NOT NULL
);
CREATE TABLE IF NOT EXISTS assessments (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL, threshold INTEGER NOT NULL, questions JSONB NOT NULL, sort_order INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS results (id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, assessment_id TEXT NOT NULL REFERENCES assessments(id), score INTEGER NOT NULL, max_score INTEGER NOT NULL, status TEXT NOT NULL, answers JSONB NOT NULL, completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(user_id,assessment_id));
CREATE TABLE IF NOT EXISTS referrals (id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id), result_id BIGINT NOT NULL UNIQUE REFERENCES results(id), status TEXT NOT NULL DEFAULT 'new', note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, title TEXT NOT NULL, price INTEGER NOT NULL DEFAULT 0, features JSONB NOT NULL DEFAULT '[]');
CREATE TABLE IF NOT EXISTS subscriptions (id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE, plan_id TEXT NOT NULL REFERENCES plans(id), status TEXT NOT NULL DEFAULT 'active', starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), ends_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'));
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS usage_limit INTEGER;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS usage_count INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS product_categories (id TEXT PRIMARY KEY, title TEXT NOT NULL, icon TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, product_type TEXT NOT NULL, category_id TEXT REFERENCES product_categories(id), audience TEXT, required_plan TEXT NOT NULL DEFAULT 'normal', is_beta BOOLEAN NOT NULL DEFAULT FALSE, is_published BOOLEAN NOT NULL DEFAULT TRUE, duration TEXT, sort_order INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS user_activity (id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, product_id TEXT REFERENCES products(id), action TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(user_id, product_id));
CREATE TABLE IF NOT EXISTS product_files (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE, original_name TEXT NOT NULL, stored_name TEXT NOT NULL, mime_type TEXT, size_bytes BIGINT NOT NULL DEFAULT 0, file_role TEXT NOT NULL DEFAULT 'main', version_label TEXT, is_active BOOLEAN NOT NULL DEFAULT TRUE, uploaded_by BIGINT REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS product_versions (id BIGSERIAL PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE, version_label TEXT NOT NULL, changelog TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', released_at TIMESTAMPTZ, created_by BIGINT REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(product_id, version_label));
CREATE TABLE IF NOT EXISTS orders (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, plan_id TEXT NOT NULL REFERENCES plans(id), amount INTEGER NOT NULL DEFAULT 0, discount_amount INTEGER NOT NULL DEFAULT 0, final_amount INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending', coupon_code TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), paid_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS payments (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE, gateway TEXT NOT NULL DEFAULT 'mock', authority TEXT, ref_id TEXT, amount INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), paid_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS invoices (id BIGSERIAL PRIMARY KEY, invoice_no TEXT NOT NULL UNIQUE, order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, amount INTEGER NOT NULL, discount_amount INTEGER NOT NULL DEFAULT 0, final_amount INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'issued', issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS coupons (id BIGSERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE, discount_type TEXT NOT NULL DEFAULT 'percent', discount_value INTEGER NOT NULL, max_uses INTEGER, used_count INTEGER NOT NULL DEFAULT 0, expires_at TIMESTAMPTZ, is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS coupon_redemptions (id BIGSERIAL PRIMARY KEY, coupon_id BIGINT NOT NULL REFERENCES coupons(id) ON DELETE CASCADE, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(coupon_id,user_id));
CREATE TABLE IF NOT EXISTS tickets (id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, subject TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'عمومی', priority TEXT NOT NULL DEFAULT 'normal', status TEXT NOT NULL DEFAULT 'open', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS ticket_messages (id BIGSERIAL PRIMARY KEY, ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE, sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, body TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS notifications (id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL, body TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'info', is_read BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS admin_audit_logs (id BIGSERIAL PRIMARY KEY, admin_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, action TEXT NOT NULL, entity_type TEXT, entity_id TEXT, details JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS bale_accounts (
  user_id BIGINT PRIMARY KEY
    REFERENCES users(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL UNIQUE,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bale_link_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS bale_payload TEXT;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS bale_charge_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS payments_bale_charge_id_unique
  ON payments(bale_charge_id) WHERE bale_charge_id IS NOT NULL;

`;
const seeds = [
  [
    "personality",
    "آزمون شخصیت",
    "ارزیابی مقدماتی ویژگی‌های فردی",
    8,
    [
      "معمولاً می‌توانم احساساتم را مدیریت کنم.",
      "در ارتباط با دیگران احساس راحتی می‌کنم.",
      "در شرایط تازه، به‌سادگی سازگار می‌شوم.",
      "برای کارهای روزانه برنامه دارم.",
      "به توانایی خودم اطمینان دارم.",
    ],
  ],
  [
    "stress",
    "غربالگری استرس",
    "بررسی میزان فشار روانی در دو هفتهٔ اخیر",
    7,
    [
      "در دو هفتهٔ اخیر، احساس آرامش داشته‌ام.",
      "توانسته‌ام با فشارهای روزمره کنار بیایم.",
      "خواب کافی و باکیفیت داشته‌ام.",
      "برای فعالیت‌های روزانه انرژی کافی داشته‌ام.",
      "احساس کرده‌ام کنترل امور در دست من است.",
    ],
  ],
  [
    "wellbeing",
    "سلامت و بهزیستی",
    "ارزیابی اولیه بهزیستی روان‌شناختی",
    8,
    [
      "از زندگی روزمره‌ام رضایت نسبی دارم.",
      "احساس می‌کنم فردی ارزشمند هستم.",
      "در زمان نیاز، فردی برای صحبت‌کردن دارم.",
      "به آینده امیدوارم.",
      "از فعالیت‌های معمول لذت می‌برم.",
    ],
  ],
];
function hash(p) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(p, salt, 64).toString("hex")}`;
}
function matches(p, s) {
  const [salt, key] = s.split(":");
  return timingSafeEqual(scryptSync(p, salt, 64), Buffer.from(key, "hex"));
}
async function setup() {
  await mkdir(UPLOAD_ROOT, { recursive: true });
  await q("CREATE EXTENSION IF NOT EXISTS pgcrypto").catch(() => {});
  await q(schema);
  // Role migration for the role-based Ravanyar dashboard. Existing employee accounts remain personal accounts.
  await q("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check").catch(
    () => {},
  );
  await q("UPDATE users SET role='personal' WHERE role='employee'").catch(
    () => {},
  );
  await q(
    "ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('personal','employee','professional','clinic','school','admin'))",
  ).catch(() => {});
  for (const m of [
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS cover_image TEXT",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS intro_video_url TEXT",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  ]) {
    await q(m).catch(() => {});
  }
  for (const [id, title, description, threshold, questions] of seeds)
    await q(
      "INSERT INTO assessments (id,title,description,category,threshold,questions,sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING",
      [
        id,
        title,
        description,
        "مرحله اول: شخصیت و غربالگری",
        threshold,
        JSON.stringify(questions),
        seeds.findIndex((x) => x[0] === id) + 1,
      ],
    );
  await q(
    `INSERT INTO users
   (first_name, last_name, national_id, father_name, username, password_hash, role)
   VALUES ('مدیر', 'سامانه', '0000000000', '-', 'admin', $1, 'admin')
   ON CONFLICT(username) DO UPDATE SET password_hash=EXCLUDED.password_hash, role='admin'`,
    [hash(process.env.ADMIN_PASSWORD || "admin123")],
  );
  const planSeeds = [
    [
      "normal",
      "عادی",
      0,
      ["دسترسی به محصولات پایه", "کتابخانه عمومی", "گزارش‌های پایه"],
    ],
    [
      "silver",
      "نقره‌ای",
      1500000,
      [
        "همه امکانات عادی",
        "آزمون‌های پیشرفته",
        "مداخلات منتخب",
        "گزارش حرفه‌ای",
      ],
    ],
    [
      "gold",
      "طلایی",
      3000000,
      [
        "تمام امکانات نقره‌ای",
        "همه سامانه‌های تخصصی",
        "دسترسی بتا",
        "اولویت پشتیبانی",
      ],
    ],
  ];
  for (const x of planSeeds)
    await q(
      "INSERT INTO plans(id,title,price,features) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING",
      [x[0], x[1], x[2], JSON.stringify(x[3])],
    );
  const cats = [
    ["assessments", " آزمون‌ها", "🧪", 1],
    ["systems", "سامانه‌های تخصصی", "🖥️", 2],
    ["interventions", "مداخلات", "🧩", 3],
    ["academy", "آموزش و دوره‌ها", "🎓", 4],
    ["library", "کتابخانه", "📚", 5],
  ];
  for (const x of cats)
    await q(
      "INSERT INTO product_categories(id,title,icon,sort_order) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING",
      x,
    );
  const products = [
    [
      "cognitive-suite",
      "مجموعه آزمون‌های شناختی",
      "ارزیابی توجه، حافظه کاری و کارکردهای اجرایی",
      "آزمون",
      "assessments",
      "کودک و بزرگسال",
      "normal",
      false,
      "30–45 دقیقه",
      1,
    ],
    [
      "psychological-tests",
      "آزمون‌های روان‌شناختی",
      "غربالگری و ارزیابی ویژگی‌ها و وضعیت روان‌شناختی",
      "آزمون",
      "assessments",
      "نوجوان و بزرگسال",
      "normal",
      false,
      "15–30 دقیقه",
      2,
    ],
    [
      "learning-system",
      "سامانه ارزیابی و مداخله اختلالات یادگیری",
      "غربالگری، نیمرخ، برنامه مداخله و پایش پیشرفت",
      "سامانه",
      "systems",
      "کودک و مدرسه",
      "gold",
      false,
      "چندسِشنی",
      1,
    ],
    [
      "bullying-system",
      "سامانه هوشمند ضد قلدری",
      "غربالگری، ثبت رخداد، ارزیابی خطر و مداخله کل‌مدرسه",
      "سامانه",
      "systems",
      "مدرسه",
      "gold",
      true,
      "مستمر",
      2,
    ],
    [
      "self-regulation",
      "آموزش خودتنظیمی",
      "ارزیابی، هدف‌گذاری، برنامه‌ریزی و پایش پیشرفت",
      "دوره",
      "academy",
      "دانش‌آموز و دانشجو",
      "silver",
      false,
      "8 جلسه",
      1,
    ],
    [
      "therapy-packages",
      "بسته‌های مداخلات درمانی",
      "پروتکل‌های ساختاریافته همراه با جلسات و کاربرگ",
      "مداخله",
      "interventions",
      "متخصصان",
      "silver",
      false,
      "متغیر",
      1,
    ],
    [
      "self-help-library",
      "دفترچه‌های خودیاری",
      "دفترچه‌های تمرینی برای اضطراب، خودتنظیمی و مهارت‌های زندگی",
      "دفترچه",
      "library",
      "عمومی",
      "normal",
      false,
      "مطالعه آزاد",
      1,
    ],
  ];
  for (const x of products)
    await q(
      "INSERT INTO products(id,title,description,product_type,category_id,audience,required_plan,is_beta,duration,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO NOTHING",
      x,
    );
}
function securityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  res.setHeader(
    "Content-Security-Policy",
    process.env.NODE_ENV === "production"
      ? "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https:; media-src 'self' https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
      : "default-src 'self' 'unsafe-inline' 'unsafe-eval' https: data: blob:; frame-ancestors 'none'",
  );
}
function rateLimit(key, max = LOGIN_MAX_ATTEMPTS, windowMs = LOGIN_WINDOW_MS) {
  const now = Date.now();
  const old = rateLimits.get(key);
  if (!old || now - old.startedAt > windowMs) {
    rateLimits.set(key, { startedAt: now, count: 1 });
    return true;
  }
  old.count++;
  return old.count <= max;
}
function sessionToken(req) {
  const authorization = req.headers.authorization || "";

  const bearerToken = authorization.replace(/^Bearer\s+/i, "").trim();

  if (bearerToken) {
    return bearerToken;
  }

  const cookieHeader = req.headers.cookie || "";

  const match = cookieHeader.match(/(?:^|;\s*)session_token=([^;]+)/);

  return match ? decodeURIComponent(match[1]) : "";
}
function setSessionCookie(res, token) {
  const isProduction = process.env.NODE_ENV === "production";

  res.setHeader(
    "Set-Cookie",
    [
      `session_token=${encodeURIComponent(token)}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      isProduction ? "Secure" : "",
      `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    ]
      .filter(Boolean)
      .join("; "),
  );
}
function json(res, status, data) {
  securityHeaders(res);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}
async function body(req) {
  const len = Number(req.headers["content-length"] || 0);
  if (len > MAX_JSON_BYTES)
    throw Object.assign(new Error("حجم درخواست بیش از حد مجاز است."), {
      status: 413,
    });
  let raw = "";
  for await (const c of req) {
    raw += c;
    if (Buffer.byteLength(raw) > MAX_JSON_BYTES)
      throw Object.assign(new Error("حجم درخواست بیش از حد مجاز است."), {
        status: 413,
      });
  }
  try {
    return JSON.parse(raw || "{}");
  } catch {
    throw Error("دادهٔ ارسالی معتبر نیست.");
  }
}
function auth(req) {
  const token = sessionToken(req);
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() - s.createdAt > SESSION_TTL_MS) {
    sessions.delete(token);
    return null;
  }
  return s;
}
async function need(req, res, role) {
  const s = auth(req);
  if (!s) {
    json(res, 401, { error: "دسترسی مجاز نیست." });
    return null;
  }
  const {
    rows: [u],
  } = await q(
    "SELECT id,first_name,last_name,username,role FROM users WHERE id=$1",
    [s.userId],
  );
  if (!u || (role && u.role !== role)) {
    json(res, 401, { error: "دسترسی مجاز نیست." });
    return null;
  }
  return u;
}
const safe = (u) => ({
  id: u.id,
  firstName: u.first_name,
  lastName: u.last_name,
  username: u.username,
  role: u.role,
});

const planRank = { normal: 1, silver: 2, gold: 3 };
async function currentSubscription(userId) {
  const {
    rows: [sub],
  } = await q(
    `SELECT s.*,pl.title plan_title,pl.price plan_price FROM subscriptions s JOIN plans pl ON pl.id=s.plan_id WHERE s.user_id=$1`,
    [userId],
  );
  return (
    sub || {
      plan_id: "normal",
      plan_title: "عادی",
      status: "active",
      ends_at: null,
    }
  );
}
async function normalizeExpiredSubscriptions() {
  await q(`
    UPDATE subscriptions
    SET
      plan_id = 'normal',
      status = 'active',
      usage_limit = NULL,
      usage_count = 0
    WHERE
      plan_id IN ('silver', 'gold')
      AND (
        (ends_at IS NOT NULL AND ends_at <= NOW())
        OR
        (
          usage_limit IS NOT NULL
          AND usage_limit > 0
          AND usage_count >= usage_limit
        )
      )
  `);
}
async function canAccessProduct(userId, product) {
  const sub = await currentSubscription(userId);
  const active =
    !sub ||
    ((!sub.ends_at || new Date(sub.ends_at) > new Date()) &&
      (!sub.status || sub.status === "active"));
  return (
    active &&
    planRank[sub.plan_id || "normal"] >=
      planRank[product.required_plan || "normal"] &&
    (!product.is_beta || sub.plan_id === "gold")
  );
}
async function canAccessCareerSystem(userId) {
  const sub = await currentSubscription(userId);

  if (!sub) return false;

  // پلن عادی دسترسی ندارد
  if (!["silver", "gold"].includes(sub.plan_id)) {
    return false;
  }

  // اشتراک باید فعال باشد
  if (sub.status !== "active") {
    return false;
  }

  // بررسی پایان ۳۰ روز
  if (sub.ends_at && new Date(sub.ends_at) <= new Date()) {
    return false;
  }

  // بررسی تعداد دفعات استفاده
  const usageLimit = Number(sub.usage_limit || 0);
  const usageCount = Number(sub.usage_count || 0);

  if (usageLimit <= 0) {
    return false;
  }

  if (usageCount >= usageLimit) {
    return false;
  }

  return true;
}
async function consumeCareerUsage(userId) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const {
      rows: [sub],
    } = await client.query(
      `SELECT *
       FROM subscriptions
       WHERE user_id=$1
       FOR UPDATE`,
      [userId],
    );

    if (!sub) {
      await client.query("ROLLBACK");

      return {
        allowed: false,
        reason: "NO_SUBSCRIPTION",
      };
    }

    if (!["silver", "gold"].includes(sub.plan_id)) {
      await client.query("ROLLBACK");

      return {
        allowed: false,
        reason: "INVALID_PLAN",
      };
    }

    if (sub.status !== "active") {
      await client.query("ROLLBACK");

      return {
        allowed: false,
        reason: "INACTIVE",
      };
    }

    if (sub.ends_at && new Date(sub.ends_at) <= new Date()) {
      await client.query("ROLLBACK");

      return {
        allowed: false,
        reason: "EXPIRED",
      };
    }

    const usageLimit = Number(sub.usage_limit || 0);
    const usageCount = Number(sub.usage_count || 0);

    if (usageLimit <= 0 || usageCount >= usageLimit) {
      await client.query("ROLLBACK");

      return {
        allowed: false,
        reason: "USAGE_LIMIT",
      };
    }

    const {
      rows: [updated],
    } = await client.query(
      `UPDATE subscriptions
       SET usage_count = usage_count + 1
       WHERE id=$1
       RETURNING *`,
      [sub.id],
    );

    await client.query("COMMIT");

    return {
      allowed: true,
      subscription: updated,
      usageCount: Number(updated.usage_count),
      usageLimit: Number(updated.usage_limit),
      remaining: Math.max(
        0,
        Number(updated.usage_limit) - Number(updated.usage_count),
      ),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
async function audit(adminId, action, entityType, entityId, details = {}) {
  await q(
    "INSERT INTO admin_audit_logs(admin_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5)",
    [
      adminId,
      action,
      entityType,
      entityId ? String(entityId) : null,
      JSON.stringify(details),
    ],
  ).catch(() => {});
}
async function multipart(req) {
  const len = Number(req.headers["content-length"] || 0);
  if (len > MAX_UPLOAD_BYTES + 2 * 1024 * 1024)
    throw Object.assign(new Error("حجم فایل بیش از حد مجاز است."), {
      status: 413,
    });
  const request = new Request(
    `http://${req.headers.host || "localhost"}${req.url}`,
    { method: req.method, headers: req.headers, body: req, duplex: "half" },
  );
  const form = await request.formData();
  const file = form.get("file");
  return { form, file: file instanceof File ? file : null };
}
async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`),
      p = url.pathname;
    if (req.method === "POST" && p === BALE_WEBHOOK_PATH) {
      const update = await body(req);

      console.log("Bale webhook received:", update);

      if (update.pre_checkout_query) {
        await handleBalePreCheckout(update.pre_checkout_query);
      }

      if (update.message?.successful_payment) {
        await handleBaleSuccessfulPayment(update.message);
      }

      return json(res, 200, { ok: true });
    }
    if (req.method === "GET" && p === "/health")
      return json(res, 200, {
        status: "ok",
        service: "ravanyar",
        timestamp: new Date().toISOString(),
      });
    if (req.method === "POST" && p === "/api/register") {
      const d = await body(req);

      const firstName = String(d.firstName || d.first_name || "").trim();

      const lastName = String(d.lastName || d.last_name || "").trim();

      const username = String(d.username || "").trim();

      // فقط password
      // nationalId نباید fallback رمز عبور باشد
      const password = String(d.password || "");

      /* =========================
     REQUIRED FIELDS
  ========================== */

      if (!firstName || !lastName || !username || !password) {
        return json(res, 400, {
          error: "نام، نام خانوادگی، نام کاربری و گذرواژه الزامی است.",
        });
      }

      /* =========================
     USERNAME VALIDATION
  ========================== */

      if (!/^[A-Za-z][A-Za-z0-9_]{3,29}$/.test(username)) {
        return json(res, 400, {
          error:
            "نام کاربری باید با حرف انگلیسی شروع شود و شامل ۴ تا ۳۰ کاراکتر انگلیسی، عدد یا _ باشد.",
        });
      }

      /* =========================
     PASSWORD VALIDATION
  ========================== */

      if (password.length < 8) {
        return json(res, 400, {
          error: "گذرواژه باید حداقل ۸ کاراکتر داشته باشد.",
        });
      }

      if (!/[A-Z]/.test(password)) {
        return json(res, 400, {
          error: "گذرواژه باید حداقل یک حرف بزرگ انگلیسی داشته باشد.",
        });
      }

      if (!/[a-z]/.test(password)) {
        return json(res, 400, {
          error: "گذرواژه باید حداقل یک حرف کوچک انگلیسی داشته باشد.",
        });
      }

      if (!/[0-9]/.test(password)) {
        return json(res, 400, {
          error: "گذرواژه باید حداقل یک عدد داشته باشد.",
        });
      }

      if (!/[^A-Za-z0-9]/.test(password)) {
        return json(res, 400, {
          error: "گذرواژه باید حداقل یک کاراکتر ویژه مثل @، # یا ! داشته باشد.",
        });
      }

      /* =========================
     WEAK PASSWORDS
  ========================== */

      const weakPasswords = [
        "password",
        "password123",
        "12345678",
        "123456789",
        "1234567890",
        "qwerty123",
        "admin123",
        "welcome123",
        "abcdefgh",
        "abcdefgh1",
      ];

      if (weakPasswords.includes(password.toLowerCase())) {
        return json(res, 400, {
          error:
            "این گذرواژه بسیار ساده و قابل حدس است. لطفاً گذرواژه قوی‌تری انتخاب کنید.",
        });
      }

      /* =========================
     NATIONAL ID
  ========================== */

      const nationalId = /^\d{10}$/.test(String(d.nationalId || ""))
        ? String(d.nationalId)
        : String(Date.now() + Math.floor(Math.random() * 900 + 100)).slice(-10);

      /* =========================
     CREATE USER
  ========================== */

      try {
        const {
          rows: [u],
        } = await q(
          `INSERT INTO users(
        first_name,
        last_name,
        national_id,
        username,
        password_hash,
        role
      )
      VALUES(
        $1,
        $2,
        $3,
        $4,
        $5,
        'personal'
      )
      RETURNING *`,
          [firstName, lastName, nationalId, username, hash(password)],
        );

        /* =========================
       DEFAULT SUBSCRIPTION
    ========================== */

        await q(
          `INSERT INTO subscriptions(
        user_id,
        plan_id,
        status,
        starts_at,
        ends_at
      )
      VALUES(
        $1,
        'normal',
        'active',
        NOW(),
        NOW() + INTERVAL '30 days'
      )
      ON CONFLICT(user_id)
      DO NOTHING`,
          [u.id],
        );

        /* =========================
       CREATE SESSION
    ========================== */

        const token = randomBytes(32).toString("hex");

        sessions.set(token, {
          userId: u.id,
          createdAt: Date.now(),
        });
        setSessionCookie(res, token);
        return json(res, 201, {
          token,
          user: safe(u),
          message: "ثبت‌نام با موفقیت انجام شد.",
        });
      } catch (err) {
        console.error("REGISTER ERROR:", err);

        return json(res, 409, {
          error: "این نام کاربری پیش‌تر ثبت شده است.",
        });
      }
    }
    if (req.method === "POST" && p === "/api/login") {
      const ip = req.socket.remoteAddress || "unknown";
      await normalizeExpiredSubscriptions();
      if (!rateLimit(`login:${ip}`))
        return json(res, 429, {
          error:
            "تعداد تلاش‌های ورود بیش از حد مجاز است. یک دقیقه بعد دوباره تلاش کنید.",
        });
      const d = await body(req),
        {
          rows: [u],
        } = await q("SELECT * FROM users WHERE username=$1", [
          d.username || "",
        ]);
      if (!u || !matches(d.password || "", u.password_hash))
        return json(res, 401, { error: "نام کاربری یا گذرواژه نادرست است." });
      const token = randomBytes(32).toString("hex");

      sessions.set(token, {
        userId: u.id,
        createdAt: Date.now(),
      });

      setSessionCookie(res, token);

      return json(res, 200, {
        token,
        user: safe(u),
      });
    }
    if (req.method === "POST" && p === "/api/logout") {
      const token = sessionToken(req);

      if (token) {
        sessions.delete(token);
      }

      res.setHeader(
        "Set-Cookie",
        [
          "session_token=",
          "Path=/",
          "HttpOnly",
          "SameSite=Lax",
          process.env.NODE_ENV === "production" ? "Secure" : "",
          "Max-Age=0",
        ]
          .filter(Boolean)
          .join("; "),
      );

      return json(res, 200, {
        message: "با موفقیت خارج شدید.",
      });
    }
    if (req.method === "GET" && p === "/api/me") {
      const u = await need(req, res);
      if (u) json(res, 200, { user: safe(u) });
      return;
    }
    if (req.method === "POST" && p === "/api/bale/link-token") {
      const u = await need(req, res);
      if (!u) return;

      if (!BALE_API)
        return json(res, 503, {
          error: "توکن ربات بله در سرور تنظیم نشده است.",
        });

      let botUsername;
      try {
        botUsername = await baleBotUsername();
      } catch (error) {
        console.error("Bale bot lookup error:", error.message);
        return json(res, 503, {
          error: "ارتباط با ربات بله برقرار نشد. تنظیمات ربات را بررسی کنید.",
        });
      }

      const rawToken = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(rawToken).digest("hex");

      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      // حذف توکن‌های قبلی و استفاده‌نشده این کاربر
      await q(
        `DELETE FROM bale_link_tokens
     WHERE user_id = $1 AND used_at IS NULL`,
        [u.id],
      );

      await q(
        `INSERT INTO bale_link_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
        [u.id, tokenHash, expiresAt],
      );

      return json(res, 201, {
        link: `https://ble.ir/${botUsername}?start=${rawToken}`,
        botLink: `https://ble.ir/${botUsername}`,
        connectionCode: rawToken,
        expiresAt,
        message: "لینک اتصال با موفقیت ساخته شد.",
      });
    }
    if (req.method === "GET" && p === "/api/profile") {
      const u = await need(req, res);
      if (!u) return;
      const {
        rows: [profile],
      } = await q("SELECT * FROM employee_profiles WHERE user_id=$1", [u.id]);
      return json(res, 200, { profile: profile || {} });
    }
    if (req.method === "PUT" && p === "/api/profile") {
      const u = await need(req, res);
      if (!u) return;
      const d = await body(req);
      const fields = [
        "personnel_code",
        "full_name",
        "age",
        "gender",
        "marital_status",
        "children_count",
        "organizational_unit",
        "position_title",
        "work_experience_years",
        "employment_type",
        "shift_type",
        "work_status",
        "work_hours",
        "family_distance",
        "shift_change_history",
        "perceived_workload",
        "occupational_incidents",
        "absence",
        "sick_leave",
      ];
      const values = fields.map((f) => d[f] || null);
      await q(
        `INSERT INTO employee_profiles (user_id,${fields.join(",")}) VALUES ($1,${fields.map((_, i) => "$" + (i + 2)).join(",")}) ON CONFLICT(user_id) DO UPDATE SET ${fields.map((f, i) => `${f}=EXCLUDED.${f}`).join(",")},updated_at=NOW()`,
        [u.id, ...values],
      );
      return json(res, 200, { message: "اطلاعات با موفقیت ذخیره شد." });
    }
    if (req.method === "GET" && p === "/api/family") {
      const u = await need(req, res);
      if (!u) return;
      const {
        rows: [spouse],
      } = await q(
        "SELECT full_name,age,education FROM spouse_profiles WHERE user_id=$1",
        [u.id],
      );
      const { rows: children } = await q(
        "SELECT full_name,age,education,sort_order FROM children_profiles WHERE user_id=$1 ORDER BY sort_order",
        [u.id],
      );
      return json(res, 200, { spouse: spouse || {}, children });
    }
    if (req.method === "PUT" && p === "/api/family/spouse") {
      const u = await need(req, res);
      if (!u) return;
      const d = await body(req);
      await q(
        "INSERT INTO spouse_profiles(user_id,full_name,age,education) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET full_name=EXCLUDED.full_name,age=EXCLUDED.age,education=EXCLUDED.education,updated_at=NOW()",
        [u.id, d.full_name || null, d.age || null, d.education || null],
      );
      return json(res, 200, { message: "اطلاعات همسر ذخیره شد." });
    }
    if (req.method === "PUT" && p === "/api/family/children") {
      const u = await need(req, res);
      if (!u) return;
      const d = await body(req);
      if (!Array.isArray(d.children) || d.children.length > 20)
        return json(res, 400, { error: "تعداد فرزندان معتبر نیست." });
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM children_profiles WHERE user_id=$1", [
          u.id,
        ]);
        for (let i = 0; i < d.children.length; i++) {
          const c = d.children[i];
          await client.query(
            "INSERT INTO children_profiles(user_id,full_name,age,education,sort_order) VALUES($1,$2,$3,$4,$5)",
            [
              u.id,
              c.full_name || "ثبت‌نشده",
              c.age || null,
              c.education || null,
              i + 1,
            ],
          );
        }
        await client.query("COMMIT");
        return json(res, 200, { message: "اطلاعات فرزندان ذخیره شد." });
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    }
    if (req.method === "GET" && p === "/api/assessments") {
      const u = await need(req, res);
      if (!u) return;
      const { rows } = await q(
        "SELECT a.id,a.title,a.description,a.category,a.threshold,a.sort_order,r.score,r.status,r.completed_at FROM assessments a LEFT JOIN results r ON r.assessment_id=a.id AND r.user_id=$1 ORDER BY a.sort_order",
        [u.id],
      );
      return json(res, 200, { assessments: rows });
    }
    const aMatch = p.match(/^\/api\/assessments\/([\w-]+)$/);
    if (req.method === "GET" && aMatch) {
      const u = await need(req, res);
      if (!u) return;
      const {
        rows: [a],
      } = await q(
        "SELECT id,title,description,questions FROM assessments WHERE id=$1",
        [aMatch[1]],
      );
      return a
        ? json(res, 200, a)
        : json(res, 404, { error: "آزمون یافت نشد." });
    }
    const sMatch = p.match(/^\/api\/assessments\/([\w-]+)\/submit$/);
    if (req.method === "POST" && sMatch) {
      const u = await need(req, res);
      if (!u) return;
      const d = await body(req),
        {
          rows: [a],
        } = await q("SELECT * FROM assessments WHERE id=$1", [sMatch[1]]);
      if (
        !a ||
        !Array.isArray(d.answers) ||
        d.answers.length !== a.questions.length ||
        d.answers.some((x) => !Number.isInteger(x) || x < 0 || x > 2)
      )
        return json(res, 400, { error: "پاسخ‌ها کامل یا معتبر نیستند." });
      const score = d.answers.reduce((x, y) => x + y, 0),
        max = a.questions.length * 2,
        status = score < a.threshold ? "needs_review" : "normal";
      const {
        rows: [r],
      } = await q(
        "INSERT INTO results(user_id,assessment_id,score,max_score,status,answers) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id,assessment_id) DO UPDATE SET score=EXCLUDED.score,max_score=EXCLUDED.max_score,status=EXCLUDED.status,answers=EXCLUDED.answers,completed_at=NOW() RETURNING id",
        [u.id, a.id, score, max, status, JSON.stringify(d.answers)],
      );
      if (status === "needs_review")
        await q(
          "INSERT INTO referrals(user_id,result_id,status) VALUES($1,$2,'new') ON CONFLICT(result_id) DO UPDATE SET status='new',updated_at=NOW()",
          [u.id, r.id],
        );
      return json(res, 200, {
        score,
        maxScore: max,
        status,
        message:
          status === "needs_review"
            ? "نتیجه نیازمند بررسی کارشناس است؛ محرمانه پیگیری خواهد شد."
            : "آزمون با موفقیت ثبت شد.",
      });
    }
    if (req.method === "GET" && p === "/api/admin/referrals") {
      const u = await need(req, res, "admin");
      if (!u) return;
      const { rows } = await q(
        "SELECT f.id,f.status,f.note,f.created_at,u.first_name,u.last_name,u.national_id,a.title,r.score,r.max_score FROM referrals f JOIN users u ON u.id=f.user_id JOIN results r ON r.id=f.result_id JOIN assessments a ON a.id=r.assessment_id ORDER BY f.status,f.created_at DESC",
      );
      return json(res, 200, { referrals: rows });
    }
    const rMatch = p.match(/^\/api\/admin\/referrals\/(\d+)$/);
    if (req.method === "PATCH" && rMatch) {
      const u = await need(req, res, "admin");
      if (!u) return;
      const d = await body(req);
      if (!["new", "contacted", "closed"].includes(d.status))
        return json(res, 400, { error: "وضعیت نامعتبر است." });
      await q(
        "UPDATE referrals SET status=$1,note=$2,updated_at=NOW() WHERE id=$3",
        [d.status, String(d.note || ""), rMatch[1]],
      );
      return json(res, 200, { message: "پیگیری به‌روز شد." });
    }

    // ===== Commercial V2 / Phase 1 Admin APIs =====
    if (req.method === "GET" && p === "/api/admin/overview") {
      const u = await need(req, res, "admin");
      if (!u) return;
      const {
        rows: [c],
      } = await q(
        `SELECT (SELECT count(*) FROM users) users,(SELECT count(*) FROM users WHERE role='admin') admins,(SELECT count(*) FROM products) products,(SELECT count(*) FROM products WHERE is_published) published,(SELECT count(*) FROM subscriptions WHERE status='active' AND ends_at>NOW()) active_subscriptions`,
      );
      const { rows: plans } = await q(
        `SELECT pl.id,pl.title,count(s.id) users FROM plans pl LEFT JOIN subscriptions s ON s.plan_id=pl.id AND s.status='active' GROUP BY pl.id,pl.title ORDER BY pl.price`,
      );
      return json(res, 200, {
        stats: Object.fromEntries(
          Object.entries(c).map(([k, v]) => [k, Number(v)]),
        ),
        plans,
      });
    }
    if (req.method === "GET" && p === "/api/admin/users") {
      const u = await need(req, res, "admin");
      if (!u) return;
      const { rows } = await q(
        `SELECT u.id,u.first_name,u.last_name,u.username,u.role,u.created_at,COALESCE(s.plan_id,'normal') plan_id,COALESCE(s.status,'active') subscription_status,s.ends_at FROM users u LEFT JOIN subscriptions s ON s.user_id=u.id ORDER BY u.created_at DESC`,
      );
      return json(res, 200, { users: rows });
    }
    const adminUserMatch = p.match(/^\/api\/admin\/users\/(\d+)$/);
    if (req.method === "PATCH" && adminUserMatch) {
      const u = await need(req, res, "admin");
      if (!u) return;
      const d = await body(req);
      const id = adminUserMatch[1];
      if (
        d.role &&
        ![
          "personal",
          "employee",
          "professional",
          "clinic",
          "school",
          "admin",
        ].includes(d.role)
      )
        return json(res, 400, { error: "نقش نامعتبر است." });
      if (d.role) await q("UPDATE users SET role=$1 WHERE id=$2", [d.role, id]);
      if (d.plan_id !== undefined) {
        const planId = String(d.plan_id);

        if (!["normal", "silver", "gold"].includes(planId)) {
          return json(res, 400, { error: "پلن نامعتبر است." });
        }

        // کاربر عادی = بدون subscription
        if (planId === "normal") {
          await q("DELETE FROM subscriptions WHERE user_id=$1", [id]);
        } else {
          const usageLimit = planId === "silver" ? 3 : 9;

          await q(
            `INSERT INTO subscriptions(
        user_id,
        plan_id,
        status,
        starts_at,
        ends_at,
        usage_limit,
        usage_count
      )
      VALUES(
        $1,
        $2,
        'active',
        NOW(),
        NOW() + INTERVAL '30 days',
        $3,
        0
      )
      ON CONFLICT(user_id)
      DO UPDATE SET
        plan_id = EXCLUDED.plan_id,
        status = 'active',
        starts_at = EXCLUDED.starts_at,
        ends_at = EXCLUDED.ends_at,
        usage_limit = EXCLUDED.usage_limit,
        usage_count = 0`,
            [id, planId, usageLimit],
          );
        }
      }
      return json(res, 200, { message: "اطلاعات کاربر به‌روزرسانی شد." });
    }
    if (req.method === "GET" && p === "/api/admin/categories") {
      const u = await need(req, res, "admin");
      if (!u) return;
      const { rows } = await q(
        "SELECT * FROM product_categories ORDER BY sort_order,title",
      );
      return json(res, 200, { categories: rows });
    }
    if (req.method === "POST" && p === "/api/admin/categories") {
      const u = await need(req, res, "admin");
      if (!u) return;
      const d = await body(req);
      const id = String(d.id || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-");
      if (!id || !d.title)
        return json(res, 400, { error: "شناسه و عنوان دسته الزامی است." });
      await q(
        "INSERT INTO product_categories(id,title,icon,sort_order) VALUES($1,$2,$3,$4)",
        [
          id,
          String(d.title),
          String(d.icon || "📦"),
          Number(d.sort_order || 0),
        ],
      );
      return json(res, 201, { message: "دسته‌بندی ایجاد شد." });
    }
    if (req.method === "GET" && p === "/api/admin/products") {
      const u = await need(req, res, "admin");
      if (!u) return;
      const { rows } = await q(
        `SELECT p.*,c.title category_title,c.icon category_icon,(SELECT COUNT(*) FROM product_files f WHERE f.product_id=p.id AND f.is_active=true) AS file_count FROM products p LEFT JOIN product_categories c ON c.id=p.category_id ORDER BY p.sort_order,p.created_at DESC`,
      );
      return json(res, 200, { products: rows });
    }
    if (req.method === "POST" && p === "/api/admin/products") {
      const u = await need(req, res, "admin");
      if (!u) return;
      const d = await body(req);
      const id = String(d.id || d.title || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/^-+|-+$/g, "");
      if (!id || !d.title || !d.product_type)
        return json(res, 400, { error: "نام، نوع و شناسه محصول الزامی است." });
      if (
        !["normal", "silver", "gold"].includes(
          String(d.required_plan || "normal"),
        )
      )
        return json(res, 400, { error: "سطح دسترسی محصول نامعتبر است." });
      await q(
        `INSERT INTO products(id,title,description,product_type,category_id,audience,required_plan,is_beta,is_published,duration,sort_order,cover_image,intro_video_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          id,
          d.title,
          d.description || "",
          d.product_type,
          d.category_id || null,
          d.audience || "عمومی",
          d.required_plan || "normal",
          !!d.is_beta,
          d.is_published !== false,
          d.duration || "",
          Number(d.sort_order || 0),
          d.cover_image || null,
          d.intro_video_url || null,
        ],
      );
      return json(res, 201, { message: "محصول با موفقیت ایجاد شد." });
    }
    const adminProductMatch = p.match(/^\/api\/admin\/products\/([^/]+)$/);
    if (req.method === "PATCH" && adminProductMatch) {
      const u = await need(req, res, "admin");
      if (!u) return;
      const d = await body(req);
      const id = decodeURIComponent(adminProductMatch[1]);
      if (
        d.required_plan !== undefined &&
        !["normal", "silver", "gold"].includes(String(d.required_plan))
      )
        return json(res, 400, { error: "سطح دسترسی محصول نامعتبر است." });
      await q(
        `UPDATE products SET title=COALESCE($1,title),description=COALESCE($2,description),product_type=COALESCE($3,product_type),category_id=COALESCE($4,category_id),audience=COALESCE($5,audience),required_plan=COALESCE($6,required_plan),is_beta=COALESCE($7,is_beta),is_published=COALESCE($8,is_published),duration=COALESCE($9,duration),sort_order=COALESCE($10,sort_order),cover_image=COALESCE($11,cover_image),intro_video_url=COALESCE($12,intro_video_url),updated_at=NOW() WHERE id=$13`,
        [
          d.title ?? null,
          d.description ?? null,
          d.product_type ?? null,
          d.category_id ?? null,
          d.audience ?? null,
          d.required_plan ?? null,
          d.is_beta ?? null,
          d.is_published ?? null,
          d.duration ?? null,
          d.sort_order ?? null,
          d.cover_image ?? null,
          d.intro_video_url ?? null,
          id,
        ],
      );
      return json(res, 200, { message: "محصول به‌روزرسانی شد." });
    }
    if (req.method === "DELETE" && adminProductMatch) {
      const u = await need(req, res, "admin");
      if (!u) return;
      const id = decodeURIComponent(adminProductMatch[1]);
      const { rows: files } = await q(
        "SELECT stored_name FROM product_files WHERE product_id=$1",
        [id],
      );
      await q("DELETE FROM products WHERE id=$1", [id]);
      for (const f of files)
        await unlink(join(UPLOAD_ROOT, f.stored_name)).catch(() => {});
      await audit(u.id, "delete", "product", id, { file_count: files.length });
      return json(res, 200, { message: "محصول و فایل‌های آن حذف شد." });
    }
    if (req.method === "GET" && p === "/api/admin/plans") {
      const u = await need(req, res, "admin");
      if (!u) return;
      const { rows } = await q("SELECT * FROM plans ORDER BY price");
      return json(res, 200, { plans: rows });
    }
    const adminPlanMatch = p.match(/^\/api\/admin\/plans\/([^/]+)$/);
    if (req.method === "PATCH" && adminPlanMatch) {
      const u = await need(req, res, "admin");
      if (!u) return;
      const d = await body(req);
      await q(
        "UPDATE plans SET title=COALESCE($1,title),price=COALESCE($2,price),features=COALESCE($3,features) WHERE id=$4",
        [
          d.title ?? null,
          d.price ?? null,
          d.features ? JSON.stringify(d.features) : null,
          decodeURIComponent(adminPlanMatch[1]),
        ],
      );
      return json(res, 200, { message: "پلن به‌روزرسانی شد." });
    }
    if (req.method === "GET" && p === "/api/plans") {
      const { rows } = await q("SELECT * FROM plans ORDER BY price");
      return json(res, 200, { plans: rows });
    }
    if (req.method === "GET" && p === "/api/products") {
      const u = await need(req, res);
      if (!u) return;
      const { rows } = await q(
        `SELECT p.*,c.title category_title,c.icon category_icon FROM products p LEFT JOIN product_categories c ON c.id=p.category_id WHERE p.is_published=true ORDER BY p.sort_order,p.title`,
      );
      const {
        rows: [sub],
      } = await q(
        "SELECT s.*,pl.title plan_title FROM subscriptions s JOIN plans pl ON pl.id=s.plan_id WHERE s.user_id=$1",
        [u.id],
      );
      return json(res, 200, {
        products: rows,
        subscription: sub || {
          plan_id: "normal",
          plan_title: "عادی",
          status: "active",
        },
      });
    }
    const publicProductMatch = p.match(/^\/api\/products\/([^/]+)$/);
    if (req.method === "GET" && publicProductMatch) {
      const u = await need(req, res);
      if (!u) return;
      const id = decodeURIComponent(publicProductMatch[1]);
      const {
        rows: [product],
      } = await q(
        `SELECT p.*,c.title category_title,c.icon category_icon FROM products p LEFT JOIN product_categories c ON c.id=p.category_id WHERE p.id=$1 AND p.is_published=true`,
        [id],
      );
      if (!product) return json(res, 404, { error: "محصول یافت نشد." });
      const allowed = await canAccessProduct(u.id, product);
      const { rows: versions } = await q(
        `SELECT version_label,changelog,status,released_at,created_at FROM product_versions WHERE product_id=$1 AND status='released' ORDER BY created_at DESC`,
        [id],
      );
      return json(res, 200, { product, allowed, versions });
    }
    if (req.method === "GET" && p === "/api/dashboard") {
      const u = await need(req, res);
      if (!u) return;
      const {
        rows: [sub],
      } = await q(
        `SELECT s.*,pl.title plan_title FROM subscriptions s JOIN plans pl ON pl.id=s.plan_id WHERE s.user_id=$1`,
        [u.id],
      );
      const {
        rows: [counts],
      } = await q(
        `SELECT count(*) FILTER(WHERE is_beta) beta, count(*) total FROM products WHERE is_published=true`,
      );
      const { rows: recent } = await q(
        `SELECT a.*,p.title,p.product_type FROM user_activity a JOIN products p ON p.id=a.product_id WHERE a.user_id=$1 ORDER BY a.updated_at DESC LIMIT 4`,
        [u.id],
      );
      return json(res, 200, {
        user: safe(u),
        subscription: sub || {
          plan_id: "normal",
          plan_title: "عادی",
          ends_at: null,
        },
        stats: {
          total: Number(counts.total),
          beta: Number(counts.beta),
          reports: 0,
        },
        recent,
      });
    }
    if (req.method === "POST" && p === "/api/subscription/upgrade") {
      return json(res, 410, {
        error:
          "این مسیر غیرفعال است. ارتقا فقط از طریق فرایند پرداخت انجام می‌شود.",
      });
    }
    if (req.method === "POST" && p === "/api/activity") {
      const u = await need(req, res);
      if (!u) return;
      const d = await body(req);
      await q(
        `INSERT INTO user_activity(user_id,product_id,action,progress) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,product_id) DO UPDATE SET action=EXCLUDED.action,progress=EXCLUDED.progress,updated_at=NOW()`,
        [u.id, d.product_id, d.action || "started", Number(d.progress || 0)],
      );
      return json(res, 200, { message: "فعالیت ثبت شد." });
    }
    if (req.method === "GET" && p === "/api/admin/analytics") {
      const u = await need(req, res, "admin");
      if (!u) return;
      const {
        rows: [summary],
      } = await q(
        `SELECT (SELECT COUNT(*) FROM orders) orders,(SELECT COUNT(*) FROM orders WHERE status='paid') paid_orders,(SELECT COALESCE(SUM(final_amount),0) FROM orders WHERE status='paid') revenue,(SELECT COUNT(*) FROM tickets WHERE status NOT IN ('closed')) open_tickets,(SELECT COUNT(*) FROM product_files) files`,
      );
      const { rows: top } = await q(
        `SELECT p.id,p.title,COUNT(a.id) uses FROM products p LEFT JOIN user_activity a ON a.product_id=p.id GROUP BY p.id,p.title ORDER BY uses DESC,p.title LIMIT 10`,
      );
      const { rows: monthly } = await q(
        `SELECT to_char(date_trunc('month',created_at),'YYYY-MM') month,COUNT(*) orders,COALESCE(SUM(final_amount) FILTER(WHERE status='paid'),0) revenue FROM orders GROUP BY 1 ORDER BY 1 DESC LIMIT 12`,
      );
      return json(res, 200, {
        summary: Object.fromEntries(
          Object.entries(summary).map(([k, v]) => [k, Number(v)]),
        ),
        top,
        monthly,
      });
    }
    if (req.method === "GET" && p === "/api/admin/orders") {
      const u = await need(req, res, "admin");
      if (!u) return;
      const { rows } = await q(
        `SELECT o.*,u.username,pl.title plan_title,p.status payment_status,p.ref_id FROM orders o JOIN users u ON u.id=o.user_id JOIN plans pl ON pl.id=o.plan_id LEFT JOIN payments p ON p.order_id=o.id ORDER BY o.created_at DESC`,
      );
      return json(res, 200, { orders: rows });
    }
    if (req.method === "GET" && p === "/api/admin/tickets") {
      const u = await need(req, res, "admin");
      if (!u) return;
      const { rows } = await q(
        `SELECT t.*,u.username FROM tickets t JOIN users u ON u.id=t.user_id ORDER BY CASE WHEN t.status='open' THEN 0 ELSE 1 END,t.updated_at DESC`,
      );
      return json(res, 200, { tickets: rows });
    }
    const adminTicketMatch = p.match(/^\/api\/admin\/tickets\/(\d+)$/);
    if (req.method === "GET" && adminTicketMatch) {
      const u = await need(req, res, "admin");
      if (!u) return;
      const {
        rows: [t],
      } = await q(
        `SELECT t.*,u.username FROM tickets t JOIN users u ON u.id=t.user_id WHERE t.id=$1`,
        [adminTicketMatch[1]],
      );
      if (!t) return json(res, 404, { error: "تیکت یافت نشد." });
      const { rows: messages } = await q(
        `SELECT m.*,u.username,u.role FROM ticket_messages m JOIN users u ON u.id=m.sender_id WHERE ticket_id=$1 ORDER BY m.created_at`,
        [t.id],
      );
      return json(res, 200, { ticket: t, messages });
    }
    if (req.method === "POST" && adminTicketMatch) {
      const u = await need(req, res, "admin");
      if (!u) return;
      const d = await body(req);
      if (!d.body) return json(res, 400, { error: "متن پاسخ الزامی است." });
      await q(
        "INSERT INTO ticket_messages(ticket_id,sender_id,body) VALUES($1,$2,$3)",
        [adminTicketMatch[1], u.id, String(d.body)],
      );
      await q("UPDATE tickets SET status=$1,updated_at=NOW() WHERE id=$2", [
        d.status || "answered",
        adminTicketMatch[1],
      ]);
      const {
        rows: [t],
      } = await q("SELECT user_id,subject FROM tickets WHERE id=$1", [
        adminTicketMatch[1],
      ]);
      if (t)
        await q(
          "INSERT INTO notifications(user_id,title,body,type) VALUES($1,$2,$3,$4)",
          [
            t.user_id,
            "پاسخ پشتیبانی",
            `پاسخ جدید برای تیکت «${t.subject}» ثبت شد.`,
            "ticket",
          ],
        );
      return json(res, 201, { message: "پاسخ ثبت شد." });
    }
    if (req.method === "GET" && p === "/api/admin/coupons") {
      const u = await need(req, res, "admin");
      if (!u) return;
      const { rows } = await q(
        "SELECT * FROM coupons ORDER BY created_at DESC",
      );
      return json(res, 200, { coupons: rows });
    }
    if (req.method === "POST" && p === "/api/admin/coupons") {
      const u = await need(req, res, "admin");
      if (!u) return;
      const d = await body(req);
      const code = String(d.code || "")
        .trim()
        .toUpperCase();
      if (!code || !Number.isInteger(Number(d.discount_value)))
        return json(res, 400, { error: "کد و مقدار تخفیف الزامی است." });
      const {
        rows: [c],
      } = await q(
        "INSERT INTO coupons(code,discount_type,discount_value,max_uses,expires_at,is_active) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
        [
          code,
          d.discount_type === "fixed" ? "fixed" : "percent",
          Number(d.discount_value),
          d.max_uses ? Number(d.max_uses) : null,
          d.expires_at || null,
          d.is_active !== false,
        ],
      );
      await audit(u.id, "create", "coupon", c.id, { code });
      return json(res, 201, { coupon: c });
    }
    const adminCouponMatch = p.match(/^\/api\/admin\/coupons\/(\d+)$/);
    if (req.method === "PATCH" && adminCouponMatch) {
      const u = await need(req, res, "admin");
      if (!u) return;
      const d = await body(req);
      await q(
        "UPDATE coupons SET is_active=COALESCE($1,is_active),max_uses=COALESCE($2,max_uses),expires_at=COALESCE($3,expires_at) WHERE id=$4",
        [
          d.is_active ?? null,
          d.max_uses ?? null,
          d.expires_at ?? null,
          adminCouponMatch[1],
        ],
      );
      return json(res, 200, { message: "کد تخفیف به‌روزرسانی شد." });
    }
    if (req.method === "GET" && p === "/api/notifications") {
      const u = await need(req, res);
      if (!u) return;
      const { rows } = await q(
        "SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50",
        [u.id],
      );
      return json(res, 200, { notifications: rows });
    }
    const notificationMatch = p.match(/^\/api\/notifications\/(\d+)\/read$/);
    if (req.method === "PATCH" && notificationMatch) {
      const u = await need(req, res);
      if (!u) return;
      await q(
        "UPDATE notifications SET is_read=true WHERE id=$1 AND user_id=$2",
        [notificationMatch[1], u.id],
      );
      return json(res, 200, { message: "خوانده شد." });
    }
    if (req.method === "GET" && p === "/api/admin/notifications") {
      const u = await need(req, res, "admin");
      if (!u) return;
      const { rows } = await q(
        `SELECT n.*,u.username FROM notifications n JOIN users u ON u.id=n.user_id ORDER BY n.created_at DESC LIMIT 200`,
      );
      return json(res, 200, { notifications: rows });
    }
    if (req.method === "POST" && p === "/api/admin/notifications") {
      const u = await need(req, res, "admin");
      if (!u) return;
      const d = await body(req);
      if (!d.title || !d.body)
        return json(res, 400, { error: "عنوان و متن اعلان الزامی است." });
      if (d.user_id)
        await q(
          "INSERT INTO notifications(user_id,title,body,type) VALUES($1,$2,$3,$4)",
          [d.user_id, d.title, d.body, d.type || "info"],
        );
      else
        await q(
          "INSERT INTO notifications(user_id,title,body,type) SELECT id,$1,$2,$3 FROM users WHERE role<>'admin'",
          [d.title, d.body, d.type || "info"],
        );
      return json(res, 201, { message: "اعلان ارسال شد." });
    }
    if (req.method === "GET" && p === "/api/tickets") {
      const u = await need(req, res);
      if (!u) return;
      const { rows } = await q(
        "SELECT * FROM tickets WHERE user_id=$1 ORDER BY updated_at DESC",
        [u.id],
      );
      return json(res, 200, { tickets: rows });
    }
    if (req.method === "POST" && p === "/api/tickets") {
      const u = await need(req, res);
      if (!u) return;
      const d = await body(req);
      if (!d.subject || !d.body)
        return json(res, 400, { error: "موضوع و متن الزامی است." });
      const {
        rows: [t],
      } = await q(
        "INSERT INTO tickets(user_id,subject,category,priority) VALUES($1,$2,$3,$4) RETURNING *",
        [
          u.id,
          String(d.subject),
          String(d.category || "عمومی"),
          String(d.priority || "normal"),
        ],
      );
      await q(
        "INSERT INTO ticket_messages(ticket_id,sender_id,body) VALUES($1,$2,$3)",
        [t.id, u.id, String(d.body)],
      );
      return json(res, 201, { ticket: t });
    }
    const ticketMatch = p.match(/^\/api\/tickets\/(\d+)$/);
    if (req.method === "GET" && ticketMatch) {
      const u = await need(req, res);
      if (!u) return;
      const {
        rows: [t],
      } = await q("SELECT * FROM tickets WHERE id=$1 AND user_id=$2", [
        ticketMatch[1],
        u.id,
      ]);
      if (!t) return json(res, 404, { error: "تیکت یافت نشد." });
      const { rows: messages } = await q(
        `SELECT m.*,u.username,u.role FROM ticket_messages m JOIN users u ON u.id=m.sender_id WHERE ticket_id=$1 ORDER BY m.created_at`,
        [t.id],
      );
      return json(res, 200, { ticket: t, messages });
    }
    if (req.method === "POST" && ticketMatch) {
      const u = await need(req, res);
      if (!u) return;
      const d = await body(req);
      const {
        rows: [t],
      } = await q("SELECT * FROM tickets WHERE id=$1 AND user_id=$2", [
        ticketMatch[1],
        u.id,
      ]);
      if (!t) return json(res, 404, { error: "تیکت یافت نشد." });
      if (!d.body) return json(res, 400, { error: "متن پیام الزامی است." });
      await q(
        "INSERT INTO ticket_messages(ticket_id,sender_id,body) VALUES($1,$2,$3)",
        [t.id, u.id, String(d.body)],
      );
      await q("UPDATE tickets SET status='open',updated_at=NOW() WHERE id=$1", [
        t.id,
      ]);
      return json(res, 201, { message: "پیام ثبت شد." });
    }
    // بررسی وضعیت اتصال بله
    if (req.method === "GET" && p === "/api/bale/status") {
      const u = await need(req, res);
      if (!u) return;

      try {
        const {
          rows: [account],
        } = await q(
          `SELECT linked_at
       FROM bale_accounts
       WHERE user_id = $1`,
          [u.id],
        );

        return json(res, 200, {
          connected: Boolean(account),
          linkedAt: account?.linked_at || null,
        });
      } catch (error) {
        console.error("Bale status error:", error);
        return json(res, 500, {
          error: "بررسی وضعیت اتصال با خطا مواجه شد.",
        });
      }
    }
    if (req.method === "DELETE" && p === "/api/bale/account") {
      const u = await need(req, res);
      if (!u) return;

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rowCount } = await client.query(
          "DELETE FROM bale_accounts WHERE user_id=$1",
          [u.id],
        );
        // A delivered invoice must not remain payable after its account is unlinked.
        await client.query(
          `UPDATE payments p SET status='failed'
           FROM orders o
           WHERE p.order_id=o.id AND o.user_id=$1
             AND p.gateway='bale' AND p.status='pending'`,
          [u.id],
        );
        await client.query(
          `UPDATE orders SET status='failed'
           WHERE user_id=$1 AND status='pending'
             AND id IN (SELECT order_id FROM payments WHERE gateway='bale' AND status='failed')`,
          [u.id],
        );
        await client.query(
          "DELETE FROM bale_link_tokens WHERE user_id=$1 AND used_at IS NULL",
          [u.id],
        );
        await client.query("COMMIT");
        return json(res, 200, {
          disconnected: Boolean(rowCount),
          message: "اتصال حساب بله با موفقیت قطع شد.",
        });
      } catch (error) {
        await client.query("ROLLBACK");
        console.error("Bale disconnect error:", error);
        return json(res, 500, { error: "قطع اتصال بله با خطا مواجه شد." });
      } finally {
        client.release();
      }
    }
    if (req.method === "POST" && p === "/api/checkout") {
      const u = await need(req, res);
      if (!u) return;
      const d = await body(req);
      if (!["normal", "silver", "gold"].includes(String(d.plan_id || "")))
        return json(res, 400, { error: "پلن نامعتبر است." });

      if (String(d.plan_id) === "normal")
        return json(res, 400, {
          error: "پلن عادی قابل خرید نیست.",
        });

      const {
        rows: [pl],
      } = await q("SELECT * FROM plans WHERE id=$1", [d.plan_id]);
      if (!pl) return json(res, 400, { error: "پلن نامعتبر است." });
      let discount = 0,
        coupon = null;
      if (d.coupon_code) {
        const {
          rows: [c],
        } = await q(
          `SELECT * FROM coupons WHERE code=$1 AND is_active=true AND (expires_at IS NULL OR expires_at>NOW()) AND (max_uses IS NULL OR used_count<max_uses)`,
          [String(d.coupon_code).trim().toUpperCase()],
        );
        if (!c) return json(res, 400, { error: "کد تخفیف معتبر نیست." });
        const {
          rows: [used],
        } = await q(
          "SELECT id FROM coupon_redemptions WHERE coupon_id=$1 AND user_id=$2",
          [c.id, u.id],
        );
        if (used)
          return json(res, 400, { error: "این کد قبلاً استفاده شده است." });
        discount =
          c.discount_type === "percent"
            ? Math.floor(
                (pl.price * Math.min(100, Math.max(0, c.discount_value))) / 100,
              )
            : Math.min(pl.price, Math.max(0, c.discount_value));
        coupon = c;
      }
      const final = Math.max(0, pl.price - discount);
      const isBale =
        process.env.PAYMENT_MODE === "real" &&
        process.env.PAYMENT_GATEWAY === "bale";
      if (process.env.PAYMENT_MODE === "real" && !isBale)
        return json(res, 503, {
          error: "درگاه پرداخت واقعی بله پیکربندی نشده است.",
        });
      let baleAccount = null;
      let baleBotLink = null;
      if (isBale) {
        if (
          !process.env.BALE_PAYMENT_PROVIDER_TOKEN ||
          !process.env.BALE_BOT_TOKEN
        )
          return json(res, 503, {
            error: "تنظیمات پرداخت بله در سرور کامل نیست.",
          });
        const {
          rows: [account],
        } = await q("SELECT chat_id FROM bale_accounts WHERE user_id=$1", [
          u.id,
        ]);
        if (!account)
          return json(res, 409, {
            error: "ابتدا حساب بله خود را در بخش اشتراک متصل کنید.",
          });
        baleAccount = account;
        try {
          baleBotLink = `https://ble.ir/${await baleBotUsername()}`;
        } catch (error) {
          console.error("Bale bot lookup error:", error.message);
          return json(res, 503, {
            error: "ارتباط با ربات بله برقرار نشد. تنظیمات ربات را بررسی کنید.",
          });
        }
        // Only the latest unpaid Bale invoice for a user is payable. Older messages
        // remain in the chat but are rejected during pre-checkout validation.
        await q(
          `UPDATE payments p SET status='failed'
           FROM orders o
           WHERE p.order_id=o.id AND o.user_id=$1
             AND p.gateway='bale' AND p.status='pending'`,
          [u.id],
        );
        await q(
          `UPDATE orders SET status='failed'
           WHERE user_id=$1 AND status='pending'
             AND id IN (SELECT order_id FROM payments WHERE gateway='bale' AND status='failed')`,
          [u.id],
        );
      }
      const {
        rows: [order],
      } = await q(
        "INSERT INTO orders(user_id,plan_id,amount,discount_amount,final_amount,status,coupon_code) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
        [
          u.id,
          pl.id,
          pl.price,
          discount,
          final,
          "pending",
          coupon?.code || null,
        ],
      );
      const {
        rows: [payment],
      } = await q(
        "INSERT INTO payments(order_id,amount,gateway,status) VALUES($1,$2,$3,$4) RETURNING *",
        [
          order.id,
          final,
          isBale ? "bale" : process.env.PAYMENT_GATEWAY || "mock",
          "pending",
        ],
      );
      if (final === 0) {
        await activatePayment(pool, {
          paymentId: payment.id,
          gateway: "discount",
          authority: "FREE",
          refId: "FREE",
        });
        return json(res, 201, {
          order,
          payment: { ...payment, status: "paid" },
          mode: "free",
          message: "سفارش با تخفیف کامل ثبت شد.",
        });
      }
      if (isBale) {
        const payload = `rypay:${payment.id}`;
        const baleAmount = tomanToRial(final);
        await q("UPDATE payments SET bale_payload=$1 WHERE id=$2", [
          payload,
          payment.id,
        ]);
        try {
          await baleRequest("sendInvoice", {
            chat_id: baleAccount.chat_id,
            title: "اشتراک روان‌یار",
            description: `خرید ${pl.title} برای ۳۰ روز`,
            payload,
            provider_token: process.env.BALE_PAYMENT_PROVIDER_TOKEN,
            prices: [{ label: pl.title, amount: baleAmount }],
          });
        } catch (error) {
          await q(
            "UPDATE payments SET status='failed' WHERE id=$1 AND status='pending'",
            [payment.id],
          );
          await q(
            "UPDATE orders SET status='failed' WHERE id=$1 AND status='pending'",
            [order.id],
          );
          throw error;
        }
      }
      return json(res, 201, {
        order,
        payment,
        mode: isBale ? "bale" : process.env.PAYMENT_MODE || "mock",
        message: isBale ? "درخواست پرداخت به چت بله شما ارسال شد." : undefined,
        baleBotLink,
      });
    }
    const payMatch = p.match(/^\/api\/payments\/([^/]+)\/confirm$/);
    if (req.method === "POST" && payMatch) {
      const u = await need(req, res);
      if (!u) return;
      if (process.env.PAYMENT_MODE !== "mock")
        return json(res, 409, {
          error: "تأیید آزمایشی پرداخت در حالت Production غیرفعال است.",
        });
      const {
        rows: [payment],
      } = await q(
        `SELECT p.*,o.user_id,o.plan_id,o.coupon_code,o.amount,o.discount_amount,o.final_amount,o.status order_status FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.id=$1 AND o.user_id=$2`,
        [payMatch[1], u.id],
      );
      if (!payment) return json(res, 404, { error: "پرداخت یافت نشد." });
      if (payment.status === "paid")
        return json(res, 200, { message: "قبلاً ثبت شده است." });
      if (payment.order_status !== "pending")
        return json(res, 409, { error: "سفارش در وضعیت قابل پرداخت نیست." });
      const client = await pool.connect(),
        ref = "MOCK-" + Date.now() + "-" + randomBytes(4).toString("hex");
      try {
        await client.query("BEGIN");
        const {
          rows: [fresh],
        } = await client.query(
          "SELECT status FROM payments WHERE id=$1 FOR UPDATE",
          [payment.id],
        );
        if (fresh.status === "paid") {
          await client.query("COMMIT");
          return json(res, 200, { message: "قبلاً ثبت شده است." });
        }
        await client.query(
          "UPDATE payments SET status='paid',authority=$1,ref_id=$1,paid_at=NOW() WHERE id=$2",
          [ref, payment.id],
        );
        await client.query(
          "UPDATE orders SET status='paid',paid_at=NOW() WHERE id=$1",
          [payment.order_id],
        );
        const usageLimit =
          payment.plan_id === "silver"
            ? 3
            : payment.plan_id === "gold"
              ? 9
              : null;

        await client.query(
          `INSERT INTO subscriptions(
    user_id,
    plan_id,
    status,
    starts_at,
    ends_at,
    usage_limit,
    usage_count
  )
  VALUES(
    $1,
    $2,
    'active',
    NOW(),
    NOW() + INTERVAL '30 days',
    $3,
    0
  )
  ON CONFLICT(user_id)
  DO UPDATE SET
    plan_id = EXCLUDED.plan_id,
    status = 'active',
    starts_at = EXCLUDED.starts_at,
    ends_at = EXCLUDED.ends_at,
    usage_limit = EXCLUDED.usage_limit,
    usage_count = 0`,
          [u.id, payment.plan_id, usageLimit],
        );
        if (payment.coupon_code) {
          const {
            rows: [r],
          } = await client.query(
            "INSERT INTO coupon_redemptions(coupon_id,user_id,order_id) SELECT id,$1,$2 FROM coupons WHERE code=$3 ON CONFLICT DO NOTHING RETURNING id",
            [u.id, payment.order_id, payment.coupon_code],
          );
          if (r)
            await client.query(
              "UPDATE coupons SET used_count=used_count+1 WHERE code=$1",
              [payment.coupon_code],
            );
        }
        const invoiceNo =
          "RY-" + new Date().getFullYear() + "-" + String(Date.now()).slice(-8);
        await client.query(
          "INSERT INTO invoices(invoice_no,order_id,user_id,amount,discount_amount,final_amount,status) VALUES($1,$2,$3,$4,$5,$6,'issued') ON CONFLICT(order_id) DO NOTHING",
          [
            invoiceNo,
            payment.order_id,
            u.id,
            payment.amount,
            payment.discount_amount,
            payment.final_amount,
          ],
        );
        await client.query(
          "INSERT INTO notifications(user_id,title,body,type) VALUES($1,$2,$3,$4)",
          [
            u.id,
            "پرداخت موفق",
            `اشتراک ${payment.plan_id} فعال شد و فاکتور صادر گردید.`,
            "payment",
          ],
        );
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
      return json(res, 200, {
        message: "پرداخت با موفقیت ثبت شد.",
        reference: ref,
      });
    }

    if (req.method === "GET" && p === "/api/orders") {
      const u = await need(req, res);
      if (!u) return;
      const { rows } = await q(
        `SELECT o.*,pl.title plan_title,p.status payment_status,p.ref_id FROM orders o JOIN plans pl ON pl.id=o.plan_id LEFT JOIN payments p ON p.order_id=o.id WHERE o.user_id=$1 ORDER BY o.created_at DESC`,
        [u.id],
      );
      return json(res, 200, { orders: rows });
    }
    if (req.method === "GET" && p === "/api/invoices") {
      const u = await need(req, res);
      if (!u) return;
      const { rows } = await q(
        `SELECT i.*,o.created_at,pl.title plan_title FROM invoices i JOIN orders o ON o.id=i.order_id JOIN plans pl ON pl.id=o.plan_id WHERE i.user_id=$1 ORDER BY i.issued_at DESC`,
        [u.id],
      );
      return json(res, 200, { invoices: rows });
    }
    if (
      req.method === "POST" &&
      /^\/api\/admin\/products\/[^/]+\/files$/.test(p)
    ) {
      const u = await need(req, res, "admin");
      if (!u) return;

      const productId = decodeURIComponent(p.split("/")[4]);

      const { form, file } = await multipart(req);

      if (!file) {
        return json(res, 400, {
          error: "فایل انتخاب نشده است.",
        });
      }

      if (file.size > MAX_UPLOAD_BYTES) {
        return json(res, 413, {
          error: `حجم فایل بیش از ${Math.floor(
            MAX_UPLOAD_BYTES / 1024 / 1024,
          )} مگابایت است.`,
        });
      }

      const allowed = [
        "html",
        "htm",
        "pdf",
        "zip",
        "doc",
        "docx",
        "xlsx",
        "xls",
        "ppt",
        "pptx",
        "txt",
        "mp4",
        "webm",
        "mp3",
        "wav",
        "png",
        "jpg",
        "jpeg",
      ];

      const ext = extname(file.name).toLowerCase().slice(1);

      console.log("UPLOAD FILE:", file.name, "EXT:", ext, "MIME:", file.type);

      if (!allowed.includes(ext)) {
        return json(res, 400, {
          error: `فرمت فایل .${ext || "نامشخص"} مجاز نیست.`,
        });
      }

      const {
        rows: [product],
      } = await q("SELECT id FROM products WHERE id=$1", [productId]);

      if (!product) {
        return json(res, 404, {
          error: "محصول یافت نشد.",
        });
      }

      const safeName = file.name
        .replace(/[^\w\-.\u0600-\u06FF ]+/g, "_")
        .replace(/\s+/g, "_");

      const stored = `${Date.now()}-${randomUUID()}-${safeName}`;

      await writeFile(
        join(UPLOAD_ROOT, stored),
        Buffer.from(await file.arrayBuffer()),
      );

      const {
        rows: [f],
      } = await q(
        `INSERT INTO product_files
    (
      product_id,
      original_name,
      stored_name,
      mime_type,
      size_bytes,
      file_role,
      version_label,
      is_active,
      uploaded_by
    )
    VALUES
    ($1,$2,$3,$4,$5,$6,$7,true,$8)
    RETURNING *`,
        [
          product.id,
          file.name,
          stored,
          file.type || "application/octet-stream",
          file.size,
          String(form.get("file_role") || "main"),
          String(form.get("version_label") || ""),
          u.id,
        ],
      );

      await audit(u.id, "upload", "product_file", f.id, {
        product_id: product.id,
        extension: ext,
      });

      return json(res, 201, {
        file: f,
      });
    }

    if (req.method === "GET" && p === "/api/admin/product-files") {
      const u = await need(req, res, "admin");
      if (!u) return;

      const { rows } = await q(
        `SELECT f.*,p.title product_title
     FROM product_files f
     JOIN products p ON p.id=f.product_id
     ORDER BY f.created_at DESC`,
      );

      return json(res, 200, { files: rows });
    }
    const productFileDelete = p.match(/^\/api\/admin\/product-files\/([^/]+)$/);
    if (req.method === "DELETE" && productFileDelete) {
      const u = await need(req, res, "admin");
      if (!u) return;
      const {
        rows: [f],
      } = await q("SELECT * FROM product_files WHERE id=$1", [
        productFileDelete[1],
      ]);
      if (!f) return json(res, 404, { error: "فایل یافت نشد." });
      await q("DELETE FROM product_files WHERE id=$1", [f.id]);
      await unlink(join(UPLOAD_ROOT, f.stored_name)).catch(() => {});
      return json(res, 200, { message: "فایل حذف شد." });
    }
    const productFilesMatch = p.match(/^\/api\/products\/([^/]+)\/files$/);
    if (req.method === "GET" && productFilesMatch) {
      const u = await need(req, res);
      if (!u) return;
      const {
        rows: [product],
      } = await q("SELECT * FROM products WHERE id=$1 AND is_published=true", [
        decodeURIComponent(productFilesMatch[1]),
      ]);
      if (!product) return json(res, 404, { error: "محصول یافت نشد." });
      if (!(await canAccessProduct(u.id, product)))
        return json(res, 403, { error: "سطح اشتراک کافی نیست." });
      const { rows: files } = await q(
        "SELECT id,original_name,mime_type,size_bytes,file_role,version_label,created_at FROM product_files WHERE product_id=$1 AND is_active=true ORDER BY created_at DESC",
        [product.id],
      );
      return json(res, 200, { files });
    }
    const downloadMatch = p.match(/^\/api\/product-files\/([^/]+)\/download$/);
    if (req.method === "GET" && downloadMatch) {
      const u = await need(req, res);
      if (!u) return;
      const {
        rows: [f],
      } = await q(
        "SELECT f.*,p.* FROM product_files f JOIN products p ON p.id=f.product_id WHERE f.id=$1",
        [downloadMatch[1]],
      );
      if (!f) return json(res, 404, { error: "فایل یافت نشد." });
      if (!(await canAccessProduct(u.id, f)))
        return json(res, 403, { error: "دسترسی مجاز نیست." });
      const full = join(UPLOAD_ROOT, f.stored_name);
      const info = await stat(full);
      securityHeaders(res);
      const range = req.headers.range;
      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range);
        if (m) {
          const start = m[1]
            ? Number(m[1])
            : Math.max(0, info.size - Number(m[2] || 0));
          const end = m[2] ? Number(m[2]) : info.size - 1;
          if (start <= end && start < info.size) {
            const { createReadStream } = await import("node:fs");
            res.writeHead(206, {
              "Content-Type": f.mime_type || "application/octet-stream",
              "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(f.original_name)}`,
              "Content-Range": `bytes ${start}-${end}/${info.size}`,
              "Accept-Ranges": "bytes",
              "Content-Length": end - start + 1,
              "Cache-Control": "private, no-store",
            });
            return createReadStream(full, { start, end }).pipe(res);
          }
        }
      }
      const { createReadStream } = await import("node:fs");
      res.writeHead(200, {
        "Content-Type": f.mime_type || "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(f.original_name)}`,
        "Accept-Ranges": "bytes",
        "Content-Length": info.size,
        "Cache-Control": "private, no-store",
      });
      return createReadStream(full).pipe(res);
    }
    const versionMatch = p.match(/^\/api\/admin\/products\/([^/]+)\/versions$/);
    if (req.method === "GET" && versionMatch) {
      const u = await need(req, res, "admin");
      if (!u) return;
      const { rows } = await q(
        "SELECT * FROM product_versions WHERE product_id=$1 ORDER BY created_at DESC",
        [decodeURIComponent(versionMatch[1])],
      );
      return json(res, 200, { versions: rows });
    }
    if (req.method === "POST" && versionMatch) {
      const u = await need(req, res, "admin");
      if (!u) return;
      const d = await body(req);
      if (!d.version_label)
        return json(res, 400, { error: "شماره نسخه الزامی است." });
      const released = d.status === "released";
      const {
        rows: [v],
      } = await q(
        `INSERT INTO product_versions(product_id,version_label,changelog,status,released_at,created_by) VALUES($1,$2,$3,$4,${released ? "NOW()" : "NULL"},$5) RETURNING *`,
        [
          decodeURIComponent(versionMatch[1]),
          String(d.version_label),
          String(d.changelog || ""),
          d.status || "draft",
          u.id,
        ],
      );
      return json(res, 201, { version: v });
    }
    if (req.method === "GET" && p === "/api/admin/audit-logs") {
      const u = await need(req, res, "admin");
      if (!u) return;
      const { rows } = await q(
        `SELECT l.*,u.username FROM admin_audit_logs l JOIN users u ON u.id=l.admin_id ORDER BY l.created_at DESC LIMIT 300`,
      );
      return json(res, 200, { logs: rows });
    }
    // ============================================
    // PROTECTED CAREER SELECTION SYSTEM
    // ============================================
    if (req.method === "GET" && p === "/assessments/ChaFildv7.html") {
      const u = await need(req, res);

      if (!u) return;

      const allowed = await canAccessCareerSystem(u.id);

      if (!allowed) {
        const sub = await currentSubscription(u.id);

        let message =
          "برای استفاده از سامانه انتخاب رشته، اشتراک نقره‌ای یا طلایی فعال لازم است.";

        if (
          sub &&
          sub.status === "active" &&
          sub.ends_at &&
          new Date(sub.ends_at) <= new Date()
        ) {
          message = "مدت ۳۰ روزه اشتراک شما به پایان رسیده است.";
        } else if (
          sub &&
          ["silver", "gold"].includes(sub.plan_id) &&
          Number(sub.usage_count || 0) >= Number(sub.usage_limit || 0)
        ) {
          message =
            "تعداد دفعات مجاز استفاده از سامانه در اشتراک شما به پایان رسیده است.";
        }

        return json(res, 403, {
          error: message,
        });
      }

      // ادامه کد فعلی ارسال فایل ChaFildv7.html
      const full = normalize(join(ROOT, "/assessments/ChaFildv7.html"));

      if (!full.startsWith(ROOT)) {
        return json(res, 403, {
          error: "دسترسی غیرمجاز.",
        });
      }

      await stat(full);

      securityHeaders(res);

      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
      });

      return res.end(await readFile(full));
    }
    // ============================================
    // CONSUME CAREER SELECTION USAGE
    // فقط با زدن «تحلیل هوشمند» یک استفاده مصرف می‌شود
    // ============================================
    if (req.method === "POST" && p === "/api/career/consume") {
      const u = await need(req, res);

      if (!u) return;

      const result = await consumeCareerUsage(u.id);

      if (!result.allowed) {
        const messages = {
          NO_SUBSCRIPTION:
            "برای استفاده از سامانه انتخاب رشته، اشتراک نقره‌ای یا طلایی لازم است.",

          INVALID_PLAN:
            "اشتراک فعلی شما اجازه استفاده از سامانه انتخاب رشته را ندارد.",

          INACTIVE: "اشتراک شما فعال نیست.",

          EXPIRED: "مدت ۳۰ روزه اشتراک شما به پایان رسیده است.",

          USAGE_LIMIT:
            "تعداد دفعات مجاز استفاده از سامانه در اشتراک شما به پایان رسیده است.",
        };

        return json(res, 403, {
          error:
            messages[result.reason] ||
            "امکان استفاده از سامانه انتخاب رشته وجود ندارد.",
        });
      }

      return json(res, 200, {
        ok: true,
        usageCount: result.usageCount,
        usageLimit: result.usageLimit,
        usageRemaining: result.remaining,
      });
    }
    // ============================================
    // PROTECTED CAREER EXCEL FILES
    // ============================================
    const careerDataFiles = {
      1: {
        path: "/assessments/data/1.xlsx",
        filename: "1.xlsx",
      },
      2: {
        path: "/assessments/data/2.xlsx",
        filename: "2.xlsx",
      },
      3: {
        path: "/assessments/data/3.xlsx",
        filename: "3.xlsx",
      },
    };

    const careerDataMatch = p.match(/^\/api\/career-data\/([123])$/);

    if (req.method === "GET" && careerDataMatch) {
      const u = await need(req, res);

      if (!u) return;

      const allowed = await canAccessCareerSystem(u.id);

      if (!allowed) {
        return json(res, 403, {
          error: "برای دریافت اطلاعات انتخاب رشته، اشتراک فعال لازم است.",
        });
      }

      const fileInfo = careerDataFiles[careerDataMatch[1]];

      if (!fileInfo) {
        return json(res, 404, {
          error: "فایل اطلاعاتی یافت نشد.",
        });
      }

      const full = normalize(join(ROOT, fileInfo.path));

      if (!full.startsWith(ROOT)) {
        return json(res, 403, {
          error: "دسترسی غیرمجاز.",
        });
      }

      const info = await stat(full);

      securityHeaders(res);

      res.writeHead(200, {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

        "Content-Disposition": `inline; filename="${fileInfo.filename}"`,

        "Content-Length": info.size,

        "Cache-Control": "private, no-store",

        "X-Content-Type-Options": "nosniff",
      });

      return res.end(await readFile(full));
    }
    // ============================================
    // BLOCK DIRECT ACCESS TO CAREER DATA FILES
    // ============================================
    if (
      req.method === "GET" &&
      /^\/assessments\/data\/(?:1|2|3)\.xlsx$/i.test(p)
    ) {
      return json(res, 403, {
        error: "دسترسی مستقیم به فایل اطلاعاتی مجاز نیست.",
      });
    }
    if (req.method === "GET") {
      const file = p === "/" ? "/index.html" : p,
        full = normalize(join(ROOT, file));
      if (!full.startsWith(ROOT)) return json(res, 403, { error: "ممنوع" });
      const mime =
        {
          ".html": "text/html; charset=utf-8",
          ".js": "text/javascript; charset=utf-8",
          ".css": "text/css; charset=utf-8",
        }[extname(full)] || "application/octet-stream";
      await stat(full);
      securityHeaders(res);
      res.writeHead(200, { "Content-Type": mime, "Cache-Control": "no-store" });
      return res.end(await readFile(full));
    }
    json(res, 404, { error: "یافت نشد." });
  } catch (e) {
    console.error(e);
    json(res, e.status || 500, {
      error: e.status === 413 ? e.message : "خطای داخلی سرور رخ داد.",
    });
  }
}
setup()
  .then(async () => {
    await normalizeExpiredSubscriptions();

    setInterval(() => {
      normalizeExpiredSubscriptions().catch((err) => {
        console.error("Subscription normalization error:", err);
      });
    }, 30 * 1000);
    createServer(handler).listen(PORT, () =>
      console.log(`سامانه روی http://localhost:${PORT} اجرا شد`),
    );
  })
  .catch((e) => {
    console.error("اتصال PostgreSQL برقرار نشد:", e.message);
    process.exit(1);
  });
