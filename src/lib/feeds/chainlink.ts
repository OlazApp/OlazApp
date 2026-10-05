import "server-only";
import { ethCall, pad, rpcBatch, signed, uint, words } from "@/lib/feeds/rpc";

/*
 * Chainlink price feeds on Robinhood Chain. Stock feeds follow 24/5 US equity
 * hours, update on a 0.5 % move or a 24 h heartbeat, and carry 8 decimals. The
 * price at a past moment is the last answer published at or before it, found
 * by walking back through the aggregator's rounds.
 */

export type FeedRound = { roundId: bigint; answer: number; updatedAt: number };

function decode(hex: string): FeedRound | null {
  const w = words(hex);
  if (w.length < 5) return null;
  const answer = Number(signed(w[1])) / 1e8;
  const updatedAt = Number(uint(w[3])) * 1000;
  if (!updatedAt || !Number.isFinite(answer)) return null;
  return { roundId: uint(w[0]), answer, updatedAt };
}

const latestCache = new Map<string, { at: number; value: FeedRound | null }>();

export async function latest(feed: string): Promise<FeedRound | null> {
  const hit = latestCache.get(feed);
  if (hit && Date.now() - hit.at < 15_000) return hit.value;
  try {
    const value = decode(await ethCall(feed, "0xfeaf968c"));
    latestCache.set(feed, { at: Date.now(), value });
    return value;
  } catch {
    return hit?.value ?? null;
  }
}

const pinned = new Map<string, number | null>();

/** Last answer published at or before `at` (ms); null if none within reach. */
export async function feedPriceAt(feed: string, at: number): Promise<number | null> {
  if (at > Date.now()) return null;
  const key = `${feed}:${at}`;
  if (pinned.has(key)) return pinned.get(key)!;
  const head = await latest(feed);
  if (!head) return null;
  if (head.updatedAt <= at) return head.answer; // not pinned: a newer answer may still land before `at` is old
  const phase = head.roundId >> 64n;
  let id = head.roundId & 0xffffffffffffffffn;
  for (let batch = 0; batch < 6 && id > 1n; batch++) {
    const ids: bigint[] = [];
    for (let k = 1n; k <= 12n && id - k >= 1n; k++) ids.push((phase << 64n) | (id - k));
    const results = await rpcBatch<string>(
      ids.map((rid) => ({ method: "eth_call", params: [{ to: feed, data: "0x9a6fc8f5" + pad(rid) }, "latest"] })),
    ).catch(() => []);
    for (const hex of results) {
      const r = hex ? decode(hex) : null;
      if (r && r.updatedAt <= at) {
        pinned.set(key, r.answer);
        return r.answer;
      }
    }
    id -= BigInt(ids.length);
  }
  pinned.set(key, null);
  return null;
}

/** Recent answers (newest last) for a chart, up to `count` rounds back. */
export async function feedHistory(feed: string, since: number, count = 24) {
  const head = await latest(feed);
  if (!head) return [];
  const phase = head.roundId >> 64n;
  const id = head.roundId & 0xffffffffffffffffn;
  const ids: bigint[] = [];
  for (let k = 1n; k <= BigInt(count) && id - k >= 1n; k++) ids.push((phase << 64n) | (id - k));
  const results = await rpcBatch<string>(
    ids.map((rid) => ({ method: "eth_call", params: [{ to: feed, data: "0x9a6fc8f5" + pad(rid) }, "latest"] })),
  ).catch(() => []);
  const rows = [head, ...results.map((h) => (h ? decode(h) : null)).filter((r): r is FeedRound => r !== null)];
  return rows
    .filter((r) => r.updatedAt >= since)
    .sort((a, b) => a.updatedAt - b.updatedAt)
    .map((r) => ({ t: r.updatedAt, p: r.answer }));
}

/** Hour of the week in New York time: Sunday 00:00 = 0. */
function nyWeekHour(at: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date(at));
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.find((p) => p.type === "weekday")!.value);
  const hour = Number(parts.find((p) => p.type === "hour")!.value) % 24;
  return day * 24 + hour;
}

/** US equities trade 24/5 on these feeds: Sunday 20:00 to Friday 20:00 New York time. */
export function inEquityHours(at = Date.now()) {
  const h = nyWeekHour(at);
  return h >= 20 && h < 5 * 24 + 20;
}

/** A feed that has not published for this long is treated as not moving. */
export const QUIET_MS = 4 * 60 * 60 * 1000;
