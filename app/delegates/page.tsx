import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getDelegates, getFilterOptions, stageBadgeClass, stageLabel, STAGES } from "@/lib/data";
import Shell from "../Shell";
import DelegateSearch from "./DelegateSearch";
import DelegatesList from "./DelegatesList";
import ExportButtons from "./ExportButtons";
import { companyDisplay } from "@/lib/company";

export const dynamic = "force-dynamic";

export default async function DelegatesPage({
  searchParams,
}: {
  searchParams: {
    brand?: string;
    edition?: string;
    status?: string;
    q?: string;
    has_valid_email?: string;
    has_phone?: string;
    has_linkedin?: string;
  };
}) {
  const user = await requireUser();
  const filters = {
    brand: searchParams.brand,
    edition: searchParams.edition,
    status: searchParams.status,
    q: searchParams.q,
    hasValidEmail: searchParams.has_valid_email === "1",
    hasPhone: searchParams.has_phone === "1",
    hasLinkedin: searchParams.has_linkedin === "1",
  };
  const [rows, options] = await Promise.all([getDelegates(filters), getFilterOptions()]);

  // Preserve the active filters so a delegate detail page can link back to this view.
  const qs = new URLSearchParams();
  for (const k of ["brand", "edition", "status", "q", "has_valid_email", "has_phone", "has_linkedin"] as const) {
    if (searchParams[k]) qs.set(k, searchParams[k] as string);
  }
  const ret = qs.toString();
  const extraCount = [
    searchParams.has_valid_email,
    searchParams.has_phone,
    searchParams.has_linkedin,
  ].filter((v) => v === "1").length;

  return (
    <Shell user={user}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, margin: "0 0 14px" }}>
        <h2 style={{ margin: 0 }}>
          <Link href="/dashboard" style={{ color: "var(--accent, #0f6e56)" }}>Home</Link>
          <span style={{ color: "var(--muted)", margin: "0 8px" }}>›</span>
          Delegates
          <span style={{ color: "var(--muted)", margin: "0 8px" }}>›</span>
          {searchParams.edition || "All"}
          <span style={{ color: "var(--muted)", margin: "0 8px" }}>›</span>
          {searchParams.status ? stageLabel(searchParams.status) : "All"}
        </h2>
        <div style={{ fontSize: 13, color: "var(--muted)", whiteSpace: "nowrap" }}>
          <strong style={{ color: "var(--text)", fontSize: 15 }}>{rows.length}</strong> delegate{rows.length === 1 ? "" : "s"}
        </div>
      </div>

      <style>{`.flt summary{list-style:none}.flt summary::-webkit-details-marker{display:none}`}</style>
      <form
        method="get"
        className="card section flt"
        style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}
      >
        {/* Row 1 — filters + More + Apply (one row on desktop, stacked on mobile) */}
        <div className="flt-row" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select name="brand" defaultValue={searchParams.brand ?? ""} style={{ flex: 1, minWidth: 0 }}>
            <option value="">All events</option>
            {options.brands.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <select name="edition" defaultValue={searchParams.edition ?? ""} style={{ flex: 1, minWidth: 0 }}>
            <option value="">All editions</option>
            {options.editions.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
          <select name="status" defaultValue={searchParams.status ?? ""} style={{ flex: 1, minWidth: 0 }}>
            <option value="">All statuses</option>
            {STAGES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          <details className="flt-more" style={{ position: "relative" }}>
            <summary className="btn" style={{ cursor: "pointer", whiteSpace: "nowrap" }}>
              More{extraCount > 0 ? ` · ${extraCount}` : ""}
            </summary>
            <div
              className="card"
              style={{ position: "absolute", zIndex: 10, top: "calc(100% + 6px)", right: 0, padding: 12, minWidth: 190, display: "flex", flexDirection: "column", gap: 10, boxShadow: "0 6px 24px rgba(0,0,0,0.12)" }}
            >
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, margin: 0 }}>
                <input type="checkbox" name="has_valid_email" value="1" defaultChecked={searchParams.has_valid_email === "1"} style={{ width: "auto" }} /> Has valid email
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, margin: 0 }}>
                <input type="checkbox" name="has_phone" value="1" defaultChecked={searchParams.has_phone === "1"} style={{ width: "auto" }} /> Has phone
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, margin: 0 }}>
                <input type="checkbox" name="has_linkedin" value="1" defaultChecked={searchParams.has_linkedin === "1"} style={{ width: "auto" }} /> Has LinkedIn
              </label>
            </div>
          </details>

          <button className="btn btn-primary" type="submit" style={{ whiteSpace: "nowrap" }}>Apply</button>
        </div>

      </form>

      {/* Row 2 — typeahead picker + export of the current filtered view */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <DelegateSearch />
        </div>
        <ExportButtons filterQs={ret} count={rows.length} />
      </div>

      <DelegatesList
        rows={rows.map((r) => ({
          id: r.id,
          name: r.contact?.full_name_clean ?? "—",
          job_title: r.contact?.job_title ?? "—",
          company: companyDisplay(r.contact?.company?.name ?? r.contact?.company_name_submitted) ?? "—",
          edition: r.event_edition ?? "—",
          stage: (r.stage ?? "identified").toLowerCase(),
          stageLabel: stageLabel(r.stage),
          stageClass: stageBadgeClass(r.stage),
        }))}
        ret={ret}
      />
    </Shell>
  );
}
