import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Refreshes the Supabase auth session cookie on every request, gates routes,
// and forwards the verified user to pages via the x-pmg-user header so
// lib/session doesn't pay a second auth round trip per render.
export async function middleware(request: NextRequest) {
  // Never trust a client-supplied copy of the identity header.
  request.headers.delete("x-pmg-user");

  // When AUTH_COOKIE_DOMAIN is set (production), share the session cookie
  // across all *.pmgapphub.com subdomains. Unset locally → host-scoped as today.
  const cookieOptions = process.env.AUTH_COOKIE_DOMAIN
    ? { domain: process.env.AUTH_COOKIE_DOMAIN, path: "/", sameSite: "lax" as const, secure: true }
    : undefined;

  let sessionCookies: { name: string; value: string; options?: any }[] = [];

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
          sessionCookies = cookiesToSet;
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
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

  // Hub redirect rewiring (Part 2): when HUB_URL is set, unauthenticated and
  // unauthorized users are sent to the hub instead of the local /login page.
  const hubUrl = process.env.HUB_URL;

  if (!user && !isAuthRoute) {
    if (hubUrl) {
      // Behind Railway's proxy request.url resolves to the internal host
      // (e.g. https://localhost:8080), so rebuild the public return-to URL
      // from the forwarded headers. Absent locally → fall back to request.url.
      const fwdHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
      const fwdProto =
        request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
      const returnTo = fwdHost
        ? `${fwdProto}://${fwdHost}${request.nextUrl.pathname}${request.nextUrl.search}`
        : request.url;
      return NextResponse.redirect(
        `${hubUrl}/login?next=${encodeURIComponent(returnTo)}`
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

  // Forward the verified user so lib/session reads it without a second auth
  // round trip. encodeURIComponent keeps the header ASCII-safe.
  if (user) {
    request.headers.set(
      "x-pmg-user",
      encodeURIComponent(
        JSON.stringify({
          id: user.id,
          email: user.email ?? null,
          app_metadata: user.app_metadata ?? {},
          user_metadata: user.user_metadata ?? {},
        })
      )
    );
  }

  const response = NextResponse.next({ request });
  sessionCookies.forEach(({ name, value, options }) =>
    response.cookies.set(name, value, options)
  );
  // Expire legacy host-scoped copies so they can't shadow the
  // domain-scoped ones. Appended as raw headers AFTER all cookies.set
  // calls — ResponseCookies is keyed by name, so a second
  // set(name, ...) would replace the real session cookie.
  if (process.env.AUTH_COOKIE_DOMAIN) {
    sessionCookies.forEach(({ name }) =>
      response.headers.append("set-cookie", `${name}=; Path=/; Max-Age=0`)
    );
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
