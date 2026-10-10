import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "ld_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

// Returns a readable reason if the auth env vars are missing or too short.
export function authConfigProblem(): string | null {
  const password = process.env.DASHBOARD_PASSWORD;
  const secret = process.env.SESSION_SECRET;
  if (!password || password.length < 20) {
    return "DASHBOARD_PASSWORD is missing or shorter than 20 characters.";
  }
  if (!secret || secret.length < 32) {
    return "SESSION_SECRET is missing or shorter than 32 characters.";
  }
  return null;
}

// Compares in constant time. Hashing first makes both sides the same length,
// which timingSafeEqual requires, without leaking the real password's length.
export function passwordMatches(attempt: string): boolean {
  const expected = process.env.DASHBOARD_PASSWORD ?? "";
  const a = createHash("sha256").update(attempt).digest();
  const b = createHash("sha256").update(expected).digest();
  return expected.length > 0 && timingSafeEqual(a, b);
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(process.env.SESSION_SECRET ?? "");
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("hamza")
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

export async function isValidSessionToken(token: string | undefined): Promise<boolean> {
  if (!token || (process.env.SESSION_SECRET ?? "").length < 32) return false;
  try {
    await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    return true;
  } catch {
    return false;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  // Browsers drop Secure cookies on plain http in some cases (e.g. Safari on
  // localhost), so this is only relaxed in local dev. Always on in production.
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
};
