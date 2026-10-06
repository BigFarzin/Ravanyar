# راهنمای استقرار روان‌یار

## اجرای محلی
1. PostgreSQL را اجرا و دیتابیس `payesh` را بسازید.
2. `.env` را تنظیم کنید.
3. `npm install`
4. `npm start`
5. `http://localhost:3000`
6. سلامت سرویس: `http://localhost:3000/health`

## اجرای Docker
قبل از اجرا، رمز دیتابیس و مدیر را در `docker-compose.yml` تغییر دهید. سپس `.env.example` را به `.env` کپی کنید و مقادیر `BALE_BOT_TOKEN`، `BALE_BOT_USERNAME` و `BALE_PAYMENT_PROVIDER_TOKEN` را وارد کنید. توکن payment را فقط از @botfather و برای همین ربات بگیرید؛ برای تست بدون انتقال وجه، `WALLET-TEST-1111111111111111` قابل استفاده است.

```bash
docker compose up -d --build
```

## Reverse Proxy
در Production سرویس Node را پشت Nginx/Reverse Proxy قرار دهید و HTTPS را در لایه Reverse Proxy فعال کنید.

## Database
- PostgreSQL را روی اینترنت عمومی باز نگذارید.
- Backup روزانه و Backup خارج از سرور داشته باشید.
- Restore را به‌صورت دوره‌ای تست کنید.

## Payment
درگاه بله در این نسخه فعال است. سرویس `app` پس از ایجاد سفارش، `sendInvoice` را به چت بلهٔ متصل‌شدهٔ کاربر می‌فرستد و سرویس `bale-bot` پاسخ `pre_checkout_query` را حداکثر در ۱۰ ثانیه می‌دهد. اشتراک تنها بعد از دریافت `SuccessfulPayment` فعال می‌شود.

پس از بالا آوردن سرویس‌ها این دو لاگ را بررسی کنید:

```bash
docker compose logs -f app bale-bot
```

کاربر باید یک‌بار از صفحهٔ اشتراک، «اتصال بله» را بزند و در ربات `/start` را کامل کند. سپس در همان صفحه خرید را آغاز کند؛ درخواست پول در چت خصوصی همان ربات ظاهر می‌شود. برای اجرای فقط migration روی دیتابیس قدیمی: `psql "$DATABASE_URL" -f migrations/008_bale_payments.sql`.
