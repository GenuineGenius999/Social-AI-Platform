# Database setup — Supabase (recommended)

This project is built for **[Supabase](https://supabase.com)**. Use it — do not switch to raw Postgres, PlanetScale, or Firebase without rewriting auth, storage, and realtime.

Supabase gives you in one place:

| Feature | Used by Kinetik |
|---------|-----------------|
| PostgreSQL | Posts, profiles, chat, admin |
| Auth | Sign up / sign in |
| Storage | Generated & uploaded images |
| Realtime | Live feed & chat |
| Row Level Security | Per-user permissions |

---

## Part 1 — Create a new Supabase project (5 min)

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**
2. Choose:
   - **Name**: `kinetik` (or any name)
   - **Database password**: save this somewhere safe
   - **Region**: closest to your users (e.g. `East US` if Vercel is US)
3. Wait until the project status is **Active** (~2 minutes)

---

## Part 2 — Run database setup (one time)

### Option A — SQL Editor (easiest, no CLI)

1. Supabase Dashboard → **SQL Editor** → **New query**
2. Open `supabase/bootstrap.sql` from this repo
3. Copy **all** contents → paste → **Run**
4. You should see **Success**

### Option B — CLI

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npm run db:push
```

`YOUR_PROJECT_REF` is the ID in your project URL:  
`https://supabase.com/dashboard/project/`**`abcdefghijklmnop`**

---

## Part 3 — Get API keys (copy to Vercel)

Supabase Dashboard → **Project Settings** → **API**

| What you need | Where in Supabase | Env variable name(s) |
|---------------|-------------------|----------------------|
| Project URL | Project URL | `SUPABASE_URL`, `VITE_SUPABASE_URL` |
| Publishable key | `sb_publishable_...` under API Keys | `SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PUBLISHABLE_KEY` |
| Secret key | `sb_secret_...` (service role) | `SUPABASE_SERVICE_ROLE_KEY` |

Also add:

| Key | Where |
|-----|--------|
| `OPENAI_API_KEY` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |

Copy `.env.example` → `.env` locally and fill the same values.

---

## Part 4 — Vercel environment variables

Vercel → your project → **Settings** → **Environment Variables**

Add **all** of these for **Production**, **Preview**, and **Development**:

```
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
OPENAI_API_KEY
```

**Important:** `VITE_*` vars must be set on Vercel too — they are baked in at build time.

### Optional: Supabase ↔ Vercel integration

1. Vercel → **Integrations** → search **Supabase** → Add
2. Link your Supabase project — it can auto-inject `SUPABASE_URL` and keys
3. You still must run `bootstrap.sql` once (integrations do not create tables)
4. You still must add `OPENAI_API_KEY` manually

---

## Part 5 — Vercel build settings

| Setting | Value |
|---------|--------|
| Framework Preset | **TanStack Start** |
| Build Command | `npm run build` |
| Output Directory | **(empty)** — not `dist` |
| Install Command | `npm install` |

Redeploy after env vars are saved.

---

## Part 6 — Verify

In Supabase **Table Editor**, you should see:

- `profiles`, `posts`, `generations`, `global_messages`, `ai_conversations`, …

In **Storage**, buckets:

- `generated-images`
- `avatars`

Create admin account after deploy:

- Email: `admin@genai.com`
- Username: `genaisocial`
- Password: `genaisocial123!!`

Admin panel: `https://your-app.vercel.app/admin`

---

## Auth settings (recommended)

Supabase → **Authentication** → **Providers** → **Email**:

- Turn **off** “Confirm email” if you want instant signup (app uses server-side signup anyway)

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `global_messages` table not found | Run `bootstrap.sql` |
| `Bucket not found` | Run `bootstrap.sql` (creates storage buckets) |
| App loads but auth fails | Check `VITE_SUPABASE_*` on Vercel and redeploy |
| 404 on Vercel | Output Directory must be empty, framework TanStack Start |
