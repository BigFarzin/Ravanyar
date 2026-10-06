import "dotenv/config";
import pg from "pg";
import { createHash } from "node:crypto";
import { activatePayment } from "./payment-service.mjs";

const { Pool } = pg;

const token = process.env.BALE_BOT_TOKEN;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

if (!token) {
  throw new Error("BALE_BOT_TOKEN در فایل env تنظیم نشده است.");
}

const api = `https://tapi.bale.ai/bot${token}`;
const tomanToRial = (amount) => Number(amount) * 10;

async function baleRequest(method, data = {}) {
  const response = await fetch(`${api}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(45000),
  });

  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error(result.description || `Bale API error: ${method}`);
  }

  return result.result;
}

async function sendMessage(chatId, text) {
  return baleRequest("sendMessage", {
    chat_id: chatId,
    text,
  });
}

async function linkAccount(chatId, payload) {
  const tokenHash = createHash("sha256").update(payload).digest("hex");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const {
      rows: [linkToken],
    } = await client.query(
      `SELECT id, user_id
       FROM bale_link_tokens
       WHERE token_hash = $1
         AND used_at IS NULL
         AND expires_at > NOW()
       FOR UPDATE`,
      [tokenHash],
    );

    if (!linkToken) {
      await client.query("ROLLBACK");
      return {
        success: false,
        message: "کد اتصال نامعتبر یا منقضی شده است. از سایت دوباره کد بگیر.",
      };
    }

    await client.query(
      `INSERT INTO bale_accounts (user_id, chat_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id)
       DO UPDATE SET
         chat_id = EXCLUDED.chat_id,
         linked_at = NOW()`,
      [linkToken.user_id, String(chatId)],
    );

    await client.query(
      `UPDATE bale_link_tokens
       SET used_at = NOW()
       WHERE id = $1`,
      [linkToken.id],
    );

    await client.query("COMMIT");

    return {
      success: true,
      message: "حساب روان‌یار با موفقیت به بله متصل شد.",
    };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Link account error:", error.message);

    return {
      success: false,
      message: "اتصال انجام نشد. لطفاً دوباره از سایت تلاش کن.",
    };
  } finally {
    client.release();
  }
}

async function handleUpdate(update) {
  if (update.pre_checkout_query)
    return handlePreCheckout(update.pre_checkout_query);
  if (update.message?.successful_payment)
    return handleSuccessfulPayment(update.message);

  const message = update.message;
  if (!message?.text || !message.chat?.id) return;

  const chatId = message.chat.id;
  const text = message.text.trim();

  // Fallback for Bale Web: some browsers lose the ?start parameter while
  // they send the user through the web-app login. The one-time code can be
  // pasted into the bot chat instead.
  if (/^[a-f0-9]{64}$/i.test(text)) {
    const result = await linkAccount(chatId, text);
    await sendMessage(chatId, result.message);
    return;
  }

  const match = text.match(/^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]+))?$/);

  if (!match) {
    await sendMessage(
      chatId,
      "برای اتصال حساب، لینک اتصال را از سایت روان‌یار باز کن.",
    );
    return;
  }

  const payload = match[1];

  if (!payload) {
    await sendMessage(
      chatId,
      "سلام! برای اتصال حساب، ابتدا از سایت روان‌یار لینک اتصال بساز و از طریق آن وارد ربات شو.",
    );
    return;
  }

  const result = await linkAccount(chatId, payload);
  await sendMessage(chatId, result.message);
}

function paymentIdFromPayload(payload) {
  const match = String(payload || "").match(/^rypay:([0-9a-f-]{36})$/i);
  return match?.[1] || null;
}

async function handlePreCheckout(preCheckout) {
  const paymentId = paymentIdFromPayload(preCheckout.invoice_payload);
  let ok = false;
  let errorMessage = "اطلاعات پرداخت معتبر نیست. لطفاً دوباره تلاش کنید.";
  try {
    if (!paymentId || preCheckout.currency !== "IRR") {
      errorMessage = "صورت‌حساب نامعتبر است.";
    } else {
      const {
        rows: [payment],
      } = await pool.query(
        `SELECT p.status, p.amount, p.bale_payload, b.chat_id
         FROM payments p
         JOIN orders o ON o.id=p.order_id
         JOIN bale_accounts b ON b.user_id=o.user_id
         WHERE p.id=$1 AND p.gateway='bale'`,
        [paymentId],
      );
      if (
        payment &&
        payment.status === "pending" &&
        payment.bale_payload === preCheckout.invoice_payload &&
        tomanToRial(payment.amount) === Number(preCheckout.total_amount) &&
        String(payment.chat_id) === String(preCheckout.from?.id)
      ) {
        ok = true;
      } else {
        errorMessage = "این صورت‌حساب دیگر قابل پرداخت نیست.";
      }
    }
  } catch (error) {
    console.error("Bale pre-checkout validation error:", error.message);
    errorMessage = "خطا در بررسی سفارش. لطفاً دوباره تلاش کنید.";
  }
  // Bale cancels the payment if this is not sent within 10 seconds.
  await baleRequest("answerPreCheckoutQuery", {
    pre_checkout_query_id: preCheckout.id,
    ok,
    ...(ok ? {} : { error_message: errorMessage }),
  });
}

async function handleSuccessfulPayment(message) {
  const paid = message.successful_payment;
  const paymentId = paymentIdFromPayload(paid.invoice_payload);
  if (!paymentId || paid.currency !== "IRR") return;
  try {
    const {
      rows: [payment],
    } = await pool.query(
      `SELECT p.id, p.status, p.amount, p.bale_payload, b.chat_id
       FROM payments p
       JOIN orders o ON o.id=p.order_id
       JOIN bale_accounts b ON b.user_id=o.user_id
       WHERE p.id=$1 AND p.gateway='bale'`,
      [paymentId],
    );
    if (
      !payment ||
      payment.bale_payload !== paid.invoice_payload ||
      tomanToRial(payment.amount) !== Number(paid.total_amount) ||
      String(payment.chat_id) !== String(message.chat?.id)
    ) {
      console.error("Ignoring invalid Bale successful payment", paymentId);
      return;
    }
    const result = await activatePayment(pool, {
      paymentId,
      gateway: "bale",
      authority: paid.telegram_payment_charge_id,
      refId: paid.provider_payment_charge_id || paid.telegram_payment_charge_id,
      balePayload: paid.invoice_payload,
      baleChargeId: paid.telegram_payment_charge_id,
    });
    if (!result.alreadyPaid)
      await sendMessage(
        message.chat.id,
        "پرداخت شما با موفقیت ثبت شد و اشتراک روان‌یار فعال است.",
      );
  } catch (error) {
    // Keep the update offset moving; duplicate SuccessfulPayment is safe because activation is idempotent.
    console.error("Bale successful payment processing error:", error.message);
  }
}

process.on("SIGINT", async () => {
  await pool.end();
  process.exit(0);
});
