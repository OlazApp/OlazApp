"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Eye, EyeOff, Share2 } from "lucide-react";
import { BRAND } from "@/config/brand";
import { findMarket, FRAME_LABEL } from "@/config/markets";
import { AssetLogo } from "@/components/AssetLogo";
import { ActivityFeed } from "@/components/board/Widgets";
import { RoundChart, type Point } from "@/components/market/Chart";
import { Comments } from "@/components/market/Comments";
import { EntryPanel } from "@/components/market/EntryPanel";
import { Countdown, Elapsed, Move, OutcomeChip, PoolBar, moveOf, valueText } from "@/components/market/ui";
import { PositionList } from "@/components/practice/PositionList";
import { useBoard } from "@/components/providers/BoardProvider";
import { usePractice } from "@/components/providers/PracticeProvider";
import { useClock, useWatchlist } from "@/components/providers/useLocal";
import type { MarketSnapshot } from "@/lib/board";
import { FEE_LABEL, fmtPrice, type Outcome, type Pool, type Side } from "@/lib/rounds";
import { KIND, ONCHAIN_MARKETS, onchainIndex, ROUNDS_CONTRACT } from "@/config/onchain";
import { CHAIN } from "@/config/brand";

/** Where the contract reads this market's price, in words. */
function chainSourceLabel(id: string) {
  const m = ONCHAIN_MARKETS[onchainIndex(id)];
  const ref = findMarket(id);
  if (!m || !ref) return null;
  if (m.kind === KIND.EthPool) return "Uniswap v3 WETH/USDG oracle";
  if (m.kind === KIND.TokenPool) return `Uniswap v3 ${ref.asset.symbol}/WETH and WETH/USDG oracles`;
  return ref.asset.sourceLabel;
}

type Past = { start: number; end: number; result: { lock: number | null; close: number | null; outcome: Outcome } | null; pool: Pool & { count: number } };
type Detail = {
  market: MarketSnapshot;
  focus: number;
  focusRound: { start: number; end: number; result: Past["result"]; pool: Pool & { count: number }; lock: number | null } | null;
  past: Past[];
  chart: { from: number; to: number; points: Point[] };
};

export function MarketView({ id }: { id: string }) {
  const ref = findMarket(id)!;
  const params = useSearchParams();
  const roundParam = params.get("round");
  const sideParam = params.get("side");
  const initialSide: Side | null = sideParam === "up" || sideParam === "down" ? sideParam : null;
  const { board } = useBoard();
  const { account } = usePractice();
  const { time } = useClock();
  const { has, toggle } = useWatchlist();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [live, setLive] = useState<Point[]>([]);
  const [tab, setTab] = useState<"comments" | "entries" | "rules">("comments");
  const [shared, setShared] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch(`/api/market/${id}${roundParam ? `?round=${roundParam}` : ""}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((b: Detail | null) => {
          if (!cancelled && b) {
            setDetail(b);
            setLive([]);
          }
        })
        .catch(() => {});
    load();
    const t = window.setInterval(() => !document.hidden && load(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [id, roundParam]);

  const asset = board?.assets.find((a) => a.id === ref.asset.id);
  const snap = board?.markets.find((m) => m.id === id) ?? detail?.market;
  const viewingPast = Boolean(detail?.focusRound);

  // Append the live value from the board poll to the chart of the live round.
  useEffect(() => {
    if (viewingPast || !asset?.value || !board) return;
    const t = window.setTimeout(() => setLive((cur) => [...cur.slice(-400), { t: board.at, p: asset.value! }]), 0);
    return () => window.clearTimeout(t);
  }, [board, asset?.value, viewingPast]);

  // A new round started: reload so the chart and lock move with it.
  const liveStart = snap?.live.start;
  useEffect(() => {
    if (!liveStart || !detail || viewingPast || detail.market.live.start === liveStart) return;
    fetch(`/api/market/${id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((b: Detail) => {
        setDetail(b);
        setLive([]);
      })
      .catch(() => {});
  }, [liveStart, detail, viewingPast, id]);

  const points = useMemo(() => {
    const base = detail?.chart.points ?? [];
    const lastT = base.length ? base[base.length - 1].t : 0;
    return [...base, ...live.filter((p) => p.t > lastT)];
  }, [detail, live]);

  const unit = ref.asset.unit;
  const fmt = (v: number) => (unit === "blocks" ? `${Math.round(v)}` : `$${fmtPrice(v)}`);
  const sym = unit === "blocks" ? "Chain pace" : ref.asset.category === "stocks" ? ref.asset.symbol : `$${ref.asset.symbol}`;
  const siblings = ref.asset.frames;
  // With the round contract live, the live round shows the exact prices the contract will read.
  const onChain = snap?.chain ?? null;
  const lock = viewingPast ? (detail?.focusRound?.result?.lock ?? detail?.focusRound?.lock ?? null) : onChain ? onChain.lock : (snap?.live.lock ?? null);
  const now = viewingPast ? (detail?.focusRound?.result?.close ?? null) : onChain ? onChain.now : (asset?.value ?? null);
  const myHere = (account?.positions ?? []).filter((p) => p.kind === "round" && p.market === id).reverse();

  const share = async () => {
    const url = `${window.location.origin}/market/${id}`;
    try {
      if (navigator.share) await navigator.share({ title: `${snap?.question} · ${BRAND.name}`, url });
      else {
        await navigator.clipboard.writeText(url);
        setShared(true);
        window.setTimeout(() => setShared(false), 1500);
      }
    } catch {
      // dismissed
    }
  };

  return (
    <main className="mx-auto max-w-[1320px] px-4 pt-5 pb-8 sm:px-6">
      <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink">
        <ArrowLeft className="size-3.5" /> The board
      </Link>
      <div className="mt-3 grid gap-6 lg:grid-cols-[1fr_380px] lg:gap-x-8">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          {/* Title */}
          <div className="flex flex-wrap items-start gap-3">
            <AssetLogo src={ref.asset.logo} symbol={ref.asset.symbol} size={48} />
            <div className="min-w-0 flex-1">
              <h1 className="text-[22px] leading-tight font-semibold sm:text-[26px]" data-testid="market-title">
                {snap?.question ?? `${sym} · ${FRAME_LABEL[ref.frame]}`}
              </h1>
              <p className="mt-1 text-[13px] text-ink-3">
                {ref.asset.name} · {onChain ? `settled on-chain from the ${chainSourceLabel(id)}` : `settled from ${ref.asset.sourceLabel}`}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => toggle(ref.asset.id)}
                className={`btn btn-ghost h-9 px-3 text-[13px] ${has(ref.asset.id) ? "border-amber-deep" : ""}`}
                aria-pressed={has(ref.asset.id)}
                data-testid="watch-toggle"
              >
                {has(ref.asset.id) ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                {has(ref.asset.id) ? "Watching" : "Watch"}
              </button>
              <button type="button" onClick={share} className="btn btn-ghost h-9 px-3 text-[13px]" aria-label="Share market">
                {shared ? <Check className="size-4 text-up" /> : <Share2 className="size-4" />}
              </button>
            </div>
          </div>

          {/* Frame switch */}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {siblings.map((f) => (
              <Link
                key={f}
                href={`/market/${ref.asset.id}-${f}`}
                className={`rounded-md border px-3 py-1.5 font-mono text-[12.5px] ${f === ref.frame ? "border-ink bg-ink text-chalk" : "border-line-2 bg-card hover:border-ink"}`}
              >
                {FRAME_LABEL[f]}
              </Link>
            ))}
          </div>

          {/* Round panel */}
          <section className="panel mt-4 overflow-hidden">
            <div className="grid grid-cols-2 border-b border-line sm:grid-cols-4">
              {[
                { k: viewingPast ? "Lock" : unit === "blocks" ? "Last window" : "Price to beat", v: valueText(lock, unit), cls: "text-amber-deep" },
                {
                  k: viewingPast ? "Close" : unit === "blocks" ? "This window so far" : "Now",
                  v: valueText(now, unit),
                  cls: "",
                },
                {
                  k: viewingPast ? "Result" : "Since lock",
                  v: viewingPast ? <OutcomeChip outcome={detail?.focusRound?.result?.outcome} /> : unit === "blocks" ? "—" : <Move pct={moveOf(lock, now)} />,
                },
                {
                  k: viewingPast ? "Round" : "Ends in",
                  v: viewingPast ? time(detail!.focusRound!.start, true) : snap ? <Countdown to={snap.live.end} /> : "—",
                },
              ].map((c, i) => (
                <div
                  key={c.k}
                  className={`min-w-0 px-4 py-3 ${i % 2 ? "border-l border-line" : ""} ${i === 2 ? "border-t border-line sm:border-t-0 sm:border-l" : ""} ${i === 3 ? "border-t border-line sm:border-t-0" : ""}`}
                >
                  <p className="label">{c.k}</p>
                  <div className={`num mt-1 text-[17px] font-semibold break-all sm:text-[19px] ${c.cls ?? ""}`}>{c.v}</div>
                </div>
              ))}
            </div>
            {snap && !viewingPast ? <Elapsed start={snap.live.start} end={snap.live.end} className="mx-4 mt-3" /> : null}
            <div className="px-2 pt-2 sm:px-3">
              {unit === "blocks" ? (
                <div className="px-3 py-8 text-[14px] leading-relaxed text-ink-2">
                  This market compares block counts, not a price. The lock is the number of blocks Robinhood Chain produced in the previous{" "}
                  {FRAME_LABEL[ref.frame]}; UP wins if the round itself produces more. Counts come from block headers on the public RPC.
                </div>
              ) : (
                <RoundChart
                  points={detail ? points : []}
                  lock={lock}
                  from={detail?.chart.from ?? 0}
                  to={detail?.chart.to ?? 1}
                  roundStart={detail?.focus}
                  format={fmt}
                  height={280}
                  label={snap && !snap.status.open ? (snap.status.note ?? "Market closed") : undefined}
                />
              )}
            </div>
            {snap && !viewingPast ? (
              <div className="grid gap-4 border-t border-line px-4 py-3 sm:grid-cols-2">
                <div>
                  <p className="label mb-1.5">Live round pool (locked){onChain ? " · ETH" : ""}</p>
                  <PoolBar pool={onChain ? onChain.live : snap.live.pool} unit={onChain ? "ETH" : "pETH"} />
                </div>
                <div>
                  <p className="label mb-1.5">Next round pool (open){onChain ? " · ETH" : ""}</p>
                  <PoolBar pool={onChain ? onChain.open : snap.open.pool} unit={onChain ? "ETH" : "pETH"} />
                </div>
              </div>
            ) : null}
            {viewingPast && detail?.focusRound ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-[13px]">
                <span className="text-ink-2">Pool of that round:</span>
                <div className="min-w-[240px] flex-1">
                  <PoolBar pool={detail.focusRound.pool} />
                </div>
                <Link href={`/market/${id}`} className="btn btn-ink h-9 px-3 text-[13px]">
                  Back to live round
                </Link>
              </div>
            ) : null}
          </section>
        </div>

        <aside className="min-w-0 space-y-5 lg:sticky lg:top-[120px] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          {snap ? (
            <EntryPanel key={id} market={snap} initialSide={initialSide} ethUsd={board?.assets.find((a) => a.id === "eth")?.value ?? null} />
          ) : (
            <div className="panel h-[460px] animate-pulse" />
          )}
          {myHere.length ? (
            <div className="panel p-4">
              <p className="label">Your positions here</p>
              <PositionList positions={myHere.slice(0, 6)} />
            </div>
          ) : null}
        </aside>

        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          {/* Past rounds */}
          <section className="lg:mt-0">
            <div className="flex items-end justify-between border-b border-ink pb-2">
              <h2 className="h-display text-[24px]">Past rounds</h2>
              <span className="font-mono text-[11px] text-ink-3">{FEE_LABEL}</span>
            </div>
            <div className="scroll-x mt-3 flex gap-2 pb-1">
              {(detail?.past ?? []).map((p) => (
                <Link
                  key={p.start}
                  href={`/market/${id}?round=${p.start}`}
                  className={`w-[176px] shrink-0 rounded-md border px-3 py-2.5 transition-colors ${detail?.focus === p.start ? "border-ink bg-card" : "border-line-2 bg-card/60 hover:border-ink"}`}
                  data-testid="past-round"
                >
                  <p className="font-mono text-[11px] text-ink-3">{time(p.start)}</p>
                  <div className="mt-1">
                    <OutcomeChip outcome={p.result?.outcome} />
                  </div>
                  <p className="num mt-1.5 text-[11.5px] leading-snug break-words text-ink-2">
                    {p.result?.lock != null
                      ? `${fmt(p.result.lock)} → ${p.result.close != null ? fmt(p.result.close) : "—"}`
                      : !p.result
                        ? "settling…"
                        : ref.asset.category === "stocks"
                          ? "closed hours"
                          : "no price read"}
                  </p>
                </Link>
              ))}
              {!detail ? <p className="py-3 text-sm text-ink-3">Loading rounds…</p> : null}
            </div>
          </section>

          {/* Tabs */}
          <section className="mt-6">
            <div className="flex gap-1 border-b border-line" role="tablist">
              {(
                [
                  ["comments", "Comments"],
                  ["entries", "Practice entries"],
                  ["rules", "Rules"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={tab === k}
                  onClick={() => setTab(k)}
                  className={`-mb-px cursor-pointer border-b-2 px-3 py-2 text-[14px] font-medium ${tab === k ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="pt-4">
              {tab === "comments" ? <Comments thread={ref.asset.id} /> : null}
              {tab === "entries" ? <ActivityFeed market={id} limit={30} title="Entries in this market" /> : null}
              {tab === "rules" ? <Rules id={id} onChain={Boolean(onChain)} /> : null}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function chainRule(id: string) {
  const m = ONCHAIN_MARKETS[onchainIndex(id)];
  if (!m) return "";
  if (m.kind === KIND.Feed)
    return "The contract reads the Chainlink round that was current at the start and at the end, and checks it on chain. A price older than four hours refunds the round.";
  return `The contract reads the ${chainSourceLabel(id)} itself: 60-second time-weighted averages ending at the start and at the end. If the pool history no longer reaches the round a day after it ended, it refunds.`;
}

function Rules({ id, onChain }: { id: string; onChain: boolean }) {
  const ref = findMarket(id)!;
  const s = ref.asset.source;
  const how =
    s.kind === "okx"
      ? `Lock = open of the OKX ${s.inst} 1-minute candle that starts at the round's first second. Close = open of the candle that starts at the round's end (which is also the next round's lock).`
      : s.kind === "pool"
        ? "Lock and close are 30-second time-weighted averages from the token's Uniswap v3 pool oracle on Robinhood Chain, ending at the round's start and end, converted to USD with the OKX ETH-USDT minute candle of that moment."
        : s.kind === "chainlink"
          ? "Lock and close are the last answers the Chainlink feed on Robinhood Chain published at or before the round's start and end. Stock feeds run 24/5 and update on a 0.5% move or every 24 hours, so a quiet hour ends in a tie and refunds. Rounds outside equity hours do not open."
          : "Lock = number of blocks Robinhood Chain produced in the window before the round. Close = blocks produced during the round. Blocks are located by timestamp from public RPC block headers.";
  return (
    <div className="space-y-3 text-[14px] leading-relaxed text-ink-2">
      <p>
        <strong className="text-ink">Question.</strong>{" "}
        {ref.asset.unit === "blocks"
          ? "UP wins if the round produces more blocks than the window before it; DOWN wins if fewer."
          : "UP wins if the close is above the lock; DOWN wins if it is below."}
      </p>
      <p>
        <strong className="text-ink">Prices.</strong> {how}
      </p>
      <p>
        <strong className="text-ink">Entries.</strong> Positions go into the next round and close when it locks at the boundary. You can add to your side but
        not take both.
      </p>
      <p>
        <strong className="text-ink">Payout.</strong> {FEE_LABEL}. Winners split the whole pot pro rata to stake. A tie, an empty side or an unreadable price
        refunds every stake in full.
      </p>
      {onChain ? (
        <p>
          <strong className="text-ink">Real ETH.</strong> {chainRule(id)} Anyone can settle a round once it ends; claims pay out from the{" "}
          <a href={`${CHAIN.explorer}/address/${ROUNDS_CONTRACT}`} target="_blank" rel="noreferrer" className="underline">
            round contract
          </a>
          . Practice stakes follow the price sources above.
        </p>
      ) : (
        <p>
          <strong className="text-ink">Practice mode.</strong> Stakes use practice ETH kept by this site.{" "}
          {onchainIndex(id) >= 0
            ? "The same rules move to the on-chain round contract at launch."
            : "This market has no on-chain price source, so it stays practice-only."}{" "}
          <Link href="/how-it-works" className="underline">
            More
          </Link>
        </p>
      )}
    </div>
  );
}
