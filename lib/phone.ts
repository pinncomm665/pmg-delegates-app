// Phone normalisation — the ONE place phone numbers are cleaned before a write.
// Rule (Syed): numbers are ALWAYS stored in E.164 (+country code). A team member
// may type any local/national form; we auto-correct it using, in order:
//   1. the contact's own country (contacts.country_iso, ISO-2)
//   2. the company's HQ country (companies.headquarters_country_iso)
//   3. the country inferred from the role row's event edition ("10DX Nigeria 2026" → NG)
// Numbers typed with a leading "+" (or "00") are parsed as-is. Anything we can't
// recognise is rejected with a human hint — never stored raw.
//
// Identical copy in speakers-app / delegates-app / roundtables-app (lib/phone.ts).

import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export type PhoneHints = {
  countryIso?: string | null;
  companyCountryIso?: string | null;
  editionCountry?: string | null;
};

export type PhoneResult = { e164: string; display: string } | { error: string };

export const PHONE_HINT_TEXT = "Any format works — we store it as +country code.";

export const PHONE_ERROR =
  "Couldn't recognise this number — include the country code, e.g. +234 803 000 0000";

// PMG markets — country NAME (as it appears in an edition name) → ISO-2.
// Longest names first so "South Africa" wins over nothing, "Saudi Arabia" etc.
const MARKET_COUNTRIES: Array<[string, CountryCode]> = [
  ["saudi arabia", "SA"],
  ["south africa", "ZA"],
  ["united kingdom", "GB"],
  ["united arab emirates", "AE"],
  ["côte d'ivoire", "CI"],
  ["cote d'ivoire", "CI"],
  ["ivory coast", "CI"],
  ["nigeria", "NG"],
  ["indonesia", "ID"],
  ["malaysia", "MY"],
  ["kenya", "KE"],
  ["ethiopia", "ET"],
  ["tanzania", "TZ"],
  ["ghana", "GH"],
  ["egypt", "EG"],
  ["uae", "AE"],
  ["ksa", "SA"],
  ["bahrain", "BH"],
  ["india", "IN"],
  ["pakistan", "PK"],
  ["singapore", "SG"],
  ["uk", "GB"],
];

// "10DX Nigeria 2026" → "NG"; "4WARD MENA 2027" → null (region, not a country).
export function countryIsoFromEdition(edition: string | null | undefined): CountryCode | null {
  if (!edition) return null;
  const s = ` ${edition.toLowerCase().replace(/[^a-z'à-ÿ]+/g, " ")} `;
  for (const [name, iso] of MARKET_COUNTRIES) {
    if (s.includes(` ${name} `)) return iso;
  }
  return null;
}

function cleanIso(v: string | null | undefined): CountryCode | null {
  const s = (v ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(s) ? (s as CountryCode) : null;
}

// Keep digits and a single leading "+"; "00" international prefix → "+".
function scrub(raw: string): string {
  let s = (raw ?? "").trim();
  if (s.startsWith("00")) s = "+" + s.slice(2);
  const plus = s.startsWith("+");
  const digits = s.replace(/\D/g, "");
  return (plus ? "+" : "") + digits;
}

export function normalizePhone(raw: string, hints: PhoneHints = {}): PhoneResult {
  const s = scrub(raw);
  if (!s.replace(/\D/g, "")) return { error: PHONE_ERROR };

  const finish = (n: ReturnType<typeof parsePhoneNumberFromString>) =>
    n ? { e164: n.number as string, display: n.formatInternational() } : null;

  // 1. Explicit country code → parse as-is.
  if (s.startsWith("+")) {
    const n = parsePhoneNumberFromString(s);
    if (n && (n.isValid() || n.isPossible())) return finish(n)!;
    return { error: PHONE_ERROR };
  }

  // 2. National form → try default countries in hint order.
  const order: CountryCode[] = [];
  for (const c of [cleanIso(hints.countryIso), cleanIso(hints.companyCountryIso), countryIsoFromEdition(hints.editionCountry)]) {
    if (c && !order.includes(c)) order.push(c);
  }
  const candidates = order.map((c) => parsePhoneNumberFromString(s, c)).filter(Boolean);
  const valid = candidates.find((n) => n!.isValid());
  if (valid) return finish(valid)!;

  // 3. Last-resort guess: typed without "+" but already carrying a country code
  //    ("60193107646", "971567773742" on an SA contact, "353868385969" with no
  //    hints). Accepted ONLY when "+digits" is a fully VALID number with no
  //    default country; 9–15 digits (E.164 bounds) — "255" must still fail.
  const digits = s.replace(/\D/g, "");
  if (digits.length >= 9 && digits.length <= 15) {
    const intl = parsePhoneNumberFromString("+" + digits);
    if (intl && intl.isValid()) return finish(intl)!;
  }

  // 4. Last resort: a hint country that makes it at least *possible*.
  const possible = candidates.find((n) => n!.isPossible());
  if (possible) return finish(possible)!;

  return { error: PHONE_ERROR };
}

// Display helper (read paths only — never writes): "+2348035358808" →
// "+234 803 535 8808"; anything unparseable is shown as stored.
export function formatPhone(v: string | null | undefined): string | null {
  if (!v) return null;
  const n = parsePhoneNumberFromString(v);
  return n ? n.formatInternational() : v;
}
