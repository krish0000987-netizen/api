# White-Label API Reseller Platform

A SaaS platform for reselling third-party APIs under your own brand: connect
your vendor API keys, issue branded keys to your customers, control
sandbox/live modes, and bill on your own terms.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind CSS v4) — one project for
  the customer app and the admin dashboard (route groups)
- **Prisma 7 + Neon** (serverless Postgres) with the Neon serverless driver
- **Upstash Redis** for rate limiting and usage counters
- **NextAuth.js** for customer/admin authentication (+ optional Google OAuth)
- **Stripe** for billing (checkout + webhooks)
- **dnd-kit / react-dropzone** for drag-and-drop UX
- **Vercel Cron** for nightly usage aggregation

## Getting started

```bash
npm install
cp .env.example .env   # then fill in real values
npm run dev            # http://localhost:3000
```

Required env vars (see `.env.example`): `DATABASE_URL` (pooled Neon URL),
`DIRECT_URL` (direct Neon URL, for Prisma CLI/migrations), `ENCRYPTION_KEY`
(AES-256 key for vendor keys at rest), `AUTH_SECRET` / `NEXTAUTH_SECRET`,
`ADMIN_EMAIL` / `ADMIN_PASSWORD` (for `npm run seed`), `CRON_SECRET`,
`STRIPE_SECRET_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.

## Database

```bash
npx prisma generate   # regenerate the client
npx prisma migrate dev  # create/apply migrations locally (needs DIRECT_URL)
npm run seed          # create the first admin account (ADMIN_EMAIL/PASSWORD)
```

## The proxy gateway

Customers call `/api/v1/{vendor-slug}/...` with their branded key:

```bash
curl https://your-app.com/api/v1/sms/messages \
  -H "Authorization: Bearer sk_test_..." \
  -d '{"to": "+1234", "text": "hello"}'
```

The gateway validates the key (sha256 lookup + bcrypt), checks the sliding-window
rate limit (Upstash, skipped until configured), decrypts the right vendor key
(sandbox or live per the customer's mode), forwards the request, strips
vendor-identifying headers, and logs a usage event.

## Drag-and-drop features (dnd-kit + react-dropzone)

- **Integration Builder** (`/integrations`): customers drag vendor blocks onto a
  canvas to enable services; the gateway rejects calls to services the customer
  hasn't enabled.
- **Admin fallback order**: drag to reorder which vendor is tried first when a
  route has multiple vendors (writes `priority`).
- **Dashboard widgets**: admin and customer stat cards can be reordered with
  mouse, touch, or keyboard; the layout is saved per user.
- **Dropzones**: bulk-import customers from CSV (one-time temp passwords) and
  import vendor settings from JSON on the admin pages.

## Deploying to Vercel

1. **Push to GitHub** (done for you if you're reading this after the push):
   ```bash
   git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
   git push -u origin main
   ```
2. **Import into Vercel**: vercel.com → Add New → Project → import the GitHub
   repo. The build command already runs `prisma generate && prisma migrate deploy
   && next build`, so migrations apply automatically on every deploy.
3. **Add environment variables** (Project Settings → Environment Variables) for
   **Production** — same values as your local `.env`:
   - `DATABASE_URL` (Neon **pooled** URL), `DIRECT_URL` (Neon direct URL)
   - `ENCRYPTION_KEY` — same value as local; never change it once vendors exist
   - `AUTH_SECRET` + `NEXTAUTH_SECRET` — same random value
   - `CRON_SECRET` — same value as local (Vercel sends it to the cron)
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD` (used by `npm run seed` against prod)
   - `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
   - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
   - `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` (optional)
4. **Run the admin seed once** against production:
   ```bash
   DATABASE_URL=... DIRECT_URL=... npm run seed
   ```
   (or set the vars in your shell first).
5. **Verify the cron**: after deploy, open
   `https://your-app.com/api/cron/usage` with header
   `Authorization: Bearer <CRON_SECRET>` — expect `{"ok":true,...}`. Vercel
   triggers it nightly at 00:00 UTC automatically.
6. **Stripe webhook**: Stripe Dashboard → Developers → Webhooks → add endpoint
   `https://your-app.com/api/stripe/webhook`, subscribe to
   `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`; copy the `whsec_...` signing secret into
   `STRIPE_WEBHOOK_SECRET`.
7. **NextAuth callback URLs**: if you enabled Google sign-in, add
   `https://your-app.com/api/auth/callback/google` to the Google OAuth client's
   authorized redirect URIs (Google Cloud Console).
8. **Smoke test**: sign up a customer, add a vendor (slug `sms`), call
   `https://your-app.com/api/v1/sms/...` with their `sk_test_...` key.

## Current status

- [x] Step 1 — project scaffolded, dev server verified
- [x] Step 2 (partial) — Prisma + Neon adapter wired, schema in place
- [x] Step 3 — Vendor Key Vault (admin-only) + AES-256-GCM encryption
- [x] Step 4 — customer sign-up/login + branded API key issuance (shown once)
- [x] Step 5 — proxy/gateway route end-to-end (`/api/v1/[...path]`)
- [x] Step 6 — live mode, rate limiting, usage logging, nightly cron aggregation + analytics
- [x] Step 7 — drag-and-drop Integration Builder, fallback ordering, dashboard widgets, file dropzones
- [ ] Step 8 — Stripe billing
- [ ] Step 9 — deploy to Vercel

> Note: reselling a vendor API may require their permission — check each
> vendor's Terms of Service before going live.
