import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
const AGENT_BASE = process.env.AGENT_BASE_URL ?? "https://agent.pmgapphub.com";

// ════════════════════════════════════════════════════════════════════════════
// UNIVERSAL ADD CONTACT — MASTER COPY. Identical in the delegates, speakers
// and roundtables apps; change one, copy it to the other two.
//
// POST { linkedin_url, event_brand, event_id, participant_type, note? }
// Proxies to pmg-agent /api/internal/intake-contact.
//   · submitted_by / submitted_by_email come from the session — never from
//     the client body.
//   · force_new is never forwarded. Staff cannot override a duplicate from
//     the apps: the same LinkedIn URL is the same person, and a same-name
//     match goes to review. The operator can still force one via MCP.
// ════════════════════════════════════════════════════════════════════════════
export async function POST(request: NextRequest) {
  const user = await requireUser();

  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  let clientBody: Record<string, unknown>;
  try {
    clientBody = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const { submitted_by: _a, submitted_by_email: _b, force_new: _c, ...rest } = clientBody as Record<string, unknown>;
  const payload = { ...rest, submitted_by: user.id, submitted_by_email: user.email ?? null };

  try {
    const res = await fetch(`${AGENT_BASE}/api/internal/intake-contact`, {
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
