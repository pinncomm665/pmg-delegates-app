import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const AGENT_BASE =
  process.env.AGENT_BASE_URL ?? "https://agent.pmgapphub.com";

// GET /api/email-history?email=name@company.com
// Proxies to the pmg-agent internal Gmail lookup. Only logged-in team members.
export async function GET(request: NextRequest) {
  await requireUser();

  const email = (new URL(request.url).searchParams.get("email") ?? "").trim();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ messages: [] });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "not_configured", messages: [] },
      { status: 200 }
    );
  }

  try {
    const res = await fetch(
      `${AGENT_BASE}/api/internal/email-history?email=${encodeURIComponent(email)}`,
      { headers: { "x-cron-secret": secret }, cache: "no-store" }
    );
    if (!res.ok) {
      return NextResponse.json(
        { error: `agent_${res.status}`, messages: [] },
        { status: 200 }
      );
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "fetch_failed", messages: [] });
  }
}
