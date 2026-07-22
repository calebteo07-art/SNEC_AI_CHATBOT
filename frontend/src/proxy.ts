import { NextResponse, type NextRequest } from "next/server";

/* Cookie-presence fast path: signed-out visitors get redirected to the login
 * screen before any protected shell flashes. Real authorization stays with
 * the client guards (role/check-in logic) and the API's JWT validation —
 * this only checks that the auth cookie exists. */
export function proxy(request: NextRequest) {
  if (!request.cookies.has("eyebot_token")) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/homepage/:path*",
    "/chat",
    "/cases/:path*",
    "/flashcards",
    "/admin",
    "/checkin",
  ],
};
