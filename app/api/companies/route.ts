import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/session";
import { searchCompanies } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json([], { status: 401 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const rows = await searchCompanies(q);
  return NextResponse.json(rows);
}
