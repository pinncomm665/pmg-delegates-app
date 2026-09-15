import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// ════════════════════════════════════════════════════════════════════════════
// UNIVERSAL ADD CONTACT — MASTER COPY. Identical in the delegates, speakers
// and roundtables apps; change one, copy it to the other two.
//
// GET ?brand=<brand> → { events: [{ id, name, client_roundtable }] } for the
// Add Contact Edition select.
//
//   · Summit brands (10DX / VERIFY / 4WARD): that brand's editions, minus its
//     roundtables (they are listed under PMG Roundtables, never twice).
//   · PMG Roundtables: every roundtable, whichever brand the registry files it
//     under (the intake server accepts a roundtable edition under the "PMG
//     Roundtables" umbrella). The brand-level portfolio row is NOT offered here
//     — it is where sponsor prospecting lives, which is the sales app's job.
//   · Active and not yet run (dateless rows kept — we cannot prove they ran).
//     Alphabetical: a picker is scanned by name (Syed, 2026-09-04).
//   · A user stamped with app_metadata.rt_markets sees only the roundtables
//     in those markets — the same substring rule the roundtables app uses
//     everywhere. Admins and unstamped users see every roundtable. Summit
//     editions are never narrowed.
// ════════════════════════════════════════════════════════════════════════════

const BRANDS = ["10DX", "VERIFY", "4WARD", "PMG Roundtables"];
const PORTFOLIO_EDITION = "PMG Roundtables";

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
  const brand = new URL(request.url).searchParams.get("brand") ?? "";
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
  if (brand !== "PMG Roundtables") query = query.eq("brand", brand);

  const { data, error } = await query;
  if (error) return NextResponse.json({ events: [], error: "load_failed" });

  let rows = ((data ?? []) as Row[]).filter((r) => (r.edition_name ?? "").trim() !== "");
  rows =
    brand === "PMG Roundtables"
      ? rows.filter((r) => isRoundtable(r) && r.edition_name !== PORTFOLIO_EDITION)
      : rows.filter((r) => !isRoundtable(r));

  if (brand === "PMG Roundtables") {
    const { data: authUser } = await sb.auth.admin.getUserById(user.id);
    const markets = parseMarkets(authUser?.user?.app_metadata, authUser?.user?.user_metadata);
    if (markets) rows = rows.filter((r) => markets.some((m) => (r.edition_name ?? "").toLowerCase().includes(m)));
  }

  return NextResponse.json({
    events: rows.map((r) => ({
      id: r.id,
      name: r.edition_name,
      // pmg-agent lib/events/sponsor-eligibility isClientRoundtable
      client_roundtable: (r.format ?? "").trim().toLowerCase() === "roundtable" && r.edition_name !== PORTFOLIO_EDITION,
    })),
  });
}
