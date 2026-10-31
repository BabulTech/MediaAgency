# MAMP: decisions, architecture and status

## Business decisions (configurable defaults, please confirm)

| Decision | Default used | Why it matters |
|---|---|---|
| Discount base | Applied to base + surcharge + premium | Matches the reference calculator wording; some agencies exempt premiums |
| Rounding | 2 decimals, half up, per line | Affects invoice totals |
| Rule conflicts | Priority, then specificity; exact ties are refused | Prevents silent wrong prices |
| Specificity order | Customer contract > format > edition > time band > weekday | Sets which rate wins |
| Discount limit | 30% slider cap in calculators; approval flow arrives in Phase 3 | Needs the real threshold |
| Tax | No rate shipped; `taxPercent` is an input | A Pakistani tax professional must validate treatment |
| Tenancy | Single tenant, `tenant_id` on every table | Ready for multi-agency later |
| Sample data | Fictional "Sample Daily" and "Sample News TV", flagged `is_sample` | No real outlet's rates are invented |
| Local database | PGlite; set `DATABASE_URL` for Postgres/Supabase | Docker and Postgres are not on the dev machine |
| ORM | Drizzle | Spec allows Prisma or Drizzle |

## Architecture

- `packages/pricing`: decimal pricing engine shared by browser and server, so one set of rules produces both prices.
- `apps/api`: NestJS REST API on Drizzle/Postgres. `POST /v1/pricing/calculate` picks published rules, separates selling and supplier cost, and stores a snapshot.
- `apps/web`: Next.js App Router. English/Urdu with RTL via `lib/dict.ts`; mobile bottom navigation; light and dark themes.

## Status against the spec phases

| Phase | State |
|---|---|
| 1 Foundation | Mostly done: login, hashed passwords, revocable sessions, lockout, 15 roles, server-side permissions, tenant filtering, user admin, audit. **Missing: MFA, role editor, field and ownership permissions, database RLS, rate limiting, audit viewer** |
| 2 Media and rate cards | Partial: outlets list/create, rate card create, rules, publish, expire, versions, history, CSV import and export, engine, calculators, previews. Single-step approval only; no Excel format |
| 3 CRM and sales | Mostly done: customers, contacts, campaigns, quotations, orders, placements with frozen prices, discount approval above 10%. No PDFs, quotation revisions, order amendments or general approval engine |
| 4 Booking and operations | Mostly done: supplier bookings, artwork versions, proofs, private file storage. No booking PDFs, TV calendar, schedule discrepancy flags or spec validation |
| 5 Finance | Mostly done: invoices, supplier bills, payments, advances, credit notes, aging, quoted, committed and actual margin. No PDFs, refunds, ledgers, consolidated tax rules or withholding |
| 6 Reporting | Mostly done: all 30 reports, bar charts, Excel, CSV and PDF export, Excel and CSV import with preview. No report builder, scheduled reports, role dashboards, email or jobs |
| 7 Portals | Partial: customer view with quotation accept and reject; supplier booking responses. No uploads, requests, bills or PDF downloads in portals |

Rule 9.3 note: rule stacking, rule-level premiums and tax rules are not in the engine yet. Radio, digital and outdoor calculators are also outstanding.

Documents are print pages saved as PDF from the browser, which keeps Urdu shaping correct.

Deliverables not yet produced: full SRS, ERD, permission matrix, Swagger, Docker config, admin and user guides.

Supabase: database, Auth login and password recovery are live. Storage arrives with creative management.

## Deferred to the end, by owner decision

MFA, per-tenant RLS policies, rate limiting, API certificate verification, and field and ownership permissions. All must be done before production.

## Next step

Core features first: Phase 2 rate card editing, then Phase 3 CRM and sales. The API must stay on loopback until RLS, rate limiting and TLS exist. Sessions are local to the API; moving to Supabase Auth only replaces the login and session lookup in apps/api/src/auth.ts.
