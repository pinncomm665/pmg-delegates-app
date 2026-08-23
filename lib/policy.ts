// Safe team writes — tier policy. Pure rules (no DB), used by server actions and
// API routes before any write.
//
//   Tier A  auto-apply + activity log: stage change (except moving OUT of a
//           secured stage → Tier B queue as 'stage_revert' unless admin/reviewer),
//           registration fields, additive phone, attach-to-event, brief jobs.
//   Tier B  verified email (MV ok AND domain matches the company → apply, else
//           queue), company re-link to an EXISTING company (confirm → apply + log),
//           title change (queue).
//   Tier C  new company, merge, delete at secured stage, locked email_source,
//           anything touching personal_email → never written by this app.
//
// Scope: if app_metadata.editions is present and non-empty, non-admin users may
// write ONLY on contacts/roles in those editions (names or event ids). Absent →
// full access. Reads are never restricted.

import type { AppUser } from "./session";
import { isReviewer } from "./session";

// Delegate stages that count as "secured" (registered / paid / attending).
export const SECURED_STAGES = ["registered", "confirmed", "attended"];

export type Tier = "A" | "B" | "C";

export type PolicyAction =
  | "stage"
  | "stage_revert"
  | "logistics"
  | "phone"
  | "attach"
  | "job"
  | "email"
  | "company"
  | "role"
  | "company_new"
  | "merge"
  | "delete_secured"
  | "locked_email"
  | "personal_email";

export function tierFor(action: PolicyAction): Tier {
  switch (action) {
    case "stage":
    case "logistics":
    case "phone":
    case "attach":
    case "job":
      return "A";
    case "stage_revert":
    case "email":
    case "company":
    case "role":
      return "B";
    default:
      return "C";
  }
}

export type ScopeTarget = { eventId?: string | null; edition?: string | null };

// May this user write on a row belonging to the given event/edition?
export function canEdit(user: AppUser, target: ScopeTarget): boolean {
  if (user.role === "admin") return true;
  const scope = user.editions;
  if (!scope || scope.length === 0) return true; // no scope set → full access
  const id = (target.eventId ?? "").toLowerCase();
  const ed = (target.edition ?? "").toLowerCase();
  return scope.some((s) => {
    const v = s.toLowerCase();
    return (!!id && v === id) || (!!ed && v === ed);
  });
}

// Stage change classification: moving OUT of a secured stage is a revert that
// only admin/reviewer may apply directly; everyone else queues it.
export function stageChangeNeedsReview(user: AppUser, from: string | null, to: string): boolean {
  const f = (from ?? "").toLowerCase();
  const t = to.toLowerCase();
  if (!SECURED_STAGES.includes(f)) return false;
  if (SECURED_STAGES.includes(t)) return false; // registered → confirmed etc. stays secured
  return !isReviewer(user);
}

// Tier-B email rule: the new address's domain must match the company's
// domain_root (when the company has one). Subdomains of the root are fine.
export function emailDomainMatches(email: string, domainRoot: string | null | undefined): boolean {
  if (!domainRoot) return true; // nothing to compare against → don't block
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const d = email.slice(at + 1).toLowerCase().trim();
  const root = domainRoot.toLowerCase().trim().replace(/^www\./, "");
  return d === root || d.endsWith(`.${root}`);
}

// Rate guard threshold: more than this many auto-applied rows in the last
// 60 minutes → further Tier A/B writes are queued instead.
export const RATE_GUARD_LIMIT = 25;
export const RATE_GUARD_WINDOW_MIN = 60;

export const NO_ACCESS_MSG = "You don’t have edit access to this edition — ask Syed to add it to your scope.";
