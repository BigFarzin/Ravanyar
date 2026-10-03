# راهنمای استقرار روان‌یار

## اجرای محلی
1. PostgreSQL را اجرا و دیتابیس `payesh` را بسازید.
2. `.env` را تنظیم کنید.
3. `npm install`
4. `npm start`
5. `http://localhost:3000`
6. سلامت سرویس: `http://localhost:3000/health`

## اجرای Docker
قبل از اجرا، رمز دیتابیس و مدیر را در `docker-compose.yml` تغییر دهید. برای محیط واقعی بهتر است secrets را از فایل compose خارج کرده و از secret manager استفاده کنید.

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
`PAYMENT_MODE=real` بدون آداپتور واقعی کافی نیست. آداپتور درگاه باید create-payment، callback و verify را پیاده‌سازی کند و فعال‌سازی اشتراک فقط پس از verify موفق انجام شود.
