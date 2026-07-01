import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
const AGENT_BASE = process.env.AGENT_BASE_URL ?? "https://agent.pmgapphub.com";

export async function GET() {
  await requireUser();
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured", campaigns: [] });
  try {
    const res = await fetch(`${AGENT_BASE}/api/internal/instantly-campaigns`, {
      headers: { "x-cron-secret": secret },
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ error: `agent_${res.status}`, campaigns: [] });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ error: "fetch_failed", campaigns: [] });
  }
}
