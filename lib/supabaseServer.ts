import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Auth-aware client (anon key + user session cookies). Used to identify the
// logged-in user. Data reads/writes go through supabaseAdmin after the role
// check, so we never expose the service key to the browser.
export function supabaseServer() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
