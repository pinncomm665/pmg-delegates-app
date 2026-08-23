"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireReviewer } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { STAGE_VALUES } from "@/lib/data";
import { normalizePhone } from "@/lib/phone";
import { postIntakeReview } from "./intake";

// All queue actions end with a redirect carrying a one-line success flash.
function done(kind: "ok" | "warn", msg: string): never {
  revalidatePath("/admin/queue");
  redirect(`/admin/queue?flash=${kind}&msg=${encodeURIComponent(msg)}`);
}

// Registration fields a held (rate-guarded) "logistics" row may patch.
const REGISTRATION_KEYS = new Set([
  "invoice_sent", "payment_received", "complimentary", "payment_amount",
  "ticket_type", "delegate_type", "registration_date", "badge_name", "seating_assignment",
  "dietary_requirements", "special_access", "complimentary_reason", "notes",
]);

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

// Approve = apply the proposed change for its kind, then mark approved.
// admin OR reviewer.
export async function approveRequest(formData: FormData) {
  const admin = await requireReviewer();
  const id = String(formData.get("id"));
  const sb = supabaseAdmin();

  const { data: req } = await sb
    .from("contact_change_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!req || req.status !== "pending") done("warn", "That request was already handled.");

  let applied = "Approved";
  if (req.kind === "email" && req.proposed_value) {
    await sb
      .from("contacts")
      .update({
        email: req.proposed_value,
        email_source: "admin_approved",
        email_mv_result: req.mv_result,
        email_mv_verified_at: new Date().toISOString(),
      })
      .eq("id", req.contact_id);
    applied = `Email updated to ${req.proposed_value}`;
  } else if (req.kind === "role" && req.field === "name" && req.proposed_value) {
    // Inline name editor (ContactDetails): proposed_value = the new full name.
    const full = String(req.proposed_value).trim().replace(/\s+/g, " ");
    const parts = full.split(" ");
    await sb
      .from("contacts")
      .update({
        full_name_clean: full,
        first_name_clean: parts[0] ?? null,
        last_name_clean: parts.length > 1 ? parts.slice(1).join(" ") : null,
      })
      .eq("id", req.contact_id);
    applied = `Name changed to ${full}`;
  } else if (req.kind === "role") {
    const patch: Record<string, any> = {};
    if (req.proposed_value) patch.job_title = req.proposed_value;
    if (req.proposed_company) patch.company_name_submitted = req.proposed_company;
    if (Object.keys(patch).length) {
      await sb.from("contacts").update(patch).eq("id", req.contact_id);
    }
    applied = "Role change applied";
  } else if ((req.kind === "stage" || req.kind === "stage_revert") && req.delegate_id && req.proposed_value) {
    const stage = String(req.proposed_value).toLowerCase();
    if (!STAGE_VALUES.includes(stage)) done("warn", `Invalid stage "${stage}" on that request.`);
    const update: Record<string, unknown> = {
      stage,
      stage_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const stampCol = STAGE_STAMP[stage];
    if (stampCol) update[stampCol] = new Date().toISOString();
    await sb.from("delegates").update(update).eq("id", req.delegate_id);
    applied = `Stage set to ${stage}`;
  } else if (req.kind === "company" && req.proposed_value) {
    // proposed_value = company id, proposed_company = its name (see updateCompany)
    await sb.from("contacts").update({ company_id: req.proposed_value }).eq("id", req.contact_id);
    applied = `Company set to ${req.proposed_company ?? "the requested company"}`;
  } else if (req.kind === "company_new" && req.proposed_company) {
    // Companies are created by the CRM (domain-verified) — record the name on
    // the contact so the CRM's resolution picks it up; nothing is created here.
    await sb.from("contacts").update({ company_name_submitted: req.proposed_company }).eq("id", req.contact_id);
    applied = `Recorded "${req.proposed_company}" — create/link it in the CRM`;
  } else if (req.kind === "phone" && req.proposed_value) {
    // Stored as E.164 — re-normalise here too (older queue rows may carry a
    // national form); hints: contact country → company HQ → edition country.
    const { data: pc } = await sb
      .from("contacts")
      .select("country_iso, company:companies(headquarters_country_iso)")
      .eq("id", req.contact_id)
      .maybeSingle();
    const pcAny = pc as { country_iso?: string | null; company?: { headquarters_country_iso?: string | null } | null } | null;
    const n = normalizePhone(String(req.proposed_value), {
      countryIso: pcAny?.country_iso ?? null,
      companyCountryIso: pcAny?.company?.headquarters_country_iso ?? null,
      editionCountry: (req.event_edition as string | null) ?? null,
    });
    if ("error" in n) done("warn", n.error);
    await sb
      .from("contacts")
      .update({ other_phone: n.e164, other_phone_source: "user_managed" })
      .eq("id", req.contact_id);
    applied = "Phone added";
  } else if ((req.kind === "registration" || req.kind === "logistics") && req.delegate_id && req.proposed_value) {
    try {
      const after = JSON.parse(req.proposed_value) as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(after)) if (REGISTRATION_KEYS.has(k)) patch[k] = v;
      if (Object.keys(patch).length) {
        patch.updated_at = new Date().toISOString();
        await sb.from("delegates").update(patch).eq("id", req.delegate_id);
      }
      applied = "Registration applied";
    } catch {
      done("warn", "Couldn’t parse the registration payload on that request.");
    }
  }

  await sb
    .from("contact_change_requests")
    .update({
      status: "approved",
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);
  done("ok", applied);
}

// Hard delete of the delegate row from the queue — admin only.
export async function removeDelegateFromQueue(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id"));
  const sb = supabaseAdmin();

  const { data: req } = await sb
    .from("contact_change_requests")
    .select("id, delegate_id")
    .eq("id", id)
    .maybeSingle();
  if (!req) done("warn", "Request not found.");

  let msg = "Request closed";
  if (req.delegate_id) {
    const { data: del } = await sb
      .from("delegates")
      .select("id, stage")
      .eq("id", req.delegate_id)
      .maybeSingle();
    const secured = ["registered", "confirmed", "attended"];
    if (del && !secured.includes((del.stage ?? "").toLowerCase())) {
      await sb.from("delegates").delete().eq("id", del.id);
      msg = "Delegate removed from the pipeline";
    } else if (del) {
      msg = "Secured delegate — not removed (change the stage instead); request closed";
    }
  }

  await sb
    .from("contact_change_requests")
    .update({
      status: "rejected",
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
      review_notes: "Delegate removed from pipeline",
    })
    .eq("id", id);
  done("ok", msg);
}

export async function rejectRequest(formData: FormData) {
  const admin = await requireReviewer();
  const id = String(formData.get("id"));
  const sb = supabaseAdmin();
  await sb
    .from("contact_change_requests")
    .update({
      status: "rejected",
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending");
  done("ok", "Rejected");
}

// ── New-contact intake queue (contact_intake_requests via the agent) ────────
// These act on the agent's staff-intake queue, NOT contact_change_requests.

export async function approveIntake(formData: FormData) {
  const admin = await requireReviewer();
  const id = String(formData.get("id"));
  const r = await postIntakeReview({ request_id: id, action: "approve", reviewed_by: admin.id });
  if (!r.ok) done("warn", `Approve failed: ${r.error ?? "unknown error"}`);
  done("ok", "Approved — contact added");
}

export async function mergeIntake(formData: FormData) {
  const admin = await requireReviewer();
  const id = String(formData.get("id"));
  const mergeInto = String(formData.get("merge_into"));
  if (!mergeInto) done("warn", "Pick a contact to merge into.");
  const r = await postIntakeReview({
    request_id: id,
    action: "merge",
    reviewed_by: admin.id,
    merge_into_contact_id: mergeInto,
  });
  if (!r.ok) done("warn", `Merge failed: ${r.error ?? "unknown error"}`);
  done("ok", "Merged into the existing contact");
}

export async function rejectIntake(formData: FormData) {
  const admin = await requireReviewer();
  const id = String(formData.get("id"));
  const reason = formData.get("reason");
  const r = await postIntakeReview({
    request_id: id,
    action: "reject",
    reviewed_by: admin.id,
    reject_reason: reason ? String(reason) : null,
  });
  if (!r.ok) done("warn", `Reject failed: ${r.error ?? "unknown error"}`);
  done("ok", "Rejected");
}
