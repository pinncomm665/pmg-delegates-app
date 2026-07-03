import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Refreshes the Supabase auth session cookie on every request and gates routes.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthRoute = path === "/login";

  // Per-app access: admins see everything; everyone else needs this app's
  // slug in app_metadata.apps (stamped when the account is provisioned).
  const md = (user?.app_metadata ?? {}) as { role?: string; apps?: string[] };
  const canAccess =
    !!user &&
    (md.role === "admin" ||
      (Array.isArray(md.apps) && md.apps.includes("delegates")));

  if (!user && !isAuthRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (user && !canAccess && !isAuthRoute) {
    return NextResponse.redirect(
      new URL(
        "/login?error=" +
          encodeURIComponent("Your account doesn't have access to this app."),
        request.url
      )
    );
  }
  if (user && canAccess && isAuthRoute) {
    return NextResponse.redirect(new URL("/delegates", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
