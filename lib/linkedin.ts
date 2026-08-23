// LinkedIn profile URL helpers shared by the detail page (ContactDetails) and
// its server actions. Mirrors the CRM canonical form (pmg-agent
// company-normalizer): https scheme, host collapsed to www.linkedin.com,
// lower-cased path, query/fragment/trailing slash dropped.

// Canonical profile URL, or null when the input isn't a linkedin.com/in/<slug>.
export function canonicalLinkedin(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    const host = u.hostname.toLowerCase();
    if (!(host === "linkedin.com" || host.endsWith(".linkedin.com"))) return null;
    const m = u.pathname.match(/^\/in\/([^/?#]+)/i);
    if (!m) return null;
    const slug = decodeURIComponent(m[1]).toLowerCase().replace(/\/+$/, "");
    if (!/^[^\s/?#]+$/.test(slug)) return null;
    return `https://www.linkedin.com/in/${slug}`;
  } catch {
    return null;
  }
}

// "in/slug" for display.
export function linkedinSlug(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    const path = u.pathname.replace(/\/+$/, "").replace(/^\/+/, "");
    return path || u.hostname;
  } catch {
    return url;
  }
}
