import { NextResponse, type NextRequest } from "next/server";
import { createGatewayToken, GATEWAY_COOKIE, verifyGatewayToken } from "@/lib/webGateway";

/**
 * Issues a short-lived HttpOnly website session cookie to browsers visiting dashboard pages
 * (public users need no login, while direct API scrapers without a valid page session are blocked).
 */
export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const existing = req.cookies.get(GATEWAY_COOKIE)?.value;
  if (!(await verifyGatewayToken(existing))) {
    const token = await createGatewayToken();
    res.cookies.set(GATEWAY_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: req.nextUrl.protocol === "https:",
      path: "/",
      maxAge: 60 * 60 * 24,
    });
  }
  return res;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
