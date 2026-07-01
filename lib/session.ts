import { redirect } from "next/navigation";
import { supabaseServer } from "./supabaseServer";

export type AppUser = {
  id: string;
  email: string;
  role: string; // 'delegate_team' | 'admin' | ...
};

// Role is stored on the auth user's metadata when the admin creates the account.
// app_metadata.role is preferred (not user-editable); fall back to user_metadata.
export async function getUser(): Promise<AppUser | null> {
  const sb = supabaseServer();
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return null;
  const u = data.user;
  const role =
    (u.app_metadata as any)?.role ||
    (u.user_metadata as any)?.role ||
    "delegate_team";
  return { id: u.id, email: u.email ?? "", role };
}

export async function requireUser(): Promise<AppUser> {
  const u = await getUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireAdmin(): Promise<AppUser> {
  const u = await requireUser();
  if (u.role !== "admin") redirect("/delegates");
  return u;
}
