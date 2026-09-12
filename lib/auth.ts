/**
 * Optional single shared password for the whole instance. Set HOUSE_PASSWORD to
 * turn it on; leave it unset and the site is open. This keeps the deployment to
 * a single account (Vercel) rather than pulling in an auth provider.
 */
export const AUTH_COOKIE = "house_elo_auth";

export function authEnabled(): boolean {
  return Boolean(process.env.HOUSE_PASSWORD);
}

/** Web Crypto so the same code runs in middleware (edge) and server actions. */
export async function tokenFor(password: string): Promise<string> {
  const data = new TextEncoder().encode(`house_elo:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function expectedToken(): Promise<string | null> {
  const password = process.env.HOUSE_PASSWORD;
  if (!password) return null;
  return tokenFor(password);
}
