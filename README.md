# Malik Store V2

Next.js App Router migration of the existing Malik Store. The existing Supabase project remains the backend and source of truth.

## Setup

1. Copy `.env.example` to `.env.local` and fill the existing production values.
2. Run `npm install`.
3. Run `npm run build`.
4. Deploy to Vercel and attach `malik-store.my.id` after preview testing.

Do **not** run `supabase/master_setup.sql` against the existing production database. It is retained as schema documentation/reference only.

The pre-migration frontend/serverless implementation is retained under `legacy/` for behavior comparison during rollout.
