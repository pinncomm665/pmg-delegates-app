# PMG Delegates App

Front-facing delegate-management app for the PMG events team — the delegate twin
of the Speakers app (`pinncomm665/pmg-speakers-app`). Same architecture: Next.js 14
(App Router), Supabase auth (`@supabase/ssr`) with role metadata, direct
service-role reads, and all writes/external calls proxied to **pmg-agent**
internal endpoints (`/api/internal/*`, `x-cron-secret` auth).

## Surfaces
- **Pulse dashboard** (`/dashboard`) — per-edition registration health vs each
  event's `delegate_target`.
- **All delegates** (`/delegates`) — filter by brand / edition / stage / has-email /
  has-phone / has-LinkedIn; inline stage editing; typeahead search; XLSX / Drive
  export of the filtered view; multi-select → **Push to Instantly**.
- **Delegate detail** (`/delegates/[id]`) — tabs:
  - **Contact Information** — read-only CRM contact; verify-new-email
    (MillionVerifier, auto-applies when `ok`); add-additive-phone; flag role/company
    change → review queue.
  - **Contact History** — Gmail email history + Instantly enrolment history.
  - **Registration** — stage, ticket type, delegate type, registration date, badge
    name, seating, dietary, special access, invoicing/payment, complimentary, notes.
- **Review queue** (`/admin/queue`, admin only) — approve/reject change requests;
  remove a non-secured delegate.

## Delegate lifecycle (stages)
`identified → invited → registered → confirmed → attended`, plus `cancelled`,
`declined`, `no_show`. Secured stages (registered/confirmed/attended) can't be
deleted from the UI — change status instead.

## Environment
See `.env.example`. Required:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
  — same PMG CRM Supabase project as the Speakers app.
- `MILLIONVERIFIER_API_KEY` — email verify-on-submit.
- `CRON_SECRET` — shared secret matching pmg-agent (`/api/internal/*` auth).
- `AGENT_BASE_URL` — defaults to `https://agent.pmgapphub.com`.

## Backend dependency (pmg-agent)
This app requires **pmg-agent migration 105** and three internal endpoints that
ship in the same PR:
- `migration 105_delegates_app_support.sql` — `contact_change_requests.delegate_id`,
  `events.delegate_target`, and the `advance_delegate_on_instantly_push` trigger.
- `/api/internal/add-delegates` — commits selected contacts as Delegate role rows.
- `/api/internal/push-delegates` — enrols selected contacts into an Instantly campaign.
- `/api/internal/delegate-export` — XLSX / Google Sheet export.
Reused as-is (role-agnostic): `/api/internal/email-history`, `instantly-status`,
`instantly-campaigns`.

## Deploy
1. Apply pmg-agent migration 105 and deploy pmg-agent (Railway, `main`).
2. New GitHub repo + Railway service; set the env vars above.
3. Point `delegates.pmgapphub.com` at the service.
4. Create team logins in Supabase Auth with `app_metadata.role` = `admin` or
   `delegate_team`.

## Set a per-event delegate target
```sql
UPDATE events SET delegate_target = 200 WHERE edition_name = '10DX Nigeria 2026';
```
Standard target is **100/edition** (already set on all current editions). Editions
with no target fall back to `DEFAULT_TARGET_DELEGATES` (100) in `lib/pulse.ts`.

## Not in v1
Self-service registration approval queue + Ticket Tailor ticket issuing (the
`contacts.registration_status`/`ticket_tailor_ticket_id` flow) — deferred to Phase 2.
