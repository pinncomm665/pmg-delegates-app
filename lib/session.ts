import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { supabaseServer } from "./supabaseServer";

export type AppUser = {
  id: string;
  email: string;
  role: string; // 'delegate_team' | 'reviewer' | 'admin' | ...
  // Optional write scope: edition names and/or event ids from app_metadata.editions.
  // Absent/empty → full access (today's behaviour). See lib/policy.ts.
  editions: string[] | null;
};

// Role + scope live on the auth user's app_metadata (set by the admin when the
// account is provisioned — NOT user-editable). user_metadata is deliberately
// ignored: a user could set their own role there.
function fromAuthUser(u: any): AppUser {
  const md = (u?.app_metadata ?? {}) as { role?: string; editions?: unknown };
  const role = typeof md.role === "string" && md.role ? md.role : "delegate_team";
  const editions = Array.isArray(md.editions)
    ? (md.editions as unknown[]).map(String).map((s) => s.trim()).filter(Boolean)
    : null;
  return { id: u.id, email: u.email ?? "", role, editions: editions && editions.length ? editions : null };
}

export async function getUser(): Promise<AppUser | null> {
  // Middleware already verified the session and forwarded the user via
  // x-pmg-user — reading it here saves a second auth round trip per render.
  const fwd = headers().get("x-pmg-user");
  if (fwd) {
    try {
      return fromAuthUser(JSON.parse(decodeURIComponent(fwd)));
    } catch {}
  }
  const sb = supabaseServer();
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return null;
  return fromAuthUser(data.user);
}

export async function requireUser(): Promise<AppUser> {
  const u = await getUser();
  if (!u) redirect("/login");
  return u;
}

export function isAdmin(u: AppUser): boolean {
  return u.role === "admin";
}

// admin OR reviewer — may access the review queue and approve/reject.
export function isReviewer(u: AppUser): boolean {
  return u.role === "admin" || u.role === "reviewer";
}

export async function requireAdmin(): Promise<AppUser> {
  const u = await requireUser();
  if (!isAdmin(u)) redirect("/delegates");
  return u;
}

export async function requireReviewer(): Promise<AppUser> {
  const u = await requireUser();
  if (!isReviewer(u)) redirect("/delegates");
  return u;
}
