"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, requireAdmin, isReviewer, type AppUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyEmail } from "@/lib/millionverifier";
import { getDelegate, getCompanyById, STAGE_VALUES, type DelegateRow } from "@/lib/data";
import { canEdit, stageChangeNeedsReview, emailDomainMatches, SECURED_STAGES, NO_ACCESS_MSG } from "@/lib/policy";
import { logChange, isRateGuarded, RATE_GUARD_MSG } from "@/lib/changes";
import { companyDisplay } from "@/lib/company";
import { canonicalizeLinkedinUrl, fullNameFrom, type FieldWriteResult } from "@/lib/contactFields";
import { normalizePhone } from "@/lib/phone";
import { titleCaseJobTitle, properCaseName, normalizeEmail } from "@/lib/textCase";
import { cleanNameFields } from "@/lib/nameClean";

async function loadContext(delegateId: string) {
  const d = await getDelegate(delegateId);
  if (!d) redirect("/delegates");
  return d;
}

function flash(delegateId: string, kind: "ok" | "warn", msg: string, ret = "", tab = "") {
  const r = ret ? `&return=${encodeURIComponent(ret)}` : "";
  const t = tab ? `&tab=${tab}` : "";
  redirect(
    `/delegates/${delegateId}?flash=${kind}&msg=${encodeURIComponent(msg)}${r}${t}`
  );
}

// Scope gate (lib/policy canEdit): users with app_metadata.editions may only
// write on rows in those editions. Flashes and stops when denied.
function guard(user: AppUser, d: DelegateRow, ret: string, tab = "") {
  if (!canEdit(user, { eventId: d.event_id, edition: d.event_edition })) {
    flash(d.id, "warn", NO_ACCESS_MSG, ret, tab);
  }
}

function base(d: DelegateRow) {
  return {
    contact_id: (d.contact?.id as string) ?? null,
    delegate_id: d.id,
    event_id: d.event_id,
    event_edition: d.event_edition,
  };
}

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

export async function updateStatus(formData: FormData) {
  const user = await requireUser();
  const delegateId = String(formData.get("delegateId"));
  const ret = String(formData.get("return") ?? "");
  const stage = String(formData.get("stage")).toLowerCase();
  if (!STAGE_VALUES.includes(stage)) flash(delegateId, "warn", "Invalid status", ret, "registration");
  const d = await loadContext(delegateId);
  guard(user, d, ret, "registration");
  const prev = (d.stage ?? "identified").toLowerCase();
  if (prev === stage) flash(delegateId, "ok", "Status unchanged", ret, "registration");

  const entry = { ...base(d), kind: "stage" as const, field: "stage", current_value: prev, proposed_value: stage };

  // Tier B: moving OUT of a secured stage needs a reviewer.
  if (stageChangeNeedsReview(user, prev, stage)) {
    const err = await logChange(user, { ...entry, kind: "stage_revert" }, "pending");
    if (err) flash(delegateId, "warn", `Couldn’t queue the change: ${err}`, ret, "registration");
    flash(delegateId, "warn", "Moving out of a secured stage needs a reviewer — queued for review", ret, "registration");
  }
  if (await isRateGuarded(user)) {
    await logChange(user, entry, "pending");
    flash(delegateId, "warn", RATE_GUARD_MSG, ret, "registration");
  }

  const sb = supabaseAdmin();
  const update: Record<string, unknown> = {
    stage,
    stage_updated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const stampCol = STAGE_STAMP[stage];
  if (stampCol) update[stampCol] = new Date().toISOString();
  await sb.from("delegates").update(update).eq("id", delegateId);
  await logChange(user, entry);
  revalidatePath(`/delegates/${delegateId}`);
  flash(delegateId, "ok", "Status updated", ret, "registration");
}

// Admin-only hard delete of the role row. Typed confirmation ("REMOVE") is
// required — the UI dialog collects it, the server re-checks it.
export async function removeDelegate(formData: FormData) {
  await requireAdmin();
  const delegateId = String(formData.get("delegateId"));
  const ret = String(formData.get("return") ?? "");
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== "REMOVE") {
    flash(delegateId, "warn", "Type REMOVE to confirm removal", ret, "registration");
  }
  const d = await getDelegate(delegateId);
  if (!d) redirect("/delegates");
  if (SECURED_STAGES.includes((d.stage ?? "").toLowerCase())) {
    flash(
      delegateId,
      "warn",
      "Can't remove a secured delegate (registered/confirmed/attended) — change the status instead.",
      ret,
      "registration"
    );
  }
  const sb = supabaseAdmin();
  await sb.from("delegates").delete().eq("id", delegateId);
  redirect(ret ? (ret.startsWith("/") ? ret : `/delegates?${ret}`) : "/delegates");
}

export type CompanyWriteResult = { ok: boolean; queued?: boolean; message: string };

// Tier B: re-link the contact to an EXISTING company (the UI shows a confirm
// card first). Applied + logged; queued under the rate guard.
export async function updateCompany(delegateId: string, companyId: string): Promise<CompanyWriteResult> {
  const user = await requireUser();
  const d = await loadContext(delegateId);
  if (!canEdit(user, { eventId: d.event_id, edition: d.event_edition })) {
    return { ok: false, message: NO_ACCESS_MSG };
  }
  const target = await getCompanyById(companyId);
  if (!target) return { ok: false, message: "That company no longer exists in the CRM." };
  const oldName = companyDisplay(d.contact?.company?.name ?? d.contact?.company_name_submitted) ?? null;
  const entry = {
    ...base(d),
    kind: "company" as const,
    field: "company_id",
    current_value: oldName,
    proposed_value: companyId,
    proposed_company: target.name,
  };
  if (await isRateGuarded(user)) {
    await logChange(user, entry, "pending");
    return { ok: true, queued: true, message: RATE_GUARD_MSG };
  }
  const sb = supabaseAdmin();
  const { error } = await sb
    .from("contacts")
    .update({ company_id: companyId })
    .eq("id", d.contact?.id);
  if (error) return { ok: false, message: error.message };
  await logChange(user, entry);
  revalidatePath(`/delegates/${delegateId}`);
  return { ok: true, message: `Company changed to ${target.name}` };
}

// Tier C: a company that isn't in the CRM yet. Never created here — filed as a
// change request (kind 'company_new') for the admin queue.
export async function requestNewCompany(delegateId: string, name: string): Promise<CompanyWriteResult> {
  const user = await requireUser();
  const clean = name.trim();
  if (clean.length < 2) return { ok: false, message: "Enter the company name." };
  const d = await loadContext(delegateId);
  if (!canEdit(user, { eventId: d.event_id, edition: d.event_edition })) {
    return { ok: false, message: NO_ACCESS_MSG };
  }
  const err = await logChange(
    user,
    {
      ...base(d),
      kind: "company_new",
      field: "company",
      current_value: companyDisplay(d.contact?.company?.name ?? d.contact?.company_name_submitted) ?? null,
      proposed_value: null,
      proposed_company: clean,
    },
    "pending"
  );
  if (err) return { ok: false, message: `Couldn’t file the request: ${err}` };
  return { ok: true, queued: true, message: "New-company request sent for review" };
}

const REG_BOOL = ["invoice_sent", "payment_received", "complimentary"] as const;
const REG_TEXT = [
  "ticket_type", "delegate_type", "registration_date", "badge_name", "seating_assignment",
  "dietary_requirements", "special_access", "complimentary_reason", "notes",
] as const;

export async function updateRegistration(formData: FormData) {
  const user = await requireUser();
  const delegateId = String(formData.get("delegateId"));
  const ret = String(formData.get("return") ?? "");
  const d = await loadContext(delegateId);
  guard(user, d, ret, "registration");

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

  // Activity log = the fields that actually changed (compact before/after).
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const cur = d as unknown as Record<string, unknown>;
  for (const k of [...REG_BOOL, ...REG_TEXT, "payment_amount"]) {
    const a = cur[k] ?? null;
    const b = update[k] ?? null;
    const same = (REG_BOOL as readonly string[]).includes(k) ? !!a === !!b : String(a ?? "") === String(b ?? "");
    if (!same) { before[k] = a; after[k] = b; }
  }
  const changedKeys = Object.keys(after);
  if (changedKeys.length === 0) flash(delegateId, "ok", "No registration changes", ret, "registration");

  if (await isRateGuarded(user)) {
    await logChange(user, {
      ...base(d), kind: "registration", field: changedKeys.join(","),
      current_value: JSON.stringify(before), proposed_value: JSON.stringify(after),
    }, "pending");
    flash(delegateId, "warn", RATE_GUARD_MSG, ret, "registration");
  }

  await sb.from("delegates").update(update).eq("id", delegateId);
  await logChange(user, {
    ...base(d), kind: "logistics", field: changedKeys.join(","),
    current_value: JSON.stringify(before), proposed_value: JSON.stringify(after),
  });
  revalidatePath(`/delegates/${delegateId}`);
  flash(delegateId, "ok", "Registration saved", ret, "registration");
}

// On-demand: queue a delegate (summit attend-value) profile → contact_profiles.
export async function generateBrief(formData: FormData) {
  const user = await requireUser();
  const delegateId = String(formData.get("delegateId"));
  const ret = String(formData.get("return") ?? "");
  const d = await loadContext(delegateId);
  guard(user, d, ret, "background");
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
  flash(delegateId, "ok", "Background research queued — this page refreshes automatically when it lands", ret, "background");
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
  guard(user, d, ret);
  const err = await logChange(
    user,
    {
      ...base(d),
      kind: "role",
      field: "job_title/company",
      current_value: d.contact?.job_title ?? null,
      proposed_value: newTitle || null,
      proposed_company: newCompany || null,
    },
    "pending"
  );
  if (err) flash(delegateId, "warn", `Couldn’t submit: ${err}`, ret);
  flash(delegateId, "ok", "Role change submitted for review", ret);
}

// ─── Inline field editors (Contact details card) ─────────────────────────────
// Result-returning actions for ContactDetails.tsx. Every path: canEdit scope
// gate → tier rule → rate guard → write → logChange. Identical to speakers-app.

async function fieldContext(delegateId: string): Promise<{ user: AppUser; d: DelegateRow } | { denied: FieldWriteResult }> {
  const user = await requireUser();
  const d = await loadContext(delegateId);
  if (!canEdit(user, { eventId: d.event_id, edition: d.event_edition })) {
    return { denied: { ok: false, message: NO_ACCESS_MSG } };
  }
  return { user, d };
}

function managedWith(d: DelegateRow, field: string): string[] {
  const managed: string[] = Array.isArray(d.contact?.user_managed_fields) ? [...d.contact.user_managed_fields] : [];
  if (!managed.includes(field)) managed.push(field);
  return managed;
}

// Work email — Tier B: MV valid AND domain matches the company → apply + log;
// otherwise queued with the reason. (Was the "Found a new email?" form.)
export async function updateWorkEmail(delegateId: string, email: string): Promise<FieldWriteResult> {
  // Outbound address: normalised (trim, lowercase domain) AND fully lowercased —
  // finders, MillionVerifier and dedup all key on the lowercase form.
  const newEmail = normalizeEmail(email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) return { ok: false, message: "Enter a valid email address." };
  const ctx = await fieldContext(delegateId);
  if ("denied" in ctx) return ctx.denied;
  const { user, d } = ctx;
  const contactId = d.contact?.id as string;
  const oldEmail = d.contact?.email ?? null;
  if (oldEmail && oldEmail.toLowerCase() === newEmail) return { ok: true, message: "Email unchanged", value: oldEmail };

  const mv = await verifyEmail(newEmail);
  const entry = { ...base(d), kind: "email" as const, field: "email", current_value: oldEmail, proposed_value: newEmail, mv_result: mv.result };
  const domainRoot: string | null = d.contact?.company?.domain_root ?? null;
  const domainOk = emailDomainMatches(newEmail, domainRoot);

  if (!(mv.valid && domainOk)) {
    const err = await logChange(user, entry, "pending");
    if (err) return { ok: false, message: `Couldn’t queue the change: ${err}` };
    const why = !mv.valid ? `Email verified as ${mv.result}.` : `Domain doesn’t match the company (${domainRoot}).`;
    return { ok: true, queued: true, message: `${why} Sent for review.` };
  }
  if (await isRateGuarded(user)) {
    await logChange(user, entry, "pending");
    return { ok: true, queued: true, message: RATE_GUARD_MSG };
  }
  const { error } = await supabaseAdmin()
    .from("contacts")
    .update({
      email: newEmail,
      email_source: "user_submitted",
      email_mv_result: mv.result,
      email_mv_verified_at: new Date().toISOString(),
      user_managed_fields: managedWith(d, "email"),
    })
    .eq("id", contactId);
  if (error) return { ok: false, message: error.message };
  await logChange(user, entry);
  revalidatePath(`/delegates/${delegateId}`);
  return { ok: true, message: "Work email verified and updated", value: newEmail };
}

// "Use as primary" — Tier B: copy personal_email into the OUTBOUND address
// (contacts.email) after MillionVerifier says ok. Shown only when the work
// email is empty or dead. MV not ok → queued for review exactly like
// updateWorkEmail's invalid branch. personal_email itself is never touched.
// Domain match is NOT required here (it's a personal inbox by definition);
// email_source = 'personal_promoted' so finders may later replace it.
export async function promotePersonalEmail(delegateId: string, returnTo?: string): Promise<FieldWriteResult> {
  const ctx = await fieldContext(delegateId);
  if ("denied" in ctx) return ctx.denied;
  const { user, d } = ctx;
  const contactId = d.contact?.id as string;
  const raw: string | null = d.contact?.personal_email ?? null;
  if (!raw || !PERSONAL_EMAIL_RE.test(raw.trim())) return { ok: false, message: "No personal email on this contact." };
  const at = raw.trim().lastIndexOf("@");
  const newEmail = raw.trim().slice(0, at) + "@" + raw.trim().slice(at + 1).toLowerCase();
  const oldEmail: string | null = d.contact?.email ?? null;
  if (oldEmail && oldEmail.toLowerCase() === newEmail.toLowerCase()) {
    return { ok: true, message: "Already the primary email", value: oldEmail };
  }
  const previous = {
    email: oldEmail,
    email_source: (d.contact?.email_source as string | null) ?? null,
    email_mv_result: (d.contact?.email_mv_result as string | null) ?? null,
  };

  const mv = await verifyEmail(newEmail);
  const entry = { ...base(d), kind: "email" as const, field: "email", current_value: oldEmail, proposed_value: newEmail, mv_result: mv.result };
  if (!mv.valid) {
    const err = await logChange(user, entry, "pending");
    if (err) return { ok: false, message: `Couldn’t queue the change: ${err}` };
    return { ok: true, queued: true, message: `Email verified as ${mv.result}. Sent for review.` };
  }
  if (await isRateGuarded(user)) {
    await logChange(user, entry, "pending");
    return { ok: true, queued: true, message: RATE_GUARD_MSG };
  }
  const { error } = await supabaseAdmin()
    .from("contacts")
    .update({
      email: newEmail,
      email_source: "personal_promoted",
      email_mv_result: mv.result,
      email_mv_verified_at: new Date().toISOString(),
      user_managed_fields: managedWith(d, "email"),
    })
    .eq("id", contactId);
  if (error) return { ok: false, message: error.message };
  await logChange(user, entry);
  revalidatePath(`/delegates/${delegateId}`);
  if (returnTo && returnTo.startsWith("/")) revalidatePath(returnTo);
  return { ok: true, message: "Now the primary email", value: newEmail, previous };
}

// Undo for promotePersonalEmail: put the outbound address back exactly as it
// was (previous null → clear email + email_source). Logged as a plain email
// change; no MV call (we restore the previous verdict we captured).
export async function undoPromotePersonalEmail(
  delegateId: string,
  previous: { email: string | null; email_source: string | null; email_mv_result: string | null }
): Promise<FieldWriteResult> {
  const ctx = await fieldContext(delegateId);
  if ("denied" in ctx) return ctx.denied;
  const { user, d } = ctx;
  const current: string | null = d.contact?.email ?? null;
  const entry = { ...base(d), kind: "email" as const, field: "email", current_value: current, proposed_value: previous.email };
  const { error } = await supabaseAdmin()
    .from("contacts")
    .update({
      email: previous.email,
      email_source: previous.email ? previous.email_source : null,
      email_mv_result: previous.email ? previous.email_mv_result : null,
    })
    .eq("id", d.contact?.id);
  if (error) return { ok: false, message: error.message };
  await logChange(user, entry);
  revalidatePath(`/delegates/${delegateId}`);
  return { ok: true, message: "Primary email restored", value: previous.email };
}

// Name — Tier C identity change: QUEUED (kind 'role', field 'name'). Admin /
// reviewer apply immediately (they could approve it anyway) + log.
export async function updateName(delegateId: string, first: string, last: string): Promise<FieldWriteResult> {
  // CRM name engine (lib/nameClean.ts, ported from pmg-agent): honorifics and
  // credentials stripped, "LASTNAME, First" handled, engine casing. properCaseName
  // is only the fallback when the engine returns nothing for a box.
  const cleaned = cleanNameFields(first, last);
  const f = cleaned.first || properCaseName(first);
  const l = cleaned.last || (cleaned.first ? "" : properCaseName(last));
  const full = cleaned.full || fullNameFrom(f, l);
  if (full.length < 2) return { ok: false, message: "Enter the person’s name." };
  const ctx = await fieldContext(delegateId);
  if ("denied" in ctx) return ctx.denied;
  const { user, d } = ctx;
  const current = d.contact?.full_name_clean ?? null;
  if (current === full && (d.contact?.first_name_clean ?? "") === f && (d.contact?.last_name_clean ?? "") === l) {
    return { ok: true, message: "Name unchanged", value: full, first: f, last: l };
  }
  const entry = { ...base(d), kind: "role" as const, field: "name", current_value: current, proposed_value: full };
  if (!isReviewer(user) || (await isRateGuarded(user))) {
    const err = await logChange(user, entry, "pending");
    if (err) return { ok: false, message: `Couldn’t queue the change: ${err}` };
    return { ok: true, queued: true, message: "Name change sent for review" };
  }
  const { error } = await supabaseAdmin()
    .from("contacts")
    .update({
      full_name_clean: full,
      first_name_clean: f || null,
      last_name_clean: l || null,
      user_managed_fields: managedWith(d, "full_name_clean"),
    })
    .eq("id", d.contact?.id);
  if (error) return { ok: false, message: error.message };
  await logChange(user, entry);
  revalidatePath(`/delegates/${delegateId}`);
  return { ok: true, message: "Name updated", value: full, first: f, last: l };
}

// Job title — Tier A: auto-apply + log (kind 'role', field 'job_title').
export async function updateJobTitle(delegateId: string, title: string): Promise<FieldWriteResult> {
  const t = titleCaseJobTitle(title);
  const ctx = await fieldContext(delegateId);
  if ("denied" in ctx) return ctx.denied;
  const { user, d } = ctx;
  const current = d.contact?.job_title ?? null;
  if ((current ?? "") === t) return { ok: true, message: "Job title unchanged", value: current };
  const entry = { ...base(d), kind: "role" as const, field: "job_title", current_value: current, proposed_value: t || null };
  if (await isRateGuarded(user)) {
    await logChange(user, entry, "pending");
    return { ok: true, queued: true, message: RATE_GUARD_MSG };
  }
  const { error } = await supabaseAdmin()
    .from("contacts")
    .update({ job_title: t || null, user_managed_fields: managedWith(d, "job_title") })
    .eq("id", d.contact?.id);
  if (error) return { ok: false, message: error.message };
  await logChange(user, entry);
  revalidatePath(`/delegates/${delegateId}`);
  return { ok: true, message: "Job title updated", value: t || null };
}

// Personal email — Tier A: auto-apply + log (kind 'email', field
// 'personal_email'). Warm/manual contact only — NEVER an outbound address, so
// no MillionVerifier call and no Instantly/Brevo touch. Empty string clears.
const PERSONAL_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export async function updatePersonalEmail(delegateId: string, value: string, returnTo?: string): Promise<FieldWriteResult> {
  const raw = value.trim();
  let v: string | null = null;
  if (raw) {
    if (!PERSONAL_EMAIL_RE.test(raw)) return { ok: false, message: "Enter a valid email address." };
    v = normalizeEmail(raw);
  }
  const ctx = await fieldContext(delegateId);
  if ("denied" in ctx) return ctx.denied;
  const { user, d } = ctx;
  const current: string | null = d.contact?.personal_email ?? null;
  if ((current ?? "") === (v ?? "")) return { ok: true, message: "Personal email unchanged", value: current };
  const entry = { ...base(d), kind: "email" as const, field: "personal_email", current_value: current, proposed_value: v };
  if (await isRateGuarded(user)) {
    await logChange(user, entry, "pending");
    return { ok: true, queued: true, message: RATE_GUARD_MSG };
  }
  const { error } = await supabaseAdmin()
    .from("contacts")
    .update({ personal_email: v, user_managed_fields: managedWith(d, "personal_email") })
    .eq("id", d.contact?.id);
  if (error) return { ok: false, message: error.message };
  await logChange(user, entry);
  revalidatePath(`/delegates/${delegateId}`);
  if (returnTo && returnTo.startsWith("/")) revalidatePath(returnTo);
  return { ok: true, message: "Personal email updated", value: v };
}

export type PhoneField = "mobile" | "office_phone" | "other_phone";
const PHONE_FIELDS: PhoneField[] = ["mobile", "office_phone", "other_phone"];

// Phone / Mobile correction — Tier A: auto-apply + log (kind 'phone'). The
// previous number is kept: it moves to other_phone when that is empty, else it
// stays on the change-log row (current_value). Other phone: plain replace.
// `restoreOther` (Undo path) puts other_phone back to what it was before the
// move so an undo leaves no duplicate behind.
export async function updatePhone(
  delegateId: string,
  field: PhoneField,
  value: string,
  restoreOther?: { other_phone: string | null }
): Promise<FieldWriteResult> {
  if (!PHONE_FIELDS.includes(field)) return { ok: false, message: "Unknown phone field." };
  const ctx = await fieldContext(delegateId);
  if ("denied" in ctx) return ctx.denied;
  const { user, d } = ctx;
  const c = d.contact ?? {};
  // Always stored as E.164 (+country code). National forms are auto-corrected
  // using the contact's country → company HQ country → edition country.
  let v = "";
  if (value.trim()) {
    const n = normalizePhone(value, {
      countryIso: c.country_iso ?? null,
      companyCountryIso: c.company?.headquarters_country_iso ?? null,
      editionCountry: d.event_edition ?? null,
    });
    if ("error" in n) return { ok: false, message: n.error };
    v = n.e164;
  }
  const current: string | null = c[field] ?? null;
  if ((current ?? "") === v) return { ok: true, message: "Number unchanged", value: current, other_phone: c.other_phone ?? null };
  const entry = { ...base(d), kind: "phone" as const, field, current_value: current, proposed_value: v || null };
  if (await isRateGuarded(user)) {
    await logChange(user, entry, "pending");
    return { ok: true, queued: true, message: RATE_GUARD_MSG };
  }
  const patch: Record<string, unknown> = { [field]: v || null };
  let otherAfter: string | null = c.other_phone ?? null;
  if (field !== "other_phone") {
    if (restoreOther) {
      otherAfter = restoreOther.other_phone;
      patch.other_phone = otherAfter;
    } else if (current && !c.other_phone && v) {
      otherAfter = current;
      patch.other_phone = current;
      patch.other_phone_source = "user_managed";
    }
  } else {
    otherAfter = v || null;
    patch.other_phone_source = "user_managed";
  }
  const managed = managedWith(d, field);
  if (patch.other_phone !== undefined && !managed.includes("other_phone")) managed.push("other_phone");
  patch.user_managed_fields = managed;
  const { error } = await supabaseAdmin().from("contacts").update(patch).eq("id", c.id);
  if (error) return { ok: false, message: error.message };
  await logChange(user, entry);
  revalidatePath(`/delegates/${delegateId}`);
  const label = field === "mobile" ? "Mobile" : field === "office_phone" ? "Phone" : "Other phone";
  return { ok: true, message: `${label} updated`, value: v || null, other_phone: otherAfter };
}

// LinkedIn — canonicalised; auto-apply (kind 'other', field 'linkedin_url') when
// the slug is valid AND no other contact carries it; a collision is queued for
// review (the admin resolves the likely duplicate).
export async function updateLinkedin(delegateId: string, url: string): Promise<FieldWriteResult> {
  const canonical = canonicalizeLinkedinUrl(url);
  if (!canonical) return { ok: false, message: "Enter a LinkedIn profile URL (linkedin.com/in/…)." };
  const ctx = await fieldContext(delegateId);
  if ("denied" in ctx) return ctx.denied;
  const { user, d } = ctx;
  const current: string | null = d.contact?.linkedin_url_canonical ?? null;
  if (current === canonical) return { ok: true, message: "LinkedIn unchanged", value: current };
  const entry = { ...base(d), kind: "other" as const, field: "linkedin_url", current_value: current, proposed_value: canonical };
  const sb = supabaseAdmin();
  const { data: clash } = await sb
    .from("contacts")
    .select("id, full_name_clean")
    .eq("linkedin_url_canonical", canonical)
    .neq("id", d.contact?.id)
    .maybeSingle();
  if (clash) {
    const err = await logChange(user, entry, "pending");
    if (err) return { ok: false, message: `Couldn’t queue the change: ${err}` };
    return { ok: true, queued: true, message: `This LinkedIn is already on ${clash.full_name_clean ?? "another contact"} — sent for review` };
  }
  if (await isRateGuarded(user)) {
    await logChange(user, entry, "pending");
    return { ok: true, queued: true, message: RATE_GUARD_MSG };
  }
  const { error } = await sb
    .from("contacts")
    .update({ linkedin_url_canonical: canonical, user_managed_fields: managedWith(d, "linkedin_url_canonical") })
    .eq("id", d.contact?.id);
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      await logChange(user, entry, "pending");
      return { ok: true, queued: true, message: "This LinkedIn is already on another contact — sent for review" };
    }
    return { ok: false, message: error.message };
  }
  await logChange(user, entry);
  revalidatePath(`/delegates/${delegateId}`);
  return { ok: true, message: "LinkedIn updated", value: canonical };
}

// Admin-only hard delete of the role row. Typed confirmation ("REMOVE") is
