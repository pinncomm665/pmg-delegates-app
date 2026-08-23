// Tiny unit check for lib/phone.ts — run with `node scripts/phone.test.ts`
// (Node ≥ 22.18 strips types natively; no ts-node/tsx needed).
import assert from "node:assert/strict";
import { normalizePhone, formatPhone, countryIsoFromEdition } from "../lib/phone.ts";
import { titleCaseJobTitle, properCaseName, normalizeEmail } from "../lib/textCase.ts";
import { canonicalizeLinkedinUrl } from "../lib/contactFields.ts";
import { cleanNameFields, cleanFullName, splitName } from "../lib/nameClean.ts";

const e164 = (r: ReturnType<typeof normalizePhone>) => ("e164" in r ? r.e164 : `ERROR: ${r.error}`);

assert.equal(e164(normalizePhone("0803 535 8808", { countryIso: "NG" })), "+2348035358808");
assert.equal(e164(normalizePhone("+234 803 535 8808", {})), "+2348035358808");
assert.equal(e164(normalizePhone("00234 803 535 8808", {})), "+2348035358808");
assert.equal(e164(normalizePhone("60193107646", { countryIso: "MY" })), "+60193107646");
assert.equal(e164(normalizePhone("019-310 7646", { editionCountry: "10DX Malaysia 2026" })), "+60193107646");
assert.equal(e164(normalizePhone("0803 535 8808", { companyCountryIso: "ng" })), "+2348035358808");
assert.ok("error" in normalizePhone("8035358808", {}), "no hints → error");
assert.equal(e164(normalizePhone("971567773742", { countryIso: "SA" })), "+971567773742");
assert.equal(e164(normalizePhone("353868385969", {})), "+353868385969");
assert.ok("error" in normalizePhone("255", { countryIso: "TZ" }), "bare country code → error");
assert.ok("error" in normalizePhone("8035358808", { editionCountry: "4WARD MENA 2027" }), "region edition → no country → error");
assert.ok("error" in normalizePhone("", { countryIso: "NG" }), "empty → error");
assert.equal(countryIsoFromEdition("VERIFY Saudi Arabia 2026"), "SA");
assert.equal(countryIsoFromEdition("4WARD MENA 2027"), null);
assert.equal(formatPhone("+2348035358808"), "+234 803 535 8808");
assert.equal(formatPhone("garbage"), "garbage");
assert.equal(formatPhone(null), null);

// ── textCase ────────────────────────────────────────────────────────────────
assert.equal(titleCaseJobTitle("HeAD of DIGItal"), "Head of Digital");
assert.equal(titleCaseJobTitle("chief information officer"), "Chief Information Officer");
assert.equal(titleCaseJobTitle("ciso & dpo"), "CISO & DPO");
assert.equal(titleCaseJobTitle("head, digital banking and partnerships"), "Head, Digital Banking and Partnerships");
assert.equal(titleCaseJobTitle("vice-president, risk & compliance"), "Vice-President, Risk & Compliance");
assert.equal(titleCaseJobTitle("  svp   digital  banking  "), "SVP Digital Banking");
assert.equal(titleCaseJobTitle("Partner at McKinsey"), "Partner at McKinsey");
assert.equal(titleCaseJobTitle("head of eCommerce and iOS apps"), "Head of eCommerce and iOS Apps");
assert.equal(titleCaseJobTitle("Head of AI/ML"), "Head of AI/ML");
assert.equal(titleCaseJobTitle("of counsel"), "Of Counsel");
assert.equal(properCaseName("aBIMBOLA ademola"), "Abimbola Ademola");
assert.equal(properCaseName("o'brien"), "O'Brien");
assert.equal(properCaseName("mcdonald"), "McDonald");
assert.equal(properCaseName("  jean-luc   picard. "), "Jean-Luc Picard");
assert.equal(properCaseName("DeAngelo"), "DeAngelo");
assert.equal(normalizeEmail("  Name@Example.COM "), "Name@example.com");
assert.equal(normalizeEmail("nope"), "nope");

// ── LinkedIn canonicalisation ───────────────────────────────────────────────
const LI = "https://www.linkedin.com/in/john-doe";
assert.equal(canonicalizeLinkedinUrl("john-doe"), LI);
assert.equal(canonicalizeLinkedinUrl("in/john-doe"), LI);
assert.equal(canonicalizeLinkedinUrl("linkedin.com/in/John-Doe/"), LI);
assert.equal(canonicalizeLinkedinUrl("https://ww.linkedin.com/in/john-doe?trk=x#y"), LI);
assert.equal(canonicalizeLinkedinUrl("http://mobile.linkedin.com/in/john-doe"), LI);
assert.equal(canonicalizeLinkedinUrl("https://twitter.com/in/john-doe"), null);
assert.equal(canonicalizeLinkedinUrl("ab"), null);

// ── name engine (port of pmg-agent splitName) ───────────────────────────────
assert.deepEqual(cleanNameFields("Dr. Hassan Dajani, PE, PMP", ""), { first: "Hassan", last: "Dajani", full: "Hassan Dajani" });
assert.deepEqual(cleanNameFields("SMITH, john", ""), { first: "John", last: "Smith", full: "John Smith" });
assert.deepEqual(cleanNameFields("aBIMBOLA", "ademola"), { first: "Abimbola", last: "Ademola", full: "Abimbola Ademola" });
assert.deepEqual(cleanNameFields("Mr. Ahmed", "Khan MBA"), { first: "Ahmed", last: "Khan", full: "Ahmed Khan" });
assert.deepEqual(cleanNameFields("jan", "van der merwe"), { first: "Jan", last: "van der Merwe", full: "Jan van der Merwe" });
assert.deepEqual(cleanNameFields("M. Yousuf Mirza", ""), { first: "Yousuf", last: "Mirza", full: "Yousuf Mirza" });
assert.equal(cleanFullName("mohammed al maktoum, phd"), "Mohammed Al Maktoum");
assert.equal(splitName("Syed Faisal Abbas").first, "Syed Faisal");
assert.equal(cleanNameFields("", "").full, "");

console.log("phone.test.ts: all assertions passed");
