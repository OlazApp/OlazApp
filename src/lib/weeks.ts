import "server-only";
import { findAsset, type WeekMarket } from "@/config/markets";
import type { Store } from "@/lib/chat/store";
import { priceAt } from "@/lib/prices";
import { WEEK_MS } from "@/lib/rounds";

/*
 * Weekly range markets. The week runs Monday 00:00 UTC to the next Monday
 * 00:00 UTC. Ranges are cut around the price at the week's open: a "nice"
 * step of about 3 % of that price, six ranges from far below to far above.
 * The close is the open of the first minute of the next week (the same
 * source as the round markets). Entries close 48 hours before the end.
 */

export const WEEK_ENTRY_CUTOFF_MS = 48 * 60 * 60 * 1000;

export type Bucket = { lo: number | null; hi: number | null; label: string };

function niceStep(raw: number) {
  const exp = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / exp;
  const nice = f < 1.5 ? 1 : f < 3.5 ? 2.5 : f < 7.5 ? 5 : 10;
  return nice * exp;
}

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { maximumFractionDigits: n < 10 ? 2 : 0 })}`;

export function bucketsFor(open: number): Bucket[] {
  const step = niceStep(open * 0.03);
  const c = Math.round(open / step) * step;
  const edges = [c - 2 * step, c - step, c, c + step, c + 2 * step];
  return [
    { lo: null, hi: edges[0], label: `Under ${money(edges[0])}` },
    ...edges.slice(0, -1).map((lo, i) => ({ lo, hi: edges[i + 1], label: `${money(lo)} – ${money(edges[i + 1])}` })),
    { lo: edges[4], hi: null, label: `${money(edges[4])} or more` },
  ];
}

export function bucketOf(buckets: Bucket[], value: number) {
  return buckets.findIndex((b) => (b.lo === null || value >= b.lo) && (b.hi === null || value < b.hi));
}

export async function weekBuckets(store: Store | null, w: WeekMarket, start: number) {
  const key = `week:open:${w.id}:${start}`;
  let open: number | null = null;
  if (store) open = Number(await store.get(key).catch(() => null)) || null;
  if (open === null) {
    const asset = findAsset(w.assetId);
    if (!asset) return null;
    open = await priceAt(asset, start);
    if (open === null) return null;
    if (store) await store.setEx(key, String(open), 60 * 24 * 60 * 60).catch(() => {});
  }
  return bucketsFor(open);
}

export async function weekOpen(store: Store | null, w: WeekMarket, start: number) {
  const key = `week:open:${w.id}:${start}`;
  const cached = store ? Number(await store.get(key).catch(() => null)) || null : null;
  if (cached) return cached;
  const asset = findAsset(w.assetId);
  return asset ? priceAt(asset, start) : null;
}

export async function weekResult(store: Store | null, w: WeekMarket, start: number) {
  const end = start + WEEK_MS;
  if (Date.now() < end + 30_000) return null;
  const asset = findAsset(w.assetId);
  const buckets = await weekBuckets(store, w, start);
  if (!asset || !buckets) return null;
  const close = await priceAt(asset, end);
  if (close === null) return null;
  return { close, buckets, winner: bucketOf(buckets, close) };
}
