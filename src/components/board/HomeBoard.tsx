"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { BRAND } from "@/config/brand";
import { CATEGORIES, FRAMES, FRAME_LABEL, FRAME_MS, WEEK_MARKETS, findAsset, type Category, type Frame } from "@/config/markets";
import { AssetLogo } from "@/components/AssetLogo";
import { AssetRow } from "@/components/board/AssetRow";
import { ActivityFeed, HeadlinesMini, Movers } from "@/components/board/Widgets";
import { RoundChart, type Point } from "@/components/market/Chart";
import { Countdown, Elapsed, Move, PoolBar, moveOf, valueText } from "@/components/market/ui";
import { useBoard } from "@/components/providers/BoardProvider";
import { useWatchlist } from "@/components/providers/useLocal";
import type { Board, MarketSnapshot } from "@/lib/board";
import { FEE_PCT, fmtPrice } from "@/lib/rounds";
import { roundsLive } from "@/config/onchain";

type Sort = "board" | "staked" | "move" | "watched";
const SORTS: { id: Sort; label: string }[] = [
  { id: "board", label: "Board order" },
  { id: "staked", label: "Most staked" },
  { id: "move", label: "Biggest move" },
  { id: "watched", label: "Watched first" },
];

function pickFeatured(board: Board): MarketSnapshot | undefined {
  const open = board.markets.filter((m) => m.status.open && board.assets.find((a) => a.id === m.assetId)?.unit === "usd");
  const staked = [...open].sort(
    (a, b) => b.live.pool.up + b.live.pool.down + b.open.pool.up + b.open.pool.down - (a.live.pool.up + a.live.pool.down + a.open.pool.up + a.open.pool.down),
  );
  const top = staked[0];
  if (top && top.live.pool.up + top.live.pool.down + top.open.pool.up + top.open.pool.down > 0) return top;
  return open.find((m) => m.id === "eth-15m") ?? open[0];
}

function Featured({ board }: { board: Board }) {
  const market = pickFeatured(board);
  const asset = market ? board.assets.find((a) => a.id === market.assetId) : undefined;
  const [points, setPoints] = useState<Point[]>([]);
  const assetId = asset?.id;
  const frame = market?.frame;

  useEffect(() => {
    if (!assetId || !frame) return;
    let cancelled = false;
    const load = () =>
      fetch(`/api/market/${assetId}-${frame}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((b: { chart?: { points: Point[] } }) => !cancelled && setPoints(b.chart?.points ?? []))
        .catch(() => {});
    load();
    const t = window.setInterval(() => !document.hidden && load(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [assetId, frame]);

  if (!market || !asset) return <div className="board h-[360px] animate-pulse" />;
  const live = asset.value !== null ? [...points.filter((p) => p.t < board.at - 5000), { t: board.at, p: asset.value }] : points;
  const move = moveOf(market.live.lock, asset.value);
  return (
    <div className="board overflow-hidden" data-testid="featured">
      <div className="flex items-center justify-between gap-3 border-b border-chalk/10 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <AssetLogo src={asset.logo} symbol={asset.symbol} size={30} />
          <div className="min-w-0">
            <p className="text-[15px] leading-snug font-semibold">{market.question}</p>
            <p className="font-mono text-[11px] leading-snug text-chalk/55">Live round · {asset.sourceLabel}</p>
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded bg-chalk/10 px-2 py-1 font-mono text-[11px]">
          <span className="size-1.5 animate-pulse-dot rounded-full bg-[#3fcf86]" /> LIVE
        </span>
      </div>
      <div className="grid grid-cols-3 gap-px bg-chalk/10">
        {[
          { k: "Price to beat", v: valueText(market.live.lock, "usd"), cls: "text-amber" },
          { k: "Now", v: valueText(asset.value, "usd"), cls: "" },
          { k: "Ends in", v: <Countdown to={market.live.end} />, cls: "" },
        ].map((c) => (
          <div key={c.k} className="min-w-0 bg-board px-4 py-3 sm:px-5">
            <p className="font-mono text-[10px] tracking-[0.08em] text-chalk/50 uppercase">{c.k}</p>
            <p className={`num mt-1 text-[14px] leading-tight font-semibold break-all sm:text-[20px] ${c.cls}`}>{c.v}</p>
          </div>
        ))}
      </div>
      <div className="px-2 pt-2 sm:px-3">
        <RoundChart
          points={live}
          lock={market.live.lock}
          from={market.live.start - FRAME_MS[market.frame]}
          to={market.live.end}
          roundStart={market.live.start}
          height={200}
          tone="board"
          format={(v) => `$${fmtPrice(v)}`}
        />
      </div>
      <div className="space-y-3 px-4 pt-1 pb-4 sm:px-5">
        <Elapsed start={market.live.start} end={market.live.end} tone="board" />
        <div className="flex items-center justify-between gap-3 text-[13px]">
          <span className="text-chalk/70">
            Since lock <Move pct={move} className="ml-1 font-semibold" />
          </span>
          <span className="font-mono text-[11px] text-chalk/55">next round pool</span>
        </div>
        <PoolBar pool={market.open.pool} tone="board" />
        <div className="grid grid-cols-2 gap-2">
          <Link href={`/market/${market.id}?side=up`} className="btn btn-up h-11 text-[15px]">
            Call UP
          </Link>
          <Link href={`/market/${market.id}?side=down`} className="btn btn-down h-11 text-[15px]">
            Call DOWN
          </Link>
        </div>
      </div>
    </div>
  );
}

function WeeklyStrip() {
  return (
    <section className="mt-12">
      <div className="flex items-end justify-between gap-4 border-b border-ink pb-2">
        <h2 className="h-display text-[30px] sm:text-[36px]">This week&apos;s ranges</h2>
        <Link href="/weekly" className="flex items-center gap-1 text-[13px] text-ink-2 hover:text-ink">
          All weekly <ArrowRight className="size-3.5" />
        </Link>
      </div>
      <div className="grid gap-3 pt-4 md:grid-cols-3">
        {WEEK_MARKETS.map((w) => {
          const a = findAsset(w.assetId)!;
          return (
            <Link key={w.id} href={`/week/${w.id}`} className="panel flex items-center gap-3 p-4 transition-colors hover:border-ink">
              <AssetLogo src={a.logo} symbol={a.symbol} size={34} />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{w.title}</span>
                <span className="block text-[12.5px] text-ink-3">Six price ranges · closes Monday 00:00 UTC</span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-ink-3" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function HomeBoard() {
  const { board, failed } = useBoard();
  const params = useSearchParams();
  const router = useRouter();
  const { list: watched } = useWatchlist();
  const cat = (CATEGORIES.find((c) => c.id === params.get("cat"))?.id ?? null) as Category | null;
  const frame = (FRAMES.find((f) => f === params.get("round")) ?? null) as Frame | null;
  const sort = (SORTS.find((s) => s.id === params.get("sort"))?.id ?? "board") as Sort;

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value === null) next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    router.replace(qs ? `/?${qs}` : "/", { scroll: false });
  };

  const assets = (board?.assets ?? []).filter((a) => !cat || a.category === cat);
  const marketsOf = (id: string) => (board?.markets ?? []).filter((m) => m.assetId === id);
  const staked = (id: string) => marketsOf(id).reduce((s, m) => s + m.live.pool.up + m.live.pool.down + m.open.pool.up + m.open.pool.down, 0);
  const bigMove = (id: string) => {
    const a = board?.assets.find((x) => x.id === id);
    return Math.max(0, ...marketsOf(id).map((m) => Math.abs(moveOf(m.live.lock, a?.value) ?? 0)));
  };
  const rows = [...assets].sort((a, b) => {
    if (sort === "staked") return staked(b.id) - staked(a.id);
    if (sort === "move") return a.unit === "blocks" ? 1 : b.unit === "blocks" ? -1 : bigMove(b.id) - bigMove(a.id);
    if (sort === "watched") return Number(watched.includes(b.id)) - Number(watched.includes(a.id));
    return 0;
  });

  const chip = (on: boolean) =>
    `shrink-0 cursor-pointer rounded-md px-2.5 py-1.5 text-left text-[13.5px] transition-colors ${on ? "bg-ink text-chalk" : "text-ink-2 hover:bg-card hover:text-ink"}`;

  return (
    <main className="mx-auto max-w-[1320px] px-4 pt-6 pb-8 sm:px-6">
      {/* Intro band */}
      <section className="grid items-start gap-6 lg:grid-cols-[1fr_540px] lg:gap-10">
        <div className="min-w-0 pt-2 lg:pt-6">
          <p className="label">Short-round prediction markets · Robinhood Chain</p>
          <h1 className="h-display mt-3 text-[64px] sm:text-[92px] xl:text-[108px]">
            Predict.
            <br />
            <span className="text-up">Win.</span> Repeat.
          </h1>
          <p className="mt-4 max-w-lg text-[17px] leading-relaxed text-ink-2">
            {BRAND.tagline} Pick an asset, call where it goes in the next 5 minutes, 15 minutes or hour, and let the price feed settle it.
          </p>
          <dl className="mt-6 grid max-w-lg grid-cols-3 border-y border-line-2">
            {[
              { k: "Round lengths", v: "5m · 15m · 1h" },
              { k: "Fee on decided rounds", v: `${FEE_PCT}%` },
              { k: "Ties & one-sided", v: "Full refund" },
            ].map((d, i) => (
              <div key={d.k} className={`py-3 ${i ? "border-l border-line pl-3" : ""}`}>
                <dt className="label">{d.k}</dt>
                <dd className="num mt-1 text-[14px] font-semibold">{d.v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 max-w-lg rounded-md border border-amber-deep/40 bg-amber-soft px-3 py-2.5 text-[13.5px] leading-relaxed text-[#5c4300]">
            {roundsLive() ? (
              <>
                <strong>Real ETH rounds are live.</strong> ETH, chain-token and stock markets settle on-chain through the round contract; every market can also
                be played with practice ETH (pETH).{" "}
              </>
            ) : (
              <>
                <strong>Practice mode.</strong> Prices and settlement rules are real; stakes use practice ETH (pETH) until the round contract is deployed.{" "}
              </>
            )}
            <Link href="/how-it-works" className="underline">
              How it works
            </Link>
          </p>
        </div>
        {board ? <Featured board={board} /> : <div className="board h-[420px] animate-pulse" />}
      </section>

      {/* Board */}
      <section className="mt-12 grid gap-6 lg:grid-cols-[190px_1fr] lg:gap-8" id="board">
        <aside className="min-w-0 lg:sticky lg:top-[120px] lg:self-start">
          <p className="label hidden lg:block">Market</p>
          <div className="scroll-x mt-0 flex gap-1 lg:mt-2 lg:flex-col">
            <button type="button" onClick={() => set("cat", null)} className={chip(cat === null)}>
              All markets
            </button>
            {CATEGORIES.map((c) => (
              <button key={c.id} type="button" onClick={() => set("cat", c.id)} className={chip(cat === c.id)} title={c.blurb}>
                {c.label}
              </button>
            ))}
          </div>
          <p className="label mt-5 hidden lg:block">Round length</p>
          <div className="scroll-x mt-2 flex gap-1 lg:flex-col">
            <button type="button" onClick={() => set("round", null)} className={chip(frame === null)}>
              Every length
            </button>
            {FRAMES.map((f) => (
              <button key={f} type="button" onClick={() => set("round", f)} className={chip(frame === f)}>
                {FRAME_LABEL[f]}
              </button>
            ))}
          </div>
          <p className="label mt-5 hidden lg:block">Order</p>
          <div className="scroll-x mt-2 flex gap-1 lg:flex-col">
            {SORTS.map((s) => (
              <button key={s.id} type="button" onClick={() => set("sort", s.id === "board" ? null : s.id)} className={chip(sort === s.id)}>
                {s.label}
              </button>
            ))}
          </div>
        </aside>

        <div className="min-w-0">
          <div className="flex items-end justify-between gap-4 border-b border-ink pb-2">
            <h2 className="h-display text-[30px] sm:text-[36px]">{cat ? CATEGORIES.find((c) => c.id === cat)!.label : "The board"}</h2>
            <span className="hidden font-mono text-[11px] text-ink-3 sm:block">UP / DOWN enter the next round · multipliers from the practice pool</span>
          </div>
          {failed && !board ? <p className="py-10 text-center text-ink-3">The board could not be loaded. Retrying…</p> : null}
          {!board && !failed ? (
            <div className="space-y-3 py-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-md bg-card" />
              ))}
            </div>
          ) : null}
          {rows.map((a) => (
            <AssetRow key={a.id} asset={a} markets={marketsOf(a.id)} frame={frame} />
          ))}
          {board && rows.length === 0 ? <p className="py-10 text-center text-ink-3">No markets in this filter.</p> : null}
          <WeeklyStrip />
        </div>
      </section>

      {/* Bottom band */}
      <section className="mt-14 grid gap-10 md:grid-cols-2 xl:grid-cols-3">
        <Movers />
        <ActivityFeed />
        <div className="md:col-span-2 xl:col-span-1">
          <HeadlinesMini />
        </div>
      </section>
    </main>
  );
}
