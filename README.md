# WardrobeAI

AI wardrobe and virtual try-on (Next.js + Convex + Better Auth + Eve stylist).

Photograph clothes → digitize a wardrobe → build outfits → render try-ons on your avatar (credit-metered) → chat with Eve, who only styles from your real items.

## Requirements

- **Node.js ≥ 24** (Eve). With nvm: `nvm install && nvm use`
- pnpm (`packageManager` in `package.json`)

## Local setup

```bash
pnpm install
cp .env.example .env.local
# set BETTER_AUTH_SECRET on Convex; Convex URLs are set by `npx convex dev`
pnpm dev
```

App: [http://localhost:3000](http://localhost:3000)  
Dashboard: https://dashboard.convex.dev/t/vijay-reddy-0f65e/wardrobe-ai

Signed-in users are redirected from `/` to `/wardrobe`. Preview the marketing page while signed in with `/?preview=landing`.

## Environment matrix

### Next.js (`.env.local`)

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_CONVEX_URL` | yes | Set by `npx convex dev` |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | yes | Same host, `.site` suffix |
| `NEXT_PUBLIC_SITE_URL` | yes | e.g. `http://localhost:3000` |
| `AGENT_SERVICE_KEY` | for stylist | Same value as Convex `AGENT_SERVICE_KEY` |
| `AGENT_DEV_AUTH_ID` | optional | Local Eve without browser JWT (`users.authId`) |

### Convex deployment (`npx convex env set …`)

| Variable | Required | Notes |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | yes | `openssl rand -base64 32` |
| `SITE_URL` | yes | Must match the public site origin |
| `OPENAI_API_KEY` or `AI_GATEWAY_API_KEY` | for pipelines | Detect / extract / render / embed |
| `AGENT_SERVICE_KEY` | for stylist | Shared with Next `.env.local` |
| `STRIPE_SECRET_KEY` | billing | Test or live secret |
| `STRIPE_WEBHOOK_SECRET` | billing | From Stripe webhook endpoint |
| `STRIPE_PRICE_PRO` / `STRIPE_PRICE_PLUS` | billing | Price IDs from Dashboard |
| `ALLOW_DEV_SMOKE` | optional | `1` to allow non-admin test plan grants |

See [`.env.example`](.env.example) for copy-paste commands.

## Admin bootstrap

There is no self-promote mutation. In the Convex dashboard, open the `users` table and set `role` to `"admin"` on your user row. Then open `/admin`.

## Smoke path

1. Sign up → complete onboarding (avatar + men’s/women’s wardrobe prefs)
2. Empty wardrobe → **Seed demo wardrobe** (or **Add clothes** and extract)
3. Create an outfit → render a try-on → save to lookbook
4. Open `/share/[token]` for a public render (Pro+ sharing)
5. Open `/billing` and exercise Checkout / portal in Stripe test mode
6. Open `/stylist` and ask Eve for a look from seeded pieces

## Production checklist

- [ ] `npx convex deploy` to production
- [ ] Set prod `SITE_URL`, `BETTER_AUTH_SECRET`, AI keys, `AGENT_SERVICE_KEY`
- [ ] Stripe Dashboard: products/prices + webhook → live `STRIPE_*` on Convex
- [ ] Confirm Eve agent model is on a paid Gateway tier (not the free-tier placeholder)
- [ ] Run the smoke path against production
- [ ] Bootstrap first admin via dashboard `users.role`

## Scripts

| Script | Purpose |
| --- | --- |
| `pnpm dev` | Convex + Next |
| `pnpm build` / `pnpm start` | Production Next build |
| `pnpm typecheck` | App + Convex + agent TypeScript |
| `pnpm lint` | ESLint |
