// Brand constants — the ONE place the app knows which brands exist. Brands
// themselves live in the `events` registry; these helpers exist so no query or
// render hard-codes a list (and so retired names never leak into the UI again):
//   · "FraudSense" was renamed to VERIFY on 2026-08-16 (pmg-agent mig 208).
//   · "PMG Roundtables" was renamed to PeerRoom on 2026-09-22 (Syed approved).
//     During the rollout window the DB may hold either value, so every READ
//     that filters by brand goes through brandDbValues(); every WRITE sends the
//     canonical "PeerRoom".

export const BRANDS = ["VERIFY", "10DX", "4WARD", "PeerRoom"] as const;
export type Brand = (typeof BRANDS)[number];

// The canonical roundtables brand, and the legacy DB value it replaced.
export const ROUNDTABLE_BRAND: Brand = "PeerRoom";
export const LEGACY_ROUNDTABLE_BRAND = "PMG Roundtables";

// The three SUMMIT brands this app serves (roundtables are a separate app).
export const SUMMIT_BRANDS: Brand[] = ["10DX", "VERIFY", "4WARD"];

// Legacy spellings that may still arrive from old rows / external payloads.
const LEGACY: Record<string, Brand> = {
  fraudsense: "VERIFY",
  "fraud sense": "VERIFY",
  "10dx": "10DX",
  verify: "VERIFY",
  "4ward": "4WARD",
  peerroom: "PeerRoom",
  "peer room": "PeerRoom",
  "pmg roundtables": "PeerRoom",
  "pmg roundtable": "PeerRoom",
  roundtables: "PeerRoom",
};

// Map any brand string from the DB / an API to its canonical spelling.
// Unknown values pass through unchanged (never drop data on render).
export function normalizeBrand<T extends string | null | undefined>(b: T): T | Brand {
  if (!b) return b;
  const hit = LEGACY[String(b).trim().toLowerCase()];
  return hit ?? b;
}

// True for PeerRoom under either its current or its legacy name.
export function isRoundtableBrand(b: string | null | undefined): boolean {
  return normalizeBrand(b) === ROUNDTABLE_BRAND;
}

// Every DB value a brand filter must match. PeerRoom → both the new and the
// legacy value (rollout window: the pmg-agent migration may not have run yet);
// any other brand → its canonical spelling alone.
export function brandDbValues(b: string): string[] {
  const canon = normalizeBrand(b);
  return canon === ROUNDTABLE_BRAND ? [ROUNDTABLE_BRAND, LEGACY_ROUNDTABLE_BRAND] : [canon];
}

// Roundtable editions are kept out of this summit app by edition name. Client
// roundtables keep "Roundtable" in their name, but the standing holding edition
// (ca27bd35-0993-442c-9b47-bc84a2f39991) was renamed "PMG Roundtables" →
// "PeerRoom" and no longer matches /roundtable/ — so every roundtable-edition
// test (JS and SQL) also checks this pattern, keeping behaviour identical
// before and after the pmg-agent migration.
export const PEERROOM_EDITION_ILIKE = "peerroom%";
export function isRoundtableEdition(edition: string | null | undefined): boolean {
  const e = (edition ?? "").trim();
  return /roundtable/i.test(e) || /^peer\s?room\b/i.test(e);
}

// Best-effort brand from a canonical edition name ("VERIFY Saudi Arabia 2026").
export function brandOf(edition: string | null | undefined): Brand | null {
  if (!edition) return null;
  const e = edition.trim().toLowerCase();
  if (isRoundtableEdition(e)) return ROUNDTABLE_BRAND;
  for (const b of BRANDS) {
    if (e.startsWith(b.toLowerCase())) return b;
  }
  if (e.startsWith("fraudsense")) return "VERIFY";
  return null;
}
