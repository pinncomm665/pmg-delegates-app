import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// GET ?brand=FraudSense  → returns active events for the given brand, upcoming first.
// Used by the Add Contact form to populate the Edition select.
export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json([], { status: 401 });

  const brand = (req.nextUrl.searchParams.get("brand") ?? "").trim();
  if (!brand) return NextResponse.json([], { status: 200 });

  // PMG Roundtables uses a holding edition — skip the registry lookup.
  if (brand === "PMG Roundtables") return NextResponse.json([], { status: 200 });

  const sb = supabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await sb
    .from("events")
    .select("id, edition_name, event_date_start")
    .eq("brand", brand)
    .eq("is_active", true)
    .not("edition_name", "is", null)
    .gte("event_date_start", today)
    .order("event_date_start", { ascending: true })
    .limit(50);

  if (error) return NextResponse.json([], { status: 200 });

  const rows = (data ?? []).map((e: any) => ({
    id: e.id as string,
    edition_name: e.edition_name as string,
    event_date_start: e.event_date_start as string,
  }));

  return NextResponse.json(rows);
}
