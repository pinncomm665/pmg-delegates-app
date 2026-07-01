import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { getDelegates, stageLabel } from "@/lib/data";
import { companyDisplay } from "@/lib/company";

export const dynamic = "force-dynamic";

const AGENT_BASE = process.env.AGENT_BASE_URL ?? "https://agent.pmgapphub.com";

// Export the CURRENT filtered delegate view as an XLSX download (?mode=xlsx) or a
// Google Sheet in the "PMG Delegate Exports" Drive folder (?mode=drive). The
// filtered query runs here (single source of filter logic); the spreadsheet /
// Drive build is delegated to pmg-agent's shared utils.
const COLUMNS = ["Name", "Job Title", "Company", "Edition", "Status", "Ticket", "Paid", "Email", "Phone", "LinkedIn", "Country"];

export async function GET(request: NextRequest) {
  await requireUser();
  const sp = request.nextUrl.searchParams;
  const mode = sp.get("mode") === "drive" ? "drive" : "xlsx";

  const filters = {
    brand: sp.get("brand") ?? undefined,
    edition: sp.get("edition") ?? undefined,
    status: sp.get("status") ?? undefined,
    q: sp.get("q") ?? undefined,
    hasValidEmail: sp.get("has_valid_email") === "1",
    hasPhone: sp.get("has_phone") === "1",
    hasLinkedin: sp.get("has_linkedin") === "1",
  };

  const delegates = await getDelegates(filters);
  const rows = delegates.map((r) => {
    const c = r.contact ?? {};
    return {
      Name: c.full_name_clean ?? "",
      "Job Title": c.job_title ?? "",
      Company: companyDisplay(c.company?.name ?? c.company_name_submitted) ?? "",
      Edition: r.event_edition ?? "",
      Status: stageLabel(r.stage),
      Ticket: r.ticket_type ?? "",
      Paid: r.payment_received ? "Yes" : "",
      Email: c.email ?? c.personal_email ?? "",
      Phone: c.phone ?? c.mobile ?? c.office_phone ?? c.other_phone ?? "",
      LinkedIn: c.linkedin_url_canonical ?? "",
      Country: c.location_country ?? "",
    };
  });

  const datePart = new Date().toISOString().slice(0, 10);
  const scope = filters.edition || filters.brand || "All";
  const title = `Delegates — ${scope} — ${datePart}`;

  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "export not configured" }, { status: 500 });

  const res = await fetch(`${AGENT_BASE}/api/internal/delegate-export`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cron-secret": secret },
    body: JSON.stringify({ columns: COLUMNS, rows, title, mode }),
    cache: "no-store",
  });

  if (mode === "drive") {
    const data = await res.json().catch(() => ({ error: "drive export failed" }));
    return NextResponse.json(data, { status: res.ok ? 200 : 502 });
  }

  if (!res.ok) {
    const err = await res.text().catch(() => "export failed");
    return NextResponse.json({ error: err.slice(0, 200) }, { status: 502 });
  }
  const buf = await res.arrayBuffer();
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": res.headers.get("content-disposition") ?? `attachment; filename="${title}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
