/**
 * Shared server-only helpers for the Website API Gateway.
 * Ensures /api/* endpoints can only be called from pages rendered on our website,
 * blocking direct backend access, cross-site embeds, and automated scraping.
 */

export const GATEWAY_COOKIE = "__slcr_web";
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export function getWebsiteApiKey(): string {
  return process.env.WEBSITE_API_KEY || "varanasi-slcr-web-gateway-2026";
}

async function hmacSign(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createGatewayToken(): Promise<string> {
  const ts = Date.now().toString();
  const sig = await hmacSign(ts, getWebsiteApiKey());
  return `${ts}.${sig}`;
}

export async function verifyGatewayToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const tsStr = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const ts = Number(tsStr);
  if (!Number.isFinite(ts) || Date.now() - ts > TOKEN_TTL_MS || ts > Date.now() + 60_000) {
    return false;
  }
  const expected = await hmacSign(tsStr, getWebsiteApiKey());
  if (sig.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) {
    diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
