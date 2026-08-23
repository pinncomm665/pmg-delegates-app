// Brand constants — the ONE place the app knows which brands exist. Brands
// themselves live in the `events` registry; these helpers exist so no query or
// render hard-codes a list (and so the retired "FraudSense" name never leaks
// into the UI again — it was renamed to VERIFY on 2026-08-16, pmg-agent mig 208).

export const BRANDS = ["VERIFY", "10DX", "4WARD", "PMG Roundtables"] as const;
export type Brand = (typeof BRANDS)[number];

// The three SUMMIT brands this app serves (roundtables are a separate app).
export const SUMMIT_BRANDS: Brand[] = ["10DX", "VERIFY", "4WARD"];

// Legacy spellings that may still arrive from old rows / external payloads.
const LEGACY: Record<string, Brand> = {
  fraudsense: "VERIFY",
  "fraud sense": "VERIFY",
  "10dx": "10DX",
  verify: "VERIFY",
  "4ward": "4WARD",
  "pmg roundtables": "PMG Roundtables",
  roundtables: "PMG Roundtables",
};

// Map any brand string from the DB / an API to its canonical spelling.
// Unknown values pass through unchanged (never drop data on render).
export function normalizeBrand<T extends string | null | undefined>(b: T): T | Brand {
  if (!b) return b;
  const hit = LEGACY[String(b).trim().toLowerCase()];
  return hit ?? b;
}

// Best-effort brand from a canonical edition name ("VERIFY Saudi Arabia 2026").
export function brandOf(edition: string | null | undefined): Brand | null {
  if (!edition) return null;
  const e = edition.trim().toLowerCase();
  if (/roundtable/.test(e)) return "PMG Roundtables";
  for (const b of BRANDS) {
    if (e.startsWith(b.toLowerCase())) return b;
  }
  if (e.startsWith("fraudsense")) return "VERIFY";
  return null;
}
