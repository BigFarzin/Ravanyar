const root = document.querySelector("#app");
let state = {
  token: localStorage.token || "",
  user: null,
  products: [],
  subscription: null,
  notifications: [],
};
const level = { normal: 1, silver: 2, gold: 3 };
const planName = { normal: "عادی", silver: "نقره‌ای", gold: "طلایی" };
const api = async (path, opt = {}) => {
  const headers = {
    ...(state.token ? { Authorization: "Bearer " + state.token } : {}),
  };
  if (!(opt.body instanceof FormData))
    headers["Content-Type"] = "application/json";
  const r = await fetch(path, { ...opt, headers });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(d.error || "خطایی رخ داد");
  return d;
};
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (n) => Number(n || 0).toLocaleString("fa-IR") + " تومان";
function displayName() {
  const n = [state.user?.firstName, state.user?.lastName]
    .filter((x) => x && x !== "ثبت‌نشده")
    .join(" ")
    .trim();
  return n || state.user?.username || "کاربر";
}
function enterSession(d) {
  state.token = d.token;
  localStorage.token = d.token;
  state.user = d.user;
  d.user.role === "admin" ? admin() : home();
}
function login(msg = "", mode = "login") {
  const isRegister = mode === "register";

  root.innerHTML = `
    <div class="glass-auth-page">

      <!-- Background Glow -->
      <div class="auth-glow auth-glow-1"></div>
      <div class="auth-glow auth-glow-2"></div>
      <div class="auth-glow auth-glow-3"></div>

      <!-- Decorative shapes -->
      <div class="auth-orb auth-orb-1"></div>
      <div class="auth-orb auth-orb-2"></div>

      <div class="glass-auth-container">

        <!-- =========================
             LEFT / BRAND SECTION
        ========================== -->

        <section class="glass-auth-brand">

          <div class="brand-decoration decoration-1"></div>
          <div class="brand-decoration decoration-2"></div>

          <div class="auth-brand-content">

            <div class="auth-brand-logo">
              <span>✦</span>
            </div>

            <div class="auth-brand-name">
              روان‌یار
            </div>

            <div class="auth-brand-line"></div>

            <h1>
              مسیر شناخت،
              <br>
              <span>از همین‌جا شروع می‌شود.</span>
            </h1>

            <p>
              پلتفرم یکپارچه روان‌شناختی برای ارزیابی،
              آموزش و رشد فردی.
            </p>

            <div class="auth-feature-list">

              <div class="auth-feature">
                <div class="auth-feature-icon">✦</div>
                <div>
                  <strong>ارزیابی هوشمند</strong>
                  <span>شناخت بهتر ویژگی‌ها و توانمندی‌ها</span>
                </div>
              </div>

              <div class="auth-feature">
                <div class="auth-feature-icon">◈</div>
                <div>
                  <strong>مسیر رشد شخصی</strong>
                  <span>دسترسی به ابزارها و محتوای تخصصی</span>
                </div>
              </div>

              <div class="auth-feature">
                <div class="auth-feature-icon">✓</div>
                <div>
                  <strong>فضای امن و شخصی</strong>
                  <span>اطلاعات شما در حساب شخصی شما</span>
                </div>
              </div>

            </div>

          </div>

        </section>


        <!-- =========================
             LOGIN / REGISTER
        ========================== -->

        <section class="glass-auth-panel">

          <div class="glass-auth-card">

            <div class="glass-auth-card-header">

              <div class="mobile-auth-logo">
                ✦
              </div>

              <span class="glass-auth-eyebrow">
                ${isRegister ? "عضویت در روان‌یار" : "ورود به حساب"}
              </span>

              <h2>
                ${isRegister ? "حساب خودت را بساز" : "خوش آمدی 👋"}
              </h2>

              <p>
                ${
                  isRegister
                    ? "برای شروع مسیر خود اطلاعاتت را وارد کن."
                    : "برای ادامه وارد حساب کاربری خود شو."
                }
              </p>

            </div>


            <!-- Tabs -->

            <div class="glass-auth-tabs">

              <button
                type="button"
                id="tabLogin"
                class="${isRegister ? "" : "active"}"
              >
                ورود
              </button>

              <button
                type="button"
                id="tabRegister"
                class="${isRegister ? "active" : ""}"
              >
                ثبت‌نام
              </button>

              <div
                class="glass-tab-indicator ${isRegister ? "register" : ""}"
              ></div>

            </div>


            ${
              msg
                ? `
                  <div class="glass-auth-alert">
                    <span>!</span>
                    <div>${esc(msg)}</div>
                  </div>
                `
                : ""
            }


            <form id="authForm" class="glass-auth-form">

              ${
                isRegister
                  ? `
                    <div class="glass-auth-row">

                      <label class="glass-input-group">
                        <span>نام</span>

                        <div class="glass-input-wrapper">
                          <span class="glass-input-icon">◉</span>

                          <input
                            name="firstName"
                            required
                            autocomplete="given-name"
                            placeholder="نام شما"
                          >
                        </div>
                      </label>


                      <label class="glass-input-group">
                        <span>نام خانوادگی</span>

                        <div class="glass-input-wrapper">
                          <span class="glass-input-icon">◉</span>

                          <input
                            name="lastName"
                            required
                            autocomplete="family-name"
                            placeholder="نام خانوادگی"
                          >
                        </div>
                      </label>

                    </div>
                  `
                  : ""
              }


              <label class="glass-input-group">

                <span>نام کاربری</span>

                <div class="glass-input-wrapper">

                  <span class="glass-input-icon">
                    @
                  </span>

                  <input
                    name="username"
                    required
                    autocomplete="username"
                    placeholder="نام کاربری خود را وارد کنید"
                  >

                </div>

              </label>


              <label class="glass-input-group">

                <div class="glass-label-row">
                  <span>گذرواژه</span>

                  ${
                    !isRegister
                      ? `<button type="button" class="forgot-password">
                          فراموشی گذرواژه؟
                        </button>`
                      : ""
                  }

                </div>


                <div class="glass-input-wrapper">

                  <span class="glass-input-icon">
                    ◈
                  </span>

                  <input
                    id="passwordInput"
                    type="password"
                    name="password"
                    required
                    minlength="${isRegister ? 8 : 1}"
                    autocomplete="${
                      isRegister ? "new-password" : "current-password"
                    }"
                    placeholder="گذرواژه خود را وارد کنید"
                  >

                  <button
                    type="button"
                    id="togglePassword"
                    class="password-toggle"
                  >
                    ◉
                  </button>

                </div>

              </label>


              ${
                isRegister
                  ? `
                    <div
                      id="passwordStrength"
                      class="password-strength"
                    >

                      <div class="password-strength-bar">
                        <span></span>
                      </div>

                      <div class="password-strength-info">
                        <span>قدرت گذرواژه</span>
                        <strong>ضعیف</strong>
                      </div>

                    </div>


                    <label class="glass-input-group">

                      <span>تکرار گذرواژه</span>

                      <div class="glass-input-wrapper">

                        <span class="glass-input-icon">
                          ◈
                        </span>

                        <input
                          id="passwordConfirm"
                          type="password"
                          name="password2"
                          required
                          minlength="8"
                          autocomplete="new-password"
                          placeholder="گذرواژه را دوباره وارد کنید"
                        >

                      </div>

                    </label>
                  `
                  : ""
              }


              ${
                isRegister
                  ? `
                    <label class="glass-checkbox">

                      <input
                        type="checkbox"
                        required
                      >

                      <span class="checkbox-custom"></span>

                      <span>
                        قوانین استفاده از روان‌یار را می‌پذیرم.
                      </span>

                    </label>
                  `
                  : ""
              }


              <button
                type="submit"
                class="glass-submit-button"
              >

                <span>
                  ${isRegister ? "ساخت حساب کاربری" : "ورود به روان‌یار"}
                </span>

                <strong>←</strong>

              </button>

            </form>


            <div class="glass-auth-footer">

              ${
                isRegister
                  ? `
                    <span>قبلاً حساب ساخته‌ای؟</span>

                    <button
                      type="button"
                      id="footerLogin"
                    >
                      وارد شو
                    </button>
                  `
                  : `
                    <span>هنوز حساب کاربری نداری؟</span>

                    <button
                      type="button"
                      id="footerRegister"
                    >
                      ثبت‌نام کن
                    </button>
                  `
              }

            </div>

          </div>

        </section>

      </div>

    </div>
  `;

  /* =========================
     TABS
  ========================== */

  document.querySelector("#tabLogin").onclick = () => login("", "login");

  document.querySelector("#tabRegister").onclick = () => login("", "register");

  /* =========================
     FOOTER SWITCH
  ========================== */

  document
    .querySelector("#footerLogin")
    ?.addEventListener("click", () => login("", "login"));

  document
    .querySelector("#footerRegister")
    ?.addEventListener("click", () => login("", "register"));

  /* =========================
     PASSWORD TOGGLE
  ========================== */

  const passwordInput = document.querySelector("#passwordInput");

  const togglePassword = document.querySelector("#togglePassword");

  togglePassword?.addEventListener("click", () => {
    if (passwordInput.type === "password") {
      passwordInput.type = "text";
      togglePassword.textContent = "◉";
    } else {
      passwordInput.type = "password";
      togglePassword.textContent = "◌";
    }
  });

  /* =========================
     PASSWORD STRENGTH
  ========================== */

  const strengthBox = document.querySelector("#passwordStrength");

  if (strengthBox) {
    passwordInput.addEventListener("input", () => {
      const password = passwordInput.value;

      let score = 0;

      if (password.length >= 8) score++;

      if (/[A-Z]/.test(password)) score++;

      if (/[a-z]/.test(password)) score++;

      if (/[0-9]/.test(password)) score++;

      if (/[^A-Za-z0-9]/.test(password)) score++;

      const bar = strengthBox.querySelector(".password-strength-bar span");

      const label = strengthBox.querySelector(".password-strength-info strong");

      const levels = ["ضعیف", "ضعیف", "متوسط", "خوب", "قوی", "عالی"];

      const widths = ["5%", "20%", "40%", "60%", "80%", "100%"];

      bar.style.width = widths[score];

      label.textContent = levels[score];
    });
  }

  /* =========================
     FORM SUBMIT
  ========================== */

  document.querySelector("#authForm").onsubmit = async (e) => {
    e.preventDefault();

    const payload = Object.fromEntries(new FormData(e.target));

    try {
      if (isRegister) {
        if (payload.password !== payload.password2) {
          return login("گذرواژه‌ها یکسان نیستند.", "register");
        }

        const d = await api("/api/register", {
          method: "POST",

          body: JSON.stringify({
            firstName: payload.firstName,

            lastName: payload.lastName,

            username: payload.username,

            password: payload.password,
          }),
        });

        enterSession(d);
      } else {
        const d = await api("/api/login", {
          method: "POST",

          body: JSON.stringify({
            username: payload.username,

            password: payload.password,
          }),
        });

        enterSession(d);
      }
    } catch (x) {
      login(x.message, mode);
    }
  };
}
async function load() {
  const d = await api("/api/products");
  state.products = d.products;
  state.subscription = d.subscription;
  const n = await api("/api/notifications").catch(() => ({
    notifications: [],
  }));
  state.notifications = n.notifications || [];
}
function roleMeta(role) {
  return (
    {
      personal: {
        label: "حساب شخصی",
        icon: "👤",
        subtitle: "ارزیابی، خودیاری و پیگیری شخصی",
      },
      employee: {
        label: "حساب شخصی",
        icon: "👤",
        subtitle: "ارزیابی، خودیاری و پیگیری شخصی",
      },
      professional: {
        label: "روان‌شناس / مشاور",
        icon: "🧠",
        subtitle: "محیط حرفه‌ای ارزیابی و مداخله",
      },
      clinic: {
        label: "کلینیک / مرکز",
        icon: "🏥",
        subtitle: "مدیریت متخصصان، مراجعان و خدمات",
      },
      school: {
        label: "مدرسه / مرکز آموزشی",
        icon: "🏫",
        subtitle: "پایش دانش‌آموزان و برنامه‌های مدرسه",
      },
      admin: {
        label: "مدیر سامانه",
        icon: "🛠️",
        subtitle: "مدیریت تجاری و عملیاتی روان‌یار",
      },
    }[role] || { label: "کاربر", icon: "👤", subtitle: "فضای شخصی روان‌یار" }
  );
}
function userRole() {
  return state.user?.role || "personal";
}
function navItems(role) {
  if (role === "professional")
    return [
      ["home", "⌂", "داشبورد"],
      ["clients", "👥", "مراجعان"],
      ["assessments", "🧪", "ارزیابی‌ها"],
      ["interventions", "🧩", "مداخلات"],
      ["reports", "📊", "گزارش‌ها"],
      ["progress", "📈", "پیگیری و پیشرفت"],
      ["resources", "📚", "منابع حرفه‌ای"],
      ["products", "🛒", "فروشگاه"],
      ["subscription", "💳", "اشتراک و اعتبار"],
      ["notifications", "🔔", "اعلان‌ها"],
      ["support", "🎫", "پشتیبانی"],
    ];

  if (role === "clinic")
    return [
      ["home", "⌂", "داشبورد"],
      ["clients", "👥", "مراجعان"],
      ["staff", "👨‍⚕️", "متخصصان"],
      ["assessments", "🧪", "ارزیابی‌ها"],
      ["interventions", "🧩", "مداخلات"],
      ["reports", "📊", "گزارش‌ها"],
      ["analytics", "📈", "عملکرد مرکز"],
      ["resources", "📚", "منابع"],
      ["subscription", "💳", "اشتراک و صورتحساب"],
      ["notifications", "🔔", "اعلان‌ها"],
      ["support", "🎫", "پشتیبانی"],
    ];

  if (role === "school")
    return [
      ["home", "⌂", "داشبورد"],
      ["students", "👨‍🎓", "دانش‌آموزان"],
      ["screening", "🧪", "غربالگری"],
      ["risk", "⚠️", "نقشه خطر"],
      ["cases", "🚨", "موارد مداخله"],
      ["interventions", "🧩", "مداخلات"],
      ["teachers", "👨‍🏫", "معلمان"],
      ["parents", "👨‍👩‍👧", "والدین"],
      ["reports", "📊", "گزارش‌ها"],
      ["outcomes", "📈", "پیامدها"],
      ["subscription", "💳", "اشتراک"],
      ["notifications", "🔔", "اعلان‌ها"],
      ["support", "🎫", "پشتیبانی"],
    ];

  // داشبورد کاربران عادی
  return [
    ["academy", "📚", "سامانه انتخاب رشته"],
    ["subscription", "💳", "اشتراک"],
  ];
}
function shell(content, active = "home") {
  const isAdmin = state.user?.role === "admin";
  const meta = roleMeta(userRole());
  const unread = state.notifications.filter((x) => !x.is_read).length;

  const items = navItems(userRole())
    .map((x) => {
      const label =
        x[0] === "notifications" && unread ? `${x[2]} (${unread})` : x[2];

      return `
        <button
          class="nav ${active === x[0] ? "active" : ""}"
          data-page="${x[0]}"
          type="button"
        >
          <span class="nav-icon">${x[1]}</span>
          <b>${label}</b>
        </button>
      `;
    })
    .join("");

  const firstName = esc(state.user?.firstName || "کاربر");
  const profileLetter = esc((state.user?.firstName || "ک").slice(0, 1));

  root.innerHTML = `
    <div class="app-shell">

      <!-- ================= SIDEBAR ================= -->
      <aside class="sidebar">

        <div class="sidebar-inner">

          <!-- Brand -->
          <button class="brand brand-button" data-page="home" type="button">
            <div class="brand-mark">
              <span>✦</span>
            </div>

            <div class="brand-text">
              <b>روان‌یار</b>
              <small>پلتفرم محصولات روان‌شناختی</small>
            </div>
          </button>

          <!-- User / Role -->
          <div class="role-chip">

            <div class="role-avatar">
              ${meta.icon}
            </div>

            <div class="role-info">
              <b>${meta.label}</b>
              <small>${meta.subtitle}</small>
            </div>

          </div>

          <!-- Navigation -->
          <div class="sidebar-label">
            منوی اصلی
          </div>

          <nav class="sidebar-nav">

            ${items}

            ${
              isAdmin
                ? `
                  <button
                    class="nav"
                    data-page="admin"
                    type="button"
                  >
                    <span class="nav-icon">🛠️</span>
                    <b>پنل مدیریت</b>
                  </button>
                `
                : ""
            }

          </nav>

          <!-- Sidebar Bottom -->
          <div class="sidebar-bottom">

            <div class="mini-plan">

              <div class="mini-plan-icon">
                💳
              </div>

              <div>
                <small>سطح اشتراک</small>
                <b>${esc(state.subscription?.plan_title || "عادی")}</b>
              </div>

            </div>

            <button
              id="logout"
              class="logout"
              type="button"
            >
              <span>↪</span>
              خروج از حساب
            </button>

          </div>

        </div>

      </aside>


      <!-- ================= MAIN ================= -->
      <section class="main">

        <!-- Header -->
        <header class="dashboard-header">

          <div class="header-info">

            <div class="header-breadcrumb">
              <span>${meta.icon}</span>
              <span>${meta.label}</span>
            </div>

            <h2>
              سلام، ${firstName}
              <span class="hello-wave">👋</span>
            </h2>

            <p>
              ${meta.subtitle}
            </p>

          </div>


          <div class="header-actions">

            <!-- Notification -->
            <button
              class="header-icon-btn"
              type="button"
              data-page="notifications"
              aria-label="اعلان‌ها"
            >
              <span>🔔</span>

              ${unread ? `<i class="notification-dot">${unread}</i>` : ""}
            </button>


            <!-- Profile -->
            <button
              class="header-profile"
              type="button"
            >

              <span class="profile-dot">
                ${profileLetter}
              </span>

              <span class="profile-info">
                <b>${firstName}</b>
                <small>${meta.label}</small>
              </span>

              <span class="profile-chevron">
               ⌄
              </span>

            </button>

          </div>

        </header>


        <!-- Page Content -->
        <main class="content">
          ${content}
        </main>

      </section>

    </div>
  `;

  document.querySelectorAll("[data-page]").forEach((b) => {
    b.onclick = () => nav(b.dataset.page);
  });
  document.querySelector("#logout").onclick = logout;
}
function actionCard(icon, title, text, page, tone = "") {
  return `<button class="action-card ${tone}" data-page="${page}"><span class="action-icon">${icon}</span><span><b>${title}</b><small>${text}</small></span><strong>←</strong></button>`;
}
function metric(label, value, icon = "") {
  return `<div class="metric"><span>${icon} ${label}</span><b>${value}</b></div>`;
}
async function personalHome() {
  const d = await api("/api/dashboard");

  state.user = d.user;
  state.subscription = d.subscription;

  await load();

  // بررسی دسترسی کاربر به سامانه انتخاب رشته
  const careerAccess = hasCareerAccess();

  // تعداد ارزیابی‌های تکمیل‌شده
  const completed =
    (
      await api("/api/assessments").catch(() => ({
        assessments: [],
      }))
    ).assessments?.filter((x) => x.score != null).length || 0;

  // تعداد محصولاتی که بر اساس اشتراک فعلی قابل دسترسی هستند
  const availableProducts = state.products.filter(
    (p) =>
      level[state.subscription.plan_id || "normal"] >= level[p.required_plan] &&
      (!p.is_beta || state.subscription.plan_id === "gold"),
  ).length;

  const firstName = esc(
    state.user?.firstName || state.user?.first_name || "کاربر",
  );

  shell(
    `
    <!-- =========================
         DASHBOARD HERO
    ========================== -->

    <section class="dashboard-hero">

      <div class="dashboard-hero-content">

        <div class="dashboard-hero-top">

          <span class="dashboard-hero-badge">
            ${esc(state.subscription.plan_title || "عادی")}
          </span>

          <span class="dashboard-hero-status">
            ● حساب فعال
          </span>

        </div>

        <h1>
          سلام ${firstName} 👋
        </h1>

        <p>
          مسیر رشد و شناخت خودت را ادامه بده؛
          از همین‌جا می‌توانی فعالیت‌های خود را مدیریت کنی.
        </p>

        <div class="dashboard-hero-actions">

          ${
            careerAccess
              ? `
                <button
                  class="hero-primary-btn"
                  data-page="academy"
                  type="button"
                >
                  <span>شروع ارزیابی</span>
                  <strong>←</strong>
                </button>
              `
              : `
                <button
                  class="hero-primary-btn hero-locked-btn"
                  data-page="subscription"
                  type="button"
                >
                  <span class="hero-lock-icon">🔒</span>
                  <span>ارتقای اشتراک</span>
                  <strong>←</strong>
                </button>
              `
          }


        </div>

      </div>


      <div class="dashboard-hero-visual">

        <div class="hero-orbit orbit-one"></div>
        <div class="hero-orbit orbit-two"></div>

        <div class="hero-brain">
          🧠
        </div>

        <div class="hero-floating-card floating-one">

          <span>✓</span>

          <div>
            <b>مسیر شما آماده است</b>
            <small>ادامه مسیر رشد</small>
          </div>

        </div>

        <div class="hero-floating-card floating-two">

          <span>✦</span>

          <div>
            <b>${completed}</b>
            <small>ارزیابی تکمیل‌شده</small>
          </div>

        </div>

      </div>

    </section>


    <!-- =========================
         STATISTICS
    ========================== -->

    <section class="dashboard-stats">

      <div class="dashboard-stat-card">

        <div class="stat-icon purple">
          🧪
        </div>

        <div class="stat-content">

          <span>
            ارزیابی‌های تکمیل‌شده
          </span>

          <strong>
            ${completed}
          </strong>

          <small>
            فعالیت‌های انجام‌شده
          </small>

        </div>

      </div>


      <div class="dashboard-stat-card">

        <div class="stat-icon blue">
          🔓
        </div>

        <div class="stat-content">

          <span>
            محصولات قابل دسترس
          </span>

          <strong>
            ${availableProducts}
          </strong>

          <small>
            بر اساس سطح اشتراک
          </small>

        </div>

      </div>


      <div class="dashboard-stat-card">

        <div class="stat-icon green">
          📈
        </div>

        <div class="stat-content">

          <span>
            فعالیت‌های اخیر
          </span>

          <strong>
            ${d.recent.length}
          </strong>

          <small>
            فعالیت ثبت‌شده
          </small>

        </div>

      </div>


      <div class="dashboard-stat-card">

        <div class="stat-icon orange">
          💳
        </div>

        <div class="stat-content">

          <span>
            سطح اشتراک
          </span>

          <strong class="plan-value">
            ${esc(state.subscription.plan_title || "عادی")}
          </strong>

          <small>
            وضعیت حساب شما
          </small>

        </div>

      </div>

    </section>


    <!-- =========================
         QUICK START
    ========================== -->

    <section class="dashboard-section">

      <div class="dashboard-section-header">

        <div>

          <span class="section-eyebrow">
            شروع سریع
          </span>

          <h2>
            از کجا شروع کنیم؟
          </h2>

          <p>
            دسترسی سریع به مهم‌ترین بخش‌های روان‌یار
          </p>

        </div>

      </div>


      <div class="quick-actions-grid">


        <!-- =========================
             CAREER SYSTEM
        ========================== -->

        <button
          class="quick-action-card featured career-quick-card ${
            careerAccess ? "career-quick-active" : "career-quick-locked"
          }"
          data-page="${careerAccess ? "academy" : "subscription"}"
          type="button"
        >

          <div class="quick-action-icon">
            ${careerAccess ? "🎓" : "🔒"}
          </div>

          <div class="quick-action-body">

            <span>
              ${careerAccess ? "پیشنهاد ویژه" : "دسترسی محدود"}
            </span>

            <h3>
              سامانه انتخاب رشته تحصیلی
            </h3>

            <p>
              ${
                careerAccess
                  ? `
                    انتخاب رشته مناسب و بررسی مسیر تحصیلی
                    خود را از اینجا شروع کنید.
                  `
                  : `
                    برای استفاده از سامانه، اشتراک خود را
                    ارتقا دهید.
                  `
              }
            </p>

          </div>

          <div class="quick-action-arrow">
            ←
          </div>

        </button>


        <!-- =========================
             EDUCATION
        ========================== -->

        <button
          class="quick-action-card"
          data-page="academy"
          type="button"
        >

          <div class="quick-action-icon blue">
            🎥
          </div>

          <div class="quick-action-body">

            <span>
              آموزش
            </span>

            <h3>
              آموزش استفاده از سامانه
            </h3>

            <p>
              ویدئوی آموزشی نحوه استفاده از سامانه
              انتخاب رشته را مشاهده کنید.
            </p>

          </div>

          <div class="quick-action-arrow">
            ←
          </div>

        </button>


        <!-- =========================
             SUBSCRIPTION
        ========================== -->

        <button
          class="quick-action-card"
          data-page="subscription"
          type="button"
        >

          <div class="quick-action-icon orange">
            💳
          </div>

          <div class="quick-action-body">

            <span>
              حساب شما
            </span>

            <h3>
              مدیریت اشتراک
            </h3>

            <p>
              وضعیت اشتراک و امکانات قابل دسترس
              خود را مشاهده کنید.
            </p>

          </div>

          <div class="quick-action-arrow">
            ←
          </div>

        </button>

      </div>

    </section>


    <!-- =========================
         CAREER SYSTEM ACCESS
    ========================== -->

    <section class="dashboard-section products-section">

      <div class="dashboard-section-header">

        <div>

          <span class="section-eyebrow">
            دسترسی سریع
          </span>

          <h2>
            سامانه انتخاب رشته
          </h2>

          <p>
            ورود مستقیم به سامانه انتخاب رشته تحصیلی
          </p>

        </div>

      </div>


      <button
        class="career-system-card ${
          careerAccess ? "career-system-active" : "career-system-locked"
        }"
        data-page="${careerAccess ? "career-guidance" : "subscription"}"
        type="button"
      >

        <div class="career-system-icon">
          ${careerAccess ? "🎓" : "🔒"}
        </div>


        <div class="career-system-content">

          <h3>
            سامانه انتخاب رشته
          </h3>

          ${
            careerAccess
              ? `
                <div class="career-system-link">

                  ورود به سامانه انتخاب رشته

                  <strong>
                    ←
                  </strong>

                </div>
              `
              : `
                <div class="career-system-link career-system-upgrade">

                  ارتقای اشتراک برای دسترسی

                  <strong>
                    ←
                  </strong>

                </div>
              `
          }

        </div>


        <div class="career-system-arrow">
          ${careerAccess ? "←" : "🔒"}
        </div>

      </button>

    </section>
    `,
    "home",
  );

  bind();
}
async function professionalHome() {
  const d = await api("/api/dashboard");
  state.user = d.user;
  state.subscription = d.subscription;
  await load();
  const assessments =
    (await api("/api/assessments").catch(() => ({ assessments: [] })))
      .assessments || [];
  const completed = assessments.filter((x) => x.score != null).length;
  shell(
    `<section class="welcome-card professional"><div><span class="pill">محیط حرفه‌ای</span><h1>مرکز کار حرفه‌ای شما</h1><p>مراجع، ارزیابی، گزارش و مداخله را از یک مسیر واحد مدیریت کنید.</p><div class="hero-actions"><button class="primary" data-page="clients">+ افزودن مراجع</button><button class="secondary" data-page="assessments">شروع ارزیابی</button></div></div><div class="welcome-icon">🧠</div></section><div class="metric-grid">${metric("ارزیابی‌های تکمیل‌شده", completed, "🧪")}${metric("مداخلات فعال", "—", "🧩")}${metric("گزارش‌های آماده", "—", "📊")}${metric("اشتراک", esc(state.subscription.plan_title || "عادی"), "💳")}</div><section class="section-head"><div><h2>اقدامات سریع</h2><p>کارهای اصلی را از همین‌جا انجام دهید.</p></div></section><div class="action-grid">${actionCard("👥", "مراجعان", "ایجاد و مدیریت پرونده‌های مراجعان.", "clients")}${actionCard("🧪", "ارزیابی‌ها", "انتخاب و اجرای ابزارهای ارزیابی.", "assessments")}${actionCard("🧩", "مداخلات", "مشاهده و شروع برنامه‌های مداخله‌ای.", "interventions")}${actionCard("📊", "گزارش‌ها", "مشاهده نتایج و گزارش‌های حرفه‌ای.", "reports")}</div><div class="notice-card"><b>نکته</b><p>در این نسخه، ساختار پنل حرفه‌ای آماده شده است؛ ماژول‌های پرونده الکترونیک و مدیریت مراجعان را می‌توان در مرحله بعد به همین معماری متصل کرد.</p></div>`,
    "home",
  );
  bind();
}
async function clinicHome() {
  const d = await api("/api/dashboard");
  state.user = d.user;
  state.subscription = d.subscription;
  await load();
  shell(
    `<section class="welcome-card clinic"><div><span class="pill">پنل مرکز</span><h1>مدیریت خدمات کلینیک</h1><p>نمایش مراجعان، متخصصان، ارزیابی‌ها و گزارش‌های مرکز در یک داشبورد.</p></div><div class="welcome-icon">🏥</div></section><div class="metric-grid">${metric("مراجعان فعال", "—", "👥")}${metric("متخصصان", "—", "👨‍⚕️")}${metric("ارزیابی‌های این ماه", "—", "🧪")}${metric("اشتراک", esc(state.subscription.plan_title || "عادی"), "💳")}</div><div class="action-grid">${actionCard("👥", "مراجعان", "مدیریت مراجعان مرکز.", "clients")}${actionCard("👨‍⚕️", "متخصصان", "مدیریت کاربران حرفه‌ای مرکز.", "staff")}${actionCard("📊", "گزارش‌ها", "گزارش‌های عملیاتی و حرفه‌ای.", "reports")}${actionCard("📈", "عملکرد مرکز", "نمایش شاخص‌های استفاده.", "analytics")}</div><div class="notice-card"><b>معماری مرکز</b><p>مدیریت چندمتخصصی، دسترسی‌ها و گزارش‌های سازمانی به‌صورت نقش‌محور در این پنل قرار می‌گیرند.</p></div>`,
    "home",
  );
  bind();
}
async function schoolHome() {
  const d = await api("/api/dashboard");
  state.user = d.user;
  state.subscription = d.subscription;
  await load();
  shell(
    `<section class="welcome-card school"><div><span class="pill">پنل مدرسه</span><h1>مدرسه سالم؛ از غربالگری تا مداخله</h1><p>دانش‌آموزان، غربالگری، نقشه خطر، مداخله و پیامدها را در یک مسیر واحد مدیریت کنید.</p></div><div class="welcome-icon">🏫</div></section><div class="metric-grid">${metric("دانش‌آموزان", "—", "👨‍🎓")}${metric("غربالگری‌های انجام‌شده", "—", "🧪")}${metric("موارد نیازمند پیگیری", "—", "🚨")}${metric("اشتراک", esc(state.subscription.plan_title || "عادی"), "💳")}</div><div class="action-grid">${actionCard("👨‍🎓", "دانش‌آموزان", "مدیریت جامعه دانش‌آموزی.", "students")}${actionCard("🧪", "غربالگری", "اجرای ارزیابی‌های مدرسه.", "screening")}${actionCard("⚠️", "نقشه خطر", "مشاهده وضعیت خطر به‌صورت تجمیعی.", "risk")}${actionCard("🧩", "مداخلات", "برنامه‌های مداخله و پیگیری.", "interventions")}</div><div class="notice-card"><b>محرمانگی</b><p>گزارش‌های مدیریتی مدرسه باید تا حد امکان به‌صورت تجمیعی ارائه شوند و دسترسی به اطلاعات فردی بر اساس نقش و مجوز کنترل شود.</p></div>`,
    "home",
  );
  bind();
}
async function home() {
  const role = userRole();
  if (role === "admin") return admin();
  if (role === "professional") return professionalHome();
  if (role === "clinic") return clinicHome();
  if (role === "school") return schoolHome();
  return personalHome();
}
function workspacePage(title, subtitle, items, active, notice = "") {
  shell(
    `<div class="page-title"><div><span class="eyebrow">${roleMeta(userRole()).label}</span><h1>${title}</h1><p>${subtitle}</p></div></div><div class="action-grid">${items.map((x) => actionCard(x[0], x[1], x[2], x[3])).join("")}</div>${notice ? `<div class="notice-card"><b>راهنما</b><p>${notice}</p></div>` : ""}`,
    active,
  );
  bind();
}
function roleWorkspace(page) {
  const r = userRole();
  if (page === "clients")
    return workspacePage(
      "مراجعان",
      "محیط مدیریت مراجعان و پرونده‌های حرفه‌ای.",
      [
        ["➕", "مراجع جدید", "ایجاد پرونده جدید برای مراجع.", "clients"],
        ["🧪", "ارزیابی مراجع", "انتخاب ابزار ارزیابی.", "assessments"],
        ["📊", "گزارش‌ها", "مشاهده گزارش‌های موجود.", "reports"],
      ],
      "clients",
      "در نسخه فعلی، زیرساخت احراز هویت و ارزیابی موجود است؛ مدیریت کامل پرونده الکترونیک مراجعان می‌تواند در همین بخش توسعه یابد.",
    );
  if (page === "staff")
    return workspacePage(
      "متخصصان",
      "مدیریت اعضای حرفه‌ای مرکز و دسترسی‌های آنان.",
      [
        ["➕", "دعوت متخصص", "افزودن متخصص به مرکز.", "staff"],
        ["👥", "اعضای مرکز", "فهرست و وضعیت دسترسی متخصصان.", "staff"],
        ["🔐", "سطوح دسترسی", "تنظیم نقش‌های عملیاتی.", "staff"],
      ],
      "staff",
    );
  if (
    [
      "students",
      "screening",
      "risk",
      "cases",
      "teachers",
      "parents",
      "outcomes",
    ].includes(page)
  ) {
    const m = {
      students: ["دانش‌آموزان", "مدیریت جامعه دانش‌آموزی."],
      screening: ["غربالگری", "مدیریت غربالگری‌های مدرسه."],
      risk: ["نقشه خطر", "نمایش تجمیعی سطوح خطر."],
      cases: ["موارد نیازمند مداخله", "پیگیری موارد ارجاع‌شده."],
      teachers: ["معلمان", "منابع و دسترسی معلمان."],
      parents: ["والدین", "ارتباط و آموزش والدین."],
      outcomes: ["پیامدها", "مقایسه شاخص‌های قبل و بعد."],
    };
    return workspacePage(
      m[page][0],
      m[page][1],
      [
        ["📋", "داده‌های فعلی", "داده‌های مرتبط با این بخش.", "reports"],
        ["➕", "ایجاد مورد جدید", "شروع یک فرایند جدید.", "products"],
        ["📊", "گزارش", "نمایش گزارش‌های مرتبط.", "reports"],
      ],
      page,
    );
  }
  if (page === "progress") return reports();
  if (page === "programs") return products("interventions", "برنامه‌های من");
  if (page === "library" || page === "resources")
    return products(
      "library",
      page === "resources" ? "منابع حرفه‌ای" : "کتابخانه من",
    );
  if (page === "analytics")
    return workspacePage(
      "عملکرد مرکز",
      "شاخص‌های استفاده و فعالیت مرکز.",
      [
        ["📊", "گزارش‌ها", "مشاهده گزارش‌های موجود.", "reports"],
        ["📈", "روند استفاده", "بررسی روند فعالیت‌ها.", "analytics"],
      ],
      "analytics",
    );
  return home();
}
function card(p) {
  const ok =
    level[state.subscription?.plan_id || "normal"] >= level[p.required_plan] &&
    (!p.is_beta || state.subscription?.plan_id === "gold");
  return `<article class="product-card"><div class="product-top"><span class="type">${esc(p.product_type)}</span>${p.is_beta ? '<span class="beta">BETA</span>' : ""}</div>${p.cover_image ? `<img class="product-cover" src="${esc(p.cover_image)}">` : `<div class="product-icon">${p.category_icon || "✦"}</div>`}<h3>${esc(p.title)}</h3><p>${esc(p.description)}</p><div class="meta"><span>${esc(p.audience || "عمومی")}</span><span>${esc(p.duration || "")}</span></div><div class="card-footer"><span class="access ${p.required_plan}">${planName[p.required_plan] || p.required_plan}</span><button class="${ok ? "open" : "locked"}" data-product="${esc(p.id)}">${ok ? "مشاهده و شروع ←" : "🔒 ارتقا"}</button></div></article>`;
}
function products(cat = null, title = "مرکز محصولات", active = "products") {
  const a = state.products.filter((p) => !cat || p.category_id === cat);
  shell(
    `<div class="page-title"><div><span class="eyebrow">کاتالوگ محصولات</span><h1>${title}</h1><p>آزمون‌ها، سامانه‌ها، مداخلات، آموزش و کتابخانه.</p></div><div class="search">⌕ <input id="search" placeholder="جستجو..."></div></div><div class="product-grid" id="grid">${a.map(card).join("")}</div>`,
    active,
  );
  document.querySelector("#search").oninput = (e) => {
    const q = e.target.value.trim();
    document.querySelector("#grid").innerHTML = a
      .filter((p) =>
        (p.title + " " + p.description + " " + p.product_type).includes(q),
      )
      .map(card)
      .join("");
    bind();
  };
  bind();
}
async function productDetail(id) {
  const d = await api("/api/products/" + encodeURIComponent(id));
  const p = d.product;
  shell(
    `<button class="back" data-page="products">← بازگشت به محصولات</button><div class="workspace"><div class="eyebrow">${esc(p.product_type)}</div><h1>${esc(p.title)}</h1><p>${esc(p.description)}</p><div class="meta"><span>مخاطب: ${esc(p.audience || "عمومی")}</span><span>مدت: ${esc(p.duration || "")}</span><span>سطح: ${planName[p.required_plan]}</span></div>${p.intro_video_url ? `<div class="video-box"><a target="_blank" href="${esc(p.intro_video_url)}">▶ ویدئوی معرفی محصول</a></div>` : ""}<div class="workspace-panel"><div class="workspace-icon">${p.category_icon || "✦"}</div><div><h3>${d.allowed ? "دسترسی شما فعال است" : "این محصول برای سطح اشتراک فعلی قفل است"}</h3><p>${d.allowed ? "می‌توانید فایل‌ها و نسخه‌های منتشرشده را مشاهده و دریافت کنید." : "برای دسترسی، اشتراک خود را ارتقا دهید."}</p><button class="${d.allowed ? "primary" : "secondary"}" data-action="${d.allowed ? "files" : "upgrade"}" data-product-id="${esc(p.id)}">${d.allowed ? "مشاهده فایل‌ها" : "ارتقای اشتراک"}</button></div></div>${d.allowed ? `<div id="productFiles" class="file-list"><h3>فایل‌های محصول</h3><p>در حال دریافت...</p></div>` : ""}<div class="version-list"><h3>نسخه‌ها</h3>${d.versions.length ? d.versions.map((v) => `<div class="version-item"><b>${esc(v.version_label)}</b><span>${esc(v.status)}</span><p>${esc(v.changelog)}</p></div>`).join("") : '<div class="empty">هنوز نسخه‌ای ثبت نشده است.</div>'}</div></div></div>`,
    "products",
  );
  bind();
  document
    .querySelector('[data-action="files"]')
    ?.addEventListener("click", async () => {
      const box = document.querySelector("#productFiles");
      const x = await api("/api/products/" + encodeURIComponent(id) + "/files");
      box.innerHTML = `<h3>فایل‌های محصول</h3>${x.files.length ? x.files.map((f) => `<div class="file-row"><span>📄 ${esc(f.original_name)} <small>${moneyBytes(f.size_bytes)} — ${esc(f.file_role)}</small></span><button class="secondary" data-download="${f.id}">دانلود</button></div>`).join("") : '<div class="empty">فایلی برای این محصول بارگذاری نشده است.</div>'}`;
      document.querySelectorAll("[data-download]").forEach(
        (b) =>
          (b.onclick = async () => {
            try {
              const r = await fetch(
                "/api/product-files/" + b.dataset.download + "/download",
                { headers: { Authorization: "Bearer " + state.token } },
              );
              if (!r.ok) throw Error("دریافت فایل مجاز نیست");
              const blob = await r.blob();
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = "ravanyar-file";
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 1000);
            } catch (e) {
              alert(e.message);
            }
          }),
      );
    });
  document
    .querySelector('[data-action="upgrade"]')
    ?.addEventListener("click", subscription);
}
const moneyBytes = (n) => {
  n = Number(n || 0);
  if (n < 1024) return n + " B";
  if (n < 1024 ** 2) return (n / 1024).toFixed(1) + " KB";
  if (n < 1024 ** 3) return (n / 1024 ** 2).toFixed(1) + " MB";
  return (n / 1024 ** 3).toFixed(1) + " GB";
};
async function subscription() {
  const d = await api("/api/plans");

  const sub = state.subscription || {};
  const currentPlan = sub.plan_id || "normal";

  const startDate = sub.starts_at ? new Date(sub.starts_at) : null;
  const endDate = sub.ends_at ? new Date(sub.ends_at) : null;

  const now = new Date();

  const isPaidPlan = ["silver", "gold"].includes(currentPlan);

  const isActive =
    isPaidPlan && sub.status === "active" && endDate && endDate > now;

  const isExpired = isPaidPlan && endDate && endDate <= now;

  const daysLeft = isActive
    ? Math.max(
        0,
        Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      )
    : 0;

  const usageLimit = Number(sub.usage_limit || 0);
  const usageCount = Number(sub.usage_count || 0);

  const usageRemaining = Math.max(0, usageLimit - usageCount);

  const usagePercent =
    usageLimit > 0
      ? Math.min(100, Math.max(0, (usageRemaining / usageLimit) * 100))
      : 0;

  const percentRemaining = isActive
    ? Math.min(100, Math.max(0, (daysLeft / 30) * 100))
    : 0;

  const planTitle =
    currentPlan === "gold"
      ? "طلایی"
      : currentPlan === "silver"
        ? "نقره‌ای"
        : "عادی";

  const planIcon =
    currentPlan === "gold" ? "👑" : currentPlan === "silver" ? "⭐" : "○";

  const statusClass = isActive ? "active" : isExpired ? "expired" : "normal";

  const statusText = isActive ? "فعال" : isExpired ? "منقضی شده" : "پایه";

  shell(
    `
    <!-- =========================
         PAGE TITLE
    ========================== -->
    <div class="page-title">
      <div>
        <span class="eyebrow">
          اشتراک و دسترسی
        </span>

        <h1>
          اشتراک من
        </h1>

        <p>
          وضعیت اشتراک و دسترسی‌های حساب کاربری خود را مدیریت کنید.
        </p>
      </div>
    </div>


    <!-- =========================
         BALE CONNECTION
    ========================== -->
    <section class="bale-connect-section">

      <div class="bale-connect-info">

        <div class="bale-icon">
          <img
            src="/images/bale.webp"
            alt="بله"
          />
        </div>

        <div class="bale-connect-text">

          <strong>
            اتصال به بله
          </strong>

          <span id="baleConnectionStatus">
            در حال بررسی وضعیت اتصال...
          </span>

          <small id="baleConnectHelp" hidden></small>

        </div>

      </div>


      <div class="bale-connect-actions">

        <span
          class="bale-status-dot"
          id="baleStatusDot"
        ></span>

        <button
          id="baleConnectBtn"
          class="bale-connect-btn"
          type="button"
        >
          اتصال
        </button>

        <button
          id="baleDisconnectBtn"
          class="secondary"
          type="button"
          hidden
        >
          قطع اتصال
        </button>

      </div>

    </section>


    <!-- =========================
         CURRENT SUBSCRIPTION
    ========================== -->
    <section class="subscription-current-card ${statusClass}">

      <div class="subscription-current-main">

        <div class="subscription-current-icon">
          ${planIcon}
        </div>

        <div class="subscription-current-info">

          <span class="subscription-label">
            اشتراک فعلی
          </span>

          <div class="subscription-title-row">

            <h2>
              ${planTitle}
            </h2>

            <span class="subscription-status ${statusClass}">
              ${statusText}
            </span>

          </div>

          ${
            isActive
              ? `
                <p>
                  اشتراک ${planTitle} شما فعال است و به امکانات
                  این پلن دسترسی دارید.
                </p>
              `
              : isExpired
                ? `
                  <p>
                    اشتراک ${planTitle} شما به پایان رسیده است.
                    برای ادامه استفاده، اشتراک خود را تمدید کنید.
                  </p>
                `
                : `
                  <p>
                    در حال حاضر اشتراک پولی فعالی ندارید.
                    برای استفاده از امکانات ویژه، یکی از پلن‌ها را انتخاب کنید.
                  </p>
                `
          }

        </div>

      </div>


      ${
        isActive
          ? `
            <!-- Subscription Details -->

            <div class="subscription-details">

              <div class="subscription-detail">
                <span>
                  شروع اشتراک
                </span>

                <strong>
                  ${formatDate(startDate)}
                </strong>
              </div>


              <div class="subscription-detail">
                <span>
                  پایان اشتراک
                </span>

                <strong>
                  ${formatDate(endDate)}
                </strong>
              </div>


              <div class="subscription-detail highlight">
                <span>
                  زمان باقی‌مانده
                </span>

                <strong>
                  ${daysLeft}
                  <small>
                    روز
                  </small>
                </strong>
              </div>


              <div class="subscription-detail usage-highlight">
                <span>
                  استفاده باقی‌مانده
                </span>

                <strong>
                  ${usageRemaining}
                  <small>
                    از ${usageLimit} بار
                  </small>
                </strong>
              </div>

            </div>


            <!-- Subscription Time Progress -->

            <div class="subscription-progress">

              <div class="subscription-progress-top">

                <span>
                  مدت باقی‌مانده اشتراک
                </span>

                <strong>
                  ${daysLeft} روز
                </strong>

              </div>


              <div class="subscription-progress-track">

                <div
                  class="subscription-progress-bar"
                  style="width: ${percentRemaining}%"
                ></div>

              </div>

            </div>


            <!-- Career Usage Progress -->

            <div class="subscription-progress usage-progress">

              <div class="subscription-progress-top">

                <span>
                  استفاده باقی‌مانده از سامانه انتخاب رشته
                </span>

                <strong>
                  ${usageRemaining} از ${usageLimit} بار
                </strong>

              </div>


              <div class="subscription-progress-track">

                <div
                  class="subscription-progress-bar"
                  style="width: ${usagePercent}%"
                ></div>

              </div>

            </div>
          `
          : `
            <div class="subscription-no-active">

              <div>

                <strong>
                  دسترسی ویژه فعال نیست
                </strong>

                <span>
                  با انتخاب اشتراک نقره‌ای یا طلایی،
                  دسترسی شما فعال می‌شود.
                </span>

              </div>

            </div>
          `
      }


      <!-- Current Subscription Actions -->

      <div class="subscription-current-actions">

        ${
          isActive
            ? `
              <button
                class="primary"
                data-renew="${esc(currentPlan)}"
                type="button"
              >
                تمدید اشتراک
                <span>←</span>
              </button>
            `
            : `
              <button
                class="primary"
                data-scroll-plans
                type="button"
              >
                انتخاب اشتراک
                <span>←</span>
              </button>
            `
        }


        <button
          class="secondary"
          data-orders
          type="button"
        >
          تاریخچه سفارش‌ها
        </button>

      </div>

    </section>


    <!-- =========================
         PLANS
    ========================== -->
    <section
      class="subscription-plans-section"
      id="subscriptionPlans"
    >

      <div class="subscription-section-title">

        <span class="section-eyebrow">
          انتخاب پلن
        </span>

        <h2>
          اشتراک مناسب خود را انتخاب کنید
        </h2>

        <p>
          هر دو اشتراک نقره‌ای و طلایی به مدت ۳۰ روز معتبر هستند.
        </p>

      </div>


      <div class="plan-grid">

        ${d.plans
          .map((p) => {
            const isNormal = p.id === "normal";

            const isCurrent = isActive && currentPlan === p.id;

            return `
              <article
                class="
                  plan
                  ${isCurrent ? "selected" : ""}
                  ${p.id === "gold" ? "plan-gold" : ""}
                "
              >

                ${
                  isCurrent
                    ? `
                      <div class="plan-current-badge">
                        اشتراک فعلی
                      </div>
                    `
                    : ""
                }


                <div class="plan-top">

                  <span class="plan-icon">
                    ${p.id === "gold" ? "👑" : p.id === "silver" ? "⭐" : "○"}
                  </span>

                  <h2>
                    ${esc(p.title)}
                  </h2>

                </div>


                <div class="price">
                  ${p.price ? money(p.price) : "رایگان"}
                </div>


                <div
                  class="
                    plan-duration
                    ${isNormal ? "normal-duration" : ""}
                  "
                >
                  ${isNormal ? "پلن پایه" : "۳۰ روز اعتبار"}
                </div>


                <ul>
                  ${(p.features || [])
                    .map((x) => `<li>✓ ${esc(x)}</li>`)
                    .join("")}
                </ul>


                ${
                  isNormal
                    ? `
                      <button
                        class="plan-disabled-btn"
                        type="button"
                        disabled
                      >
                        پلن پایه
                      </button>
                    `
                    : isCurrent
                      ? `
                        <button
                          class="plan-current-btn"
                          type="button"
                          disabled
                        >
                          اشتراک فعلی
                        </button>
                      `
                      : `
                        <button
                          class="primary"
                          data-plan="${esc(p.id)}"
                          type="button"
                        >
                          ${isExpired ? "تمدید اشتراک" : "تهیه اشتراک"}

                          <span>
                            ←
                          </span>
                        </button>
                      `
                }

              </article>
            `;
          })
          .join("")}

      </div>

    </section>
    `,
    "subscription",
  );

  // =====================================================
  // BALE CONNECTION
  // =====================================================

  const baleBtn = document.querySelector("#baleConnectBtn");

  const baleDisconnectBtn = document.querySelector("#baleDisconnectBtn");

  const baleStatus = document.querySelector("#baleConnectionStatus");

  const baleConnectHelp = document.querySelector("#baleConnectHelp");

  const baleDot = document.querySelector("#baleStatusDot");

  async function checkBaleStatus() {
    try {
      const result = await api("/api/bale/status");

      if (result.connected) {
        baleStatus.textContent = "حساب بله شما متصل است";

        baleDot.classList.add("connected");

        baleBtn.textContent = "متصل است";

        baleBtn.disabled = true;

        baleDisconnectBtn.hidden = false;

        baleConnectHelp.hidden = true;

        return true;
      }

      baleStatus.textContent = "حساب بله خود را متصل کنید";

      baleDot.classList.remove("connected");

      baleBtn.textContent = "اتصال";

      baleBtn.disabled = false;

      baleDisconnectBtn.hidden = true;

      return false;
    } catch (error) {
      console.error("Bale status error:", error);

      baleStatus.textContent = "خطا در بررسی وضعیت اتصال";

      baleDot.classList.remove("connected");

      baleBtn.disabled = false;

      baleDisconnectBtn.hidden = true;

      baleBtn.textContent = "اتصال";

      return false;
    }
  }

  baleBtn?.addEventListener("click", async () => {
    try {
      baleBtn.disabled = true;

      baleBtn.textContent = "در حال اتصال...";

      baleStatus.textContent = "در حال ساخت لینک اتصال...";

      const result = await api("/api/bale/link-token", {
        method: "POST",
        body: JSON.stringify({}),
      });

      if (!result.link) {
        throw new Error("لینک اتصال از سرور دریافت نشد.");
      }

      const fallback = `اگر ربات باز نشد، <a href="${esc(result.botLink || "https://ble.ir")}" target="_blank" rel="noopener noreferrer">چت ربات را باز کنید</a>، «شروع» را بزنید و این کد را ارسال کنید: <code>${esc(result.connectionCode || "")}</code>`;
      baleConnectHelp.innerHTML = fallback;
      baleConnectHelp.hidden = false;

      baleStatus.textContent = "در حال انتقال به بله...";

      /*
       * باز کردن لینک بله
       */
      const baleWindow = window.open(result.link, "_blank");

      /*
       * اگر مرورگر popup را مسدود کرده باشد
       */
      if (!baleWindow) {
        baleStatus.innerHTML = `
            پنجره بله توسط مرورگر مسدود شد.
            <a
              href="${result.link}"
              target="_blank"
              rel="noopener noreferrer"
            >
              برای اتصال اینجا کلیک کنید
            </a>
          `;
      } else {
        baleStatus.textContent = "لینک بله باز شد؛ اتصال را در بله تأیید کنید.";
      }

      /*
       * هر ۳ ثانیه وضعیت اتصال بررسی می‌شود.
       * حداکثر حدود ۱ دقیقه.
       */
      let attempts = 0;

      const timer = setInterval(async () => {
        attempts++;

        const connected = await checkBaleStatus();

        if (connected || attempts >= 20) {
          clearInterval(timer);

          if (!connected) {
            baleStatus.textContent = "هنوز حساب بله متصل نشده است.";

            baleBtn.disabled = false;

            baleBtn.textContent = "اتصال";
          }
        }
      }, 3000);
    } catch (error) {
      console.error("Bale connect error:", error);

      baleStatus.textContent = error.message || "اتصال به بله با خطا مواجه شد.";

      baleBtn.disabled = false;

      baleBtn.textContent = "اتصال";
    }
  });

  baleDisconnectBtn?.addEventListener("click", async () => {
    if (
      !confirm(
        "اتصال حساب بله قطع شود؟ درخواست‌های پرداخت بله که هنوز پرداخت نشده‌اند نیز لغو می‌شوند.",
      )
    )
      return;
    try {
      baleDisconnectBtn.disabled = true;
      baleDisconnectBtn.textContent = "در حال قطع اتصال...";
      await api("/api/bale/account", { method: "DELETE", body: "{}" });
      baleStatus.textContent = "اتصال حساب بله قطع شد.";
      baleConnectHelp.hidden = true;
      await checkBaleStatus();
    } catch (error) {
      console.error("Bale disconnect error:", error);
      baleStatus.textContent =
        error.message || "قطع اتصال بله با خطا مواجه شد.";
    } finally {
      baleDisconnectBtn.disabled = false;
      baleDisconnectBtn.textContent = "قطع اتصال";
    }
  });

  /*
   * بررسی اولیه وضعیت بله
   */
  await checkBaleStatus();

  // =====================================================
  // خرید پلن
  // =====================================================

  document.querySelectorAll("[data-plan]").forEach((button) => {
    button.onclick = () => {
      checkout(button.dataset.plan);
    };
  });

  // =====================================================
  // تمدید اشتراک فعلی
  // =====================================================

  document.querySelector("[data-renew]")?.addEventListener("click", (e) => {
    const planId = e.currentTarget.dataset.renew;

    checkout(planId);
  });

  // =====================================================
  // تاریخچه سفارش‌ها
  // =====================================================

  document.querySelector("[data-orders]")?.addEventListener("click", orders);

  // =====================================================
  // رفتن به بخش پلن‌ها
  // =====================================================

  document
    .querySelector("[data-scroll-plans]")
    ?.addEventListener("click", () => {
      document.querySelector("#subscriptionPlans")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
}
async function checkout(planId) {
  const pl = await api("/api/plans");
  const plan = pl.plans.find((x) => x.id === planId);
  if (!plan) return alert("پلن یافت نشد");
  const d = modal(
    `<h2>تکمیل خرید — ${esc(plan.title)}</h2><div class="admin-card"><p>مبلغ پایه: <b>${money(plan.price)}</b></p><form id="checkoutForm"><label>کد تخفیف (اختیاری)<input name="coupon_code" autocomplete="off"></label><label style="display:block;margin-top:12px"><input type="checkbox" name="accept" required> شرایط خرید و حریم خصوصی را می‌پذیرم.</label><div style="margin-top:16px"><button class="primary">ایجاد سفارش</button> <button type="button" data-close>انصراف</button></div></form></div>`,
  );
  d.querySelector("#checkoutForm").onsubmit = async (e) => {
    e.preventDefault();
    const x = Object.fromEntries(new FormData(e.target));
    try {
      const order = await api("/api/checkout", {
        method: "POST",
        body: JSON.stringify({
          plan_id: planId,
          coupon_code: x.coupon_code || undefined,
        }),
      });
      if (order.mode === "mock") {
        if (
          !confirm(
            `سفارش ${money(order.order.final_amount)} ایجاد شد.\nحالت آزمایشی فعال است. تأیید پرداخت را انجام می‌دهید؟`,
          )
        )
          return;
        await api("/api/payments/" + order.payment.id + "/confirm", {
          method: "POST",
          body: "{}",
        });
        alert("پرداخت آزمایشی با موفقیت ثبت شد.");
      } else if (order.mode === "bale") {
        alert(
          "فاکتور با مبلغ درست به چت بلهٔ شما ارسال شد. اکنون به ربات بله منتقل می‌شوید تا پرداخت را کامل کنید.",
        );
        if (order.baleBotLink) {
          window.location.assign(order.baleBotLink);
          return;
        }
      } else if (order.mode === "free") {
        alert("سفارش با تخفیف کامل ثبت و اشتراک فعال شد.");
      } else {
        alert("سفارش ایجاد شد.");
      }
      d.remove();
      await home();
    } catch (err) {
      alert(err.message);
    }
  };
}
async function orders() {
  const d = await api("/api/orders");
  shell(
    `<div class="page-title"><h1>سفارش‌ها و پرداخت‌ها</h1><button class="secondary" data-invoices>فاکتورهای من</button></div><div class="admin-card">${d.orders.length ? `<table class="admin-table"><thead><tr><th>پلن</th><th>مبلغ</th><th>وضعیت</th><th>مرجع</th><th>تاریخ</th></tr></thead><tbody>${d.orders.map((o) => `<tr><td>${esc(o.plan_title)}</td><td>${money(o.final_amount)}</td><td>${o.status === "paid" ? "پرداخت‌شده" : "در انتظار"}</td><td>${esc(o.ref_id || "—")}</td><td>${new Date(o.created_at).toLocaleDateString("fa-IR")}</td></tr>`).join("")}</tbody></table>` : '<div class="empty large">هنوز سفارشی ندارید.</div>'}</div>`,
    "subscription",
  );
  document.querySelector("[data-invoices]").onclick = invoices;
}
async function invoices() {
  const d = await api("/api/invoices");
  shell(
    `<div class="page-title"><h1>فاکتورهای من</h1></div><div class="admin-card">${d.invoices.length ? d.invoices.map((i) => `<div class="ticket-row"><div><b>${esc(i.invoice_no)}</b><small>${esc(i.plan_title)} · ${money(i.final_amount)} · ${new Date(i.issued_at).toLocaleDateString("fa-IR")}</small></div></div>`).join("") : '<div class="empty large">هنوز فاکتوری صادر نشده است.</div>'}</div>`,
    "subscription",
  );
}
async function reports() {
  const d = await api("/api/assessments").catch(() => ({ assessments: [] }));
  shell(
    `<div class="page-title"><h1>پرونده و گزارش‌ها</h1><p>نتایج ارزیابی و فعالیت‌های شما.</p></div><div class="admin-card">${d.assessments?.length ? d.assessments.map((a) => `<div class="recent"><span>🧪</span><div><b>${esc(a.title)}</b><small>${a.score != null ? "امتیاز: " + a.score : "هنوز انجام نشده"}</small></div></div>`).join("") : '<div class="empty large">هنوز گزارشی ثبت نشده است.</div>'}</div>`,
    "reports",
  );
}
async function support() {
  const d = await api("/api/tickets");
  shell(
    `<div class="page-title"><h1>پشتیبانی</h1><button class="primary" id="newTicket">+ تیکت جدید</button></div><div class="admin-card">${d.tickets.length ? d.tickets.map((t) => `<div class="ticket-row"><div><b>#${t.id} — ${esc(t.subject)}</b><small>${esc(t.category)} · ${esc(t.priority)} · ${esc(t.status)}</small></div><button class="secondary" data-ticket="${t.id}">مشاهده</button></div>`).join("") : '<div class="empty">هنوز تیکتی ثبت نکرده‌اید.</div>'}</div>`,
    "support",
  );
  document.querySelector("#newTicket").onclick = newTicket;
  document
    .querySelectorAll("[data-ticket]")
    .forEach((b) => (b.onclick = () => ticketDetail(b.dataset.ticket)));
}
function newTicket() {
  const d = modal(
    `<h2>ثبت تیکت</h2><form id="tf"><div class="form-grid"><label>موضوع<input name="subject" required></label><label>دسته<select name="category"><option>عمومی</option><option>فنی</option><option>اشتراک و پرداخت</option><option>محصول</option></select></label><label>اولویت<select name="priority"><option value="normal">عادی</option><option value="high">بالا</option></select></label><label>پیام<textarea name="body" required></textarea></label></div><button class="primary">ارسال</button> <button type="button" data-close>انصراف</button></form>`,
  );
  d.querySelector("#tf").onsubmit = async (e) => {
    e.preventDefault();
    await api("/api/tickets", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(e.target))),
    });
    d.remove();
    support();
  };
}
async function ticketDetail(id) {
  const d = await api("/api/tickets/" + id);
  const m = d.messages
    .map(
      (x) =>
        `<div class="message ${x.role === "admin" ? "admin-msg" : ""}"><b>${x.role === "admin" ? "پشتیبانی" : "شما"}</b><p>${esc(x.body)}</p><small>${new Date(x.created_at).toLocaleString("fa-IR")}</small></div>`,
    )
    .join("");
  const x = modal(
    `<h2>تیکت #${d.ticket.id} — ${esc(d.ticket.subject)}</h2><div class="messages">${m}</div><form id="reply"><textarea name="body" placeholder="پیام شما..." required></textarea><button class="primary">ارسال پاسخ</button></form>`,
  );
  x.querySelector("#reply").onsubmit = async (e) => {
    e.preventDefault();
    await api("/api/tickets/" + id, {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(e.target))),
    });
    x.remove();
    ticketDetail(id);
  };
}
async function notifications() {
  const d = await api("/api/notifications");
  state.notifications = d.notifications || [];
  shell(
    `<div class="page-title"><h1>اعلان‌ها</h1></div><div class="admin-card">${state.notifications.length ? state.notifications.map((n) => `<div class="notification ${n.is_read ? "read" : ""}" data-notification="${n.id}"><b>${esc(n.title)}</b><p>${esc(n.body)}</p><small>${new Date(n.created_at).toLocaleString("fa-IR")}</small></div>`).join("") : '<div class="empty large">اعلانی ندارید.</div>'}</div>`,
    "notifications",
  );
  document.querySelectorAll("[data-notification]").forEach(
    (x) =>
      (x.onclick = async () => {
        await api("/api/notifications/" + x.dataset.notification + "/read", {
          method: "PATCH",
          body: "{}",
        });
        x.classList.add("read");
      }),
  );
}
function admin() {
  api("/api/admin/overview").then((o) => {
    root.innerHTML = `<div class="admin-shell"><aside class="admin-sidebar"><h2>🛠 مدیریت تجاری</h2>${[
      ["overview", "داشبورد"],
      ["users", "کاربران"],
      ["products", "محصولات"],
      ["categories", "دسته‌بندی‌ها"],
      ["plans", "پلن‌ها"],
      ["orders", "سفارش‌ها"],
      ["coupons", "کدهای تخفیف"],
      ["tickets", "تیکت‌ها"],
      ["notifications", "اعلان‌ها"],
      ["analytics", "تحلیل و آمار"],
      ["files", "فایل‌ها"],
      ["audit", "گزارش فعالیت"],
      ["back", "بازگشت به کاربر"],
    ]
      .map((x) => `<button data-admin="${x[0]}">${x[1]}</button>`)
      .join(
        "",
      )}</aside><main class="admin-main"><div id="adminContent"></div></main></div>`;
    document
      .querySelectorAll("[data-admin]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            b.dataset.admin === "back"
              ? personalHome()
              : adminPage(b.dataset.admin)),
      );
    adminOverview(o);
  });
}
function adminOverview(o) {
  document.querySelector("#adminContent").innerHTML =
    `<h1>داشبورد مدیریت</h1><p>هسته تجاری، فروش و عملیات پلتفرم</p><div class="admin-grid">${[
      ["کاربران", o.stats.users],
      ["مدیران", o.stats.admins],
      ["محصولات", o.stats.products],
      ["اشتراک فعال", o.stats.active_subscriptions],
    ]
      .map(
        (x) =>
          `<div class="admin-stat"><span>${x[0]}</span><b>${x[1]}</b></div>`,
      )
      .join(
        "",
      )}</div><div class="admin-card" style="margin-top:18px"><h3>توزیع پلن‌ها</h3>${o.plans.map((p) => `<p>${esc(p.title)}: <b>${p.users}</b> کاربر</p>`).join("")}</div>`;
}
async function adminPage(p) {
  if (p === "overview") return admin();
  const map = {
    users: ["/api/admin/users", (d) => adminUsers(d.users)],
    products: ["/api/admin/products", (d) => adminProducts(d.products)],
    categories: ["/api/admin/categories", (d) => adminCategories(d.categories)],
    plans: ["/api/admin/plans", (d) => adminPlans(d.plans)],
    orders: ["/api/admin/orders", (d) => adminOrders(d.orders)],
    coupons: ["/api/admin/coupons", (d) => adminCoupons(d.coupons)],
    tickets: ["/api/admin/tickets", (d) => adminTickets(d.tickets)],
    notifications: [
      "/api/admin/notifications",
      (d) => adminNotifications(d.notifications),
    ],
    analytics: ["/api/admin/analytics", adminAnalytics],
    files: ["/api/admin/product-files", (d) => adminFiles(d.files)],
    audit: ["/api/admin/audit-logs", (d) => adminAudit(d.logs)],
  };
  if (map[p]) {
    const d = await api(map[p][0]);
    return map[p][1](d);
  }
}
function adminUsers(a) {
  const roleLabels = {
    personal: "کاربر شخصی",
    employee: "کاربر شخصی",
    professional: "روان‌شناس / مشاور",
    clinic: "کلینیک / مرکز",
    school: "مدرسه / مرکز آموزشی",
    admin: "مدیر سامانه",
  };
  document.querySelector("#adminContent").innerHTML =
    `<h1>مدیریت کاربران</h1><p class="muted">نقش کاربر تعیین می‌کند کدام داشبورد و منوی تخصصی را ببیند.</p><table class="admin-table"><thead><tr><th>کاربر</th><th>نقش</th><th>پلن</th><th>پایان اشتراک</th><th>عملیات</th></tr></thead><tbody>${a.map((u) => `<tr><td>${esc(u.first_name)} ${esc(u.last_name)}<br><small>${esc(u.username)}</small></td><td><span class="admin-badge">${roleLabels[u.role] || u.role}</span></td><td>${planName[u.plan_id] || u.plan_id}</td><td>${u.ends_at ? new Date(u.ends_at).toLocaleDateString("fa-IR") : "—"}</td><td><button class="secondary" data-user="${u.id}">ویرایش</button></td></tr>`).join("")}</tbody></table>`;
  document.querySelectorAll("[data-user]").forEach(
    (b) =>
      (b.onclick = () => {
        const u = a.find((x) => x.id == b.dataset.user);
        const d = modal(
          `<h2>ویرایش کاربر</h2><form id="uf"><div class="form-grid"><label>نقش<select name="role"><option value="personal" ${["personal", "employee"].includes(u.role) ? "selected" : ""}>کاربر شخصی</option><option value="professional" ${u.role === "professional" ? "selected" : ""}>روان‌شناس / مشاور</option><option value="clinic" ${u.role === "clinic" ? "selected" : ""}>کلینیک / مرکز</option><option value="school" ${u.role === "school" ? "selected" : ""}>مدرسه / مرکز آموزشی</option><option value="admin" ${u.role === "admin" ? "selected" : ""}>مدیر سامانه</option></select></label><label>پلن<select name="plan_id">${["normal", "silver", "gold"].map((x) => `<option value="${x}" ${u.plan_id === x ? "selected" : ""}>${planName[x]}</option>`).join("")}</select></label></div><button class="primary">ذخیره</button></form>`,
        );
        d.querySelector("#uf").onsubmit = async (e) => {
          e.preventDefault();
          await api("/api/admin/users/" + u.id, {
            method: "PATCH",
            body: JSON.stringify(Object.fromEntries(new FormData(e.target))),
          });
          d.remove();
          adminPage("users");
        };
      }),
  );
}
async function productForm(p = null) {
  const c = (await api("/api/admin/categories")).categories;
  const d = modal(
    `<h2>${p ? "ویرایش" : "محصول جدید"}</h2><form id="pf"><div class="form-grid"><label>شناسه<input name="id" value="${esc(p?.id || "")}" ${p ? "readonly" : ""} required></label><label>نام<input name="title" value="${esc(p?.title || "")}" required></label><label>نوع<input name="product_type" value="${esc(p?.product_type || "آزمون")}" required></label><label>دسته<select name="category_id">${c.map((x) => `<option value="${x.id}" ${p?.category_id === x.id ? "selected" : ""}>${esc(x.title)}</option>`).join("")}</select></label><label>سطح<select name="required_plan">${["normal", "silver", "gold"].map((x) => `<option value="${x}" ${p?.required_plan === x ? "selected" : ""}>${planName[x]}</option>`).join("")}</select></label><label>مخاطب<input name="audience" value="${esc(p?.audience || "عمومی")}"></label><label>مدت<input name="duration" value="${esc(p?.duration || "")}"></label><label>ترتیب<input type="number" name="sort_order" value="${p?.sort_order || 0}"></label><label>تصویر کاور<input name="cover_image" value="${esc(p?.cover_image || "")}"></label><label>ویدئوی معرفی<input name="intro_video_url" value="${esc(p?.intro_video_url || "")}"></label><label><input type="checkbox" name="is_beta" ${p?.is_beta ? "checked" : ""}> نسخه بتا</label><label><input type="checkbox" name="is_published" ${p?.is_published !== false ? "checked" : ""}> منتشر شده</label><label>توضیحات<textarea name="description">${esc(p?.description || "")}</textarea></label></div><button class="primary">ذخیره محصول</button> <button type="button" data-close>انصراف</button></form>`,
  );
  d.querySelector("#pf").onsubmit = async (e) => {
    e.preventDefault();
    const x = Object.fromEntries(new FormData(e.target));
    x.is_beta = e.target.is_beta.checked;
    x.is_published = e.target.is_published.checked;
    await api(p ? "/api/admin/products/" + p.id : "/api/admin/products", {
      method: p ? "PATCH" : "POST",
      body: JSON.stringify(x),
    });
    d.remove();
    adminPage("products");
  };
}
function adminProducts(a) {
  document.querySelector("#adminContent").innerHTML =
    `<div class="toolbar"><h1>مدیریت محصولات</h1><button id="addProduct" class="primary">+ محصول جدید</button></div><table class="admin-table"><thead><tr><th>نام</th><th>نوع</th><th>دسترسی</th><th>وضعیت</th><th>فایل</th><th>عملیات</th></tr></thead><tbody>${a.map((p) => `<tr><td>${esc(p.title)}</td><td>${esc(p.product_type)}</td><td>${planName[p.required_plan]}</td><td>${p.is_published ? "منتشر" : "پیش‌نویس"} ${p.is_beta ? "BETA" : ""}</td><td>${p.file_count || 0} فایل</td><td><button class="secondary" data-upload="${esc(p.id)}">📁 انتخاب فایل</button> <button class="secondary" data-version="${esc(p.id)}">نسخه‌ها</button> <button class="secondary" data-edit="${esc(p.id)}">ویرایش</button> <button class="danger" data-del="${esc(p.id)}">حذف</button></td></tr>`).join("")}</tbody></table>`;
  document.querySelector("#addProduct").onclick = () => productForm();
  document
    .querySelectorAll("[data-edit]")
    .forEach(
      (b) =>
        (b.onclick = () => productForm(a.find((x) => x.id === b.dataset.edit))),
    );
  document
    .querySelectorAll("[data-upload]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          uploadProductFile(a.find((x) => x.id === b.dataset.upload))),
    );
  document
    .querySelectorAll("[data-version]")
    .forEach(
      (b) =>
        (b.onclick = () => versions(a.find((x) => x.id === b.dataset.version))),
    );
  document.querySelectorAll("[data-del]").forEach(
    (b) =>
      (b.onclick = async () => {
        if (confirm("حذف محصول و فایل‌های آن انجام شود؟")) {
          await api("/api/admin/products/" + b.dataset.del, {
            method: "DELETE",
          });
          adminPage("products");
        }
      }),
  );
}
function uploadProductFile(p) {
  const d = modal(
    `
    <div class="modal-header">
      <h2>بارگذاری فایل — ${esc(p.title)}</h2>
      <button type="button" class="modal-close" id="closeUploadModal" aria-label="بستن">×</button>
    </div>

    <form id="ufile">
      <div class="form-grid">

        <label>
          فایل
          <input
            type="file"
            name="file"
            required
            accept=".html,.htm,.pdf,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.mp3,.wav,.mp4,.webm"
          >
        </label>

        <label>
          نقش فایل
          <select name="file_role">
            <option value="main">فایل اصلی</option>
            <option value="guide">راهنما</option>
            <option value="worksheet">کاربرگ</option>
            <option value="resource">منبع جانبی</option>
          </select>
        </label>

        <label>
          نسخه
          <input
            name="version_label"
            placeholder="مثلاً 1.0"
          >
        </label>

      </div>

      <p class="muted">
        حداکثر حجم: 500 مگابایت.
        فایل‌های مجاز: HTML, PDF, ZIP, Office، تصویر، صوت و ویدئو.
      </p>

      <div class="modal-actions">
        <button type="submit" class="primary">
          بارگذاری
        </button>

        <button type="button" class="secondary" id="cancelUpload">
          انصراف
        </button>
      </div>
    </form>
    `,
  );

  // دکمه ×
  d.querySelector("#closeUploadModal").onclick = () => {
    d.remove();
  };

  // دکمه انصراف
  d.querySelector("#cancelUpload").onclick = () => {
    d.remove();
  };

  // ارسال فرم
  d.querySelector("#ufile").onsubmit = async (e) => {
    e.preventDefault();

    const fileInput = e.target.querySelector('input[name="file"]');
    const file = fileInput.files[0];

    if (!file) {
      alert("لطفاً یک فایل انتخاب کنید.");
      return;
    }

    // بررسی حجم فایل
    const maxSize = 500 * 1024 * 1024;

    if (file.size > maxSize) {
      alert("حجم فایل نباید بیشتر از 500 مگابایت باشد.");
      return;
    }

    // بررسی فرمت
    const allowedExtensions = [
      "html",
      "htm",
      "pdf",
      "zip",
      "doc",
      "docx",
      "xls",
      "xlsx",
      "ppt",
      "pptx",
      "jpg",
      "jpeg",
      "png",
      "gif",
      "mp3",
      "wav",
      "mp4",
      "webm",
    ];

    const extension = file.name.split(".").pop().toLowerCase();

    if (!allowedExtensions.includes(extension)) {
      alert(
        "فرمت فایل مجاز نیست.\n\nفرمت‌های مجاز:\n" +
          allowedExtensions.join(", "),
      );
      return;
    }

    const fd = new FormData(e.target);

    // غیرفعال کردن دکمه هنگام بارگذاری
    const submitButton = e.target.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = "در حال بارگذاری...";

    try {
      await api("/api/admin/products/" + encodeURIComponent(p.id) + "/files", {
        method: "POST",
        body: fd,
      });

      alert("فایل با موفقیت بارگذاری شد.");

      d.remove();
      adminPage("products");
    } catch (x) {
      alert(x.message);

      submitButton.disabled = false;
      submitButton.textContent = "بارگذاری";
    }
  };
}
async function versions(p) {
  const d = await api(
    "/api/admin/products/" + encodeURIComponent(p.id) + "/versions",
  );
  const x = modal(
    `<h2>نسخه‌های ${esc(p.title)}</h2><div>${d.versions.map((v) => `<div class="version-item"><b>${esc(v.version_label)}</b> — ${esc(v.status)}<p>${esc(v.changelog)}</p></div>`).join("") || '<div class="empty">نسخه‌ای وجود ندارد.</div>'}</div><hr><form id="vf"><div class="form-grid"><label>نسخه<input name="version_label" placeholder="1.0" required></label><label>وضعیت<select name="status"><option value="draft">پیش‌نویس</option><option value="released">منتشرشده</option></select></label><label>تغییرات<textarea name="changelog"></textarea></label></div><button class="primary">ثبت نسخه</button></form>`,
  );
  x.querySelector("#vf").onsubmit = async (e) => {
    e.preventDefault();
    await api("/api/admin/products/" + encodeURIComponent(p.id) + "/versions", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(e.target))),
    });
    x.remove();
    versions(p);
  };
}
function adminCategories(a) {
  document.querySelector("#adminContent").innerHTML =
    `<div class="toolbar"><h1>دسته‌بندی‌ها</h1><button id="addCat" class="primary">+ دسته جدید</button></div><div class="admin-card">${a.map((x) => `<p>${x.icon} <b>${esc(x.title)}</b> — ${esc(x.id)}</p>`).join("")}</div>`;
  document.querySelector("#addCat").onclick = () => {
    const d = modal(
      `<h2>دسته‌بندی جدید</h2><form id="cf"><div class="form-grid"><label>شناسه<input name="id" required></label><label>عنوان<input name="title" required></label><label>آیکن<input name="icon" value="📦"></label><label>ترتیب<input name="sort_order" type="number" value="0"></label></div><button class="primary">ذخیره</button></form>`,
    );
    d.querySelector("#cf").onsubmit = async (e) => {
      e.preventDefault();
      await api("/api/admin/categories", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(e.target))),
      });
      d.remove();
      adminPage("categories");
    };
  };
}
function adminPlans(a) {
  document.querySelector("#adminContent").innerHTML =
    `<h1>مدیریت پلن‌های عضویت</h1><div class="plan-grid">${a.map((p) => `<article class="plan"><h2>${esc(p.title)}</h2><div class="price">${money(p.price)}</div><ul>${p.features.map((x) => "<li>✓ " + esc(x) + "</li>").join("")}</ul><button class="primary" data-planedit="${p.id}">ویرایش</button></article>`).join("")}</div>`;
  document.querySelectorAll("[data-planedit]").forEach(
    (b) =>
      (b.onclick = () => {
        const p = a.find((x) => x.id === b.dataset.planedit);
        const d = modal(
          `<h2>ویرایش ${esc(p.title)}</h2><form id="plf"><div class="form-grid"><label>عنوان<input name="title" value="${esc(p.title)}"></label><label>قیمت<input name="price" type="number" value="${p.price}"></label><label>امکانات<textarea name="features">${p.features.join("\n")}</textarea></label></div><button class="primary">ذخیره</button></form>`,
        );
        d.querySelector("#plf").onsubmit = async (e) => {
          e.preventDefault();
          const x = Object.fromEntries(new FormData(e.target));
          x.features = x.features.split("\n").filter(Boolean);
          x.price = Number(x.price);
          await api("/api/admin/plans/" + p.id, {
            method: "PATCH",
            body: JSON.stringify(x),
          });
          d.remove();
          adminPage("plans");
        };
      }),
  );
}
function adminOrders(a) {
  document.querySelector("#adminContent").innerHTML =
    `<h1>سفارش‌ها و پرداخت‌ها</h1><table class="admin-table"><thead><tr><th>کاربر</th><th>پلن</th><th>مبلغ</th><th>وضعیت</th><th>درگاه</th><th>مرجع</th></tr></thead><tbody>${a.map((o) => `<tr><td>${esc(o.username)}</td><td>${esc(o.plan_title)}</td><td>${money(o.final_amount)}</td><td>${o.status === "paid" ? "پرداخت موفق" : "در انتظار"}</td><td>${esc(o.gateway || "—")}</td><td>${esc(o.ref_id || "—")}</td></tr>`).join("")}</tbody></table>`;
}
function adminCoupons(a) {
  document.querySelector("#adminContent").innerHTML =
    `<div class="toolbar"><h1>کدهای تخفیف</h1><button class="primary" id="addCoupon">+ کد جدید</button></div><table class="admin-table"><thead><tr><th>کد</th><th>نوع</th><th>مقدار</th><th>مصرف</th><th>وضعیت</th></tr></thead><tbody>${a.map((c) => `<tr><td><b>${esc(c.code)}</b></td><td>${c.discount_type === "percent" ? "درصدی" : "مبلغی"}</td><td>${c.discount_value}${c.discount_type === "percent" ? "٪" : " تومان"}</td><td>${c.used_count}${c.max_uses ? " / " + c.max_uses : ""}</td><td>${c.is_active ? "فعال" : "غیرفعال"}</td></tr>`).join("")}</tbody></table>`;
  document.querySelector("#addCoupon").onclick = () => {
    const d = modal(
      `<h2>کد تخفیف جدید</h2><form id="cfm"><div class="form-grid"><label>کد<input name="code" required></label><label>نوع<select name="discount_type"><option value="percent">درصدی</option><option value="fixed">مبلغ ثابت</option></select></label><label>مقدار<input name="discount_value" type="number" min="1" required></label><label>حداکثر استفاده<input name="max_uses" type="number" min="1"></label></div><button class="primary">ذخیره</button></form>`,
    );
    d.querySelector("#cfm").onsubmit = async (e) => {
      e.preventDefault();
      await api("/api/admin/coupons", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(e.target))),
      });
      d.remove();
      adminPage("coupons");
    };
  };
}
function adminTickets(a) {
  document.querySelector("#adminContent").innerHTML =
    `<h1>مدیریت تیکت‌ها</h1><table class="admin-table"><thead><tr><th>کاربر</th><th>موضوع</th><th>اولویت</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>${a.map((t) => `<tr><td>${esc(t.username)}</td><td>${esc(t.subject)}</td><td>${esc(t.priority)}</td><td>${esc(t.status)}</td><td><button class="secondary" data-aticket="${t.id}">پاسخ</button></td></tr>`).join("")}</tbody></table>`;
  document
    .querySelectorAll("[data-aticket]")
    .forEach((b) => (b.onclick = () => adminTicketDetail(b.dataset.aticket)));
}
async function adminTicketDetail(id) {
  const d = await api("/api/admin/tickets/" + id);
  const x = modal(
    `<h2>تیکت #${id} — ${esc(d.ticket.subject)}</h2><div class="messages">${d.messages.map((m) => `<div class="message ${m.role === "admin" ? "admin-msg" : ""}"><b>${m.role === "admin" ? "مدیر" : "کاربر"}</b><p>${esc(m.body)}</p></div>`).join("")}</div><form id="ar"><textarea name="body" required></textarea><select name="status"><option value="answered">پاسخ داده شد</option><option value="closed">بسته شود</option></select><button class="primary">ثبت پاسخ</button></form>`,
  );
  x.querySelector("#ar").onsubmit = async (e) => {
    e.preventDefault();
    await api("/api/admin/tickets/" + id, {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(e.target))),
    });
    x.remove();
    adminPage("tickets");
  };
}
function adminNotifications(a) {
  document.querySelector("#adminContent").innerHTML =
    `<div class="toolbar"><h1>اعلان‌ها</h1><button class="primary" id="sendNotif">+ ارسال اعلان</button></div><div class="admin-card">${a.map((n) => `<p><b>${esc(n.title)}</b> — ${esc(n.username)}<br>${esc(n.body)}</p>`).join("")}</div>`;
  document.querySelector("#sendNotif").onclick = () => {
    const d = modal(
      `<h2>ارسال اعلان</h2><form id="nf"><div class="form-grid"><label>شناسه کاربر (اختیاری)<input name="user_id"></label><label>عنوان<input name="title" required></label><label>متن<textarea name="body" required></textarea></label><label>نوع<input name="type" value="info"></label></div><button class="primary">ارسال</button></form>`,
    );
    d.querySelector("#nf").onsubmit = async (e) => {
      e.preventDefault();
      const x = Object.fromEntries(new FormData(e.target));
      x.user_id = x.user_id ? Number(x.user_id) : null;
      await api("/api/admin/notifications", {
        method: "POST",
        body: JSON.stringify(x),
      });
      d.remove();
      adminPage("notifications");
    };
  };
}
function adminAnalytics(d) {
  document.querySelector("#adminContent").innerHTML =
    `<h1>تحلیل و آمار</h1><div class="admin-grid">${[
      ["سفارش‌ها", d.summary.orders],
      ["پرداخت موفق", d.summary.paid_orders],
      ["درآمد", money(d.summary.revenue)],
      ["تیکت باز", d.summary.open_tickets],
      ["فایل‌ها", d.summary.files],
    ]
      .map(
        (x) =>
          `<div class="admin-stat"><span>${x[0]}</span><b>${x[1]}</b></div>`,
      )
      .join(
        "",
      )}</div><div class="admin-card" style="margin-top:18px"><h3>محصولات پرکاربرد</h3>${d.top.map((x) => `<p>${esc(x.title)} — ${x.uses} فعالیت</p>`).join("")}</div><div class="admin-card" style="margin-top:18px"><h3>روند ماهانه</h3>${d.monthly.map((x) => `<p>${x.month}: ${x.orders} سفارش — ${money(x.revenue)}</p>`).join("")}</div>`;
}
function adminFiles(a) {
  document.querySelector("#adminContent").innerHTML =
    `<h1>مدیریت فایل‌ها</h1><table class="admin-table"><thead><tr><th>محصول</th><th>فایل</th><th>نوع</th><th>حجم</th><th>عملیات</th></tr></thead><tbody>${a.map((f) => `<tr><td>${esc(f.product_title)}</td><td>${esc(f.original_name)}</td><td>${esc(f.file_role)}</td><td>${moneyBytes(f.size_bytes)}</td><td><button class="danger" data-delfile="${f.id}">حذف</button></td></tr>`).join("")}</tbody></table>`;
  document.querySelectorAll("[data-delfile]").forEach(
    (b) =>
      (b.onclick = async () => {
        if (confirm("فایل حذف شود؟")) {
          await api("/api/admin/product-files/" + b.dataset.delfile, {
            method: "DELETE",
          });
          adminPage("files");
        }
      }),
  );
}
function adminAudit(a) {
  document.querySelector("#adminContent").innerHTML =
    `<h1>گزارش فعالیت مدیران</h1><table class="admin-table"><thead><tr><th>مدیر</th><th>عملیات</th><th>موجودیت</th><th>زمان</th></tr></thead><tbody>${a.map((l) => `<tr><td>${esc(l.username)}</td><td>${esc(l.action)}</td><td>${esc(l.entity_type || "")} ${esc(l.entity_id || "")}</td><td>${new Date(l.created_at).toLocaleString("fa-IR")}</td></tr>`).join("")}</tbody></table>`;
}
function modal(html) {
  const d = document.createElement("div");
  d.className = "modal";
  d.innerHTML = `<div class="modal-box">${html}</div>`;
  document.body.append(d);
  d.querySelector("[data-close]")?.addEventListener("click", () => d.remove());
  return d;
}
function bind() {
  document
    .querySelectorAll("[data-page]")
    .forEach((b) => (b.onclick = () => nav(b.dataset.page)));
  document
    .querySelectorAll("[data-product]")
    .forEach((b) => (b.onclick = () => openProduct(b.dataset.product)));
}
function openProduct(id) {
  const p = state.products.find((x) => x.id === id);
  if (!p) return;
  const ok =
    level[state.subscription?.plan_id || "normal"] >= level[p.required_plan] &&
    (!p.is_beta || state.subscription?.plan_id === "gold");
  if (!ok) return subscription();
  return productDetail(id);
}
function nav(p) {
  if (p === "career-guidance") {
    return careerGuidance();
  }

  if (p === "home") {
    return home();
  }

  if (
    [
      "clients",
      "staff",
      "students",
      "screening",
      "risk",
      "cases",
      "teachers",
      "parents",
      "outcomes",
      "analytics",
    ].includes(p)
  )
    return roleWorkspace(p);
  if (p === "programs") return roleWorkspace("programs");
  if (p === "progress") return roleWorkspace("progress");
  if (p === "resources") return roleWorkspace("resources");
  if (p === "products") return products();
  // آموزش کاربران عادی
  if (p === "academy") {
    return careerGuidance();
  }

  // سایر بخش‌های فروشگاه
  if (["assessments", "systems", "interventions", "library"].includes(p)) {
    const m = {
      assessments: ["assessments", "ارزیابی‌ها"],
      systems: ["systems", "سامانه‌های تخصصی"],
      interventions: ["interventions", "مداخلات"],
      library: ["library", "کتابخانه"],
    };

    return products(...m[p]);
  }
  if (p === "subscription") return subscription();
  if (p === "reports") return reports();
  if (p === "support") return support();
  if (p === "notifications") return notifications();
  if (p === "admin") return admin();
  return home();
}
async function logout() {
  const token = localStorage.getItem("token");

  try {
    await fetch("/api/logout", {
      method: "POST",
      credentials: "include",
      headers: token
        ? {
            Authorization: "Bearer " + token,
          }
        : {},
    });
  } catch (e) {
    console.warn("Logout request failed:", e);
  }

  localStorage.removeItem("token");

  state = {
    token: "",
    user: null,
    products: [],
    subscription: null,
    notifications: [],
  };

  login();
}
(async () => {
  if (!state.token) return login();
  try {
    const d = await api("/api/me");
    state.user = d.user;
    state.user.role === "admin" ? admin() : home();
  } catch (e) {
    logout();
  }
})();
function hasCareerAccess() {
  const sub = state.subscription;

  if (!sub) return false;

  if (!["silver", "gold"].includes(sub.plan_id)) {
    return false;
  }

  if (sub.status !== "active") {
    return false;
  }

  if (!sub.ends_at) {
    return false;
  }

  return new Date(sub.ends_at) > new Date();
}
function careerGuidance() {
  shell(
    `
    <div class="page-title">
      <div>
        <span class="eyebrow">آموزش و راهنما</span>

        <h1>آموزش</h1>

        <p>
          برای استفاده از سامانه انتخاب رشته، یکی از گزینه‌های زیر را انتخاب کنید.
        </p>
      </div>
    </div>

    <div class="career-guidance-grid">

      <!-- سامانه انتخاب رشته -->
      <button
        class="career-guidance-card"
        id="openCareerSystem"
        type="button"
      >
        <div class="career-card-icon">
          🎓
        </div>

        <div class="career-card-content">
          <h2>سامانه انتخاب رشته تحصیلی</h2>

          <p>
            ورود به سامانه و انجام فرآیند انتخاب رشته تحصیلی
          </p>
        </div>

        <div class="career-card-arrow">
          ←
        </div>
      </button>


      <!-- فیلم آموزشی -->
      <button
        class="career-guidance-card"
        id="openCareerVideo"
        type="button"
      >
        <div class="career-card-icon">
          🎥
        </div>

        <div class="career-card-content">
          <h2>فیلم آموزش استفاده از سامانه انتخاب رشته</h2>

          <p>
            آموزش نحوه استفاده از سامانه انتخاب رشته به صورت ویدئویی
          </p>
        </div>

        <div class="career-card-arrow">
          ←
        </div>
      </button>

    </div>
    `,
    "career-guidance",
  );

  // دکمه سامانه انتخاب رشته
  document.querySelector("#openCareerSystem").onclick = () => {
    if (!hasCareerAccess()) {
      alert(
        "برای استفاده از سامانه انتخاب رشته، ابتدا باید اشتراک نقره‌ای یا طلایی تهیه کنید.",
      );

      return subscription();
    }

    window.location.href = "/assessments/ChaFildv7.html";
  };
  // دکمه فیلم آموزشی
  const videoButton = document.querySelector("#openCareerVideo");

  if (videoButton) {
    videoButton.onclick = () => {
      careerGuidanceVideo();
    };
  }
}

function careerGuidanceVideo() {
  shell(
    `
    <div class="page-title">
      <div>
        <span class="eyebrow">آموزش سامانه</span>

        <h1>فیلم آموزش استفاده از سامانه انتخاب رشته</h1>

        <p>
          برای آشنایی با نحوه کار با سامانه، ویدئوی آموزشی زیر را مشاهده کنید.
        </p>
      </div>
    </div>


    <div class="career-video-container">

      <div class="career-video-box">

        <video
          controls
          playsinline
          preload="metadata"
        >

          <source
            src="/assessments/videos/career-guidance-web.mp4"
            type="video/mp4"
          />

          مرورگر شما از پخش ویدئو پشتیبانی نمی‌کند.

        </video>

      </div>


      <button
        class="secondary career-back-button"
        id="backToCareerGuidance"
        type="button"
      >
        → بازگشت به آموزش
      </button>

    </div>
    `,
    "career-guidance",
  );

  const backButton = document.querySelector("#backToCareerGuidance");

  if (backButton) {
    backButton.onclick = () => {
      careerGuidance();
    };
  }
}
