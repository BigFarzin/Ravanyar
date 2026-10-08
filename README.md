# روان‌یار V5 — Production-Ready Mental Health Platform

**روان‌یار (Ravanyar)** یک پلتفرم تجاری و Production-oriented در حوزه محصولات و خدمات روان‌شناختی است که با تمرکز بر **اشتراک، فروش محصولات دیجیتال، پرداخت، مدیریت کاربران، کنترل دسترسی و پنل مدیریتی** طراحی و توسعه داده شده است.

این پروژه علاوه بر قابلیت‌های اصلی یک پلتفرم SaaS/Commercial، شامل مجموعه‌ای از ملاحظات امنیتی و عملیاتی برای اجرای واقعی در محیط Production است.

---

## ✨ Overview

روان‌یار یک سیستم چندنقشی است که کاربران مختلف می‌توانند بر اساس نوع حساب خود به بخش‌ها و امکانات متفاوتی از سامانه دسترسی داشته باشند.

سیستم از مدل **Subscription-based Access Control** استفاده می‌کند و دسترسی کاربران به محصولات و منابع بر اساس:

- نقش کاربر
- پلن اشتراک
- وضعیت اشتراک
- تاریخ شروع و پایان اشتراک
- محدودیت‌های پلن

کنترل می‌شود.

معماری پروژه به‌گونه‌ای طراحی شده که بتواند در آینده به سرویس‌ها و قابلیت‌های بیشتری توسعه پیدا کند.

---

## 🚀 Key Features

### 👤 User & Role Management

- سیستم احراز هویت و Session
- مدیریت کاربران
- نقش‌های تخصصی
- داشبورد Role-Based
- رابط کاربری متفاوت برای هر نوع کاربر
- کنترل دسترسی مبتنی بر نقش و وضعیت حساب

### 🎯 Supported Roles

- کاربر شخصی
- روان‌شناس / مشاور
- کلینیک / مرکز
- مدرسه / مرکز آموزشی
- مدیر سامانه

هر نقش دارای مسیرهای عملیاتی و منوی متناسب با نیاز خود است.

---

## 💳 Subscription & Payment

یکی از بخش‌های اصلی پروژه، سیستم اشتراک و پرداخت است.

### Subscription Plans

- Normal
- Silver
- Gold

سیستم از قابلیت‌های زیر پشتیبانی می‌کند:

- خرید اشتراک
- فعال‌سازی اشتراک
- تمدید اشتراک فعال
- محاسبه تاریخ انقضا
- کنترل دسترسی بر اساس Subscription
- محدودیت استفاده بر اساس پلن
- ثبت تاریخچه پرداخت
- ایجاد فاکتور پس از پرداخت موفق

### Bale Payment Gateway

پروژه به درگاه پرداخت **Bale** نیز متصل شده است.

Flow پرداخت به‌صورت کلی:

```text
User
  │
  ▼
Select Subscription
  │
  ▼
Create Order
  │
  ▼
Create Payment
  │
  ▼
Bale Invoice
  │
  ▼
Pre-Checkout Verification
  │
  ▼
Successful Payment
  │
  ▼
Activate Subscription
  │
  ▼
Generate Invoice
```

فعال‌شدن اشتراک تنها پس از دریافت و پردازش موفق پرداخت انجام می‌شود.

همچنین عملیات پرداخت به‌صورت **Idempotent** طراحی شده تا پردازش مجدد یک پرداخت باعث فعال‌سازی یا ثبت اشتراک تکراری نشود.

---

## 🛍️ Products & Digital Content

سیستم فروش و مدیریت محصولات دیجیتال شامل:

- محصولات
- دسته‌بندی‌ها
- فایل‌های چندگانه
- نسخه‌بندی فایل‌ها
- محدودیت دسترسی
- دانلود محافظت‌شده
- کنترل دسترسی بر اساس پلن

است.

برای فایل‌های بزرگ نیز امکان:

- Streaming
- HTTP Range Requests

در نظر گرفته شده است.

---

## 🎫 Support & Notifications

### Ticket System

سیستم تیکت برای ارتباط کاربران با پشتیبانی شامل:

- ایجاد تیکت
- مدیریت وضعیت
- پاسخ‌دهی
- پیگیری درخواست‌ها

### Notifications

سیستم اعلان برای اطلاع‌رسانی رویدادهای مهم به کاربران و مدیران.

---

## 🔐 Security

امنیت یکی از بخش‌های اصلی طراحی پروژه بوده است.

برخی از مکانیزم‌های امنیتی پیاده‌سازی‌شده:

- Security Headers
- Content Security Policy (CSP)
- Rate Limiting
- Login Rate Limit
- Session TTL
- Request Body Size Limit
- Upload Size Limit
- Protected File Downloads
- Role-Based Access Control
- Subscription-Based Access Control
- Server-side validation
- کنترل وضعیت و تاریخ انقضای Subscription
- Audit Logging برای فعالیت مدیران

---

## 📊 Admin & Audit

پنل مدیریت شامل قابلیت‌هایی برای مدیریت و نظارت بر سیستم است.

### Admin Features

- مدیریت کاربران
- مدیریت نقش‌ها
- مدیریت محصولات
- مدیریت دسته‌بندی‌ها
- مدیریت اشتراک‌ها
- مدیریت سفارش‌ها
- مشاهده پرداخت‌ها
- مدیریت تیکت‌ها
- گزارش‌ها
- اعلان‌ها

### Audit Log

فعالیت‌های حساس مدیریتی در Audit Log ثبت می‌شوند تا امکان بررسی و پیگیری تغییرات مهم سیستم وجود داشته باشد.

---

## 🗄️ Database

پروژه از **PostgreSQL** به‌عنوان دیتابیس اصلی استفاده می‌کند.

مدل داده بخش‌هایی مانند:

```text
Users
Roles
Plans
Subscriptions
Products
Categories
Orders
Payments
Invoices
Tickets
Notifications
Audit Logs
Files
```

را پوشش می‌دهد.

---

## 🏗️ Architecture

ساختار پروژه بر اساس یک معماری Backend محور با Node.js طراحی شده است.

```text
                         ┌──────────────────┐
                         │      Client      │
                         │   Web Interface  │
                         └────────┬─────────┘
                                  │
                                  ▼
                         ┌──────────────────┐
                         │     Node.js      │
                         │     Server       │
                         └────────┬─────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
              ▼                   ▼                   ▼
        ┌───────────┐       ┌────────────┐      ┌────────────┐
        │ PostgreSQL│       │  Payment   │      │   Files    │
        │ Database  │       │   System   │      │  Storage   │
        └───────────┘       └─────┬──────┘      └────────────┘
                                  │
                                  ▼
                            ┌───────────┐
                            │   Bale    │
                            │  Payment  │
                            └───────────┘
```

---

## 🧰 Tech Stack

### Backend

- Node.js 22+
- JavaScript / ES Modules
- PostgreSQL
- REST API
- Session-based Authentication

### Frontend

- HTML5
- CSS3
- JavaScript
- Responsive UI
- RTL / Persian UI

### Infrastructure

- Linux
- Nginx
- systemd
- Docker
- Docker Compose
- HTTPS
- Git / GitHub

### Integrations

- Bale Bot API
- Bale Payment
- PostgreSQL

---

## 📁 Project Structure

```text
.
├── public/
│   ├── app.js
│   ├── index.html
│   ├── style.css
│   └── favicon.svg
│
├── server.mjs
├── payment-service.mjs
├── bale-bot.mjs
│
├── Dockerfile
├── docker-compose.yml
├── package.json
├── .env.example
│
├── DEPLOYMENT.md
├── PRODUCTION_CHECKLIST.md
└── README.md
```

---

## ⚙️ Local Development

### Requirements

- Node.js 22+
- PostgreSQL 17+

### Installation

```bash
npm install
```

Configure your environment variables:

```bash
cp .env.example .env
```

Then configure the database and application settings inside `.env`.

Start the application:

```bash
npm start
```

Application:

```text
http://localhost:3000
```

Health check:

```text
http://localhost:3000/health
```

---

## 🐳 Docker

Run the application using Docker Compose:

```bash
docker compose up -d --build
```

Before deploying, replace all placeholder credentials and secrets in the environment configuration.

---

## 🌐 Production Deployment

The application can be deployed behind Nginx with Node.js running as a system service.

A typical production architecture:

```text
Internet
   │
   ▼
 Nginx
   │
   ├── Static Assets
   │
   └── /api
        │
        ▼
   Node.js Application
        │
        ▼
   PostgreSQL
```

Production deployment should include:

- HTTPS
- Environment-based secrets
- Database backups
- Restore testing
- Reverse proxy
- Process supervision
- Health monitoring
- File storage strategy
- Security headers
- Rate limiting

See:

- `DEPLOYMENT.md`
- `PRODUCTION_CHECKLIST.md`

---

## 🔄 Payment Flow

The payment lifecycle is designed around server-side verification.

```text
1. User selects a plan
        ↓
2. Server creates order
        ↓
3. Payment record is created
        ↓
4. Bale invoice is generated
        ↓
5. User completes payment
        ↓
6. Pre-checkout request is validated
        ↓
7. SuccessfulPayment is received
        ↓
8. Payment is activated
        ↓
9. Subscription is created/updated
        ↓
10. Invoice is generated
        ↓
11. User receives confirmation
```

The server does not activate a subscription simply because the client reports a successful payment.

---

## 🧠 Production Considerations

The project was hardened for production scenarios with particular attention to:

- Payment idempotency
- Subscription expiration
- Access control
- Session expiration
- Request limits
- Upload limits
- Protected downloads
- Secure HTTP headers
- Auditability
- Database consistency
- Health monitoring
- Deployment configuration

---

## 📌 Project Status

**Production-oriented / Active Development**

The current version contains the core commercial infrastructure required for:

- User management
- Role-based access
- Subscription management
- Product sales
- Digital content delivery
- Payment processing
- Support
- Notifications
- Administration
- Production deployment

---

## 👨‍💻 Developer

Developed as a full-stack production-oriented project with focus on:

- Backend development
- REST API design
- PostgreSQL data modeling
- Authentication & authorization
- Payment integration
- Security
- Linux server deployment
- Nginx configuration
- Docker
- Production deployment

---

## ⚠️ Security Notice

Never commit real credentials, payment provider tokens, database passwords, or session secrets to Git.

Use environment variables:

```env
DATABASE_URL=...
SESSION_SECRET=...
BALE_BOT_TOKEN=...
BALE_PAYMENT_PROVIDER_TOKEN=...
```

Before public deployment, review:

```text
PRODUCTION_CHECKLIST.md
DEPLOYMENT.md
```

---

## 📄 License

This project is currently maintained as a private/commercial project.

All rights reserved.
