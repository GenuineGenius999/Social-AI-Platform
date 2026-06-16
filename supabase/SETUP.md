# Database migration guide

**Full guide:** see [DATABASE.md](../DATABASE.md) in the project root.

## Quick start (new database)

1. Create project at [supabase.com/dashboard](https://supabase.com/dashboard)
2. SQL Editor → paste & run **`bootstrap.sql`** (entire file)
3. Copy API keys → Vercel env vars (see DATABASE.md)
4. Redeploy Vercel

## CLI alternative

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npm run db:push
```

## Vercel

- Output Directory: **empty** (not `dist`)
- Framework: **TanStack Start**
- Set all vars from `.env.example`
