import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
const AGENT_BASE = process.env.AGENT_BASE_URL ?? "https://agent.pmgapphub.com";

// POST { contact_id, force? } → proxies to pmg-agent /api/internal/contact-summary
// (x-cron-secret). requested_by is injected from the server-side session — never
// trusted from the client body. Agent replies: 200 = row, 202 = { status:'pending' },
// 404 = endpoint not deployed yet (the card shows "not available yet").
export async function POST(request: NextRequest) {
  const user = await requireUser();
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 404 });

  let clientBody: Record<string, unknown>;
  try { clientBody = await request.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const contact_id = typeof clientBody.contact_id === "string" ? clientBody.contact_id.trim() : "";
  if (!contact_id) return NextResponse.json({ error: "contact_id required" }, { status: 400 });
  const body = { contact_id, force: clientBody.force === true, requested_by: user.email || user.id };

  try {
    const res = await fetch(`${AGENT_BASE}/api/internal/contact-summary`, {
      method: "POST",
      headers: { "x-cron-secret": secret, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    let data: unknown = null;
    try { data = await res.json(); } catch { data = { error: res.ok ? "empty" : `agent_${res.status}` }; }
    return NextResponse.json(data, { status: res.status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
  }
}
