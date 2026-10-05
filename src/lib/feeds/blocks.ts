import "server-only";
import { rpc } from "@/lib/feeds/rpc";

/*
 * Robinhood Chain activity metric: how many blocks the chain produced in a
 * window. Blocks are found by timestamp with an interpolation search over
 * block headers, which any full node serves (no archive state needed).
 */

type Header = { number: string; timestamp: string };
const at = new Map<number, number>(); // unix second -> first block at or after it
let head: { n: number; t: number; read: number } | null = null;

async function header(n: number | "latest") {
  const h = await rpc<Header | null>("eth_getBlockByNumber", [n === "latest" ? n : `0x${n.toString(16)}`, false]);
  if (!h) throw new Error("no block");
  return { n: Number.parseInt(h.number, 16), t: Number.parseInt(h.timestamp, 16) };
}

export async function latestBlock() {
  if (head && Date.now() - head.read < 3000) return head;
  const h = await header("latest");
  head = { ...h, read: Date.now() };
  return head;
}

/** First block whose timestamp is >= `ms`. */
export async function blockAtOrAfter(ms: number): Promise<number | null> {
  const target = Math.ceil(ms / 1000);
  const hit = at.get(target);
  if (hit !== undefined) return hit;
  const top = await latestBlock();
  if (target > top.t) return null;
  let lo = { n: Math.max(1, top.n - Math.ceil((top.t - target) * 12) - 2000), t: 0 };
  lo = await header(lo.n);
  let hi = { n: top.n, t: top.t };
  if (lo.t >= target) {
    // Rate guess was too high; fall back to a wider bracket.
    lo = await header(Math.max(1, top.n - (top.t - target) * 40));
    if (lo.t >= target) return null;
  }
  for (let i = 0; i < 40 && hi.n - lo.n > 1; i++) {
    const span = hi.t - lo.t || 1;
    let guess = lo.n + Math.round(((target - lo.t) / span) * (hi.n - lo.n));
    if (i % 2 === 1) guess = Math.floor((lo.n + hi.n) / 2); // bisect every other step
    guess = Math.min(hi.n - 1, Math.max(lo.n + 1, guess));
    const g = await header(guess);
    if (g.t >= target) hi = g;
    else lo = g;
  }
  if (at.size > 5000) at.clear();
  at.set(target, hi.n);
  return hi.n;
}

/** Blocks produced in [from, to). Null if `to` is still in the future. */
export async function blocksBetween(from: number, to: number): Promise<number | null> {
  const [a, b] = await Promise.all([blockAtOrAfter(from), blockAtOrAfter(to)]);
  return a !== null && b !== null ? b - a : null;
}
