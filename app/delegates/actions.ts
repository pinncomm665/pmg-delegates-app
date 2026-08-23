"use server";

import { requireUser } from "@/lib/session";
import { getDelegateIdsMatching, SELECT_ALL_CAP } from "@/lib/data";

// "Select all N matching" for the bulk bar — ids of every delegate in the current
// filter set (capped at SELECT_ALL_CAP). filterQs is the list page's filter
// querystring (brand/edition/status/q/has_*).
export async function selectAllMatching(filterQs: string): Promise<{ ids: string[]; capped: boolean; cap: number }> {
  await requireUser();
  const p = new URLSearchParams(filterQs);
  const { ids, capped } = await getDelegateIdsMatching({
    brand: p.get("brand") ?? undefined,
    edition: p.get("edition") ?? undefined,
    status: p.get("status") ?? undefined,
    q: p.get("q") ?? undefined,
    hasValidEmail: p.get("has_valid_email") === "1",
    hasPhone: p.get("has_phone") === "1",
    hasLinkedin: p.get("has_linkedin") === "1",
  });
  return { ids, capped, cap: SELECT_ALL_CAP };
}
