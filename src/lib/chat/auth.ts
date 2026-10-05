import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { BRAND, CHAIN, isAddress, serverRpc } from "@/config/brand";
import type { Store } from "@/lib/chat/store";
import { recoverSigner } from "@/lib/chat/verify";

/*
 * Wallet sign-in for the chat, market comments and the practice ledger: the server hands out a one-time message, the
 * wallet signs it with personal_sign (free, no transaction), and the server
 * recovers the signer. A random session token in an httpOnly cookie then
 * stands for that address; the token itself lives in the store, so no
 * signing secret is needed.
 */

export const COOKIE = "olaz_session";
const NONCE_TTL = 5 * 60;
export const SESSION_TTL = 7 * 24 * 60 * 60;

export type Session = { address: string; holder: boolean };

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

export function signInMessage(address: string, nonce: string, host: string, issuedAt: string) {
  return [
    `${host} wants you to sign in to ${BRAND.name} with your wallet:`,
    address,
    "",
    "This proves you own this address. It is free and sends no transaction.",
    "",
    `Chain ID: ${CHAIN.id}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

// Challenges are keyed by their random nonce, not by address: nobody can
// replace or burn another wallet's pending sign-in without knowing its nonce.
const nonceKey = (nonce: string) => `chat:nonce:${nonce}`;

/**
 * Domain named in the sign-in message. It is never taken from the request on
 * trust: a look-alike site could otherwise obtain a challenge in its own name,
 * have a visitor sign it there, and replay the signature here. Only the
 * project's own domain (and localhost for development) is accepted.
 */
export function signInDomain(requestHost: string | null) {
  const host = (requestHost ?? "").toLowerCase();
  if (host === BRAND.domain || host === `www.${BRAND.domain}`) return host;
  if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
    if (/^(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(host)) return host;
  }
  return BRAND.domain;
}

export async function createChallenge(store: Store, address: string, host: string) {
  const nonce = hex(randomBytes(16));
  const message = signInMessage(address, nonce, host, new Date().toISOString());
  await store.setEx(nonceKey(nonce), message, NONCE_TTL);
  return message;
}

/** Verifies the signed challenge and opens a session. */
export async function completeSignIn(store: Store, address: string, message: string, signature: string) {
  const nonce = /^Nonce: ([0-9a-f]{32})$/m.exec(message)?.[1];
  if (!nonce) return { error: "The sign-in request expired. Try again." } as const;
  const key = nonceKey(nonce);
  const stored = await store.get(key);
  if (!stored || stored !== message) return { error: "The sign-in request expired. Try again." } as const;
  await store.del(key); // one use only, whatever the outcome
  if (message.split("\n")[1]?.toLowerCase() !== address.toLowerCase() || recoverSigner(message, signature) !== address.toLowerCase()) {
    return { error: "That signature does not match the connected address." } as const;
  }
  const session: Session = { address: address.toLowerCase(), holder: await holdsToken(address) };
  const token = hex(randomBytes(32));
  await store.setEx(`chat:session:${token}`, JSON.stringify(session), SESSION_TTL);
  return { token, session } as const;
}

export async function readSession(store: Store): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const raw = await store.get(`chat:session:${token}`);
  return raw ? (JSON.parse(raw) as Session) : null;
}

export async function endSession(store: Store) {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token && /^[0-9a-f]{64}$/.test(token)) await store.del(`chat:session:${token}`);
  jar.delete(COOKIE);
}

/** Balance check for the holder badge; a failed read just means no badge. */
export async function holdsToken(address: string) {
  if (!isAddress(BRAND.ca)) return false;
  const data = `0x70a08231${address.slice(2).toLowerCase().padStart(64, "0")}`;
  for (const url of [serverRpc(), CHAIN.fallbackRpc]) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: BRAND.ca, data }, "latest"] }),
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      });
      const body = (await res.json()) as { result?: string };
      if (body.result) return BigInt(body.result) > 0n;
    } catch {
      // try the next endpoint
    }
  }
  return false;
}
