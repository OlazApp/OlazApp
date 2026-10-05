import "server-only";
import { CHAIN, serverRpc } from "@/config/brand";

/*
 * JSON-RPC reads against Robinhood Chain from the server. The configured
 * endpoint is tried first, then the public fallback. Reads only: nothing here
 * signs or sends a transaction.
 */

const endpoints = () => [serverRpc(), CHAIN.fallbackRpc].filter((url, i, all) => all.indexOf(url) === i);
let preferred = 0;

export class RpcError extends Error {
  constructor(message: string, readonly revert = false) {
    super(message);
  }
}

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) throw new RpcError(`RPC ${res.status}`);
  return res.json();
}

export async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const list = endpoints();
  let last: unknown;
  for (let n = 0; n < list.length; n++) {
    const i = (preferred + n) % list.length;
    try {
      const body = (await post(list[i], { jsonrpc: "2.0", id: 1, method, params })) as {
        result?: T;
        error?: { message: string; code?: number };
      };
      if (body.error) {
        // A revert is an answer, not an outage: do not try the next endpoint.
        if (/revert/i.test(body.error.message) || body.error.code === 3) throw new RpcError(body.error.message, true);
        throw new RpcError(body.error.message);
      }
      preferred = i;
      return body.result as T;
    } catch (error) {
      if (error instanceof RpcError && error.revert) throw error;
      last = error;
    }
  }
  throw last;
}

export async function rpcBatch<T>(calls: { method: string; params: unknown[] }[]): Promise<(T | null)[]> {
  if (calls.length === 0) return [];
  const list = endpoints();
  let last: unknown;
  for (let n = 0; n < list.length; n++) {
    const i = (preferred + n) % list.length;
    try {
      const body = (await post(
        list[i],
        calls.map((c, id) => ({ jsonrpc: "2.0", id, ...c })),
      )) as { id: number; result?: T; error?: unknown }[];
      if (!Array.isArray(body)) throw new RpcError("batch unsupported");
      preferred = i;
      const out: (T | null)[] = calls.map(() => null);
      for (const entry of body) if (!entry.error && entry.result !== undefined) out[entry.id] = entry.result;
      return out;
    } catch (error) {
      last = error;
    }
  }
  throw last;
}

export const ethCall = (to: string, data: string) => rpc<string>("eth_call", [{ to, data }, "latest"]);

/** Splits an ABI result into 32-byte words. */
export function words(hex: string) {
  const body = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out: string[] = [];
  for (let i = 0; i + 64 <= body.length; i += 64) out.push(body.slice(i, i + 64));
  return out;
}

/** Two's-complement signed integer from a 32-byte word. */
export function signed(word: string) {
  const v = BigInt(`0x${word}`);
  return v >= 1n << 255n ? v - (1n << 256n) : v;
}

export const uint = (word: string) => BigInt(`0x${word}`);
export const pad = (n: number | bigint) => BigInt(n).toString(16).padStart(64, "0");
