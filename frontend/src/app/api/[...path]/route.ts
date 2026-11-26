import { NextResponse, type NextRequest } from "next/server";
import tunnel from "../../../../tunnel.json";
import { GATEWAY_COOKIE, getWebsiteApiKey, verifyGatewayToken } from "@/lib/webGateway";

const API_URL = (process.env.API_URL || tunnel.API_URL || "http://localhost:8000").replace(/\/+$/, "");

const STRIP_RESPONSE_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "content-encoding",
  "content-length",
]);

const TRUSTED_HOST_PATTERNS = [
  /^localhost(?::\d+)?$/i,
  /^127\.0\.0\.1(?::\d+)?$/i,
  /^(?:[a-z0-9-]+\.)*vercel\.app$/i,
  /^(?:[a-z0-9-]+\.)*slcrdss\.in$/i,
  /^(?:[a-z0-9-]+\.)*slcrdss\.xyz$/i,
];

function stripDefaultPort(host: string): string {
  return host.trim().toLowerCase().replace(/:(80|443)$/i, "");
}

function extractHost(urlHeader: string | null): string {
  if (!urlHeader) return "";
  try {
    return stripDefaultPort(new URL(urlHeader).host);
  } catch {
    return "";
  }
}

function isTrustedDashboardHost(host: string): boolean {
  const clean = stripDefaultPort(host);
  return !!clean && TRUSTED_HOST_PATTERNS.some((re) => re.test(clean));
}

function matchesHost(urlHeader: string | null, expectedHost: string): boolean {
  const parsed = extractHost(urlHeader);
  if (!parsed || !expectedHost) return false;
  return parsed === stripDefaultPort(expectedHost) || isTrustedDashboardHost(parsed);
}

function resolveWebsiteHost(req: NextRequest): string {
  const originHost = extractHost(req.headers.get("origin"));
  if (isTrustedDashboardHost(originHost)) return originHost;
  const refererHost = extractHost(req.headers.get("referer"));
  if (isTrustedDashboardHost(refererHost)) return refererHost;
  const raw = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").split(",")[0].trim();
  return stripDefaultPort(raw);
}

async function isAuthorizedWebsiteRequest(req: NextRequest): Promise<boolean> {
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").split(",")[0].trim();
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const secFetchSite = req.headers.get("sec-fetch-site");

  // Block cross-site requests and direct browser address-bar navigation (sec-fetch-site: none)
  if (secFetchSite && secFetchSite !== "same-origin") return false;
  if (origin && !matchesHost(origin, host)) return false;
  if (referer && !matchesHost(referer, host)) return false;

  // Must carry same-origin browser context (blocks curl / python-requests / direct server scraping)
  const hasSameOriginSignal =
    secFetchSite === "same-origin" ||
    matchesHost(origin, host) ||
    matchesHost(referer, host);
  if (!hasSameOriginSignal) return false;

  // Must also carry a valid HttpOnly website gateway cookie issued when loading a page on the site
  const cookieToken = req.cookies.get(GATEWAY_COOKIE)?.value;
  return verifyGatewayToken(cookieToken);
}

async function proxy(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  if (!(await isAuthorizedWebsiteRequest(req))) {
    return NextResponse.json(
      { detail: "Forbidden: API access is restricted to the official dashboard website." },
      { status: 403 },
    );
  }

  const { path } = await context.params;
  const targetUrl = `${API_URL}/api/${path.join("/")}${req.nextUrl.search}`;
  const host = resolveWebsiteHost(req);

  const headers = new Headers();
  for (const name of ["authorization", "content-type", "accept", "range"]) {
    const val = req.headers.get(name);
    if (val) headers.set(name, val);
  }
  headers.set("X-Website-Key", getWebsiteApiKey());
  if (host) headers.set("X-Website-Host", host);

  const hasBody = !["GET", "HEAD"].includes(req.method);
  const init: RequestInit & { duplex?: "half" } = {
    method: req.method,
    headers,
    cache: "no-store",
  };
  if (hasBody && req.body) {
    init.body = req.body;
    init.duplex = "half";
  }

  try {
    const upstream = await fetch(targetUrl, init);
    const outHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
      if (!STRIP_RESPONSE_HEADERS.has(key.toLowerCase())) {
        outHeaders.set(key, value);
      }
    });
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: outHeaders,
    });
  } catch {
    return NextResponse.json({ detail: "Backend API is unreachable." }, { status: 502 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
export const HEAD = proxy;
