// Role change for a summit edition — the delegates-app half.
//
//   Delegate → Speaker: insert a `speakers` row (same contact/event/brand/
//     edition, stage 'identified', owner carried over), hard-delete the delegate
//     row, keep contacts.participant_type in step, log kind 'role'. The person
//     now lives in the SPEAKERS app, so the result carries an absolute URL.
//
// Semantics mirror roundtables-app lib/roleMove.ts (locked with Syed
// 2026-08-23): hard delete of the source row; the reverse move lives in the
// speakers app.
import { supabaseAdmin } from "./supabaseAdmin";
import type { AppUser } from "./session";
import { getDelegate, isMissingColumnError } from "./data";
import { canEdit, NO_ACCESS_MSG } from "./policy";
import { logChange } from "./changes";
import { SPEAKERS_APP_URL } from "./siblingApps";

export type RoleMoveResult =
  | { ok: true; targetId: string; targetHref: string; crossApp: true; name: string | null; message: string }
  | { ok: false; message: string };

export async function moveDelegateToSpeaker(user: AppUser, delegateId: string): Promise<RoleMoveResult> {
  const src = await getDelegate(delegateId);
  if (!src) return { ok: false, message: "That record no longer exists." };
  if (!canEdit(user, { eventId: src.event_id, edition: src.event_edition })) return { ok: false, message: NO_ACCESS_MSG };
  const contactId: string | null = (src.contact?.id as string) ?? null;
  if (!contactId || !src.event_id) return { ok: false, message: "This row has no contact or event — can’t move it." };
  const name: string | null = (src.contact?.full_name_clean as string) ?? null;
  const sb = supabaseAdmin();

  const { data: existing, error: exErr } = await sb
    .from("speakers").select("id").eq("contact_id", contactId).eq("event_id", src.event_id).maybeSingle();
  if (exErr) return { ok: false, message: exErr.message };

  let targetId: string;
  let existed = false;
  if (existing?.id) {
    targetId = (existing as { id: string }).id;
    existed = true;
  } else {
    const now = new Date().toISOString();
    const baseRow: Record<string, unknown> = {
      contact_id: contactId, company_id: (src.contact as any)?.company_id ?? null,
      event_id: src.event_id, event_brand: src.event_brand, event_edition: src.event_edition,
      stage: "identified", stage_updated_at: now, source: "manual",
    };
    const ownerRow = (src as any).owner_email
      ? { owner_email: (src as any).owner_email, owner_assigned_at: (src as any).owner_assigned_at ?? now, owner_assigned_by: (src as any).owner_assigned_by ?? user.email }
      : {};
    let ins = await sb.from("speakers").insert({ ...baseRow, ...ownerRow }).select("id").single();
    if (ins.error && Object.keys(ownerRow).length && isMissingColumnError(ins.error, "owner")) {
      ins = await sb.from("speakers").insert(baseRow).select("id").single();
    }
    if (ins.error || !ins.data) return { ok: false, message: ins.error?.message ?? "Insert failed" };
    targetId = (ins.data as { id: string }).id;
  }

  // Hard delete the seat (the mig-224 trigger would otherwise only park it —
  // parked seats are for people who still hold a seat conceptually; a role
  // CHANGE is a move, so the seat goes, matching roundtables).
  const { error: delErr } = await sb.from("delegates").delete().eq("id", delegateId);
  if (delErr) return { ok: false, message: `Moved, but couldn’t remove the delegate row: ${delErr.message}` };
  await sb.from("contacts").update({ participant_type: "Speaker" }).eq("id", contactId);
  await logChange(user, {
    contact_id: contactId, delegate_id: delegateId, speaker_id: targetId, event_id: src.event_id, event_edition: src.event_edition,
    kind: "role", field: "participant_type", current_value: "Delegate", proposed_value: "Speaker",
  });

  const who = name ?? "Contact";
  return {
    ok: true, targetId, targetHref: `${SPEAKERS_APP_URL}/speakers/${targetId}`, crossApp: true, name,
    message: existed
      ? `${who} already had a speaker record on this edition — the delegate seat was removed; the record is in the Speakers app.`
      : `${who} is now a Speaker — their record has moved to the Speakers app.`,
  };
}
