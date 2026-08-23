// Simple 3-bucket email status for the team UI, derived from the CRM's richer
// MillionVerifier / Findymail / Scrubby verdicts. The CRM keeps the detailed
// statuses; here we collapse them to Valid / Invalid / Unknown.
//
// Source priority: scrubby_result (deep re-verify, overrides) → email_mv_result
// (MillionVerifier, the primary gate) → email_verified_status (legacy).

export type EmailStatus = "Valid" | "Invalid" | "Unknown";

export function emailStatusOf(c: any): EmailStatus | null {
  if (!c?.email && !c?.personal_email) return null; // no email → no status
  const v = String(
    c?.scrubby_result || c?.email_mv_result || c?.email_verified_status || ""
  ).toLowerCase();
  if (["ok", "valid"].includes(v)) return "Valid";
  if (["invalid", "disposable"].includes(v)) return "Invalid";
  // valid-risky (legacy Kitt) → Unknown: still subject to the MV / Scrubby sweep
  return "Unknown"; // catch_all, unknown, error, valid-risky, or not yet verified
}

export function emailStatusColors(s: EmailStatus): { bg: string; fg: string } {
  switch (s) {
    case "Valid":
      return { bg: "var(--accent-soft)", fg: "var(--accent)" };
    case "Invalid":
      return { bg: "var(--danger-soft)", fg: "var(--danger)" };
    default:
      return { bg: "#f1efe8", fg: "#5f5e5a" }; // Unknown
  }
}
