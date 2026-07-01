import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { getDelegates } from "@/lib/data";
import { companyDisplay } from "@/lib/company";

export const dynamic = "force-dynamic";

// GET /api/delegates/search?q=  → up to 8 matching delegates for the typeahead.
export async function GET(request: NextRequest) {
  await requireUser();
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  const rows = await getDelegates({ q });
  const results = rows.slice(0, 8).map((r) => ({
    id: r.id,
    name: r.contact?.full_name_clean ?? "—",
    job_title: r.contact?.job_title ?? null,
    company: companyDisplay(r.contact?.company?.name ?? r.contact?.company_name_submitted),
    edition: r.event_edition ?? null,
  }));
  return NextResponse.json({ results });
}
