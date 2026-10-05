import "server-only";
import { NextResponse } from "next/server";
import type { Store } from "@/lib/chat/store";
import { networkKey } from "@/lib/netkey";

/*
 * Request guards shared by every write endpoint: a hard cap on body size,
 * the caller's IP, and fixed-window rate limits keyed on the verified
 * session address and the IP (never on anything the caller names itself).
 */

export const MAX_BODY = 4096;

/** Parses a small JSON body; null when it is missing, malformed or too large. */
export async function readJson<T>(request: Request, max = MAX_BODY): Promise<T | null> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > max) return null;
  try {
    const text = await request.text();
    if (text.length > max) return null;
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

/**
 * First hop of x-forwarded-for, else x-real-ip, as a rate-limit key
 * (IPv6 cut to its /64). On Vercel the edge overwrites
 * these headers, so the value is the caller's real address. Elsewhere a
 * caller can write them; see `allowPublic`.
 */
export function clientIp(request: Request) {
  const fwd = request.headers.get("x-forwarded-for");
  const ip = (fwd ? fwd.split(",")[0] : request.headers.get("x-real-ip") ?? "local").trim();
  return networkKey(ip.slice(0, 64).replace(/[^0-9a-fA-F:.]/g, "")) || "local";
}

/**
 * True when the caller is still within `max` requests per `windowSec` for
 * every given key. Each key counts separately.
 */
export async function allow(store: Store, bucket: string, keys: string[], max: number, windowSec: number) {
  const slot = Math.floor(Date.now() / 1000 / windowSec);
  const counts = await Promise.all(
    keys.map((k) => store.incrEx(`rl:${bucket}:${k}:${slot}`, windowSec + 5).catch(() => 0)),
  );
  return counts.every((n) => n <= max);
}

/** True when the forwarded-for headers come from the Vercel edge. */
const trustedIp = Boolean(process.env.VERCEL);

/**
 * Limit for endpoints open to signed-out callers. With a trusted IP the
 * per-IP limit is enough. Without one (self-hosted, no proxy) a forged header
 * would give every request a fresh IP, so a site-wide ceiling applies too.
 * That ceiling is shared by everyone, so it is not used where the IP can be
 * trusted: one caller must not be able to lock everyone else out.
 */
export async function allowPublic(store: Store, request: Request, bucket: string, perIp: number, site: number) {
  if (!(await allow(store, bucket, [clientIp(request)], perIp, 60))) return false;
  return trustedIp || allow(store, `${bucket}:site`, ["all"], site, 60);
}

export const tooMany = () => NextResponse.json({ error: "Too many requests. Slow down a little." }, { status: 429 });
export const badBody = () => NextResponse.json({ error: "Invalid or oversized request body." }, { status: 400 });
