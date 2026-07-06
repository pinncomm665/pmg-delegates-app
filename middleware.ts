import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Refreshes the Supabase auth session cookie on every request and gates routes.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  // When AUTH_COOKIE_DOMAIN is set (production), share the session cookie
  // across all *.pmgapphub.com subdomains. Unset locally → host-scoped as today.
  const cookieOptions = process.env.AUTH_COOKIE_DOMAIN
    ? { domain: process.env.AUTH_COOKIE_DOMAIN, path: "/", sameSite: "lax" as const, secure: true }
    : undefined;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions,
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
          // Expire legacy host-scoped copies so they can't shadow the
          // domain-scoped ones. Appended as raw headers AFTER all cookies.set
          // calls — ResponseCookies is keyed by name, so a second
          // set(name, ...) would replace the real session cookie.
          if (process.env.AUTH_COOKIE_DOMAIN) {
            cookiesToSet.forEach(({ name }) =>
              response.headers.append("set-cookie", `${name}=; Path=/; Max-Age=0`)
            );
          }
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

  // Hub redirect rewiring (Part 2): when HUB_URL is set, unauthenticated and
  // unauthorized users are sent to the hub instead of the local /login page.
  const hubUrl = process.env.HUB_URL;

  if (!user && !isAuthRoute) {
    if (hubUrl) {
      return NextResponse.redirect(
        `${hubUrl}/login?next=${encodeURIComponent(request.url)}`
      );
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (user && !canAccess && !isAuthRoute) {
    if (hubUrl) {
      return NextResponse.redirect(`${hubUrl}/?denied=delegates`);
    }
    return NextResponse.redirect(
      new URL(
        "/login?error=" +
          encodeURIComponent("Your account doesn't have access to this app."),
        request.url
      )
    );
  }
  if (user && canAccess && isAuthRoute) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
