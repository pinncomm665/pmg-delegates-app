/**
 * lib/nameClean.ts — PORT of the PMG Agent CRM name engine (pure functions, no
 * deps). Source of truth: pmg-agent lib/utils/splitName.ts (v2 engine: titles,
 * credentials, "LASTNAME, First", particles, casing) + lib/utils/nameClean.ts
 * (precleanName). Keep in sync with the CRM — do not fork the rules here.
 * Identical copy in speakers-app / delegates-app / roundtables-app.
 *
 * App entry point: cleanNameFields(first, last) at the bottom — what the
 * ContactDetails "Name" editor saves through.
 */

/**
 * PMG Agent — splitName (v2)
 * ----------------------------------------------------------------------------
 * Single source of truth for parsing a person name into a GREETING first/last
 * (Brevo FIRSTNAME/LASTNAME, Instantly `{{firstName}}`) PLUS a confidence signal.
 * Both name cleaners call it so they can never disagree.
 *
 * Governs ONLY the greeting fields. `full_name_clean` keeps the FULL name and
 * Findymail keeps receiving the full name + domain via its own sanitizer.
 *
 * Three-layer model (see splitName.test.ts — that table is the spec):
 *   • Deterministic  — spacing, casing, honorific/title, suffixes (Jr kept /
 *     roman dropped), nicknames, comma last-name-first, headline/role/dept tails,
 *     initials, particles (Al/El/van/de/bin/bint), theophoric, apostrophes.
 *   • Dictionary     — compound-first names (Mary Ann, María José), binding
 *     prefixes (Syed, Muhammad-when-compound), Arabic-bin-drop vs Malay-bin-keep.
 *   • confidence:'low' — emitted for the knowledge-dependent residue (compound-
 *     vs-middle, multi-surname locales, cultural ordering, mixed script). The
 *     cleaner writes the best guess AND tags needs_review:name_confidence, and
 *     the backfill/cron resolves low-confidence rows via the LLM (email/slug
 *     hints).  NOTE: person-vs-org, email-as-name, embedded company are NOT this
 *     function's job — they live in classifyName (the cleaner).
 */

export type Confidence = 'high' | 'low'

export interface NameSplit {
  first: string | null
  last: string | null
  title: string | null
  confidence: Confidence
  flags: string[]
}

// ── lexicons ─────────────────────────────────────────────────────────────────

const ARABIC_ARTICLE = new Set(['al', 'el'])
const PATRONYMIC = new Set(['bin', 'binti', 'bint', 'ibn', 'ben'])
const EUROPEAN_PARTICLES = new Set([
  'van', 'von', 'der', 'den', 'de', 'del', 'della', 'dello', 'delle', 'di', 'da',
  'dos', 'das', 'du', 'la', 'le', 'st', 'ten', 'ter', 'of',
])
// Union used by the simple isParticle() check (also consumed by recovery below).
const PARTICLES = new Set<string>([...ARABIC_ARTICLE, ...PATRONYMIC, ...EUROPEAN_PARTICLES])

// "Servant of …" — never a standalone first name; binds to the next element.
const THEOPHORIC_PREFIXES = new Set([
  'abdul', 'abdel', 'abdal', 'abdol', 'abdur', 'abdoul', 'abdu', 'abdil', 'abd', 'abdulla',
])

// Honorific given-name prefixes that ALWAYS bind forward ("Syed Faisal Abbas"
// → "Syed Faisal" / "Abbas").
const ALWAYS_BIND = new Set(['syed', 'sayed', 'sayyid', 'sayyed', 'siti'])
// Very-common given names that ALSO appear as the first half of a compound
// surname (Mohamed Gamal-El-Din). They bind forward ONLY when a patronymic
// (bin/bint/ibn) follows — the unambiguous "all-given-name before the bin"
// signal — so "Muhammad Farhan bin Abdullah" → "Muhammad Farhan" but
// "Mohamed Gamal El Din" → "Mohamed" (Gamal El Din is the surname).
const PATRONYMIC_BIND = new Set(['muhammad', 'mohammed', 'mohamed', 'mohd', 'muhd', 'nur', 'noor'])

// Common compound first names (diacritics-stripped, space-joined bigram).
const COMPOUND_FIRST = new Set([
  'mary ann', 'mary anne', 'mary jane', 'mary kate', 'mary lou', 'mary jo', 'mary beth',
  'anna maria', 'maria jose', 'maria teresa', 'jo anne', 'jo ann', 'jean paul', 'jean pierre',
  'sarah jane', 'lily rose', 'ruby rose', 'billie jean', 'peggy sue', 'jose maria',
])

// Honorifics extracted into `title` (and removed from the name).
// NOTE: 'sheikh'/'sheikha' are intentionally NOT titles — they are far more
// often given/family names (policy 2026-07-13). Malaysian honorifics Dato/Datuk/
// Datin/Ts ARE titles and are stripped.
const TITLES = new Set([
  'dr', 'prof', 'mr', 'mrs', 'ms', 'miss', 'sir', 'madam', 'mx', 'eng', 'ing', 'ar', 'arch',
  'adv', 'capt', 'col', 'maj', 'lt', 'gen', 'rev', 'fr', 'hon', 'justice', 'amb', 'sen',
  'he', 'hh', 'he.', 'dato', 'datuk', 'datin', 'ts', 'hj', 'hajji', 'haji',
])

// Trailing credentials / academic suffixes — dropped.
const CREDENTIALS = new Set([
  'phd', 'mba', 'emba', 'msc', 'bsc', 'ma', 'ba', 'beng', 'meng', 'llb', 'llm', 'jd', 'md', 'mbbs',
  'cfa', 'cpa', 'cma', 'cia', 'cfp', 'cima', 'cgma', 'acca', 'aca', 'fca', 'fcca', 'cisa', 'cism',
  'crisc', 'cissp', 'ceh', 'pmp', 'prince2', 'frm', 'cfe', 'cams', 'obe', 'mbe', 'cbe', 'frs',
  'qc', 'kc', 'mcips', 'fcips', 'itil', 'togaf',
])

// Generational suffixes that STAY attached to the surname.
const KEEP_SUFFIX = new Map([
  ['jr', 'Jr.'], ['jnr', 'Jr.'], ['sr', 'Sr.'], ['snr', 'Sr.'],
])

const ROMAN_SUFFIX = new Set(['ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix'])

// Trailing job/department words sometimes glued onto a name field with no
// separator ("Ahmed Khan CEO", "Sarah Ali Finance Department") — trimmed.
const JOB_WORDS = new Set([
  'ceo', 'cfo', 'coo', 'cto', 'cio', 'cmo', 'ciso', 'evp', 'svp', 'vp', 'head', 'director',
  'manager', 'officer', 'president', 'chairman', 'chairwoman', 'founder', 'cofounder', 'partner',
  'lead', 'finance', 'department', 'dept', 'team', 'marketing', 'sales', 'operations',
])

// ── token predicates / casing ────────────────────────────────────────────────

function key(token: string): string {
  return token.replace(/\.$/, '').toLowerCase()
}
function normKey(token: string): string {
  return token.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.'’-]/g, '')
}
function isInitial(token: string): boolean {
  return /^[A-Za-z]\.?$/.test(token)
}
function isParticle(token: string): boolean {
  return PARTICLES.has(key(token))
}
function isArabicArticle(token: string): boolean {
  return ARABIC_ARTICLE.has(key(token))
}
function isPatronymic(token: string): boolean {
  return PATRONYMIC.has(key(token))
}
function isEuropeanParticle(token: string): boolean {
  return EUROPEAN_PARTICLES.has(key(token))
}
function isTheophoric(token: string): boolean {
  return THEOPHORIC_PREFIXES.has(key(token))
}
function isTitle(token: string): boolean {
  // strip ALL dots so "H.E." → "he", "Dr." → "dr"
  return TITLES.has(token.toLowerCase().replace(/\./g, ''))
}
function isCredential(token: string): boolean {
  return CREDENTIALS.has(key(token))
}
function isRoman(token: string): boolean {
  return ROMAN_SUFFIX.has(key(token))
}
function isJobWord(token: string): boolean {
  return JOB_WORDS.has(key(token))
}
function isNonLatinToken(token: string): boolean {
  return /\p{L}/u.test(token) && !/[A-Za-z]/.test(token)
}
function isCompoundFirst(a: string, b: string): boolean {
  return COMPOUND_FIRST.has(`${normKey(a)} ${normKey(b)}`)
}

/**
 * Fix the letter-casing after an apostrophe within a token. Capitalize after the
 * apostrophe only when the preceding part is a single letter (O'Brien, D'Angelo);
 * otherwise lowercase it (Sa'adeh, Ma'arij). Handles ' and ’.
 */
export function fixApostropheCasing(token: string): string {
  if (!/['’]/.test(token)) return token
  const parts = token.split(/(['’])/)
  let prevTextLen = 0
  return parts
    .map((part) => {
      if (part === "'" || part === '’') return part
      if (part.length === 0) return part
      const head = prevTextLen === 0
        ? part.charAt(0)
        : prevTextLen === 1
          ? part.charAt(0).toUpperCase()
          : part.charAt(0).toLowerCase()
      prevTextLen = part.length
      return head + part.slice(1)
    })
    .join('')
}

/** Normalize a single name token to Title case, preserving accents, hyphen
 *  parts, Mc/O' patterns. Single letters (initials) stay upper. */
export function recaseToken(tok: string): string {
  if (!tok) return tok
  if (tok.length === 1) return tok.toUpperCase()
  if (tok.includes('-')) return tok.split('-').map(recaseToken).join('-')
  const lower = tok.toLowerCase()
  let cap = lower.charAt(0).toUpperCase() + lower.slice(1)
  if (/^mc[a-z]{2,}$/.test(lower)) cap = 'Mc' + lower.charAt(2).toUpperCase() + lower.slice(3)
  return fixApostropheCasing(cap)
}

function capitalizeHead(tokens: string[]): string[] {
  if (tokens.length === 0) return tokens
  const head = tokens[0]
  if (!head) return tokens
  return [head.charAt(0).toUpperCase() + head.slice(1), ...tokens.slice(1)]
}

/** Format surname tokens: European/patronymic particles lowercase (van Gogh,
 *  de Gaulle, bin Abdullah); Arabic articles capitalized (Al Maktoum). */
export function formatSurname(tokens: string[]): string {
  if (tokens.length === 0) return ''
  return tokens
    .map((t) => {
      if (isArabicArticle(t)) return recaseToken(t)               // Al / El — always cap
      if (isEuropeanParticle(t) || isPatronymic(t)) return key(t)  // van / de / bin — always lower
      return recaseToken(t)
    })
    .join(' ')
}

function normalizeOut(s: string): string {
  return s.split(' ').map(fixApostropheCasing).join(' ')
}

/**
 * Strip a trailing LinkedIn-headline tail: "Mark Beaumont - The AI Guy" →
 * "Mark Beaumont". Cuts at the first HARD separator (pipe/bullet/middot/at) and
 * at a SPACED dash/slash (a real hyphenated surname has no surrounding spaces).
 */
export function stripHeadlineTail(name: string): string {
  let out = name.replace(/\s*[|•·@]\s*.*$/, '')
  out = out.replace(/\s+[-–—/]\s+.*$/, '')
  return out.replace(/\s+/g, ' ').trim()
}

// ── preprocessing ────────────────────────────────────────────────────────────

export interface Pre {
  tokens: string[]
  forcedSurname: string | null
  title: string | null
  keepSuffix: string | null
  flags: string[]
}

export function preprocess(raw: string): Pre {
  const flags: string[] = []
  let s = raw.trim().replace(/\s+/g, ' ')

  // nicknames in quotes / parens
  const denick = s.replace(/[“"][^”"]*[”"]/g, ' ').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
  if (denick !== s) { flags.push('nickname_removed'); s = denick }

  // headline / role / dept tail after a separator
  const dehead = stripHeadlineTail(s)
  if (dehead && dehead !== s) { flags.push('headline_removed'); s = dehead }

  // comma → last-name-first ("Smith, John") unless the right side is only suffixes
  let forcedSurname: string | null = null
  if (s.includes(',')) {
    const idx = s.indexOf(',')
    const left = s.slice(0, idx).trim()
    const right = s.slice(idx + 1).trim()
    const rightToks = right.split(' ').filter(Boolean)
    // A comma-tail is a credential when every right token is a known credential,
    // a roman numeral, or a vowel-less 3–6-char acronym ("Cpfpp", "CFA") — those
    // are never a given name, so drop them rather than treating as last-name-first.
    const looksCred = (t: string) => isCredential(t) || isRoman(t) || (/^[A-Za-z]{3,6}$/.test(t) && !/[aeiou]/i.test(t))
    if (right && rightToks.every(looksCred)) {
      flags.push('credential_suffix_removed'); s = left
    } else if (right && left) {
      forcedSurname = formatSurname(left.split(' ').filter(Boolean))
      flags.push('reordered'); s = right
    }
  }

  let tokens = s.split(' ').filter(Boolean)

  // mixed script → keep Latin tokens, flag low confidence later
  if (tokens.some(isNonLatinToken)) {
    const latin = tokens.filter((t) => !isNonLatinToken(t))
    if (latin.length) { tokens = latin; flags.push('mixed_script') }
  }

  // leading titles → extract
  const titleParts: string[] = []
  while (tokens.length > 1 && isTitle(tokens[0])) titleParts.push(tokens.shift() as string)

  // trailing credentials / roman / job-words → drop
  while (tokens.length > 1) {
    const last = tokens[tokens.length - 1]
    if (isCredential(last)) { tokens.pop(); flags.push('credential_suffix_removed'); continue }
    if (isRoman(last)) { tokens.pop(); flags.push('roman_suffix_removed'); continue }
    if (isJobWord(last)) { tokens.pop(); flags.push('job_word_removed'); continue }
    break
  }

  // trailing generational suffix → keep, re-attach to surname later
  let keepSuffix: string | null = null
  if (tokens.length > 1 && KEEP_SUFFIX.has(key(tokens[tokens.length - 1]))) {
    keepSuffix = KEEP_SUFFIX.get(key(tokens.pop() as string)) as string
  }

  tokens = tokens.map(recaseToken)

  return { tokens, forcedSurname, title: titleParts.length ? titleParts.join(' ') : null, keepSuffix, flags }
}

// ── core split ───────────────────────────────────────────────────────────────

function firstNameSpan(tokens: string[]): { first: string; end: number } {
  let end = 1
  const k0 = key(tokens[0])
  if (isTheophoric(tokens[0]) && tokens.length > 1) end = 2
  else if (ALWAYS_BIND.has(k0) && tokens.length >= 3 && !isParticle(tokens[1])) end = 2
  else if (PATRONYMIC_BIND.has(k0) && tokens.length >= 3 && !isParticle(tokens[1]) && isPatronymic(tokens[2])) end = 2
  else if (tokens.length >= 2 && isCompoundFirst(tokens[0], tokens[1])) end = 2
  return { first: tokens.slice(0, end).join(' '), end }
}

function surnameSpan(tokens: string[], firstEnd: number): { tokens: string[]; start: number } {
  const rem = tokens.slice(firstEnd)
  if (rem.length === 0) return { tokens: [], start: tokens.length }

  // 1) last Arabic article cluster wins (drops any bin-lineage before it), EXCEPT
  //    an article that follows a theophoric token ("Abd El Fattah" = the given
  //    name Abdel-Fattah, not a surname) — skip those.
  let artIdx = -1
  for (let k = 0; k < rem.length; k++) {
    if (!isArabicArticle(rem[k])) continue
    if (k > 0 && isTheophoric(rem[k - 1])) continue
    artIdx = k
  }
  if (artIdx >= 0) { const start = firstEnd + artIdx; return { tokens: tokens.slice(start), start } }

  // 2) last patronymic cluster (Malay "bin Abdullah" kept as surname)
  let patIdx = -1
  for (let k = 0; k < rem.length; k++) if (isPatronymic(rem[k])) patIdx = k
  if (patIdx >= 0) { const start = firstEnd + patIdx; return { tokens: tokens.slice(start), start } }

  // 3) first European particle → surname runs from there to the end
  for (let k = 0; k < rem.length; k++) {
    if (isEuropeanParticle(rem[k])) { const start = firstEnd + k; return { tokens: tokens.slice(start), start } }
  }

  // 4) default: final token only (any earlier middle words are dropped)
  const start = tokens.length - 1
  return { tokens: [tokens[start]], start }
}

function appendSuffix(last: string | null, suffix: string | null): string | null {
  if (!suffix) return last
  return last ? `${last} ${suffix}` : last
}

export function splitName(rawInput: string | null | undefined): NameSplit {
  const empty: NameSplit = { first: null, last: null, title: null, confidence: 'low', flags: ['empty'] }
  if (!rawInput?.trim()) return empty

  const pre = preprocess(rawInput)
  const flags = pre.flags
  let confidence: Confidence = flags.includes('mixed_script') ? 'low' : 'high'

  const finish = (first: string | null, last: string | null): NameSplit => ({
    first: first ? normalizeOut(first) : null,
    last: last ? normalizeOut(last) : null,
    title: pre.title,
    confidence,
    flags,
  })

  let tokens = pre.tokens
  if (tokens.length === 0) {
    if (pre.forcedSurname) return finish(null, appendSuffix(pre.forcedSurname, pre.keepSuffix))
    return finish(null, null)
  }

  // comma last-name-first: surname is explicit; just resolve the given side
  if (pre.forcedSurname !== null) {
    const span = firstNameSpan(tokens)
    return finish(span.first, appendSuffix(pre.forcedSurname, pre.keepSuffix))
  }

  // leading initials
  let i = 0
  while (i < tokens.length && isInitial(tokens[i])) i++
  if (i > 0) {
    const rest = tokens.slice(i)
    if (rest.length <= 1) {
      if (rest.length === 0) { confidence = 'low'; flags.push('initials_only') }
      return finish(tokens.join(' '), appendSuffix(null, pre.keepSuffix))
    }
    tokens = rest // ≥2 real words → the initials are noise
  }

  if (tokens.length === 1) return finish(tokens[0], appendSuffix(null, pre.keepSuffix))

  // Conventional split: first = first token (or dictionary span), surname =
  // particle-aware trailing run. Dropping a genuine MIDDLE name ("George Walker
  // Bush" → George/Bush) is the operator-endorsed DEFAULT and stays high-
  // confidence — only initials-only / mixed-script / empty are low. Locale-
  // specific multi-surname/ordering risk is routed to the LLM by the cleaner
  // using country_iso (splitName has no locale signal).
  const span = firstNameSpan(tokens)
  const sur = surnameSpan(tokens, span.end)
  const last = sur.tokens.length ? formatSurname(sur.tokens) : null

  return finish(span.first, appendSuffix(last, pre.keepSuffix))
}

// Surname particles — attach to the last name; never treated as credentials and
// never dropped as initials.
const NAME_PARTICLES = new Set([
  'al', 'el', 'bin', 'ibn', 'ben', 'van', 'von', 'de', 'del', 'della', 'di', 'da',
  'dos', 'das', 'la', 'le', 'du', 'den', 'der', 'ter', 'ten', 'abu', 'abd', 'abdel',
  'abdul', 'st', 'san', 'santa', 'mac', 'mc', 'o',
])

// Post-nominal credential tokens to strip from the END of a name. NORMALISED form
// (lowercase, no dots / ® / ™ / hyphens) — so "PMP®"→pmp, "B-Tech"→btech, "PMI-PBA®"→pmipba.
// DELIBERATELY EXCLUDES short tokens that double as real surnames (Ma, Ba, Bs, Do)
// — stripping those truncated genuine names in the past (the Ma/Ba collision).
const NAME_CREDENTIALS = new Set([
  // generational / honorific post-nominals
  'jr', 'sr', 'ii', 'iii', 'iv', 'v', 'esq',
  // academic degrees
  'phd', 'dphil', 'md', 'mbbs', 'mba', 'emba', 'dba', 'msc', 'bsc', 'bcom', 'mcom',
  'beng', 'meng', 'llb', 'llm', 'jd', 'pgdip', 'pgcert', 'hdip', 'btech', 'mtech',
  // professional certifications
  'cpa', 'cfa', 'cfe', 'cma', 'cia', 'cisa', 'cism', 'crisc', 'cissp', 'ccsp', 'pmp',
  'pmipba', 'prince2', 'itil', 'csm', 'cspo', 'frm', 'cfp', 'caia', 'cqf', 'cmp',
  'cbdm', 'cssyb', 'aca', 'fca', 'acca', 'fcca', 'cima', 'cgma', 'acma', 'fcma',
  // chartered / fellowship bodies + civic honours
  'obe', 'mbe', 'cbe', 'kbe', 'dbe', 'obc', 'frs', 'frcs', 'frcp', 'mrcp', 'frcgp',
  'mrcgp', 'fmedsci', 'frics', 'mrics', 'acib', 'fcib', 'acii', 'fcii', 'mcipd',
  'fcipd', 'mcim', 'fcim', 'mlog', 'flog', 'mcips', 'fcips', 'gaicd', 'apr', 'prsa',
  'shrm', 'sphr', 'phr', 'mcse', 'ccna', 'ccnp', 'pe', 'sh', 'rae', 'ifce',
])

const HONORIFIC_PREFIX = /^\s*(mr|mrs|ms|miss|dr|prof|sir|dame|lady|lord|rev|eng|hon|capt|col|gen|lt|maj|cdr|amb)\.?\s+/i

function normCred(token: string): string {
  return token.toLowerCase().replace(/[®™.,()]/g, '').replace(/-/g, '')
}

/**
 * Strip honorific prefix, parentheticals, trailing post-nominal credentials, and
 * stray single-letter initials — WITHOUT splitting. Returns the cleaned full name.
 * Never blanks a name that had content (falls back to whitespace-collapsed input).
 */
export function precleanName(fullName: string | null | undefined): string {
  const original = (fullName ?? '').replace(/\s+/g, ' ').trim()
  if (!original) return ''

  let s = original
    .replace(/\([^)]*\)/g, ' ')   // parentheticals: "(Osinowo)"
    .replace(HONORIFIC_PREFIX, '') // leading title
    .replace(/,/g, ' ')           // commas separate trailing credentials
    .replace(/\s+/g, ' ')
    .trim()

  let tokens = s.split(' ').filter(Boolean)

  // Strip trailing credential tokens (keep at least one token).
  while (tokens.length > 1 && NAME_CREDENTIALS.has(normCred(tokens[tokens.length - 1]))) tokens.pop()

  // Drop single-letter initials (with/without trailing period) unless a particle —
  // they're noise as LEADING or MIDDLE tokens ("M. Yousuf Mirza" → drop "M";
  // "Mohammed A Alkahtani" → drop "A"). EXCEPTION: a TRAILING initial that is the
  // ONLY surname ("Raymond L.", "Choo K." → keep the "L"/"K") — dropping it would
  // erase the last name entirely, which is worse than keeping an abbreviated one
  // (the name_dirty flag can surface it for review). So a single-letter token is
  // kept iff it's the final token of a multi-token name.
  const lastIdx = tokens.length - 1
  tokens = tokens.filter((t, idx) => {
    const bare = t.replace(/\./g, '')
    const isInitial = bare.length === 1 && !NAME_PARTICLES.has(bare.toLowerCase())
    if (!isInitial) return true
    return idx === lastIdx && lastIdx >= 1 // keep a trailing initial that serves as the surname
  })

  const cleaned = tokens.join(' ').trim()
  return cleaned || original // never blank a name that had content
}

// ── App helpers (not in pmg-agent) ───────────────────────────────────────────

/**
 * Full display name through the same engine, KEEPING middle names: nickname /
 * headline tails stripped, titles + trailing credentials / roman / job words
 * dropped, "LASTNAME, First" reordered to "First Lastname", tokens re-cased,
 * surname particles formatted. "" → "".
 */
// Trailing comma/space-separated credentials ("…, PE, PMP", "… MBA") — the
// nameClean credential list is broader than the v2 engine's and tolerates the
// comma form, so strip them BEFORE the engine sees a comma (which it would
// otherwise read as "LASTNAME, First").
export function stripCredentialTail(raw: string): string {
  let t = (raw ?? '').trim()
  for (;;) {
    const m = t.match(/^(.*?)[\s,]+([^\s,]+)$/)
    if (!m) break
    if (!NAME_CREDENTIALS.has(normCred(m[2]))) break
    t = m[1].replace(/[\s,]+$/, '')
  }
  return t || (raw ?? '').trim()
}

export function cleanFullName(raw: string | null | undefined, opts: { surname?: boolean } = {}): string {
  if (!raw?.trim()) return ''
  const pre = preprocess(stripCredentialTail(raw))
  // Particle casing (van / de / bin lower, Al / El capped): the whole string
  // when it IS a surname, otherwise everything after the given name.
  const toks = pre.tokens
  const given = opts.surname || toks.length === 0
    ? (toks.length ? formatSurname(toks).split(' ') : [])
    : [fixApostropheCasing(toks[0]), ...(toks.length > 1 ? formatSurname(toks.slice(1)).split(' ') : [])]
  const parts = pre.forcedSurname ? [...given, pre.forcedSurname] : given
  const out = parts.join(' ').trim()
  const withSuffix = pre.keepSuffix ? `${out} ${pre.keepSuffix}`.trim() : out
  // precleanName on top: stray initials / parentheticals / commas (CRM rule for
  // full_name_clean = precleanName(fullName)); it preserves the engine casing.
  return precleanName(withSuffix || raw)
}

export type CleanNameFields = { first: string; last: string; full: string }

/**
 * What the app's Name editor saves. Two shapes:
 *   • last empty → the first box holds a FULL name → full engine split
 *     ("Dr. Smith, John PhD" → John / Smith; "M. Yousuf Mirza" → Yousuf / Mirza).
 *   • both boxes → each box cleaned on its own (honorific off the first, credentials
 *     off the last, engine casing); the typed split is respected.
 * full_name_clean = the cleaned FULL name (middle names kept), per the CRM rule.
 */
export function cleanNameFields(firstRaw: string, lastRaw: string): CleanNameFields {
  const first = (firstRaw ?? '').replace(/\s+/g, ' ').trim()
  const last = (lastRaw ?? '').replace(/\s+/g, ' ').trim()
  if (!first && !last) return { first: '', last: '', full: '' }
  if (!last || !first) {
    const whole = stripCredentialTail(first || last)
    const sp = splitName(whole)
    const f = sp.first ?? ''
    const l = sp.last ?? ''
    const full = cleanFullName(whole) || [f, l].filter(Boolean).join(' ')
    return { first: f, last: l, full }
  }
  const f = cleanFullName(first)
  const l = cleanFullName(last, { surname: true })
  const full = cleanFullName(`${first} ${last}`) || [f, l].filter(Boolean).join(' ')
  return { first: f, last: l, full }
}
