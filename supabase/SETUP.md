# Database migration guide

Apply these migrations **once** to fix errors like `global_messages table not found` or `Bucket not found`.

## Step 1 — Link your Supabase project

```bash
npx supabase login
npx supabase link --project-ref qlerermcjnzetglzxpdu
```

## Step 2 — Push migrations

```bash
npm run db:push
```

This runs all files in `supabase/migrations/` in order.

## Step 3 — Verify in Supabase Dashboard

- **Table Editor**: `profiles`, `posts`, `global_messages`, `generations`, etc.
- **Storage**: buckets `generated-images` and `avatars`

## Alternative — SQL Editor

If CLI fails, open Supabase Dashboard → **SQL Editor** and run each migration file in `supabase/migrations/` from oldest to newest filename.

## Vercel deploy settings

In Vercel → Project → Settings → Build & Development:

| Setting | Value |
|---------|--------|
| Framework Preset | **TanStack Start** |
| Build Command | `npm run build` |
| Output Directory | **leave empty** (do NOT use `dist`) |
| Install Command | `npm install` |

Wrong output directory (`dist`) breaks routing and pages.
