import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { getDelegates, stageLabel } from "@/lib/data";
import { formatPhone } from "@pmg/team-ui/lib/phone";
import { companyDisplay } from "@pmg/team-ui/lib/company";
import { ownerDisplayName, parseOwnerFilter } from "@/lib/roleOwner";

export const dynamic = "force-dynamic";

const AGENT_BASE = process.env.AGENT_BASE_URL ?? "https://agent.pmgapphub.com";

// Export the CURRENT filtered delegate view as an XLSX download (?mode=xlsx) or a
// Google Sheet in the "PMG Delegate Exports" Drive folder (?mode=drive). The
// filtered query runs here (single source of filter logic); the spreadsheet /
// Drive build is delegated to pmg-agent's shared utils.
// Work Email (contacts.email — the cold-outreach address) and Personal Email
// (warm/manual only) are SEPARATE columns: the team needs to see which address
// they're looking at, so this must never collapse back to one fallback column.
const COLUMNS = ["Name", "Job Title", "Edition", "Company", "Work Email", "Personal Email", "Phone", "Ticket Type", "Status", "Owner", "Paid", "LinkedIn", "Country"];
const EXPORT_CAP = 10_000; // mirrored in app/delegates/ExportButtons.tsx

// Safe download filename: "Delegates - VERIFY Saudi Arabia 2026 - 2026-08-23.xlsx"
function fileName(scope: string, datePart: string): string {
  const clean = scope.replace(/[^\w .()-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return `Delegates - ${clean} - ${datePart}.xlsx`;
}

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
    owner: parseOwnerFilter(sp.get("owner")),
  };

  // Export the entire filtered set (not one page), capped at EXPORT_CAP rows so
  // an unfiltered export can't exhaust memory. The cap is surfaced to the
  // caller via X-Export-Truncated (and the total via X-Export-Total).
  const { rows: delegates, total } = await getDelegates({ ...filters, page: 1, pageSize: EXPORT_CAP });
  const truncated = total > EXPORT_CAP;
  const rows = delegates.map((r) => {
    const c = r.contact ?? {};
    return {
      Name: c.full_name_clean ?? "",
      "Job Title": c.job_title ?? "",
      Edition: r.event_edition ?? "",
      Company: companyDisplay(c.company?.name ?? c.company_name_submitted) ?? "",
      "Work Email": c.email ?? "",
      "Personal Email": c.personal_email ?? "",
      Phone: formatPhone(c.phone ?? c.mobile ?? c.office_phone ?? c.other_phone) ?? "",
      // delegates.ticket_type — the pass they hold (Standard / VIP / Speaker pass).
      // Named in full: "Ticket" alone read as a booking reference, not the pass tier.
      "Ticket Type": r.ticket_type ?? "",
      Status: stageLabel(r.stage),
      Owner: ownerDisplayName(r.owner_email) ?? "",
      Paid: r.payment_received ? "Yes" : "",
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
    return NextResponse.json(
      { ...data, truncated, total, exported: rows.length, cap: EXPORT_CAP },
      { status: res.ok ? 200 : 502 }
    );
  }

  if (!res.ok) {
    const err = await res.text().catch(() => "export failed");
    return NextResponse.json({ error: err.slice(0, 200) }, { status: 502 });
  }
  const buf = await res.arrayBuffer();
  const fname = fileName(scope, datePart);
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fname}"; filename*=UTF-8''${encodeURIComponent(fname)}`,
      "Cache-Control": "no-store",
      "X-Export-Total": String(total),
      "X-Export-Truncated": truncated ? "1" : "0",
    },
  });
}
