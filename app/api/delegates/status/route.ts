import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { supabaseAdmin } from "@pmg/team-ui/lib/supabaseAdmin";
import { getDelegate, STAGE_VALUES } from "@/lib/data";
import { canEdit, stageChangeNeedsReview, NO_ACCESS_MSG } from "@/lib/policy";
import { logChange, isRateGuarded, RATE_GUARD_MSG } from "@/lib/changes";

export const dynamic = "force-dynamic";

// Stage → lifecycle timestamp column stamped when a delegate enters that stage.
const STAGE_STAMP: Record<string, string> = {
  invited: "invited_at",
  applied: "applied_at",
  registered: "registered_at",
  confirmed: "confirmed_at",
  attended: "attended_at",
  cancelled: "cancelled_at",
  declined: "declined_at",
};

// POST { delegate_id, stage } → update a delegate's stage inline from the table.
// Same tier policy as the detail-page action: scope gate, secured-stage reverts
// queue for a reviewer, rate guard, and every applied change is logged to
// contact_change_requests (the toast's Undo calls this again with the previous
// stage, which naturally writes the reverse row).
// Response: { ok, stage, queued?, message? } — `queued` means nothing changed yet.
export async function POST(request: NextRequest) {
  const user = await requireUser();
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const delegateId = String(body?.delegate_id ?? "");
  const stage = String(body?.stage ?? "").toLowerCase();
  if (!delegateId || !STAGE_VALUES.includes(stage)) {
    return NextResponse.json({ error: "delegate_id and a valid stage required" }, { status: 400 });
  }
  const d = await getDelegate(delegateId);
  if (!d) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!canEdit(user, { eventId: d.event_id, edition: d.event_edition })) {
    return NextResponse.json({ error: NO_ACCESS_MSG }, { status: 403 });
  }
  const prev = (d.stage ?? "identified").toLowerCase();
  if (prev === stage) return NextResponse.json({ ok: true, stage, message: "Unchanged" });

  const entry = {
    contact_id: (d.contact?.id as string) ?? null,
    delegate_id: d.id,
    event_id: d.event_id,
    event_edition: d.event_edition,
    kind: "stage" as const,
    field: "stage",
    current_value: prev,
    proposed_value: stage,
  };

  if (stageChangeNeedsReview(user, prev, stage)) {
    const err = await logChange(user, { ...entry, kind: "stage_revert" }, "pending");
    if (err) return NextResponse.json({ error: err }, { status: 500 });
    return NextResponse.json({ ok: true, stage: prev, queued: true, message: "Moving out of a secured stage needs a reviewer — queued for review" });
  }
  if (await isRateGuarded(user)) {
    await logChange(user, entry, "pending");
    return NextResponse.json({ ok: true, stage: prev, queued: true, message: RATE_GUARD_MSG });
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
  await logChange(user, entry);
  return NextResponse.json({ ok: true, stage, previous: prev });
}
