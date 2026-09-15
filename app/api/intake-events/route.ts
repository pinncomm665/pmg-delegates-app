import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const AGENT_BASE = process.env.AGENT_BASE_URL ?? "https://agent.pmgapphub.com";

// GET ?brand=VERIFY → proxies to pmg-agent events registry filtered by brand.
// Used by the Add Contact form to populate the Edition dropdown live.
export async function GET(request: NextRequest) {
  await requireUser();
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured", events: [] }, { status: 200 });

  const brand = new URL(request.url).searchParams.get("brand") ?? "";

  const qs = brand ? `?brand=${encodeURIComponent(brand)}` : "";
  try {
    const res = await fetch(`${AGENT_BASE}/api/internal/events${qs}`, {
      headers: { "x-cron-secret": secret },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ error: `agent_${res.status}`, events: [] }, { status: 200 });
    }
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ error: "fetch_failed", events: [] });
  }
}
