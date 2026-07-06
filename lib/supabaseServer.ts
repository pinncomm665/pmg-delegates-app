import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Auth-aware client (anon key + user session cookies). Used to identify the
// logged-in user. Data reads/writes go through supabaseAdmin after the role
// check, so we never expose the service key to the browser.
export function supabaseServer() {
  const cookieStore = cookies();

  // When AUTH_COOKIE_DOMAIN is set (production), share the session cookie
  // across all *.pmgapphub.com subdomains. Unset locally → host-scoped as today.
  const cookieOptions = process.env.AUTH_COOKIE_DOMAIN
    ? { domain: process.env.AUTH_COOKIE_DOMAIN, path: "/", sameSite: "lax" as const, secure: true }
    : undefined;

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // called from a Server Component — ignore; middleware refreshes.
          }
        },
      },
    }
  );
}
