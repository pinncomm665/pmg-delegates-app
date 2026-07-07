import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
const AGENT_BASE = process.env.AGENT_BASE_URL ?? "https://agent.pmgapphub.com";

// POST { linkedin_url, event_brand, event_id?, participant_type, note? }
// Injects submitted_by / submitted_by_email from the server-side session — never
// trusts those fields from the client body. Proxies to pmg-agent /api/internal/intake-contact.
export async function POST(request: NextRequest) {
  const user = await requireUser();
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 200 });
  let clientBody: Record<string, unknown>;
  try { clientBody = await request.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  // Strip any submitted_by fields the client may have sent; inject from session.
  const { submitted_by: _a, submitted_by_email: _b, ...rest } = clientBody as any;
  const body = {
    ...rest,
    submitted_by: user.id,
    submitted_by_email: user.email,
  };

  try {
    const res = await fetch(`${AGENT_BASE}/api/internal/intake-contact`, {
      method: "POST",
      headers: { "x-cron-secret": secret, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json({ error: "fetch_failed" }, { status: 200 });
  }
}
