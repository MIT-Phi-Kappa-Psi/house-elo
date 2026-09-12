import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, expectedToken } from "./lib/auth";

export default async function proxy(request: NextRequest) {
  const expected = await expectedToken();
  if (!expected) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/login")) return NextResponse.next();

  if (request.cookies.get(AUTH_COOKIE)?.value === expected) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
