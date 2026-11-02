# Changelog

All notable changes to **Arista Trinkets Backend API** are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.2.0] — 2026-11-03

### Added
- **Complete Demo Seed SQL**: Added `src/db/complete_demo_seed.sql` containing full schema and production-grade seed data for all 16 tables, 4 categories, 10 luxury jewellery products with multi-gallery images, specifications, store settings, and default admin user.

### Changed
- **Serverless Database Pool Throttling**: Configured dynamic MySQL pool sizing in `src/config/database.ts` (`isServerless ? 2 : 10`), `maxIdle: 1`, `idleTimeout: 20000`, and added connection release guards in `ensureTablesExist()` to avoid exhausting connection quotas on cloud providers (Aiven MySQL, Vercel).
- **Dead Unsplash Image URL Replacement**: Sanitized fallback and seed image URLs, replacing dead Unsplash asset `photo-1611591475140-be38b794ff8d` with `/assets/images/occasion-festive.webp` to eliminate browser console 404 errors.

---

## [1.1.0] — 2026-10-06

### Added
- **Order Cancellation Endpoint**: `POST /api/v1/orders/:idOrOrderNumber/cancel` for self-service customer order cancellation with reason logging and automatic MySQL inventory restoration for `PENDING` and `PROCESSING` orders.
- **Newsletter Subscription Persistence**: `newsletter_subscribers` MySQL table and `POST /api/v1/newsletter` API with lowercased email normalization, duplicate handling, reactivation support, and dedicated rate limiting (`newsletterLimiter`).
- **Dynamic Store Settings API**: Public `GET /api/v1/settings` and Admin `PUT /api/v1/admin/settings` endpoints for managing GST percentage, delivery fees, free delivery threshold, company address, support phone, concierge email, and atelier operating hours.
- **Atomic Stock Checks**: Pre-check stock validation before order insertion to prevent orphaned order records.
- **Email Service Enhancements**: Admin notification templates for new enquiries, order placements, and customer password resets.

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
