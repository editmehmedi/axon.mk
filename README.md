# AXON.MK

Custom PC assembly and pre-built sales platform for North Macedonia.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS 4
- Prisma + PostgreSQL
- JWT cookie sessions (jose) + bcrypt
- RBAC: `user` / `admin` / `head_admin`

## Features

- **Готови Конфигурации** (`/prebuilts`) — catalog with stock badges and COD checkout
- **Склопи Сам** (`/configurator`) — part picker with socket/RAM/PSU compatibility + assembly fee toggle
- **Order tracker** — Verification → Parts Sourced → Building → Handed to Cargo → Delivered & Paid
- **Admin console** — inventory, status updates, cargo codes, head_admin pricing & roles

## Setup

1. Copy env vars:

```bash
copy .env.example .env
```

2. Start Postgres (Docker):

```bash
docker compose up -d
```

Or paste a Neon/Vercel Postgres URL into `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.

3. Install, migrate, seed:

```bash
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy on Vercel

1. Push this repo to GitHub.
2. Import the repo at [vercel.com/new](https://vercel.com/new).
3. Add a **Neon** Postgres database (Vercel Marketplace) and a **public Blob** store.
4. Set environment variables (Production + Preview):

| Name | Value |
|------|--------|
| `DATABASE_URL` | Neon pooled connection string (`-pooler` host) |
| `DATABASE_URL_UNPOOLED` | Neon direct connection string |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `BLOB_READ_WRITE_TOKEN` | set automatically by the Blob store |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | order emails |
| `SMTP_FROM` | `AXON.MK <noreply@axon.mk>` |
| `ORDER_NOTIFY_EMAIL` | optional admin copy |

5. Deploy. The build runs `prisma migrate deploy`, then `next build`.
6. After the first successful deploy, seed catalog data once:

```bash
npx vercel env pull .env.production.local
npx dotenv -e .env.production.local -- npm run db:seed
```

Or from your machine with the production `DATABASE_URL`:

```bash
npx prisma db seed
```

Do **not** run seed on every deploy — it wipes orders and users.

## Seed accounts

`npx prisma db seed` creates `owner@axon.mk` (head admin), `admin@axon.mk`, and `user@axon.mk`. Set `SEED_PASSWORD` before seeding; if it is missing, the seed generates one and prints it. Do not use seed passwords on the live shop.

Demo tracking code: `AXN-DEMO01`
