import { NextResponse, type NextRequest } from "next/server";
import { hasMalformedPercentEscape } from "@/lib/uri";

/** Answer a malformed percent-escape in the path or query with a clean 404 instead of a framework DecodeError 500. */
export function proxy(request: NextRequest) {
  const { pathname, search, origin } = request.nextUrl;
  if (!hasMalformedPercentEscape(pathname, search)) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.rewrite(new URL("/not-found", origin), { status: 404 });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
