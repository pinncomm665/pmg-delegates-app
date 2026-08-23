"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabaseServer";

export async function login(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const sb = supabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    // Keep the typed email so the user only re-enters the password.
    redirect(
      "/login?error=" + encodeURIComponent("Invalid email or password") +
      (email ? "&email=" + encodeURIComponent(email) : "")
    );
  }
  redirect("/dashboard");
}

export async function logout() {
  const sb = supabaseServer();
  await sb.auth.signOut();
  redirect("/login");
}
