import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const STAGE_VALUES = ["identified", "invited", "registered", "confirmed", "attended", "cancelled", "declined", "no_show"];

// Stage → lifecycle timestamp column stamped when a delegate enters that stage.
const STAGE_STAMP: Record<string, string> = {
  invited: "invited_at",
  registered: "registered_at",
  confirmed: "confirmed_at",
  attended: "attended_at",
  cancelled: "cancelled_at",
};

// POST { delegate_id, stage } → update a delegate's stage inline from the table.
export async function POST(request: NextRequest) {
  await requireUser();
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const delegateId = String(body?.delegate_id ?? "");
  const stage = String(body?.stage ?? "").toLowerCase();
  if (!delegateId || !STAGE_VALUES.includes(stage)) {
    return NextResponse.json({ error: "delegate_id and a valid stage required" }, { status: 400 });
  }
  const sb = supabaseAdmin();
  const update: Record<string, unknown> = {
    stage,
    stage_updated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const stampCol = STAGE_STAMP[stage];
  if (stampCol) update[stampCol] = new Date().toISOString();
  const { error } = await sb.from("delegates").update(update).eq("id", delegateId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, stage });
}
