import Link from "next/link";
import { requireUser } from "@/lib/session";
import Breadcrumb from "../Breadcrumb";
import { getDelegates, getStageCounts, getFilterOptions, stageBadgeClass, stageLabel, type SortKey } from "@/lib/data";
import { formatPhone } from "@/lib/phone";
import Shell from "../Shell";
import DelegateSearch from "./DelegateSearch";
import DelegatesList from "./DelegatesList";
import ExportButtons from "./ExportButtons";
import StageTabs from "./StageTabs";
import FiltersSheet from "./FiltersSheet";
import { companyDisplay } from "@/lib/company";
import { ownerFirstName, ownerOptions, parseOwnerFilter, OWNER_UNASSIGNED } from "@/lib/roleOwner";

export const dynamic = "force-dynamic";

const PAGE_SIZES = [50, 100, 250] as const;
const DEFAULT_PAGE_SIZE = 100;
const SORT_KEYS: SortKey[] = ["name", "job_title", "company", "edition", "stage"];
const FILTER_KEYS = ["brand", "edition", "status", "q", "has_valid_email", "has_phone", "has_linkedin", "owner"] as const;

function bestPhone(c: any): string | null {
  return (c?.mobile || c?.phone || c?.office_phone || c?.other_phone || null) as string | null;
}

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
    owner?: string;
    page?: string;
    pageSize?: string;
    sort?: string;
    dir?: string;
  };
}) {
  const user = await requireUser();
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const requestedSize = parseInt(searchParams.pageSize ?? "", 10);
  const pageSize = (PAGE_SIZES as readonly number[]).includes(requestedSize) ? requestedSize : DEFAULT_PAGE_SIZE;
  const sort: SortKey = SORT_KEYS.includes(searchParams.sort as SortKey)
    ? (searchParams.sort as SortKey)
    : "name";
  const dir: "asc" | "desc" = searchParams.dir === "desc" ? "desc" : "asc";
  const q = (searchParams.q ?? "").trim() || undefined;

  const filters = {
    brand: searchParams.brand || undefined,
    edition: searchParams.edition || undefined,
    status: searchParams.status || undefined,
    q,
    hasValidEmail: searchParams.has_valid_email === "1",
    hasPhone: searchParams.has_phone === "1",
    hasLinkedin: searchParams.has_linkedin === "1",
    owner: parseOwnerFilter(searchParams.owner),
    page,
    pageSize,
    sort,
    dir,
  };
  const [{ rows, total }, options, stageCounts] = await Promise.all([
    getDelegates(filters),
    getFilterOptions(),
    getStageCounts(filters),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // Filter-only querystring — the base a detail page links back to and that the
  // list's sort/page controls extend.
  const qs = new URLSearchParams();
  for (const k of FILTER_KEYS) {
    if (searchParams[k]) qs.set(k, searchParams[k] as string);
  }
  const filterQs = qs.toString();
  const anyFilter = FILTER_KEYS.some((k) => !!searchParams[k]);
  const extraCount = [
    searchParams.has_valid_email,
    searchParams.has_phone,
    searchParams.has_linkedin,
  ].filter((v) => v === "1").length;
  // Brand / edition / has_* filters in force — the phone shell's "Filters (n)".
  const activeFilterCount = extraCount + (searchParams.brand ? 1 : 0) + (searchParams.edition ? 1 : 0) + (searchParams.owner ? 1 : 0);

  // Same view without the search term (the removable "q" chip's target).
  const withoutQ = new URLSearchParams(filterQs);
  withoutQ.delete("q");
  if (searchParams.sort) withoutQ.set("sort", searchParams.sort);
  if (searchParams.dir) withoutQ.set("dir", searchParams.dir);
  if (searchParams.pageSize) withoutQ.set("pageSize", searchParams.pageSize);
  const withoutQHref = `/delegates${withoutQ.toString() ? `?${withoutQ.toString()}` : ""}`;

  // What the typeahead's "open delegate" should come back to (filters + sort + page).
  const returnQs = (() => {
    const p = new URLSearchParams(filterQs);
    p.set("page", String(page)); p.set("sort", sort); p.set("dir", dir);
    if (pageSize !== DEFAULT_PAGE_SIZE) p.set("pageSize", String(pageSize));
    return p.toString();
  })();

  const upcoming = options.editionOptions.filter((o) => o.upcoming);
  const past = options.editionOptions.filter((o) => !o.upcoming);

  return (
    <Shell user={user}>
      <div className="page-head">
        <Breadcrumb
          items={[
            { label: "Home", href: "/dashboard" },
            { label: "Delegates", href: "/delegates" },
            // Only real filters become crumbs — an unfiltered view used to end on
            // a bare "All", which read as the page's name.
            ...(searchParams.edition
              ? [{ label: searchParams.edition, href: `/delegates?edition=${encodeURIComponent(searchParams.edition)}` }]
              : []),
            ...(searchParams.status ? [{ label: stageLabel(searchParams.status) }] : []),
          ]}
        />
        <div className="page-head-aside">
          {q && (
            <Link href={withoutQHref} className="chip chip-filter" title="Remove search filter" aria-label={`Remove search filter “${q}”`}>
              “{q}” <span aria-hidden="true">×</span>
            </Link>
          )}
          <span style={{ fontSize: 13, color: "var(--muted)", whiteSpace: "nowrap" }}>
            <strong style={{ color: "var(--text)", fontSize: 15 }}>{total.toLocaleString()}</strong> delegate{total === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <form
        method="get"
        className="card section flt"
        style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}
        role="search"
        aria-label="Filter delegates"
      >
        {/* Sort / page size survive Apply; page resets to 1 by omission. */}
        <input type="hidden" name="sort" value={sort} />
        <input type="hidden" name="dir" value={dir} />
        {pageSize !== DEFAULT_PAGE_SIZE && <input type="hidden" name="pageSize" value={pageSize} />}
        {searchParams.status && <input type="hidden" name="status" value={searchParams.status} />}

        {/* ONE DOM, two layouts (see FiltersSheet + globals.css .flt-*):
            desktop = row 1 selects/More/Apply/Reset + row 2 search/exports;
            phone   = sticky [search][Filters (n)] row + bottom sheet. */}
        <FiltersSheet
          activeCount={activeFilterCount}
          extraCount={extraCount}
          showReset={anyFilter}
          resetHref="/delegates"
          search={<DelegateSearch initialQ={q ?? ""} returnQs={returnQs} />}
          exportButtons={<ExportButtons filterQs={filterQs} count={total} />}
          extras={
            <>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, margin: 0 }}>
                <input type="checkbox" name="has_valid_email" value="1" defaultChecked={searchParams.has_valid_email === "1"} style={{ width: "auto" }} /> Has valid email
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, margin: 0 }}>
                <input type="checkbox" name="has_phone" value="1" defaultChecked={searchParams.has_phone === "1"} style={{ width: "auto" }} /> Has phone
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, margin: 0 }}>
                <input type="checkbox" name="has_linkedin" value="1" defaultChecked={searchParams.has_linkedin === "1"} style={{ width: "auto" }} /> Has LinkedIn
              </label>
            </>
          }
        >
          <select name="brand" defaultValue={searchParams.brand ?? ""} style={{ flex: 1, minWidth: 0 }} aria-label="Brand">
            <option value="">All events</option>
            {options.brands.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <select name="edition" defaultValue={searchParams.edition ?? ""} style={{ flex: 1, minWidth: 0 }} aria-label="Edition">
            <option value="">All editions</option>
            {upcoming.length > 0 && (
              <optgroup label="Upcoming">
                {upcoming.map((e) => (
                  <option key={e.name} value={e.name}>{e.name}</option>
                ))}
              </optgroup>
            )}
            {past.length > 0 && (
              <optgroup label={upcoming.length > 0 ? "Past / other" : "Editions"}>
                {past.map((e) => (
                  <option key={e.name} value={e.name}>{e.name}</option>
                ))}
              </optgroup>
            )}
          </select>
          <select name="owner" defaultValue={searchParams.owner ?? ""} style={{ flex: 1, minWidth: 0 }} aria-label="Owner">
            <option value="">Anyone</option>
            {ownerOptions().map((o) => (
              <option key={o.email} value={o.email}>{o.name}</option>
            ))}
            <option value={OWNER_UNASSIGNED}>Unassigned</option>
          </select>
        </FiltersSheet>
      </form>

      {/* Stage tabs — per edition, or aggregate counts in the all-editions view */}
      <StageTabs counts={stageCounts} current={searchParams.status} searchParams={searchParams} />

      <DelegatesList
        rows={rows.map((r) => ({
          id: r.id,
          name: r.contact?.full_name_clean ?? "—",
          photo: r.contact?.profile_image_url ?? null,
          photoSeed: r.contact?.id ?? r.id,
          job_title: r.contact?.job_title ?? "—",
          company: companyDisplay(r.contact?.company?.name ?? r.contact?.company_name_submitted) ?? "—",
          edition: r.event_edition ?? "—",
          stage: (r.stage ?? "identified").toLowerCase(),
          stageLabel: stageLabel(r.stage),
          stageClass: stageBadgeClass(r.stage),
          email: r.contact?.email ?? null,
          phone: formatPhone(bestPhone(r.contact)),
          linkedin: r.contact?.linkedin_url_canonical ?? null,
          owner: ownerFirstName(r.owner_email) ?? null,
        }))}
        filterQs={filterQs}
        hasFilters={anyFilter}
        page={page}
        pageCount={pageCount}
        pageSize={pageSize}
        total={total}
        sort={sort}
        dir={dir}
      />
    </Shell>
  );
}
