// Text auto-correction for free-text contact fields — applied on save, no
// prompt: the editor simply shows the corrected value.
//   titleCaseJobTitle("HeAD of DIGItal")   → "Head of Digital"
//   properCaseName("aBIMBOLA ademola")      → "Abimbola Ademola"
//   normalizeEmail("  Name@Example.COM ")   → "Name@example.com"
// Pure functions — no DB, no React. Identical copy in speakers-app /
// delegates-app / roundtables-app (lib/textCase.ts).

// Curated ALL-CAPS (or fixed-form) acronyms. Matched case-insensitively on the
// whole word (punctuation stripped) and rendered in the listed form.
const ACRONYMS = [
  "CEO", "CFO", "COO", "CIO", "CTO", "CISO", "CDO", "CMO", "CRO", "CHRO", "CCO", "CPO", "CAE", "CDAO", "CAIO",
  "DPO", "MLRO", "MD", "VP", "SVP", "EVP", "AVP", "GM", "DGM", "AGM", "HR", "IT", "AI", "ML", "AML", "KYC", "CX",
  "UX", "PMO", "KSA", "UAE", "UK", "USA", "US", "MEA", "APAC", "EMEA", "SEA", "GCC", "BaaS", "SaaS", "PaaS",
  "B2B", "B2C", "IoT", "API", "ERP", "CRM", "ESG", "CAMS", "CFE", "CISA", "CISM", "CPA", "MBA", "PhD", "LLB",
  "LLM", "BSc", "MSc", "PMP", "SME", "SMEs", "ATM", "POS", "P2P", "QA", "R&D", "M&A", "BI", "RPA", "OT", "ICT",
];
const ACRONYM_BY_KEY = new Map(ACRONYMS.map((a) => [a.toUpperCase(), a]));

// Words that are never capitalised mid-title.
const CONNECTORS = new Set(["of", "and", "the", "for", "to", "in", "at", "on", "a", "an", "&", "-", "–", "—"]);

// Brand/product words with deliberate mixed case — kept in this form.
const KNOWN_MIXED = [
  "iOS", "iPhone", "iPad", "eCommerce", "eBay", "PayPal", "LinkedIn", "YouTube", "McKinsey", "DevOps", "FinTech",
  "RegTech", "InsurTech", "OpenAI", "GitHub", "WhatsApp", "M-Pesa", "mPesa", "JPMorgan", "MasterCard", "WePay",
];
const KNOWN_MIXED_BY_KEY = new Map(KNOWN_MIXED.map((w) => [w.toUpperCase(), w]));

// "McKinsey", "DeAngelo", "eCommerce", "iPhone": ONE internal capital after a
// lowercase letter and everything after it lowercase → intentional, leave it.
// "HeAD" / "DIGItal" / "aBIMBOLA" don't match and get re-cased.
const INTENTIONAL_MIXED = /^[A-Z]?[a-z]+[A-Z][a-z]+$/;

function collapse(s: string): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

function capFirstLetter(w: string): string {
  // Capitalise the first LETTER (skips leading "(" or quotes), lowercase the rest.
  const i = w.search(/\p{L}/u);
  if (i < 0) return w;
  return w.slice(0, i) + w.charAt(i).toUpperCase() + w.slice(i + 1).toLowerCase();
}

function stripPunct(w: string): string {
  return w.replace(/^[^\p{L}\p{N}&]+|[^\p{L}\p{N}&]+$/gu, "");
}

// One alphabetic chunk (no spaces / hyphens / slashes) of a job title.
function caseTitleChunk(chunk: string, opts: { first: boolean }): string {
  const core = stripPunct(chunk);
  if (!core) return chunk;
  const key = core.toUpperCase();
  const acr = ACRONYM_BY_KEY.get(key);
  if (acr) return chunk.replace(core, acr);
  const mixed = KNOWN_MIXED_BY_KEY.get(key);
  if (mixed) return chunk.replace(core, mixed);
  if (INTENTIONAL_MIXED.test(core)) return chunk;
  if (!opts.first && CONNECTORS.has(core.toLowerCase())) return chunk.replace(core, core.toLowerCase());
  return capFirstLetter(chunk);
}

export function titleCaseJobTitle(input: string): string {
  const s = collapse(input);
  if (!s) return "";
  const words = s.split(" ");
  return words
    .map((word, wi) => {
      // Hyphen / slash parts are each capitalised ("Vice-President", "Risk/Compliance").
      return word
        .split(/([-\/])/)
        .map((part, pi) => (pi % 2 === 1 ? part : caseTitleChunk(part, { first: wi === 0 && pi === 0 })))
        .join("");
    })
    .join(" ");
}

// Personal names: Title Case with Mc / Mac / O' / hyphen handling. Deliberate
// mixed case ("DeAngelo", "LaToya", "MacDonald" as typed) is preserved.
function caseNameChunk(chunk: string): string {
  if (!chunk) return chunk;
  if (INTENTIONAL_MIXED.test(chunk)) return chunk;
  const lower = chunk.toLowerCase();
  if (/^mc[a-z]{2,}$/.test(lower)) return "Mc" + capFirstLetter(lower.slice(2));
  if (/^mac[a-z]{4,}$/.test(lower) && /^Mac[A-Z]/.test(chunk)) return "Mac" + capFirstLetter(lower.slice(3));
  return capFirstLetter(chunk);
}

export function properCaseName(input: string): string {
  const s = collapse(input).replace(/[\s.,;:]+$/u, "");
  if (!s) return "";
  return s
    .split(" ")
    .map((word) =>
      word
        .split(/([-'’])/)
        .map((part, pi) => (pi % 2 === 1 ? part : caseNameChunk(part)))
        .join("")
    )
    .join(" ");
}

// Trim + lowercase the domain part. The local part is left as typed (mailbox
// local parts are case-sensitive in theory; callers that want a fully
// lowercased address — e.g. the outbound work email — lowercase it themselves).
export function normalizeEmail(input: string): string {
  const s = (input ?? "").trim();
  const at = s.lastIndexOf("@");
  if (at < 0) return s;
  return s.slice(0, at) + "@" + s.slice(at + 1).toLowerCase();
}
