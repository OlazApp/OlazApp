import { NextResponse } from "next/server";
import { findAsset, findWeek } from "@/config/markets";
import { getStore } from "@/lib/chat/store";
import { readPools } from "@/lib/practice/ledger";
import { currentValue, series } from "@/lib/prices";
import { WEEK_MS, weekStart } from "@/lib/rounds";
import { bucketOf, weekBuckets, weekOpen, weekResult, WEEK_ENTRY_CUTOFF_MS } from "@/lib/weeks";

export const dynamic = "force-dynamic";

const cache = new Map<string, { at: number; body: unknown }>();

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const w = findWeek(id);
  const asset = w ? findAsset(w.assetId) : null;
  if (!w || !asset) return NextResponse.json({ error: "Unknown market." }, { status: 404 });
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < 10_000) return NextResponse.json(hit.body);
  const body = await build(w, asset);
  cache.set(id, { at: Date.now(), body });
  return NextResponse.json(body);
}

async function build(w: NonNullable<ReturnType<typeof findWeek>>, asset: NonNullable<ReturnType<typeof findAsset>>) {
  const store = getStore();
  const start = weekStart();
  const [buckets, open, now, prev] = await Promise.all([
    weekBuckets(store, w, start),
    weekOpen(store, w, start),
    currentValue(asset),
    weekResult(store, w, start - WEEK_MS).catch(() => null),
  ]);
  const pools = buckets && store ? (await readPools(store, w.id, start, buckets.map((_, i) => i))) : { pools: [], count: 0 };
  const points = await series(asset, start, Date.now()).catch(() => []);
  // Thin the week to ~200 points for the chart.
  const stride = Math.max(1, Math.ceil(points.length / 200));
  return {
    id: w.id,
    title: w.title,
    asset: { id: asset.id, symbol: asset.symbol, name: asset.name, logo: asset.logo, sourceLabel: asset.sourceLabel },
    start,
    end: start + WEEK_MS,
    entriesClose: start + WEEK_MS - WEEK_ENTRY_CUTOFF_MS,
    open,
    current: now.value,
    leading: buckets && now.value !== null ? bucketOf(buckets, now.value) : null,
    buckets: buckets ?? [],
    pools: pools.pools,
    count: pools.count,
    previous: prev ? { close: prev.close, winner: prev.winner, label: prev.buckets[prev.winner]?.label ?? null } : null,
    chart: points.filter((_, i) => i % stride === 0 || i === points.length - 1),
    storage: store !== null,
  };
}
