# Media Agency Management Portal

Needs Node 22+. No database install is required for local development.

```
npm install
npm run dev     # web on http://localhost:3000, API on http://localhost:4000
npm test
```

Status, decisions and what is not built yet: [docs/plan.md](docs/plan.md).

## Deploying to Vercel

Create two projects from this repo. Set the Node version to 22 or later.

| Project | Root directory | Environment variables |
|---|---|---|
| API | `apps/api` | `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `WEB_ORIGIN` (the web project's URL) |
| Web | `apps/web` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL` (the API project's URL) |

Migrations do not run on Vercel. After a schema change, run `npm run bootstrap-admin -w @mamp/api` locally.
