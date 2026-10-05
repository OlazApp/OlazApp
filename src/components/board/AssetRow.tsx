"use client";

import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { FRAMES, FRAME_LABEL, type Frame } from "@/config/markets";
import { AssetLogo } from "@/components/AssetLogo";
import { Countdown, Elapsed, Move, PoolBar, fmtMult, moveOf, valueText } from "@/components/market/ui";
import { useWatchlist } from "@/components/providers/useLocal";
import type { AssetSnapshot, MarketSnapshot } from "@/lib/board";
import { fmtCompactUsd, fmtPct, multiplier } from "@/lib/rounds";

/** One lane: an asset at one round length. */
function Lane({ asset, market, focus }: { asset: AssetSnapshot; market: MarketSnapshot | undefined; focus: boolean }) {
  if (!market) {
    return (
      <div className="hidden min-w-0 items-center justify-center rounded-md border border-dashed border-line px-3 py-3 text-center text-[12px] text-ink-3 xl:flex">
        {asset.category === "stocks" ? "Hourly rounds only" : "Not offered"}
      </div>
    );
  }
  const closed = !market.status.open;
  const move = asset.unit === "blocks" ? null : moveOf(market.live.lock, asset.value);
  const href = `/market/${market.id}`;
  return (
    <div
      className={`group relative min-w-0 rounded-md border px-3 pt-2.5 pb-3 transition-colors ${focus ? "border-ink bg-card" : "border-line bg-card/60 hover:border-line-2"}`}
      data-testid={`lane-${market.id}`}
    >
      <Link href={href} className="absolute inset-0 z-0" aria-label={`Open ${market.question}`} />
      <div className="pointer-events-none relative z-10 flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-semibold tracking-[0.06em] text-ink uppercase">{market.frame}</span>
        {closed ? (
          <span className="chip chip-flat">Closed</span>
        ) : (
          <span className="flex items-center gap-1 font-mono text-[11px] text-ink-3">
            ends <Countdown to={market.live.end} className="text-ink" />
          </span>
        )}
      </div>
      {closed ? (
        <p className="pointer-events-none relative z-10 mt-2 line-clamp-2 text-[12px] leading-snug text-ink-3">{market.status.note}</p>
      ) : (
        <>
          <Elapsed start={market.live.start} end={market.live.end} className="pointer-events-none relative z-10 mt-2" />
          <div className="pointer-events-none relative z-10 mt-2 flex flex-wrap items-baseline justify-between gap-x-2">
            <span className="font-mono text-[11px] text-ink-3">
              {asset.unit === "blocks" ? `last ${market.frame}` : "lock"} {valueText(market.live.lock, asset.unit)}
            </span>
            {asset.unit === "blocks" ? (
              <span className="num text-[12px] text-ink-2">{valueText(asset.value, "blocks").replace(" blocks", "")} so far</span>
            ) : (
              <Move pct={move} className="text-[13px] font-semibold" />
            )}
          </div>
          <div className="relative z-10 mt-2.5 grid grid-cols-2 gap-1.5">
            <Link href={`${href}?side=up`} className="btn btn-up h-8 justify-between px-2.5 text-[12px]">
              UP <span className="num text-[11px] font-medium opacity-85">{fmtMult(multiplier(market.open.pool, "up"))}</span>
            </Link>
            <Link href={`${href}?side=down`} className="btn btn-down h-8 justify-between px-2.5 text-[12px]">
              DOWN <span className="num text-[11px] font-medium opacity-85">{fmtMult(multiplier(market.open.pool, "down"))}</span>
            </Link>
          </div>
          <div className="pointer-events-none relative z-10 mt-2">
            <PoolBar pool={market.open.pool} compact />
          </div>
        </>
      )}
    </div>
  );
}

const SM_COLS: Record<number, string> = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3" };

export function AssetRow({ asset, markets, frame }: { asset: AssetSnapshot; markets: MarketSnapshot[]; frame: Frame | null }) {
  const { has, toggle } = useWatchlist();
  const watched = has(asset.id);
  const shown = FRAMES.filter((f) => !frame || f === frame);
  return (
    <div className="grid grid-cols-1 gap-3 border-b border-line py-4 xl:grid-cols-[230px_1fr] xl:gap-4" data-testid={`row-${asset.id}`}>
      <div className="flex min-w-0 items-start gap-3">
        <AssetLogo src={asset.logo} symbol={asset.symbol} size={38} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link href={`/market/${markets[0]?.id ?? ""}`} className="truncate text-[16px] font-semibold hover:underline">
              {asset.unit === "blocks" ? asset.name : asset.category === "stocks" ? asset.symbol : `$${asset.symbol}`}
            </Link>
            <button
              type="button"
              onClick={() => toggle(asset.id)}
              aria-label={watched ? `Stop watching ${asset.symbol}` : `Watch ${asset.symbol}`}
              aria-pressed={watched}
              className={`cursor-pointer rounded p-0.5 transition-colors ${watched ? "text-amber-deep" : "text-ink-3 hover:text-ink"}`}
            >
              {watched ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
            </button>
          </div>
          <p className="truncate text-[12.5px] text-ink-3">{asset.unit === "blocks" ? "Robinhood Chain activity" : asset.name}</p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 font-mono text-[12.5px]">
            <span className="text-ink">{asset.unit === "blocks" ? `${valueText(asset.value, "blocks")} this 15m` : valueText(asset.value, "usd")}</span>
            {asset.change24h !== null ? (
              <span className={asset.change24h >= 0 ? "text-up" : "text-down"}>{fmtPct(asset.change24h)} 24h</span>
            ) : null}
            {asset.marketCap ? <span className="text-ink-3">mcap {fmtCompactUsd(asset.marketCap)}</span> : null}
          </div>
        </div>
      </div>
      <div className={`grid min-w-0 grid-cols-1 gap-2 ${SM_COLS[Math.min(shown.length, markets.length)] ?? ""} ${shown.length === 3 ? "xl:grid-cols-3" : shown.length === 2 ? "xl:grid-cols-2" : ""}`}>
        {shown.map((f) => {
          const market = markets.find((m) => m.frame === f);
          if (!market && frame) {
            return (
              <div key={f} className="rounded-md border border-dashed border-line px-3 py-3 text-[12px] text-ink-3">
                No {FRAME_LABEL[f]} rounds for this asset.
              </div>
            );
          }
          return <Lane key={f} asset={asset} market={market} focus={frame === f} />;
        })}
      </div>
    </div>
  );
}
