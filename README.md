# ServiSync — Field Service Management System

**ServiSync** is a centralized, production-grade field service management backend API built with **Node.js, TypeScript, Express, PostgreSQL, and Prisma 7**. It digitizes the end-to-end service lifecycle from customer request through manager review, technician assignment, field work execution, service report logging, invoicing, Stripe payment processing, and customer feedback.

- **Project**: ServiSync
- **Type**: Enterprise Field Service Management System
- **Backend Stack**: Node.js (>=20.19) + TypeScript (strict mode) + Express.js + PostgreSQL + Prisma 7 (`@prisma/client` & `@prisma/adapter-pg`) + Zod + JWT + bcrypt + Redis + Cloudinary + Stripe

---

## 1. End-to-End Service Lifecycle

```
[Customer] Service Request (PENDING)
       │
       ▼
[Manager] Review & Approve (APPROVED / UNDER_REVIEW)
       │
       ▼
[Manager] Assign Technician with Skill Verification (ASSIGNED)
       │
       ▼
[Technician] Accept Assignment (SCHEDULED) -> Auto-creates WorkOrder
       │
       ▼
[Technician] Start Work (IN_PROGRESS)
       │
       ▼
[Technician] Submit Service Report (Diagnosis, Actions, Parts, Labor)
       │
       ▼
[Technician] Complete Job (COMPLETED)
       │
       ▼
[Manager/Admin] Generate Invoice (INVOICED)
       │
       ▼
[Customer] Stripe Checkout & Verification (PAID)
       │
       ▼
[Customer] Submit Feedback & Rating (CLOSED)
```

---

## 2. Key Features

### Authentication & Security
- Email and password registration & login with secure bcrypt password hashing (12 rounds)
- JWT access tokens (short-lived, 15m) + refresh tokens stored hashed in the database with rotation & revocation
- Google OAuth social login with active status verification
- Strict DB user-role resolution on every request
- Fine-grained object-level ownership checks (e.g. customers can only access their own requests, invoices, and work orders)
- Helmet security headers, CORS origin whitelisting, and multi-tier rate limiting (Auth, General API, Upload, Payment)

### Service Management & Scheduling
- Hierarchical service categories and service types with baseline pricing and required skill tags
- Strict technician assignment validation: verifies that the assigned technician possesses all required skills for the service type
- Double-booking prevention: blocks overlapping technician schedules
- Real-time notification triggers across 11 core system events

### Field Work & Service Reports
- Work orders auto-generated upon technician assignment acceptance
- Accurate work status transitions (`SCHEDULED` → `IN_PROGRESS` → `COMPLETED`)
- Comprehensive service reports logging diagnosis, repair actions taken, replaced parts, labor hours, labor costs, and material costs
- Polymorphic file attachments (Multer + Cloudinary) linked to Service Requests, Work Orders, and Service Reports

### Invoicing & Stripe Payments
- Exact Decimal financial calculations for labor, materials, discounts, taxes, and totals
- Invoices require completed work orders and service reports before generation
- Real Stripe Checkout Session creation with verified session webhooks and callbacks
- Idempotent payment verification automatically advances invoice to `PAID` and request to `PAID`

### Administration & Observability
- Admin user management: activate/deactivate users, change roles, revoke active sessions
- Real-time operational analytics and KPI stats
- Comprehensive audit logging across all critical operations
- Structured error handling with standard error responses without stack trace leaks in production

---

## 3. Tech Stack & Architecture

| Layer | Technology |
|-------|------------|
| Runtime | Node.js (>=20.19.0) |
| Language | TypeScript (Strict Mode) |
| Framework | Express.js 5 |
| Database | PostgreSQL |
| ORM | **Prisma 7** (`@prisma/client` + `@prisma/adapter-pg`) |
| Schema Validation | Zod |
| Authentication | JWT + bcrypt + Google OAuth |
| File Storage | Cloudinary via Multer |
| Payment Gateway | Stripe SDK |
| In-Memory Cache | Redis (`ioredis`) |
| Security | Helmet, CORS, express-rate-limit |
| Documentation | Postman 2.1 Collection |

### Folder Structure
```
src/
├── app.ts                      # Express app initialization, middlewares, route mounts
├── server.ts                   # HTTP server entry point
├── config/
│   ├── env.ts                  # Zod environment variable validation
│   ├── cors.ts                 # CORS origin whitelist configuration
│   └── googleAuth.ts           # Google OAuth client
├── lib/
│   ├── prisma.ts               # Prisma 7 client instance with pg adapter
│   ├── redis.ts                # Redis client and caching utilities
│   └── cloudinary.ts           # Cloudinary SDK client
├── middlewares/
│   ├── authenticate.ts         # JWT authentication & fresh DB role resolution
│   ├── optionalAuthenticate.ts # Optional auth middleware
│   ├── validateRequest.ts      # Zod request body/query/params validator
│   ├── errorHandler.ts         # Global error handler (Prisma, Zod, Stripe, JWT)
│   ├── notFound.ts             # 404 Route Not Found handler
│   ├── rateLimiter.ts          # Auth, General API, Upload, and Payment rate limiters
│   └── upload.ts               # Multer memory storage file upload middleware
├── modules/
│   ├── auth/                   # Registration, login, Google OAuth, refresh token, logout
│   ├── users/                  # User profile and password management
│   ├── serviceCategories/      # Category and Service Type management
│   ├── serviceRequests/        # Service requests, manager review, cancellation
│   ├── technicians/            # Technician profiles, skill management, availability
│   ├── assignments/            # Technician assignment, acceptance/rejection, scheduling
│   ├── workOrders/             # Work order lifecycle & Service Report CRUD
│   ├── attachments/            # Polymorphic file upload & retrieval (Cloudinary)
│   ├── invoices/               # Decimal invoice calculation & generation
│   ├── payments/               # Stripe checkout, callbacks, and webhooks
│   ├── feedback/               # Customer ratings & reviews
│   ├── notifications/          # Real-time user notifications
│   └── admin/                  # Admin user management, system metrics, audit logs
└── utils/
    ├── ApiError.ts             # Custom ApiError class
    ├── asyncHandler.ts         # Async handler wrapper
    ├── jwt.ts                  # JWT signing and verification helpers
    ├── pagination.ts           # Pagination parameter normalization
    ├── response.ts             # Standardized API response helpers
    ├── auditLog.ts             # Transactional audit logging helper
    └── notification.ts         # Transactional notification helper
```

---

## 4. API Reference

Base URL: `/api/v1`

### 4.1 Health Check
- `GET /api/v1/health` — System health and uptime check

### 4.2 Authentication
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/api/v1/auth/register` | Public | Register Customer or Technician |
| POST | `/api/v1/auth/login` | Public | Login with email and password |
| POST | `/api/v1/auth/google` | Public | Google OAuth login |
| POST | `/api/v1/auth/refresh-token` | Public | Issue new access token using refresh token |
| POST | `/api/v1/auth/logout` | Authenticated | Revoke refresh token and log out |

### 4.3 Users & Profiles
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/api/v1/users/profile` | Authenticated | Get current authenticated user profile |
| PATCH | `/api/v1/users/profile` | Authenticated | Update current profile (Customer/Technician profile fields) |
| PATCH | `/api/v1/users/change-password` | Authenticated | Change user password |

### 4.4 Service Categories & Types
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/api/v1/service-categories` | Public / Any | List all categories with service types |
| GET | `/api/v1/service-categories/:id` | Public / Any | Get service category details |
| POST | `/api/v1/service-categories` | ADMIN, MANAGER | Create new category with service types |
| PATCH | `/api/v1/service-categories/:id` | ADMIN, MANAGER | Update service category |
| DELETE | `/api/v1/service-categories/:id` | ADMIN, MANAGER | Soft delete service category |

### 4.5 Technicians
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/api/v1/technicians` | Authenticated | List/search technicians (filter by skill/availability) |
| GET | `/api/v1/technicians/:id` | Authenticated | Get technician profile details |
| PATCH | `/api/v1/technicians/:id` | TECHNICIAN (Own), ADMIN | Update technician profile details and skills |

### 4.6 Service Requests
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/api/v1/service-requests` | CUSTOMER | Create new service request |
| GET | `/api/v1/service-requests` | Authenticated | List service requests (Customer: own only; Manager/Admin: all) |
| GET | `/api/v1/service-requests/:id` | Authenticated | Get service request details (with ownership check) |
| PATCH | `/api/v1/service-requests/:id/cancel` | CUSTOMER | Cancel pending service request |
| POST | `/api/v1/service-requests/:id/review` | MANAGER, ADMIN | Approve or reject service request |

### 4.7 Assignments & Scheduling
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/api/v1/service-requests/:id/assign` | MANAGER, ADMIN | Assign technician (validates skills & schedules) |
| GET | `/api/v1/assignments` | Authenticated | List assignments (Technician: own only) |
| PATCH | `/api/v1/assignments/:id/accept` | TECHNICIAN | Accept assignment (auto-generates WorkOrder) |
| PATCH | `/api/v1/assignments/:id/reject` | TECHNICIAN | Reject assignment |

### 4.8 Work Orders & Service Reports
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/api/v1/work-orders` | Authenticated | List work orders (filtered by role ownership) |
| GET | `/api/v1/work-orders/:id` | Authenticated | Get work order details |
| PATCH | `/api/v1/work-orders/:id/status` | TECHNICIAN, MANAGER | Update status (`IN_PROGRESS`, `COMPLETED`) |
| POST | `/api/v1/work-orders/:id/report` | TECHNICIAN | Submit service report |
| GET | `/api/v1/work-orders/:id/report` | Authenticated | View service report |
| PATCH | `/api/v1/work-orders/:id/report` | TECHNICIAN, MANAGER | Update service report |

### 4.9 Polymorphic Attachments
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/api/v1/attachments/upload` | Authenticated | Upload file to Cloudinary & link to entity |
| GET | `/api/v1/attachments` | Authenticated | Get attachments by `entityType` and `entityId` |
| DELETE | `/api/v1/attachments/:id` | Authenticated | Delete attachment |

### 4.10 Invoices & Billing
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/api/v1/invoices` | MANAGER, ADMIN | Generate invoice for completed work order |
| GET | `/api/v1/invoices` | Authenticated | List invoices (Customer: own only) |
| GET | `/api/v1/invoices/:id` | Authenticated | Get invoice details |

### 4.11 Payments (Stripe Integration)
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/api/v1/payments/initiate` | CUSTOMER | Create Stripe checkout session for invoice |
| POST | `/api/v1/payments/success` | Public | Stripe success callback verification |
| POST | `/api/v1/payments/cancel` | Public | Stripe cancel callback |
| POST | `/api/v1/payments/fail` | Public | Stripe failure callback |
| POST | `/api/v1/payments/webhook` | Public | Stripe raw webhook verification (IPN) |
| GET | `/api/v1/payments/:id` | Authenticated | Get payment record details |

### 4.12 Feedback & Ratings
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/api/v1/feedback` | CUSTOMER | Submit rating (1-5) and feedback for work order |
| GET | `/api/v1/feedback` | Authenticated | List feedback entries |

### 4.13 Notifications
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/api/v1/notifications` | Authenticated | List notifications for authenticated user |
| PATCH | `/api/v1/notifications/:id/read` | Authenticated | Mark specific notification as read |
| PATCH | `/api/v1/notifications/read-all` | Authenticated | Mark all user notifications as read |

### 4.14 Admin & Analytics
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/api/v1/admin/users` | ADMIN | List and search all users |
| PATCH | `/api/v1/admin/users/:id/status` | ADMIN | Activate or deactivate user |
| PATCH | `/api/v1/admin/users/:id/role` | ADMIN | Change user role |
| GET | `/api/v1/admin/stats` | ADMIN, MANAGER | Get system metrics & operational statistics |
| GET | `/api/v1/admin/audit-logs` | ADMIN | View system audit trail logs |

---

## 5. Standard API Response Formats

### Success Response
```json
{
  "success": true,
  "message": "Service request created successfully",
  "data": {
    "id": "cm123abc...",
    "title": "AC Compressor Repair",
    "status": "PENDING"
  }
}
```

### Paginated List Response
```json
{
  "success": true,
  "message": "Service requests retrieved successfully",
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 42,
    "totalPages": 5
  },
  "data": [ ... ]
}
```

### Error Response
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "path": "preferredDateTime",
      "message": "Preferred date must be in the future"
    }
  ]
}
```

---

## 6. Role-Based Access Control Matrix

| Feature | CUSTOMER | TECHNICIAN | MANAGER | ADMIN |
|---|:---:|:---:|:---:|:---:|
| Register / Login | ✓ | ✓ | ✓ | ✓ |
| Google OAuth Login | ✓ | ✓ | ✗ | ✗ |
| Update Profile & Password | ✓ | ✓ | ✓ | ✓ |
| Create Service Request | ✓ | ✗ | ✗ | ✗ |
| View Own Requests | ✓ | ✗ | ✗ | ✗ |
| Review & Approve Requests | ✗ | ✗ | ✓ | ✓ |
| Assign Technicians | ✗ | ✗ | ✓ | ✓ |
| Accept / Reject Assignment | ✗ | ✓ | ✗ | ✗ |
| Update Work Order Status | ✗ | ✓ | ✓ | ✗ |
| Submit Service Report | ✗ | ✓ | ✗ | ✗ |
| Upload Attachments | ✓ | ✓ | ✓ | ✓ |
| Generate Invoices | ✗ | ✗ | ✓ | ✓ |
| Pay Invoices (Stripe) | ✓ | ✗ | ✗ | ✗ |
| Submit Feedback | ✓ | ✗ | ✗ | ✗ |
| View System Stats | ✗ | ✗ | ✓ | ✓ |
| Manage Users & Roles | ✗ | ✗ | ✗ | ✓ |
| View Audit Logs | ✗ | ✗ | ✗ | ✓ |

---

## 7. Prisma 7 Setup & Notes

> **Important**: This project uses **Prisma 7** exclusively with `@prisma/adapter-pg` and ESM modules (`"type": "module"` in `package.json`).

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}
```

- Prisma Client is imported directly from `@prisma/client` across the application.
- Connection is initialized using `pg.Pool` and `PrismaPg` adapter in `src/lib/prisma.ts`.

### Common Prisma Commands:
```bash
# Validate schema
npx prisma validate

# Generate Prisma 7 Client
npm run prisma:generate

# Run development migrations
npm run prisma:migrate

# Seed database with initial users, categories, and service types
npm run prisma:seed

# Launch Prisma Studio
npm run prisma:studio
```

---

## 8. Local Setup & Execution Guide

### Prerequisites
- Node.js >= 20.19.0
- Docker & Docker Compose (or local PostgreSQL and Redis instances)

### Setup Steps
1. **Clone repository & install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment variables**:
   Create a `.env` file in the root directory:
   ```env
   NODE_ENV=development
   PORT=5000
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/servisync_dev?schema=public"
   REDIS_URL="redis://localhost:6379"

   ACCESS_TOKEN_SECRET="servisync_dev_access_token_secret_min_32_characters!"
   REFRESH_TOKEN_SECRET="servisync_dev_refresh_token_secret_min_32_characters!"
   ACCESS_TOKEN_EXPIRY="15m"
   REFRESH_TOKEN_EXPIRY="7d"

   GOOGLE_CLIENT_ID="your_google_client_id"
   GOOGLE_CLIENT_SECRET="your_google_client_secret"
   GOOGLE_CALLBACK_URL="http://localhost:5000/api/v1/auth/google/callback"

   CLOUDINARY_CLOUD_NAME="your_cloudinary_cloud_name"
   CLOUDINARY_API_KEY="your_cloudinary_api_key"
   CLOUDINARY_API_SECRET="your_cloudinary_api_secret"

   PAYMENT_PROVIDER="stripe"
   STRIPE_SECRET_KEY="sk_test_your_stripe_secret_key"
   STRIPE_PUBLISHABLE_KEY="pk_test_your_stripe_publishable_key"
   STRIPE_WEBHOOK_SECRET="whsec_your_stripe_webhook_secret"

   FRONTEND_URL="http://localhost:3000"
   ALLOWED_ORIGINS="http://localhost:3000,http://localhost:5000"
   ```

3. **Start local database (Docker)**:
   ```bash
   docker compose up -d
   ```

4. **Generate Prisma Client & Seed Data**:
   ```bash
   npx prisma generate
   npm run prisma:seed
   ```

5. **Start Development Server**:
   ```bash
   npm run dev
   ```

6. **Run Tests**:
   ```bash
   npm test
   ```

7. **Compile & Type Check**:
   ```bash
   npm run build
   ```

---

## 9. Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| **Admin** | `admin@servisync.com` | `AdminPass123!` |
| **Manager** | `manager@servisync.com` | `ManagerPass123!` |
| **Technician** | `technician@servisync.com` | `TechPass123!` |
| **Customer** | `customer@servisync.com` | `SecurePass123!` |

---

## 10. License
MIT License. Developed for ServiSync Field Service Management.
