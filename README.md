# Arista Trinkets — Backend REST API

> A production-grade Node.js + Express + TypeScript REST API for the **Arista Trinkets** luxury jewellery e-commerce platform. Backed by MySQL 8+ and deployed to **Vercel**.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [API Reference](#api-reference)
  - [Health Check](#health-check)
  - [Authentication](#authentication)
  - [Products & Categories](#products--categories)
  - [Cart](#cart)
  - [Wishlist](#wishlist)
  - [Orders & Payments](#orders--payments)
  - [Enquiries](#enquiries)
  - [Admin Routes](#admin-routes)
- [Authentication & Roles](#authentication--roles)
- [Email Notifications](#email-notifications)
- [Deployment](#deployment)
- [Scripts](#scripts)

---

## Tech Stack

| Layer          | Technology                                     |
|----------------|------------------------------------------------|
| Runtime        | Node.js ≥ 24.0.0                               |
| Language       | TypeScript 5.4+                                |
| Framework      | Express 4.x                                    |
| Database       | MySQL 8+ (mysql2 with connection pooling)      |
| Auth           | JWT (jsonwebtoken) + bcrypt                    |
| Payments       | Razorpay SDK                                   |
| Email          | Nodemailer (Gmail / SMTP / Ethereal fallback)  |
| Security       | Helmet, CORS, express-rate-limit               |
| Validation     | express-validator                              |
| Logging        | Morgan (HTTP) + custom logger                  |
| Deployment     | Vercel (Serverless)                            |

---

## Project Structure

```
arista-server/
├── api/
│   └── index.ts              # Vercel serverless entry point
├── src/
│   ├── app.ts                # Express app configuration & middleware stack
│   ├── server.ts             # HTTP server bootstrap (local dev)
│   ├── config/
│   │   └── database.ts       # MySQL pool, table auto-creation & admin seeding
│   ├── controllers/
│   │   ├── admin.controller.ts      # Admin dashboard, products, categories, orders
│   │   ├── auth.controller.ts       # Register, login, getCurrentUser
│   │   ├── cart.controller.ts       # Guest + auth hybrid cart
│   │   ├── enquiry.controller.ts    # Contact / customer enquiry
│   │   ├── homepage.controller.ts   # Homepage config read/write
│   │   ├── order.controller.ts      # Order creation, Razorpay, payment verify
│   │   ├── product.controller.ts    # Product listing, detail by slug
│   │   └── wishlist.controller.ts   # Guest + auth wishlist
│   ├── db/
│   │   └── schema.sql        # Full MySQL schema (reference; runtime uses database.ts)
│   ├── middlewares/
│   │   ├── auth.middleware.ts       # JWT authentication & role-based access
│   │   ├── error.middleware.ts      # Global error handler
│   │   └── validate.middleware.ts   # express-validator result checker
│   ├── routes/
│   │   └── index.ts          # All route definitions
│   ├── services/
│   │   ├── emailService.ts          # Nodemailer enquiry notifications
│   │   └── razorpay.service.ts      # Razorpay order creation & signature verification
│   └── utils/
│       ├── api-response.ts          # Standard ApiResponse helper
│       └── logger.ts                # Timestamped console logger
├── .env                      # Local secrets (git-ignored)
├── .env.example              # Template for environment variables
├── .gitignore
├── package.json
├── tsconfig.json
└── vercel.json               # Vercel serverless config
```

---

## Getting Started

### Prerequisites

- Node.js **≥ 24.0.0**
- MySQL **8+** running locally or on a cloud host
- A [Razorpay](https://razorpay.com) account (test keys are fine for dev)

### Installation

```bash
# 1. Clone the repository
git clone <repo-url>
cd arista-server

# 2. Install dependencies
npm install

# 3. Copy env template and fill in your values
cp .env.example .env

# 4. Start the development server (auto-reloads on file changes)
npm run dev
```

The server starts on **http://localhost:5000** by default.
Health check: **GET http://localhost:5000/api/v1/health**

---

## Environment Variables

Copy `.env.example` to `.env` and configure each variable:

```dotenv
# Server
PORT=5000
NODE_ENV=development

# MySQL Database
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=arista_trinkets_db
DB_CONNECTION_LIMIT=10

# JWT / Security
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_SECRET=your_refresh_token_secret
REFRESH_TOKEN_EXPIRES_IN=7d

# CORS
CORS_ORIGIN=http://localhost:4200,http://localhost:4201

# Email (Nodemailer)
EMAIL_SERVICE=gmail
EMAIL_USER=your@gmail.com
EMAIL_PASSWORD=your_app_password
ADMIN_NOTIFICATION_EMAIL=admin@yourdomain.com
EMAIL_FROM="Arista Trinkets Concierge <your@gmail.com>"

# Razorpay
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxx

# Default Admin (seeded on first DB connection)
DEFAULT_ADMIN_EMAIL=admin@aristatrinkets.com
DEFAULT_ADMIN_PASSWORD=admin123
```

> **Note:** `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `EMAIL_*`, and `DEFAULT_ADMIN_*` variables are not in the committed `.env.example`. Add them to your local `.env`.

---

## Database Setup

Tables are **auto-created** on the first successful database connection via `ensureTablesExist()` in `src/config/database.ts`. You do not need to run the SQL schema manually.

`src/db/schema.sql` is provided as a reference for manual provisioning, migrations, or reviewing the full schema.

### Tables

| Table                     | Description                                          |
|---------------------------|------------------------------------------------------|
| `users`                   | Customers, admins & super-admins                     |
| `categories`              | Product categories with slug routing                 |
| `products`                | Jewellery product catalogue                          |
| `product_images`          | Additional product gallery images                    |
| `product_specifications`  | Key-value spec table (metal purity, weight, etc.)    |
| `cart_items`              | Hybrid guest (session_id) + auth (user_id) cart      |
| `wishlist_items`          | Hybrid guest + auth wishlist                         |
| `orders`                  | Customer orders with Razorpay IDs                    |
| `order_items`             | Line items for each order                            |
| `homepage_config`         | CMS-managed homepage section images                  |
| `enquiries`               | Customer contact/enquiry submissions                 |

### Default Admin Credentials

Seeded automatically on first startup:

| Field    | Value                          |
|----------|--------------------------------|
| Email    | `admin@aristatrinkets.com`     |
| Password | `admin123`                     |
| Role     | `SUPER_ADMIN`                  |

> **Change these credentials immediately in production** via the Admin Profile update endpoint.

---

## API Reference

All endpoints are prefixed with `/api/v1`.

**Rate Limit:** 500 requests per 15 minutes per IP on all `/api` routes.

**Standard Response:**
```json
{
  "success": true,
  "message": "Human-readable message",
  "data": { }
}
```

---

### Health Check

| Method | Endpoint  | Auth | Description         |
|--------|-----------|------|---------------------|
| GET    | `/health` | None | Server & API status |

**Response:**
```json
{
  "status": "UP",
  "service": "Arista Trinkets REST API",
  "timestamp": "2026-10-01T16:00:00.000Z"
}
```

---

### Authentication

| Method | Endpoint          | Auth         | Description                     |
|--------|-------------------|--------------|---------------------------------|
| POST   | `/auth/register`  | None         | Register new customer account   |
| POST   | `/auth/login`     | None         | Login and receive JWT token     |
| GET    | `/auth/me`        | Bearer Token | Get current authenticated user  |

#### POST `/auth/register`

```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "password": "securepassword",
  "phone": "9876543210"
}
```

**Response `201`:**
```json
{
  "success": true,
  "message": "Account created successfully.",
  "data": {
    "user": { "id": 1, "name": "Jane Doe", "email": "jane@example.com", "role": "CUSTOMER" },
    "token": "<JWT>"
  }
}
```

#### POST `/auth/login`

```json
{ "email": "admin@aristatrinkets.com", "password": "admin123" }
```

**Response `200`:**
```json
{
  "success": true,
  "message": "Sign in successful.",
  "data": {
    "user": { "id": 1, "name": "Arista Trinkets Administrator", "email": "admin@aristatrinkets.com", "role": "SUPER_ADMIN" },
    "token": "<JWT>"
  }
}
```

---

### Products & Categories

| Method | Endpoint           | Auth | Description                      |
|--------|--------------------|------|----------------------------------|
| GET    | `/products`        | None | List products (filterable)       |
| GET    | `/products/:slug`  | None | Get single product by slug       |
| GET    | `/categories`      | None | List all categories              |

#### GET `/products` — Query Parameters

| Parameter  | Type    | Description                         |
|------------|---------|-------------------------------------|
| `category` | string  | Filter by category slug             |
| `search`   | string  | Full-text name search               |
| `inStock`  | boolean | `true` for in-stock only            |
| `minPrice` | number  | Minimum price (INR)                 |
| `maxPrice` | number  | Maximum price (INR)                 |
| `sort`     | string  | `price_asc`, `price_desc`, `newest` |
| `limit`    | number  | Page size (default: 50)             |
| `offset`   | number  | Pagination offset (default: 0)      |

---

### Cart

Supports **hybrid guest/auth** mode. Guest carts use an `X-Session-ID` header; authenticated carts use the JWT Bearer token.

| Method | Endpoint                  | Auth     | Description                          |
|--------|---------------------------|----------|--------------------------------------|
| GET    | `/cart`                   | Optional | Get cart for session or user         |
| POST   | `/cart/items`             | Optional | Add item to cart                     |
| PATCH  | `/cart/items/:productId`  | Optional | Update item quantity                 |
| DELETE | `/cart/items/:productId`  | Optional | Remove specific item from cart       |
| DELETE | `/cart`                   | Optional | Clear entire cart                    |
| POST   | `/cart/merge`             | Required | Merge guest cart into auth cart      |

#### POST `/cart/items`

```json
{
  "productId": 5,
  "slug": "emerald-gold-ring",
  "quantity": 1,
  "metalType": "18K Warm Gold",
  "productData": { }
}
```

---

### Wishlist

| Method | Endpoint              | Auth     | Description              |
|--------|-----------------------|----------|--------------------------|
| GET    | `/wishlist`           | Optional | Get wishlist items       |
| POST   | `/wishlist/toggle`    | Optional | Add or remove product    |
| DELETE | `/wishlist/:idOrSlug` | Optional | Remove item from wishlist|
| DELETE | `/wishlist/clear`     | Optional | Clear entire wishlist    |

---

### Orders & Payments

| Method | Endpoint                   | Auth | Description                          |
|--------|----------------------------|------|--------------------------------------|
| POST   | `/orders`                  | None | Create a new order record            |
| GET    | `/orders/:orderNumber`     | None | Retrieve order by order number       |
| POST   | `/orders/razorpay-order`   | None | Initialise a Razorpay payment order  |
| POST   | `/orders/verify-payment`   | None | Verify Razorpay payment signature    |

#### POST `/orders`

```json
{
  "customerName": "Jane Doe",
  "customerEmail": "jane@example.com",
  "customerPhone": "9876543210",
  "shippingAddress": "42 MG Road",
  "city": "Mumbai",
  "state": "Maharashtra",
  "pincode": "400001",
  "items": [
    { "title": "Diamond Stud Earrings", "price": 25000, "quantity": 1, "metalType": "18K White Gold" }
  ],
  "totalAmount": 25000,
  "paymentMethod": "RAZORPAY"
}
```

Order numbers follow the pattern: `ART-XXXXXX`

#### POST `/orders/razorpay-order`

```json
{
  "amount": 25000,
  "receipt": "REC-1234",
  "notes": { "customerEmail": "jane@example.com" }
}
```

#### POST `/orders/verify-payment`

```json
{
  "razorpay_order_id": "order_xxxxx",
  "razorpay_payment_id": "pay_xxxxx",
  "razorpay_signature": "hexstring",
  "order_number": "ART-123456"
}
```

---

### Enquiries

| Method | Endpoint     | Auth | Description                   |
|--------|--------------|------|-------------------------------|
| POST   | `/enquiries` | None | Submit a customer enquiry     |
| POST   | `/contact`   | None | Alias for `/enquiries`        |

```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "phone": "9876543210",
  "subject": "Custom jewellery inquiry",
  "message": "I'd like to discuss a bespoke ring design..."
}
```

---

### Admin Routes

All admin routes require `Authorization: Bearer <admin_jwt_token>` with role `ADMIN` or `SUPER_ADMIN`.

#### Dashboard

| Method | Endpoint            | Description                                       |
|--------|---------------------|---------------------------------------------------|
| GET    | `/admin/verify`     | Verify active admin session                       |
| GET    | `/admin/dashboard`  | Summary: products, orders, revenue, low stock     |

#### Products

| Method | Endpoint                | Description          |
|--------|-------------------------|----------------------|
| POST   | `/admin/products`       | Create new product   |
| PUT    | `/admin/products/:id`   | Update product       |
| DELETE | `/admin/products/:id`   | Delete product       |

#### Categories

| Method | Endpoint                  | Description                                              |
|--------|---------------------------|----------------------------------------------------------|
| POST   | `/admin/categories`       | Create new category                                      |
| PUT    | `/admin/categories/:id`   | Update category                                          |
| DELETE | `/admin/categories/:id`   | Delete category (blocked if products are assigned)       |

#### Orders

| Method | Endpoint                      | Description                    |
|--------|-------------------------------|--------------------------------|
| PUT    | `/admin/orders/:id/status`    | Update order and payment status|

#### Admin Users

| Method | Endpoint                        | Description                            |
|--------|---------------------------------|----------------------------------------|
| GET    | `/admin/users`                  | List all admin & super-admin accounts  |
| POST   | `/admin/users`                  | Create a new admin account             |
| PUT    | `/admin/users/:id/password`     | Reset admin user password              |
| DELETE | `/admin/users/:id`              | Delete admin account                   |
| PUT    | `/admin/profile`                | Update own admin profile & password    |

#### Homepage Config

| Method | Endpoint                  | Description                         |
|--------|---------------------------|-------------------------------------|
| GET    | `/homepage-config`        | Get homepage section images (public)|
| PUT    | `/admin/homepage-config`  | Update homepage section images      |

#### Enquiries (Admin)

| Method | Endpoint             | Description           |
|--------|----------------------|-----------------------|
| GET    | `/admin/enquiries`   | List all enquiries    |

---

## Authentication & Roles

JWT tokens are signed with `JWT_SECRET` and expire per `JWT_EXPIRES_IN`.

| Role          | Permissions                                      |
|---------------|--------------------------------------------------|
| `CUSTOMER`    | Cart, Wishlist, Orders, Enquiries                |
| `ADMIN`       | All customer permissions + Admin panel           |
| `SUPER_ADMIN` | All admin permissions + user management          |

**Token flow:**
1. Client sends `POST /auth/login` — receives `{ token }`
2. Attach to all protected requests: `Authorization: Bearer <token>`
3. `authenticateJwt` middleware validates and attaches `req.user`
4. `requireRole(['ADMIN', 'SUPER_ADMIN'])` checks the decoded role

---

## Email Notifications

Powered by **Nodemailer**. Triggered on new customer enquiry submissions.

**Configuration priority:**
1. `EMAIL_USER` + `EMAIL_PASSWORD` set → uses Gmail (or `EMAIL_SERVICE`)
2. Custom SMTP → set `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`
3. No credentials → auto-creates an **Ethereal** test account (logs preview URL)

**Gmail:** Generate an [App Password](https://myaccount.google.com/apppasswords) and use it as `EMAIL_PASSWORD`.

---

## Deployment

### Vercel

1. Connect your GitHub repo to [Vercel](https://vercel.com)
2. Add all env variables in **Vercel Dashboard → Settings → Environment Variables**
3. Deploy — Vercel uses `api/index.ts` as the serverless entry point (`vercel.json`)

### Local Production Test

```bash
npm run build   # Compile TypeScript → dist/
npm start       # Run dist/server.js
```

---

## Scripts

| Script         | Description                                      |
|----------------|--------------------------------------------------|
| `npm run dev`  | Start dev server with hot-reload (ts-node-dev)   |
| `npm run build`| Compile TypeScript to `dist/`                    |
| `npm start`    | Run compiled production server                   |
| `npm run lint` | Run ESLint on all TypeScript source files        |

---

## Security Notes

- All admin routes protected by `authenticateJwt` + `requireRole` middleware
- Passwords hashed with **bcrypt** (cost factor 10–12)
- HTTP headers hardened with **Helmet**
- Rate limiting: **500 req / 15 min** per IP on all `/api` routes
- CORS broadly open for Vercel compatibility — tighten `CORS_ORIGIN` in production
- Razorpay payment signatures verified server-side with **HMAC-SHA256**

---

## License

Private — Arista Trinkets. All rights reserved.
