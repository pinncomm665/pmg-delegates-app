import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const AGENT_BASE =
  process.env.AGENT_BASE_URL ?? "https://agent.pmgapphub.com";

type Msg = {
  date: string | null;
  subject: string | null;
  from: string | null;
  to: string | null;
  snippet: string | null;
  inbox: string | null;
  direction: "inbound" | "outbound";
  thread_id?: string | null;
};

// GET /api/email-history?emails=work@co.com,personal@yahoo.com   (or ?email=…)
// Proxies to the pmg-agent internal Gmail lookup — which accepts ONE address per
// call — once per distinct address (work + personal), then merges and dedupes.
// Correspondence that went to a contact's personal_email used to be invisible
// here because only the work address was searched. Only logged-in team members.
export async function GET(request: NextRequest) {
  await requireUser();

  const sp = new URL(request.url).searchParams;
  const raw = [sp.get("emails") ?? "", sp.get("email") ?? ""].join(",");
  const emails = Array.from(
    new Set(
      raw
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.includes("@"))
    )
  );
  if (emails.length === 0) {
    return NextResponse.json({ messages: [] });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "not_configured", messages: [] },
      { status: 200 }
    );
  }

  const results = await Promise.all(
    emails.map(async (email) => {
      try {
        const res = await fetch(
          `${AGENT_BASE}/api/internal/email-history?email=${encodeURIComponent(email)}`,
          { headers: { "x-cron-secret": secret }, cache: "no-store" }
        );
        if (!res.ok) return { error: `agent_${res.status}`, messages: [] as Msg[] };
        const data = (await res.json()) as { error?: string; messages?: Msg[] };
        return { error: data.error, messages: data.messages ?? [] };
      } catch {
        return { error: "fetch_failed", messages: [] as Msg[] };
      }
    })
  );

  // Only surface an error when EVERY lookup failed — one dead address must not
  // hide the other's history.
  if (results.every((r) => r.error)) {
    return NextResponse.json({ error: results[0].error, messages: [] }, { status: 200 });
  }

  // Merge + dedupe: prefer thread_id when the agent passes it through, else the
  // same day|subject|snippet key the internal route uses. Newest first, cap 20.
  const seen = new Set<string>();
  const messages = results
    .flatMap((r) => r.messages)
    .filter((m) => {
      const ts = Date.parse(m.date ?? "");
      const day = Number.isFinite(ts) ? new Date(ts).toISOString().slice(0, 10) : (m.date ?? "");
      const key = m.thread_id
        ? `t|${m.thread_id}`
        : `${day}|${m.subject ?? ""}|${(m.snippet ?? "").slice(0, 80)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (Date.parse(b.date ?? "") || 0) - (Date.parse(a.date ?? "") || 0))
    .slice(0, 20);

  return NextResponse.json({ messages });
}
