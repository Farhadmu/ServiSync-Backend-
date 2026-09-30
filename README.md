# ServiSync — Field Service Management System

**ServiSync** is a centralized field service management backend API that digitizes the complete service lifecycle. Customers request services, managers review and assign technicians, technicians perform field work and submit reports, and administrators manage users, payments, and analytics.

- **Project**: ServiSync
- **Type**: Business / Operations — Field Service Management System
- **Backend**: Node.js + TypeScript + Express + PostgreSQL + Prisma + Zod + JWT + bcrypt + Redis + Cloudinary + Stripe

---

## Features

### Authentication & Authorization
- Email/password registration and login
- JWT access token + refresh token
- Google Social Login (GCP OAuth)
- Secure password hashing (bcrypt)
- Strict role-based access control (CUSTOMER, TECHNICIAN, MANAGER, ADMIN)

### Customer Features
- Create service requests with category, description, location, preferred date/time
- Upload request images (Multer + Cloudinary)
- View own service requests with search, filter, sort, pagination
- Cancel eligible requests
- View assigned technician and schedule
- View work orders and service reports
- View and pay invoices via real Stripe payment gateway
- Submit feedback after service completion
- Receive notifications

### Technician Features
- View and update own profile
- Manage skills and expertise
- Set availability status
- View assigned jobs and schedule
- Accept/reject assignments
- Mark arrival, start work, complete job
- Add work notes, materials, upload before/after images
- Submit service reports
- View work history

### Manager Features
- Review and approve/reject service requests
- View and search technicians by skill and availability
- Assign technicians with schedule conflict detection
- Reschedule assignments
- Monitor active jobs and work orders
- Generate invoices
- View operational analytics

### Admin Features
- View and manage all users (activate/deactivate, change roles)
- Manage service categories
- View all invoices and payments
- View dashboard statistics
- Optional Redis infrastructure and cache helpers (feature-specific caching is not enabled by default)
- Zod validation on all inputs
- Helmet, CORS, rate limiting
- API versioning (`/api/v1/`)
- Health check endpoint

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js |
| Language | TypeScript (strict mode) |
| Framework | Express.js |
| Database | PostgreSQL |
| ORM | Prisma |
| Validation | Zod |
| Auth | JWT + bcrypt + Google OAuth |
| Cache | Redis (ioredis) |
| File Upload | Multer + Cloudinary |
| Payment | Stripe |
| Security | Helmet, CORS, express-rate-limit |
| Docs | Postman Collection |

---

## Architecture

```
src/
├── app.ts                      # Express app, middleware, routes
├── server.ts                   # HTTP server
├── config/
│   ├── env.ts                  # Zod env validation
│   ├── cors.ts                 # CORS config
│   └── googleAuth.ts           # Google OAuth
├── lib/
│   ├── prisma.ts               # PrismaClient singleton
│   ├── redis.ts                # Redis client + cache helpers
│   └── cloudinary.ts           # Cloudinary upload helper
├── middlewares/
│   ├── authenticate.ts         # JWT Bearer auth
│   ├── authorize.ts            # Role-based authorization
│   ├── validateRequest.ts      # Zod validation
│   ├── errorHandler.ts         # Global error handler
│   ├── notFound.ts             # 404 handler
│   ├── rateLimiter.ts          # Rate limiting
│   └── upload.ts               # Multer + Cloudinary
├── modules/
4. Run `npm install && npm run build && npm start`
5. Ensure `DATABASE_URL` points to the production database
6. After a reviewed migration baseline exists, run `npx prisma migrate deploy` during deployment
│   ├── auth/                   # Registration, login, Google, refresh, logout
│   ├── users/                  # Profile, password change
│   ├── serviceCategories/      # CRUD for categories
│   ├── serviceRequests/        # Customer requests, review, cancel
│   ├── technicians/            # Technician profiles, skills, availability, jobs
│   ├── assignments/            # Assign, accept/reject, reschedule
│   ├── workOrders/             # Work order status transitions
│   ├── invoices/               # Invoice generation, listing
│   ├── payments/               # Stripe initiate, success, fail, cancel, webhook
│   ├── feedback/               # Submit and view feedback
│   ├── notifications/          # List, mark as read
│   └── admin/                  # User management, dashboard stats, audit logs
├── utils/
│   ├── ApiError.ts             # Custom error class
│   ├── asyncHandler.ts         # Express async wrapper
│   ├── jwt.ts                  # JWT generate/verify
│   ├── pagination.ts           # Pagination helpers
│   ├── response.ts             # Standard response helpers
│   └── auditLog.ts             # Audit logging utilities
├── types/
│   └── index.ts                # TypeScript type exports
└── constants/
    └── index.ts                # Status transitions, enums
```

### Module Pattern
Each module follows:
```
module/
├── module.route.ts      # Express routes
├── module.controller.ts # Thin HTTP handlers
├── module.service.ts    # (inline in controller for simplicity)
├── module.validation.ts # Zod schemas
└── module.type.ts       # TypeScript types
```

---

## Database Design Summary

### Key Entities

| Model | Purpose |
|-------|---------|
| User | Core user account (email, password, role, isActive) |
| CustomerProfile | Customer-specific fields (phone, address) |
| TechnicianProfile | Technician-specific fields (bio, experience, availability) |
| Skill | Skill catalog (ELECTRICAL, HVAC, PLUMBING, etc.) |
| TechnicianSkill | Junction: technician ↔ skill |
| ServiceCategory | Top-level service categories |
| ServiceType | Specific services under a category |
| ServiceTypeRequiredSkill | Required skills for a service type |
| ServiceRequest | Customer's service request |
| Assignment | Manager assigns technician to request |
| WorkOrder | On-site execution tracker |
| ServiceReport | Technician's service report |
| Attachment | Polymorphic file attachments (entityType + entityId) |
| Invoice | Generated invoice for a work order |
| InvoiceItem | Line items on an invoice |
| Payment | Stripe payment record |
| Feedback | Customer rating and comment |
| Notification | User notifications |
| AuditLog | System audit trail |
| RefreshToken | JWT refresh token persistence |

### Status Ownership

| Model | Owned Statuses |
|-------|---------------|
| ServiceRequest | PENDING → UNDER_REVIEW → APPROVED / REJECTED / CANCELLED → CLOSED |
| Assignment | PENDING → SCHEDULED → ACCEPTED / REJECTED / CANCELLED |
| WorkOrder | SCHEDULED → ARRIVED → IN_PROGRESS → COMPLETED / CANCELLED |
| Invoice | DRAFT → PENDING → PAID / PARTIALLY_PAID / VOID |
| Payment | PENDING → PROCESSING → SUCCESS / FAILED / CANCELLED / REFUNDED |

### Polymorphic Attachments
`Attachment` uses `entityType` (enum) + `entityId` (String) scalars because Prisma doesn't support polymorphic relations natively. The service layer queries attachments by `WHERE entityType = ? AND entityId = ?`.

---

## API Reference

Base URL: `/api/v1`

### Health
- `GET /api/v1/health`

### Authentication
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST | `/api/v1/auth/register` | Public | Register customer/technician |
| POST | `/api/v1/auth/login` | Public | Login with email/password |
| POST | `/api/v1/auth/google` | Public | Google OAuth login |
| POST | `/api/v1/auth/refresh-token` | Public | Refresh access token |
| POST | `/api/v1/auth/logout` | Authenticated | Logout (invalidate refresh token) |

### Users
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/users/me` | Any | Get own profile |
| PATCH | `/api/v1/users/me` | Any | Update own profile |
| PATCH | `/api/v1/users/me/password` | Any | Change password |

### Service Categories
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST | `/api/v1/service-categories` | ADMIN, MANAGER | Create category |
| GET | `/api/v1/service-categories` | Any | List categories |
| GET | `/api/v1/service-categories/:id` | Any | Get category |
| PATCH | `/api/v1/service-categories/:id` | ADMIN, MANAGER | Update category |
| DELETE | `/api/v1/service-categories/:id` | ADMIN, MANAGER | Soft delete category |

### Service Requests
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST | `/api/v1/service-requests` | CUSTOMER | Create request |
| GET | `/api/v1/service-requests` | Any | List requests (customer: own only) |
| GET | `/api/v1/service-requests/:id` | Any | Get request |
| PATCH | `/api/v1/service-requests/:id` | CUSTOMER | Update request |
| DELETE | `/api/v1/service-requests/:id` | CUSTOMER | Soft delete request |
| POST | `/api/v1/service-requests/:id/review` | MANAGER, ADMIN | Approve/reject |
| POST | `/api/v1/service-requests/:id/cancel` | CUSTOMER | Cancel request |
| POST | `/api/v1/service-requests/:id/attachments` | CUSTOMER | Upload an image or PDF attachment |

### Technicians
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/technicians` | Any | Search/list technicians |
| GET | `/api/v1/technicians/:id` | Any | Get technician profile |
| PATCH | `/api/v1/technicians/me/profile` | TECHNICIAN | Update own profile |
| PATCH | `/api/v1/technicians/me/availability` | TECHNICIAN | Set availability |
| PATCH | `/api/v1/technicians/me/skills` | TECHNICIAN | Update skills |
| GET | `/api/v1/technicians/me/jobs` | TECHNICIAN | Get assigned jobs |
| GET | `/api/v1/technicians/me/schedule` | TECHNICIAN | Get schedule |

### Assignments
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST | `/api/v1/assignments` | MANAGER, ADMIN | Assign technician |
| PATCH | `/api/v1/assignments/:id/respond` | TECHNICIAN | Accept/reject |
| PATCH | `/api/v1/assignments/:id/reschedule` | MANAGER, ADMIN | Reschedule |

### Work Orders
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/work-orders` | Any | List work orders |
| GET | `/api/v1/work-orders/:id` | Any | Get work order |
| PATCH | `/api/v1/work-orders/:id/status` | TECHNICIAN, MANAGER | Update status |

### Service Reports
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/service-reports/work-orders/:workOrderId` | Owner, MANAGER, ADMIN | Get service report |
| PUT | `/api/v1/service-reports/work-orders/:workOrderId` | TECHNICIAN | Submit or update a report |

### Invoices
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST | `/api/v1/work-orders/:id/invoice` | MANAGER, ADMIN | Generate invoice |
| GET | `/api/v1/invoices` | Any | List invoices |
| GET | `/api/v1/invoices/:id` | Any | Get invoice |

### Payments (Stripe)
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST | `/api/v1/payments/initiate` | CUSTOMER | Start Stripe checkout |
| POST | `/api/v1/payments/success` | Public | Stripe success callback |
| POST | `/api/v1/payments/fail` | Public | Stripe fail callback |
| POST | `/api/v1/payments/cancel` | Public | Stripe cancel callback |
| POST | `/api/v1/payments/webhook` | Public | Stripe webhook (IPN) |
| GET | `/api/v1/payments/:id` | Any | Get payment details |

### Feedback
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST | `/api/v1/work-orders/:id/feedback` | CUSTOMER | Submit feedback |
| GET | `/api/v1/work-orders/:id/feedback` | Any | Get feedback |

### Notifications
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/notifications` | Any | List notifications |
| PATCH | `/api/v1/notifications/:id/read` | Any | Mark as read |

### Admin
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/admin/users` | ADMIN | List all users |
| PATCH | `/api/v1/admin/users/:id/status` | ADMIN | Activate/deactivate |
| PATCH | `/api/v1/admin/users/:id/role` | ADMIN | Change role |
| GET | `/api/v1/admin/dashboard-stats` | ADMIN, MANAGER | Dashboard statistics |
| GET | `/api/v1/admin/audit-logs` | ADMIN | Audit logs |

---

## Standard Response Format

**Success**:
```json
{
  "success": true,
  "message": "Operation successful",
  "data": {}
}
```

**List with pagination**:
```json
{
  "success": true,
  "message": "Data fetched",
  "meta": { "page": 1, "limit": 10, "total": 100, "totalPages": 10 },
  "data": []
}
```

**Error**:
```json
{
  "success": false,
  "message": "Something went wrong",
  "errors": []
}
```

---

## Environment Variables

```env
NODE_ENV=development
PORT=5000
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public"
REDIS_URL="redis://HOST:PORT"

ACCESS_TOKEN_SECRET=change_me_min_32_chars
REFRESH_TOKEN_SECRET=change_me_min_32_chars
ACCESS_TOKEN_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:5000/api/v1/auth/google/callback

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

PAYMENT_PROVIDER=stripe
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=

FRONTEND_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5000
```

---

## Installation

```bash
# Clone repository
cd servisync

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
# Edit .env with your database and service credentials

# Start PostgreSQL and Redis (Docker)
docker compose up -d postgres redis

# Generate Prisma client
npm run prisma:generate

# Development only: create a migration after reviewing the generated SQL
npm run prisma:migrate

# Seed database with demo data
npm run prisma:seed

# Start development server
npm run dev
```

---

## Run Commands

```bash
npm run dev          # Start with nodemon + ts-node
npm run build        # Compile TypeScript to dist/
npm start            # Run compiled server
npm run prisma:generate  # Generate Prisma client
npm run prisma:migrate   # Run migrations
npm run prisma:studio    # Open Prisma Studio
npm run prisma:seed      # Seed demo data
```

---

## Prisma Commands

```bash
npx prisma generate --schema prisma/schema.prisma
npx prisma migrate dev --name init
npx prisma studio
npx prisma migrate status
```

For production, use only `npx prisma migrate deploy` after a reviewed migration baseline exists. Never run `prisma migrate reset`, `prisma db push --force-reset`, `DROP DATABASE`, or destructive schema commands against production. When migration history is missing, inspect and back up the live schema first, create a matching baseline, test it on staging, and obtain approval before applying it.

---

## Seed Data

Run `npm run prisma:seed` to populate the database with demo data.

### Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@servisync.com | Admin@123 |
| Manager | manager@servisync.com | Manager@123 |
| Technician | tech1@servisync.com | Tech@123 |
| Technician | tech2@servisync.com | Tech@123 |
| Customer | customer1@example.com | Customer@123 |

---

## Payment Flow (Stripe)

1. Customer calls `POST /api/v1/payments/initiate` with `invoiceId`
2. Backend validates invoice ownership and payable status
3. Backend creates Stripe Checkout Session
4. Backend creates Payment record with `PENDING` status
5. Customer is redirected to Stripe hosted checkout page
6. Stripe redirects to `success_url` or `cancel_url` with `session_id`
7. Backend `POST /api/v1/payments/success` verifies session with Stripe
8. Backend updates Payment → `SUCCESS`, Invoice → `PAID`, WorkOrder → completed, ServiceRequest → `CLOSED`
9. Stripe webhook (`POST /api/v1/payments/webhook`) provides idempotent verification
10. **Never** accepts client-supplied `{ "status": "PAID" }` as proof

---

## Security

- Passwords hashed with bcrypt (salt rounds: 12)
- JWT access tokens (short-lived, 15m) + refresh tokens (stored hashed in DB)
- Helmet security headers
- CORS with allowed origins
- Rate limiting on auth and general APIs
- Zod validation on all inputs
- No passwords, tokens, or secrets in API responses
- Payment success ONLY via verified Stripe webhook/callback

---

## Deployment

The application is designed for Render or similar Node.js hosting:

1. Set all environment variables on the hosting platform
2. Use a managed PostgreSQL database (e.g., Render PostgreSQL)
3. Use a managed Redis instance or skip caching in production
4. Run `npm install && npm run build && npm start`
5. Ensure `DATABASE_URL` points to the production database
6. Run `npx prisma migrate deploy` during deployment

---

## Role-Permission Matrix

| Feature | Customer | Technician | Manager | Admin |
|---------|----------|------------|---------|-------|
| Register/Login | ✓ | ✓ | ✓ | ✓ |
| Google Login | ✓ | ✓ | ✗ | ✗ |
| Update own profile | ✓ | ✓ | ✓ | ✓ |
| Create service request | ✓ | ✗ | ✗ | ✗ |
| Review requests | ✗ | ✗ | ✓ | ✓ |
| Assign technician | ✗ | ✗ | ✓ | ✓ |
| Accept/reject assignment | ✗ | ✓ | ✗ | ✗ |
| Update work order status | ✗ | ✓ | ✓ | ✗ |
| Generate invoice | ✗ | ✗ | ✓ | ✓ |
| Initiate payment | ✓ | ✗ | ✗ | ✗ |
| View all users | ✗ | ✗ | ✗ | ✓ |
| Manage roles | ✗ | ✗ | ✗ | ✓ |
| Dashboard stats | ✗ | ✗ | ✓ | ✓ |
| Audit logs | ✗ | ✗ | ✗ | ✓ |

---

## Testing

```bash
# Install test dependencies
npm install -D jest @types/jest ts-jest

# Run tests
npm test
```

Critical test scenarios:
- Registration and login flow
- Unauthorized access (401)
- Role authorization (403)
- Service request creation and review
- Assignment with schedule conflict (409)
- Invalid status transition (400)
- Invoice generation
- Payment verification (Stripe mock)
- Ownership restrictions

---

## Postman Collection

Import `ServiSync.postman_collection.json` into Postman. Configure environment variables:
- `BASE_URL`: `http://localhost:5000/api/v1`
- `ACCESS_TOKEN`: JWT token from login
- `REFRESH_TOKEN`: Refresh token from login

---

## License

MIT
