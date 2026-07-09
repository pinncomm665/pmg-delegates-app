import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
const AGENT_BASE = process.env.AGENT_BASE_URL ?? "https://agent.pmgapphub.com";

// POST { contact_id, event_brand, event_id?, participant_type }
// "Use the existing record" — attach an existing contact to the chosen
// event+role. Proxies to pmg-agent /api/internal/intake-attach.
// ⚠️ submitted_by / submitted_by_email are injected SERVER-SIDE from the
//    session — never trusted from the client body.
export async function POST(request: NextRequest) {
  await requireUser();

  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const sb = supabaseServer();
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let clientBody: Record<string, unknown>;
  try {
    clientBody = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const { submitted_by: _drop1, submitted_by_email: _drop2, ...safeBody } = clientBody as Record<string, unknown>;

  const payload = {
    ...safeBody,
    submitted_by: user.id,
    submitted_by_email: user.email ?? null,
  };

  try {
    const res = await fetch(`${AGENT_BASE}/api/internal/intake-attach`, {
      method: "POST",
      headers: { "x-cron-secret": secret, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
  }
}
