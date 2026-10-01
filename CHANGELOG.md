# Changelog

All notable changes to **Arista Trinkets Backend API** are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Planned
- Refresh token endpoint (`POST /auth/refresh`)
- Order cancellation endpoint
- Customer order history endpoint (`GET /orders?userId=...`)
- Product review / rating system
- Inventory low-stock alert email notifications
- Pagination metadata in product list response

---

## [1.0.0] — 2026-10-01

### Added
- **Project scaffold**: Express 4 + TypeScript 5 + MySQL 8 architecture
- **Auto table creation**: `ensureTablesExist()` on startup — zero-manual-migration setup
- **Default admin seeding**: `SUPER_ADMIN` account created on first DB connection
- **Authentication**: JWT-based login/register with bcrypt password hashing
- **Role-based access control**: `CUSTOMER`, `ADMIN`, `SUPER_ADMIN` roles
- **Product catalogue**: List, filter, sort, and retrieve by slug
- **Admin product management**: Create, update, delete products with multi-image and specifications support
- **Category management**: Create, update, delete categories (with safety guard against deleting categories with assigned products)
- **Hybrid cart**: Guest (`session_id`) + authenticated (`user_id`) cart with merge-on-login
- **Hybrid wishlist**: Guest + authenticated wishlist with toggle support
- **Order management**: Order creation, Razorpay payment order init, HMAC-SHA256 payment signature verification
- **Admin order status management**: Update order and payment status
- **Customer enquiries**: Enquiry submission with HTML email notification via Nodemailer
- **Homepage config CMS**: Admin-managed section images for homepage editorial area
- **Admin user management**: Create, list, update password, delete admin accounts
- **Admin profile update**: Update own name, email, and password with fresh JWT issuance
- **Email service**: Nodemailer with Gmail, custom SMTP, and Ethereal auto-test-account fallback
- **Security**: Helmet headers, CORS, rate limiting (500 req / 15 min), bcrypt
- **Vercel deployment**: Serverless configuration via `vercel.json` and `api/index.ts`
- **Logging**: Morgan HTTP logger + timestamped custom logger utility
- **Health check**: `GET /api/v1/health`
