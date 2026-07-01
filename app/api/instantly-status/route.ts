import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const AGENT_BASE = process.env.AGENT_BASE_URL ?? "https://agent.pmgapphub.com";

// GET /api/instantly-status?email=  → proxies to pmg-agent live Instantly status.
export async function GET(request: NextRequest) {
  await requireUser();
  const email = (new URL(request.url).searchParams.get("email") ?? "").trim();
  if (!email || !email.includes("@")) return NextResponse.json({ leads: [] });

  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured", leads: [] });

  try {
    const res = await fetch(
      `${AGENT_BASE}/api/internal/instantly-status?email=${encodeURIComponent(email)}`,
      { headers: { "x-cron-secret": secret }, cache: "no-store" }
    );
    if (!res.ok) return NextResponse.json({ error: `agent_${res.status}`, leads: [] });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ error: "fetch_failed", leads: [] });
  }
}
