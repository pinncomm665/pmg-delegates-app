#!/bin/sh
# Guard: server pages/layouts must NOT call supabase auth.getUser() directly.
# Middleware/proxy verifies the session once per request and forwards it via
# the x-pmg-user header; pages read it through the request-auth/session
# helpers. A raw auth.getUser() in a server component quietly reintroduces a
# network round trip to Supabase auth on every render (nav-latency perf work,
# 2026-07-12). Exempt: client components ('use client' runs in the browser)
# and API routes (they authenticate per-request by design).
set -e
cd "$(git rev-parse --show-toplevel)"

BAD=""
for f in $(git ls-files 'app/page.tsx' 'app/layout.tsx' 'app/**/page.tsx' 'app/**/layout.tsx' | grep -v '^app/api/'); do
  [ -f "$f" ] || continue
  head -5 "$f" | grep -q "use client" && continue
  if grep -q 'auth\.getUser()' "$f"; then
    BAD="$BAD
  $f"
  fi
done

if [ -n "$BAD" ]; then
  echo "check-auth-helpers: raw auth.getUser() in server page/layout:$BAD" >&2
  echo "Use the helpers instead (getRequestUser/getRequestUserProfile from" >&2
  echo "lib/supabase/request-auth, or lib/session in the team apps) — one" >&2
  echo "verified auth call per request, not one per render." >&2
  exit 1
fi
echo "check-auth-helpers: green"
