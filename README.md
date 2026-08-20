# CrumbStudio

A cake ordering platform for a small, made-to-order home cake business. Customers browse the catalogue, configure a cake (size, flavour, colour, pickup/delivery date, notes), and pay via Stripe. An admin manages orders and the catalogue. Built as a learning project, deliberately kept lean.

It is really two things: a **product catalogue** (content-shaped, in Sanity) and a **made-to-order booking system** with per-day capacity and per-item dates (transactional, in Supabase).

---

## Tech Stack

- **Next.js 16** (App Router, React 19, TypeScript) — frontend **and** backend. API routes / server actions under `app/api/*` hold all trusted logic; there is no separate backend service.
- **Sanity** — product catalogue and image CDN. Source of truth for cakes, variants, and images. Standalone Studio in `apps/studio/`.
- **Supabase** — Postgres (orders, customers, capacity) + Auth (password-based). DDL in `db/schema.sql`.
- **Stripe** — embedded Checkout + webhooks for payment.
- **Tailwind CSS 4** (CSS-first `@theme`, no config file) + **shadcn/ui** (Base UI variant).
- **pnpm workspaces** monorepo.
- **AWS via SST** — the Next app deploys to AWS (Lambda + CloudFront + S3, using OpenNext under SST) as infrastructure-as-code. Chosen over Vercel because SST is already familiar: pay-per-use (~free at hobby volume) rather than a flat plan, and no commercial-use restriction. The managed services (Sanity, Supabase, Stripe) mean AWS only hosts the stateless Next app — no VPC/RDS/container orchestration needed. (Cold starts are inherent to serverless on either AWS or Vercel; a non-issue at this traffic.)

---

## Architecture

```
Browser ──▶ Next.js on AWS (Lambda + CloudFront, deployed via SST)
              ├─ Server Components / API routes  ── read catalogue ──▶ Sanity (+ image CDN)
              │                                   ── orders / capacity / auth ──▶ Supabase (Postgres + Auth)
              │                                   ── create session / verify webhook ──▶ Stripe
              └─ Client Components (cart, checkout UI)
```

- **Catalogue** is read from Sanity (Server Components fetch via `next-sanity`; TypeGen'd types).
- **Cart** is client-side (Zustand, persisted to localStorage).
- **Orders / customers / capacity** live in Supabase Postgres. Orders link to Sanity products by id (`order_item.sanity_product_id`) with a `variations` jsonb snapshot — no cross-system FK.
- **Payments** go through Stripe; the Stripe webhook is what actually writes a confirmed order.

### Checkout & capacity flow

1. Client posts the cart to `app/api/checkout`.
2. Server validates the requested date has capacity, **recomputes prices from Sanity** (never trusts the client cart), reserves the slot, and creates a Stripe Checkout Session (inline `price_data`).
3. Stripe's embedded form collects payment on the checkout page.
4. `checkout.session.completed` → write the order + items to Supabase, keep the reservation, confirm.
5. `checkout.session.expired` / cancellation → release the reserved slot.

Capacity is counted in **cakes per day** (`weekly_capacity.max_items` for recurring weekdays, `capacity_override` for specific dates; `0` = closed). Fulfilment date is per line item.

---

## Directory Structure

```
CrumbStudio/
├── apps/
│   ├── frontend/            # Next.js app (UI + API routes)
│   │   ├── app/             # App Router pages + app/api/* routes
│   │   ├── components/      # products, cart, checkout, layout, ui (shadcn)
│   │   ├── lib/             # sanity + supabase clients
│   │   ├── store/           # Zustand cart store
│   │   └── types/           # generated Sanity types, cart types
│   └── studio/              # standalone Sanity Studio (product schemas)
├── db/schema.sql            # Supabase Postgres DDL (run manually)
├── docs/diary/              # dev diary (decisions & progress)
└── package.json             # pnpm workspace root
```

---

## Getting Started

```bash
pnpm install
pnpm dev          # all apps in parallel
pnpm dev:fe       # Next app only (port 3000)
pnpm dev:studio   # Sanity Studio only (port 3333)
```

Frontend env (`apps/frontend/.env.local`): Supabase URL/key, Sanity project id/dataset, and (when wired) Stripe keys + webhook secret.

---

## Status

**Done:** product catalogue (Sanity schemas + Studio), storefront (PLP, PDP with gallery/variants/date picker), cart (Zustand + drawer), checkout UI, brand/design system, database schema design, guest-checkout modelling.

**Next:** capacity + availability endpoint, order-placement (`app/api/checkout`), Stripe embedded checkout + webhooks, confirmation email, admin order management, deploy.

The schema **is** applied to Supabase (all seven tables exist); `db/seed.sql` has not been run yet, so there is no capacity data.

See `docs/plans/` for the phase-by-phase plan of the remaining work, and `docs/diary/` for the running log of decisions and rationale.
