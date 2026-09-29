// The Delegates app is retired: People CRM (people.pmgapphub.com) replaces
// it (Syed 2026-09-29). Every page request is redirected to the same place in
// People, query string kept, so bookmarks and links in Slack / email keep
// working. Record ids are shared (same tables), so /x/<id> lands on the same
// person. API routes are NOT redirected — anything still calling them keeps
// working. Temporary (307) so it can be undone: set KEEP_OLD_APP=1 on the
// service to switch the redirect off.
import { NextResponse, type NextRequest } from "next/server";

const PEOPLE = process.env.PEOPLE_APP_URL ?? "https://people.pmgapphub.com";
const SAME_PATH = ['/delegates', '/dashboard', '/activity', '/add-contact', '/downloads', '/my-changes', '/admin/queue', '/login', '/maintenance'];

export function peoplePathFor(path: string): string {
  if (path === "/" || path === "") return "/delegates";
  if (SAME_PATH.some((p) => path === p || path.startsWith(p + "/"))) return path;
  return "/home";
}

export function retiredRedirect(request: NextRequest): NextResponse | null {
  if (process.env.KEEP_OLD_APP === "1") return null;
  const path = request.nextUrl.pathname;
  if (path.startsWith("/api/") || path.startsWith("/_next/")) return null;
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const target = new URL(peoplePathFor(path) + request.nextUrl.search, PEOPLE);
  return NextResponse.redirect(target, 307);
}
