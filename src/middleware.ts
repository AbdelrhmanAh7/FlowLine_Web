import { NextResponse, type NextRequest } from "next/server";
import { isPlaceholderSlug } from "@/lib/slug";

export function middleware(request: NextRequest) {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(request.nextUrl.pathname);
    if (request.nextUrl.search) {
      decodeURIComponent(request.nextUrl.search);
    }
  } catch {
    // Malformed URI percent-escape sequence (e.g. %E0%A4%A)
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404 });
    }
    return NextResponse.rewrite(new URL("/not-found", request.nextUrl.origin), { status: 404 });
  }

  // Check for workspace placeholder slugs in /w/:slug/* or /api/workspaces/:wid/*
  const segments = decodedPath.split("/").filter(Boolean);
  if (segments[0] === "w" && segments[1] && isPlaceholderSlug(segments[1])) {
    return NextResponse.rewrite(new URL("/not-found", request.nextUrl.origin), { status: 404 });
  }
  if (segments[0] === "api" && segments[1] === "workspaces" && segments[2] && isPlaceholderSlug(segments[2])) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Workspace not found" } }, { status: 404 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
