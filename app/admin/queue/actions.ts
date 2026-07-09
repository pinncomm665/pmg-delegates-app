"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { postIntakeReview } from "./intake";

export async function approveRequest(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id"));
  const sb = supabaseAdmin();

  const { data: req } = await sb
    .from("contact_change_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!req || req.status !== "pending") return;

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
  } else if (req.kind === "role") {
    const patch: Record<string, any> = {};
    if (req.proposed_value) patch.job_title = req.proposed_value;
    if (req.proposed_company) patch.company_name_submitted = req.proposed_company;
    if (Object.keys(patch).length) {
      await sb.from("contacts").update(patch).eq("id", req.contact_id);
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
  revalidatePath("/admin/queue");
}

export async function removeDelegateFromQueue(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id"));
  const sb = supabaseAdmin();

  const { data: req } = await sb
    .from("contact_change_requests")
    .select("id, delegate_id")
    .eq("id", id)
    .maybeSingle();
  if (!req) return;

  if (req.delegate_id) {
    const { data: del } = await sb
      .from("delegates")
      .select("id, stage")
      .eq("id", req.delegate_id)
      .maybeSingle();
    const secured = ["registered", "confirmed", "attended"];
    if (del && !secured.includes((del.stage ?? "").toLowerCase())) {
      await sb.from("delegates").delete().eq("id", del.id);
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
  revalidatePath("/admin/queue");
}

export async function rejectRequest(formData: FormData) {
  const admin = await requireAdmin();
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
  revalidatePath("/admin/queue");
}

// ── New-contact intake queue (contact_intake_requests via the agent) ────────
// These act on the agent's staff-intake queue, NOT contact_change_requests.

export async function approveIntake(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id"));
  await postIntakeReview({ request_id: id, action: "approve", reviewed_by: admin.id });
  revalidatePath("/admin/queue");
}

export async function mergeIntake(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id"));
  const mergeInto = String(formData.get("merge_into"));
  await postIntakeReview({
    request_id: id,
    action: "merge",
    reviewed_by: admin.id,
    merge_into_contact_id: mergeInto,
  });
  revalidatePath("/admin/queue");
}

export async function rejectIntake(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id"));
  const reason = formData.get("reason");
  await postIntakeReview({
    request_id: id,
    action: "reject",
    reviewed_by: admin.id,
    reject_reason: reason ? String(reason) : null,
  });
  revalidatePath("/admin/queue");
}
