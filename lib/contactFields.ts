// Pure helpers for the inline contact-field editors (ContactDetails). Shared by
// the server actions and the client components — no DB, no React.

// Canonical LinkedIn form — the SAME rule the CRM uses for
// contacts.linkedin_url_canonical (pmg-agent lib/pipeline/company-normalizer):
// https scheme, any linkedin.com host collapsed to www.linkedin.com, lowercased
// path, no trailing slash, query/fragment dropped. Returns null when the input
// isn't a usable /in/<slug> profile URL.
export function canonicalizeLinkedinUrl(input: string | null | undefined): string | null {
  const raw = input?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const host = parsed.hostname.toLowerCase();
    if (!(host === "linkedin.com" || host.endsWith(".linkedin.com"))) return null;
    const path = parsed.pathname.replace(/\/+$/, "").toLowerCase();
    const m = path.match(/^\/in\/([^/]+)$/);
    if (!m || m[1].length < 3) return null;
    return `https://www.linkedin.com${path}`;
  } catch {
    return null;
  }
}

// "in/slug" — what the read-only row shows, so the link says WHO it is.
export function linkedinSlug(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    const m = u.pathname.match(/\/(in|company|pub)\/([^/?#]+)/i);
    if (m) return `${m[1].toLowerCase()}/${decodeURIComponent(m[2])}`;
    return u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/$/, "");
  } catch {
    return url;
  }
}

// Name convention (matches CRM intake): full_name_clean keeps the FULL name;
// first_name_clean / last_name_clean are the greeting fields. The editor takes
// first + last and derives the full name as "first last" (single-spaced).
export function fullNameFrom(first: string, last: string): string {
  return [first.trim(), last.trim()].filter(Boolean).join(" ").replace(/\s+/g, " ");
}

// Best-effort first/last for pre-filling the editor when the greeting fields
// are empty: first token → first, the rest → last.
export function splitForEdit(full: string | null | undefined): { first: string; last: string } {
  const t = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (t.length === 0) return { first: "", last: "" };
  if (t.length === 1) return { first: t[0], last: "" };
  return { first: t[0], last: t.slice(1).join(" ") };
}

export function normalizePhone(v: string): string {
  return v.trim().replace(/\s+/g, " ");
}

export type FieldWriteResult = {
  ok: boolean;
  queued?: boolean;
  message: string;
  // The value now on the record (auto-applied writes), for optimistic UI.
  value?: string | null;
  // Phone moves: the other_phone value after the write (so Undo can restore it).
  other_phone?: string | null;
};
