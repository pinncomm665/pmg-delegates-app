import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// ════════════════════════════════════════════════════════════════════════════
// UNIVERSAL ADD CONTACT — MASTER COPY. Identical in the delegates, speakers,
// roundtables AND sales apps; change one, copy it to the other three.
//
// GET ?brand=<brand> → { events: [{ id, name, client_roundtable }] } for the
// Add Contact Edition select.
//
//   · Summit brands (10DX / VERIFY / 4WARD): that brand's editions, minus its
//     roundtables (they are listed under PeerRoom, never twice).
//   · PeerRoom (renamed from "PMG Roundtables" on 2026-09-22): every
//     roundtable, whichever brand the registry files it under (the intake
//     server accepts a roundtable edition under the PeerRoom umbrella). A
//     legacy ?brand=PMG Roundtables (stale form bundle) is read as PeerRoom.
//     The brand-level portfolio row is never offered:
//     it was a bucket for roundtable sponsor prospects, and no individual is
//     recorded as a sponsor on a roundtable (Syed, clarified 2026-09-19):
//     participants are delegates/speakers; company-level roundtable
//     sponsorship is a deal. People go on a real roundtable.
//   · Active and not yet run (dateless rows kept — we cannot prove they ran).
//     Alphabetical: a picker is scanned by name (Syed, 2026-09-04).
//   · A user stamped with app_metadata.rt_markets sees only the roundtables
//     in those markets — the same substring rule the roundtables app uses
//     everywhere. Admins and unstamped users see every roundtable. Summit
//     editions are never narrowed.
// ════════════════════════════════════════════════════════════════════════════

const ROUNDTABLE_BRAND = "PeerRoom";
const BRANDS = ["10DX", "VERIFY", "4WARD", ROUNDTABLE_BRAND];
// The standing holding edition (ca27bd35-0993-442c-9b47-bc84a2f39991) — its
// edition_name is "PeerRoom" after the rename, "PMG Roundtables" before it.
const PORTFOLIO_EVENT_ID = "ca27bd35-0993-442c-9b47-bc84a2f39991";
const PORTFOLIO_EDITIONS = ["PeerRoom", "PMG Roundtables"];
const isPortfolio = (r: { id: string; edition_name: string | null }) =>
  r.id === PORTFOLIO_EVENT_ID || PORTFOLIO_EDITIONS.includes(r.edition_name ?? "");
const canonBrand = (b: string) => (/^pmg roundtables?$/i.test(b.trim()) ? ROUNDTABLE_BRAND : b);

type Row = { id: string; brand: string | null; edition_name: string | null; format: string | null };

const isRoundtable = (r: Row) =>
  (r.format ?? "").toLowerCase().includes("roundtable") || (r.edition_name ?? "").toLowerCase().includes("roundtable");

// Same parse as the roundtables app's lib/session parseMarkets.
function parseMarkets(appMeta: any, userMeta: any): string[] | null {
  const role = appMeta?.role || userMeta?.role || "";
  if (role === "admin") return null;
  const raw = appMeta?.rt_markets;
  if (!Array.isArray(raw)) return null;
  const markets = raw.map((m) => String(m).toLowerCase().replace(/[^a-z0-9 ]/g, "").trim()).filter(Boolean);
  return markets.length ? markets : null;
}

export async function GET(request: NextRequest) {
  const user = await requireUser();
  const brand = canonBrand(new URL(request.url).searchParams.get("brand") ?? "");
  if (!BRANDS.includes(brand)) return NextResponse.json({ events: [] });

  const sb = supabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);
  let query = sb
    .from("events")
    .select("id, brand, edition_name, format")
    .eq("is_active", true)
    .not("edition_name", "is", null)
    .or(`event_date_start.gte.${today},event_date_start.is.null`)
    .order("edition_name", { ascending: true });
  if (brand !== ROUNDTABLE_BRAND) query = query.eq("brand", brand);

  const { data, error } = await query;
  if (error) return NextResponse.json({ events: [], error: "load_failed" });

  let rows = ((data ?? []) as Row[]).filter((r) => (r.edition_name ?? "").trim() !== "");
  rows =
    brand === ROUNDTABLE_BRAND
      ? rows.filter((r) => isRoundtable(r) && !isPortfolio(r))
      : rows.filter((r) => !isRoundtable(r));

  if (brand === ROUNDTABLE_BRAND) {
    const { data: authUser } = await sb.auth.admin.getUserById(user.id);
    const markets = parseMarkets(authUser?.user?.app_metadata, authUser?.user?.user_metadata);
    if (markets) rows = rows.filter((r) => markets.some((m) => (r.edition_name ?? "").toLowerCase().includes(m)));
  }

  return NextResponse.json({
    events: rows.map((r) => ({
      id: r.id,
      name: r.edition_name,
      // pmg-agent lib/events/sponsor-eligibility isClientRoundtable
      client_roundtable: (r.format ?? "").trim().toLowerCase() === "roundtable" && !isPortfolio(r),
    })),
  });
}
