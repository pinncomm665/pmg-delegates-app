import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
const AGENT_BASE = process.env.AGENT_BASE_URL ?? "https://agent.pmgapphub.com";

// POST { contact_ids: string[], campaign_id: string } → proxies to pmg-agent push.
export async function POST(request: NextRequest) {
  await requireUser();
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 200 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  try {
    const res = await fetch(`${AGENT_BASE}/api/internal/push-delegates`, {
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
