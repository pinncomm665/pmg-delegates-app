import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
const AGENT_BASE = process.env.AGENT_BASE_URL ?? "https://agent.pmgapphub.com";

// GET → returns the logged-in user's own intake submissions.
// Proxies to pmg-agent GET /api/internal/intake-requests?submitted_by=<uid>.
export async function GET(_request: NextRequest) {
  const user = await requireUser();
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json([], { status: 200 });
  try {
    const res = await fetch(
      `${AGENT_BASE}/api/internal/intake-requests?submitted_by=${encodeURIComponent(user.id)}`,
      {
        headers: { "x-cron-secret": secret },
        cache: "no-store",
      }
    );
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
