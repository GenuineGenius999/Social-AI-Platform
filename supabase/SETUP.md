# Supabase setup (required once)

Your errors (`global_messages` table missing, `Bucket not found`) mean migrations were never applied to your Supabase project.

## Option A — CLI (recommended)

```bash
npx supabase login
npx supabase link --project-ref qlerermcjnzetglzxpdu
npm run db:push
```

## Option B — SQL Editor

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project → **SQL Editor**
2. Run each file in `supabase/migrations/` **in filename order** (oldest first)
3. Confirm buckets exist: **Storage** → `generated-images`, `avatars`

After setup, redeploy to Vercel and hard-refresh the app.
