# WardrobeAI

AI wardrobe & virtual try-on app (Next.js + Better Auth).

## Status

- Next.js app scaffolded with `--skip-install` (no packages installed yet)
- Better Auth dependency listed in `package.json`
- Auth stubs: `src/lib/auth.ts`, `src/lib/auth-client.ts`, `src/app/api/auth/[...all]/route.ts`

## Next steps

```bash
cd wardrobe-ai
pnpm install
cp .env.example .env.local
# set BETTER_AUTH_SECRET
pnpm dev
```

Then wire a database adapter for Better Auth and add Convex.
