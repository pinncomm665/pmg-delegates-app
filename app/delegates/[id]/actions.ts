"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, requireAdmin } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyEmail } from "@/lib/millionverifier";
import { getDelegate, STAGE_VALUES } from "@/lib/data";

async function loadContext(delegateId: string) {
  const d = await getDelegate(delegateId);
  if (!d) redirect("/delegates");
  return d;
}

function flash(delegateId: string, kind: "ok" | "warn", msg: string, ret = "") {
  const r = ret ? `&return=${encodeURIComponent(ret)}` : "";
  redirect(
    `/delegates/${delegateId}?flash=${kind}&msg=${encodeURIComponent(msg)}${r}`
  );
}

// Stage → lifecycle timestamp column stamped when a delegate enters that stage.
const STAGE_STAMP: Record<string, string> = {
  invited: "invited_at",
  registered: "registered_at",
  confirmed: "confirmed_at",
  attended: "attended_at",
  cancelled: "cancelled_at",
};

export async function updateStatus(formData: FormData) {
  await requireUser();
  const delegateId = String(formData.get("delegateId"));
  const ret = String(formData.get("return") ?? "");
  const stage = String(formData.get("stage")).toLowerCase();
  if (!STAGE_VALUES.includes(stage)) flash(delegateId, "warn", "Invalid status", ret);
  const sb = supabaseAdmin();
  const update: Record<string, unknown> = {
    stage,
    stage_updated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const stampCol = STAGE_STAMP[stage];
  if (stampCol) update[stampCol] = new Date().toISOString();
  await sb.from("delegates").update(update).eq("id", delegateId);
  revalidatePath(`/delegates/${delegateId}`);
  flash(delegateId, "ok", "Status updated", ret);
}

export async function submitEmail(formData: FormData) {
  const user = await requireUser();
  const delegateId = String(formData.get("delegateId"));
  const ret = String(formData.get("return") ?? "");
  const newEmail = String(formData.get("newEmail") || "").trim().toLowerCase();
  if (!newEmail.includes("@")) flash(delegateId, "warn", "Enter a valid email", ret);
  const d = await loadContext(delegateId);
  const contactId = d.contact?.id as string;
  const oldEmail = d.contact?.email ?? null;
  const sb = supabaseAdmin();

  const mv = await verifyEmail(newEmail);
  const base = {
    contact_id: contactId,
    delegate_id: delegateId,
    event_id: d.event_id,
    event_edition: d.event_edition,
    kind: "email" as const,
    field: "email",
    current_value: oldEmail,
    proposed_value: newEmail,
    mv_result: mv.result,
    submitted_by: user.id,
    submitted_by_email: user.email,
  };

  if (mv.valid) {
    // append 'email' to user_managed_fields
    const managed: string[] = Array.isArray(d.contact?.user_managed_fields)
      ? d.contact.user_managed_fields
      : [];
    if (!managed.includes("email")) managed.push("email");
    await sb
      .from("contacts")
      .update({
        email: newEmail,
        email_source: "user_submitted",
        email_mv_result: mv.result,
        email_mv_verified_at: new Date().toISOString(),
        user_managed_fields: managed,
      })
      .eq("id", contactId);
    await sb.from("contact_change_requests").insert({
      ...base,
      status: "auto_applied",
      reviewed_at: new Date().toISOString(),
    });
    revalidatePath(`/delegates/${delegateId}`);
    flash(delegateId, "ok", "Email verified and updated", ret);
  } else {
    await sb
      .from("contact_change_requests")
      .insert({ ...base, status: "pending" });
    flash(
      delegateId,
      "warn",
      `Email found ${mv.result}. Queued for review.`,
      ret
    );
  }
}

export async function addOtherPhone(formData: FormData) {
  const user = await requireUser();
  const delegateId = String(formData.get("delegateId"));
  const ret = String(formData.get("return") ?? "");
  const newPhone = String(formData.get("newPhone") || "").trim();
  if (newPhone.length < 5) flash(delegateId, "warn", "Enter a valid phone", ret);
  const d = await loadContext(delegateId);
  const contactId = d.contact?.id as string;
  const sb = supabaseAdmin();

  const managed: string[] = Array.isArray(d.contact?.user_managed_fields)
    ? d.contact.user_managed_fields
    : [];
  if (!managed.includes("other_phone")) managed.push("other_phone");

  // additive: never overwrite original phone/mobile
  await sb
    .from("contacts")
    .update({
      other_phone: newPhone,
      other_phone_source: "user_managed",
      user_managed_fields: managed,
    })
    .eq("id", contactId);
  await sb.from("contact_change_requests").insert({
    contact_id: contactId,
    delegate_id: delegateId,
    event_id: d.event_id,
    event_edition: d.event_edition,
    kind: "phone",
    field: "other_phone",
    current_value: d.contact?.other_phone ?? null,
    proposed_value: newPhone,
    status: "auto_applied",
    submitted_by: user.id,
    submitted_by_email: user.email,
    reviewed_at: new Date().toISOString(),
  });
  revalidatePath(`/delegates/${delegateId}`);
  flash(delegateId, "ok", "Added to Other phone", ret);
}

export async function removeDelegate(formData: FormData) {
  await requireAdmin();
  const delegateId = String(formData.get("delegateId"));
  const ret = String(formData.get("return") ?? "");
  const d = await getDelegate(delegateId);
  if (!d) redirect("/delegates");
  const secured = ["registered", "confirmed", "attended"];
  if (secured.includes((d.stage ?? "").toLowerCase())) {
    flash(
      delegateId,
      "warn",
      "Can't remove a secured delegate (registered/confirmed/attended) — change the status instead.",
      ret
    );
  }
  const sb = supabaseAdmin();
  await sb.from("delegates").delete().eq("id", delegateId);
  redirect(ret ? `/delegates?${ret}` : "/delegates");
}

export async function updateCompany(delegateId: string, companyId: string) {
  await requireUser();
  const d = await loadContext(delegateId);
  const sb = supabaseAdmin();
  await sb
    .from("contacts")
    .update({ company_id: companyId })
    .eq("id", d.contact?.id);
  revalidatePath(`/delegates/${delegateId}`);
}

export async function updateRegistration(formData: FormData) {
  await requireUser();
  const delegateId = String(formData.get("delegateId"));
  const ret = String(formData.get("return") ?? "");

  const bool = (k: string) => formData.get(k) === "on";
  const text = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v === "" ? null : v;
  };
  const date = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v === "" ? null : v;
  };
  const num = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    if (v === "") return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  };

  const invoiceSent = bool("invoice_sent");
  const paymentReceived = bool("payment_received");
  const sb = supabaseAdmin();

  // Only stamp *_at when the flag flips on and isn't already stamped.
  const { data: prev } = await sb
    .from("delegates")
    .select("invoice_sent, invoice_sent_at, payment_received, payment_received_at")
    .eq("id", delegateId)
    .maybeSingle();

  const update: Record<string, unknown> = {
    ticket_type: text("ticket_type"),
    delegate_type: text("delegate_type"),
    registration_date: date("registration_date"),
    badge_name: text("badge_name"),
    seating_assignment: text("seating_assignment"),
    dietary_requirements: text("dietary_requirements"),
    special_access: text("special_access"),
    payment_amount: num("payment_amount"),
    complimentary: bool("complimentary"),
    complimentary_reason: text("complimentary_reason"),
    notes: text("notes"),
    invoice_sent: invoiceSent,
    payment_received: paymentReceived,
    updated_at: new Date().toISOString(),
  };
  if (invoiceSent && !prev?.invoice_sent) update.invoice_sent_at = new Date().toISOString();
  else if (!invoiceSent) update.invoice_sent_at = null;
  if (paymentReceived && !prev?.payment_received) update.payment_received_at = new Date().toISOString();
  else if (!paymentReceived) update.payment_received_at = null;

  await sb.from("delegates").update(update).eq("id", delegateId);
  revalidatePath(`/delegates/${delegateId}`);
  flash(delegateId, "ok", "Registration saved", ret);
}

// On-demand: queue a delegate (summit attend-value) profile → contact_profiles.
export async function generateBrief(formData: FormData) {
  await requireUser();
  const delegateId = String(formData.get("delegateId"));
  const ret = String(formData.get("return") ?? "");
  const d = await loadContext(delegateId);
  const contactId = d.contact?.id as string;
  const eventId = d.event_id ?? null;
  const sb = supabaseAdmin();

  let sel = sb.from("contact_profiles").select("id").eq("contact_id", contactId).eq("kind", "delegate");
  sel = eventId ? sel.eq("event_id", eventId) : sel.is("event_id", null);
  const { data: row } = await sel.maybeSingle();
  if (row?.id) {
    await sb.from("contact_profiles").update({ status: "pending", updated_at: new Date().toISOString() }).eq("id", (row as any).id);
  } else {
    await sb.from("contact_profiles").insert({ contact_id: contactId, kind: "delegate", event_id: eventId, status: "pending" });
  }
  await sb.from("jobs").insert({
    type: "profile_research", status: "queued", contact_id: contactId,
    payload: { contact_id: contactId, kind: "delegate", event_id: eventId }, attempts: 0, max_attempts: 3,
  });
  flash(delegateId, "ok", "Background research queued — refresh in ~1 minute", ret);
}

export async function flagRole(formData: FormData) {
  const user = await requireUser();
  const delegateId = String(formData.get("delegateId"));
  const ret = String(formData.get("return") ?? "");
  const newTitle = String(formData.get("newTitle") || "").trim();
  const newCompany = String(formData.get("newCompany") || "").trim();
  if (!newTitle && !newCompany)
    flash(delegateId, "warn", "Enter a new title or company", ret);
  const d = await loadContext(delegateId);
  const sb = supabaseAdmin();
  await sb.from("contact_change_requests").insert({
    contact_id: d.contact?.id,
    delegate_id: delegateId,
    event_id: d.event_id,
    event_edition: d.event_edition,
    kind: "role",
    field: "job_title/company",
    current_value: d.contact?.job_title ?? null,
    proposed_value: newTitle || null,
    proposed_company: newCompany || null,
    status: "pending",
    submitted_by: user.id,
    submitted_by_email: user.email,
  });
  flash(delegateId, "ok", "Role change submitted for review", ret);
}
