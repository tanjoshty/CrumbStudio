# Phase 7 — Deploy to AWS via SST

**Status:** Not started
**Depends on:** nothing strictly — but deploying before Phase 4 means a webhook
endpoint with no orders behind it. Worth doing early enough to shake out
serverless surprises, late enough to have something to show.

## Goal

The Next app running on AWS (Lambda + CloudFront + S3 via OpenNext under SST),
as infrastructure-as-code, with a public URL Stripe can reach.

## Scope

**In:** SST config, secrets, custom domain, Stripe live-mode webhook endpoint,
Sanity CORS.

**Out:** the Sanity Studio, which stays local (`pnpm dev:studio`) or goes to
Sanity's own hosting — it does not need to live in the app's deployment.

## Design notes

### Why SST

Per the README: already familiar, pay-per-use (roughly free at hobby volume),
and no commercial-use restriction. The managed services (Sanity, Supabase,
Stripe) mean AWS only hosts a stateless Next app — no VPC, RDS, or containers.

### Secrets, not env files

`.env.local` does not deploy. `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` become SST secrets
(`sst secret set`), bound to the app. Only the `NEXT_PUBLIC_*` values are safe to
inline. The service-role key in particular bypasses RLS entirely — treat it like
a root password.

`ADMIN_USER_IDS` ([C7](./README.md#c7--admin-authorisation-env-allow-list-decided-2026-08-20))
also needs setting per stage — it is not secret, but an empty value locks you out
of `/admin` and a stale one locks the wrong person in.

### The webhook needs its own secret per environment

The Stripe dashboard endpoint for the deployed URL issues a **different** signing
secret from `stripe listen`. Set it per stage; a copied local secret fails
verification with a signature error that reads like a code bug.

### Live mode is a separate account

The `Crumb Haus` account (`acct_1TrejHPE4jbIsCM5`) is live; all development so
far targets the `Crumb Studio sandbox`. Going live means new keys, a new webhook
endpoint, and a real payment as the first test. Do not point a dev stage at the
live account.

### Things that differ from `next dev`

- Cold starts exist; fine at this traffic, but do not benchmark the first hit.
- `console.log` goes to CloudWatch — worth a look before debugging blind.
- Sanity CORS must allow the deployed origin (`add_cors_origin`), and Supabase
  Auth needs its redirect URLs updated or the email confirmation and password
  reset links in `app/auth/*` will point at localhost.

## Tasks

- [ ] Add SST config for the Next app; deploy a dev stage.
- [ ] Move secrets into SST; confirm nothing sensitive is inlined in the client
      bundle.
- [ ] Custom domain + certificate.
- [ ] Register the deployed webhook URL in Stripe; store that stage's signing
      secret.
- [ ] Add the deployed origin to Sanity CORS.
- [ ] Update Supabase Auth redirect URLs (confirm, reset password).
- [ ] End-to-end sandbox order against the deployed URL.
- [ ] Document the deploy command and stage names in the README.

## Files

- `sst.config.ts` (new)
- `README.md` (deploy section)

## Done when

- The deployed URL serves the storefront with Sanity images and working auth.
- A sandbox order completes end to end against the deployed webhook.
- No secret appears in the client bundle.
- Auth emails link to the deployed domain, not localhost.
