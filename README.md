# WardrobeAI

AI wardrobe & virtual try-on app (Next.js + Convex + Better Auth).

## Setup

Requires **Node.js ≥ 24** (Eve). With nvm: `nvm install && nvm use`.

```bash
pnpm install
cp .env.example .env.local
# set BETTER_AUTH_SECRET; Convex URLs are set by `npx convex dev`
pnpm dev
```

Dashboard: https://dashboard.convex.dev/t/vijay-reddy-0f65e/wardrobe-ai
