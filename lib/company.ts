// Display-only company name cleaner: drops trailing corporate/legal forms so the
// team UI reads "Al Ahli Bank of Kuwait - Egypt (ABK-Egypt)" instead of
// "…(ABK-Egypt) S.A.E.". The CRM keeps the legal form verbatim — this never
// mutates company_name_canonical, it only affects what's rendered.
//
// Mirrors pmg-agent's companyDisplayName, extended with Gulf/Egypt bank forms
// (S.A.E., QSC, KSC/KSCP, BSC, SAOG, WLL, …). Distinctive words (Bank, Group,
// Holdings, Capital, Company) are never stripped.

// Longer/compound forms first so they win the end-anchored match.
const SUFFIX =
  /[\s,.\-–—]*\b(tbk|fz[\s-]?llc|fz[\s-]?co|fzco|fze|s\.?a\.?k\.?[pc]?|s\.?a\.?l|s\.?a\.?e|s\.?a\.?o\.?[gc]|q\.?p\.?s\.?c|q\.?s\.?c\.?c?|k\.?s\.?c\.?[pc]?|kpsc|b\.?s\.?c\.?c?|w\.?l\.?l|l\.?l\.?c|llc|ltd|limited|inc|incorporated|corp|corporation|plc|gmbh|mbh|ag|sarl|sas|s\.?r\.?l|srl|s\.?p\.?a|spa|s\.?a|b\.?v|n\.?v|pjsc|jscb|jsc|psc|ojsc|llp|pte|pty|sdn|bhd|oy|ab|aps|a\.?s)\b\.?\s*$/i;

export function companyDisplay(
  raw: string | null | undefined
): string | null {
  if (!raw?.trim()) return raw ?? null;
  const original = raw.trim().replace(/\s+/g, " ");
  let name = original;
  // drop the Indonesian state-owned marker (Persero)/(Perseroda); keep real aliases
  name = name.replace(/\s*\(\s*persero(da)?\s*\)\s*/gi, " ").replace(/\s+/g, " ").trim();
  // leading legal prefix (PT Bank Mandiri, OOO Yandex)
  name = name.replace(/^(pt|pt\.|ojsc|oao|pao|zao|ooo)\s+/i, "").trim();
  // peel trailing legal forms iteratively (handles "Pte Ltd", "Sdn Bhd")
  let prev = "";
  while (name && name !== prev) {
    prev = name;
    name = name.replace(SUFFIX, "").trim();
  }
  // tidy any connector punctuation the strip left dangling
  name = name.replace(/[\s,&+.]+$/, "").trim();
  return name || original;
}
