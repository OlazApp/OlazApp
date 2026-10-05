"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { findMarket, findWeek, FRAME_LABEL } from "@/config/markets";
import { AssetLogo } from "@/components/AssetLogo";
import { Avatar, traderName, valueText } from "@/components/market/ui";
import { useBoard, useNow } from "@/components/providers/BoardProvider";
import { ago, fmtEth, fmtPct, fromMicro } from "@/lib/rounds";

type Activity = { address: string; name: string | null; kind: "round" | "week"; market: string; start: number; side: string | number; stake: number; at: number };
type Headline = { id: string; title: string; link: string; source: string; at: number; image: string | null };

export function WidgetTitle({ children, href }: { children: React.ReactNode; href?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-ink pb-2">
      <h3 className="h-display text-[22px]">{children}</h3>
      {href ? (
        <Link href={href} className="flex items-center gap-1 text-[12.5px] text-ink-2 hover:text-ink">
          All <ArrowUpRight className="size-3.5" />
        </Link>
      ) : null}
    </div>
  );
}

/** Biggest 24 h moves among the assets on the board. */
export function Movers({ limit = 6 }: { limit?: number }) {
  const { board } = useBoard();
  const rows = (board?.assets ?? [])
    .filter((a) => a.change24h !== null)
    .sort((a, b) => Math.abs(b.change24h!) - Math.abs(a.change24h!))
    .slice(0, limit);
  return (
    <section>
      <WidgetTitle>Top movers · 24h</WidgetTitle>
      <ol className="mt-1">
        {rows.length === 0 ? <li className="py-4 text-sm text-ink-3">Reading feeds…</li> : null}
        {rows.map((a, i) => (
          <li key={a.id}>
            <Link href={`/market/${a.id}-${a.category === "stocks" ? "1h" : "5m"}`} className="flex items-center gap-3 border-b border-line py-2.5 hover:bg-card/70">
              <span className="w-4 font-mono text-[11px] text-ink-3">{i + 1}</span>
              <AssetLogo src={a.logo} symbol={a.symbol} size={26} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium">{a.category === "stocks" ? a.symbol : `$${a.symbol}`}</span>
                <span className="block truncate font-mono text-[11.5px] text-ink-3">{valueText(a.value, a.unit)}</span>
              </span>
              <span className={`num text-[13px] font-semibold ${a.change24h! >= 0 ? "text-up" : "text-down"}`}>{fmtPct(a.change24h)}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

function activityLabel(a: Activity) {
  if (a.kind === "week") {
    const w = findWeek(a.market);
    return { title: w?.title ?? a.market, side: `range ${Number(a.side) + 1}`, href: `/week/${a.market}` };
  }
  const m = findMarket(a.market);
  const sym = m ? (m.asset.category === "stocks" ? m.asset.symbol : m.asset.unit === "blocks" ? "Chain pace" : `$${m.asset.symbol}`) : a.market;
  return { title: m ? `${sym} · ${FRAME_LABEL[m.frame]}` : a.market, side: String(a.side).toUpperCase(), href: `/market/${a.market}` };
}

/** Practice entries by real visitors (newest first). Nothing is generated. */
export function ActivityFeed({ market, limit = 8, title = "Practice activity" }: { market?: string; limit?: number; title?: string }) {
  const [items, setItems] = useState<Activity[] | null>(null);
  const [storage, setStorage] = useState(true);
  const now = useNow(10_000);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch(`/api/practice/activity${market ? `?market=${market}` : ""}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((b: { items: Activity[]; storage: boolean }) => {
          if (cancelled) return;
          setItems(b.items);
          setStorage(b.storage);
        })
        .catch(() => !cancelled && setItems([]));
    load();
    const t = window.setInterval(() => !document.hidden && load(), 12_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [market]);
  return (
    <section>
      <WidgetTitle>{title}</WidgetTitle>
      <ul className="mt-1">
        {items === null ? <li className="py-4 text-sm text-ink-3">Loading…</li> : null}
        {items !== null && items.length === 0 ? (
          <li className="py-4 text-sm leading-relaxed text-ink-3">
            {storage ? "No practice entries yet. The first call on the board shows up here." : "Practice storage is not configured on this site yet."}
          </li>
        ) : null}
        {(items ?? []).slice(0, limit).map((a, i) => {
          const l = activityLabel(a);
          const sideClass = a.side === "up" ? "text-up" : a.side === "down" ? "text-down" : "text-amber-deep";
          return (
            <li key={`${a.at}-${i}`} className="flex items-center gap-3 border-b border-line py-2.5">
              <Link href={`/trader/${a.address}`}>
                <Avatar address={a.address} size={26} />
              </Link>
              <span className="min-w-0 flex-1 text-[13px] leading-snug">
                <Link href={`/trader/${a.address}`} className="font-medium hover:underline">
                  {traderName(a.address, a.name)}
                </Link>{" "}
                <span className="text-ink-3">staked {fmtEth(fromMicro(a.stake))} pETH on</span>{" "}
                <span className={`font-semibold ${sideClass}`}>{l.side}</span>
                <Link href={l.href} className="block truncate text-[12px] text-ink-3 hover:text-ink">
                  {l.title}
                </Link>
              </span>
              <span className="shrink-0 font-mono text-[11px] text-ink-3">{now ? ago(a.at, now) : ""}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function HeadlinesMini({ limit = 5 }: { limit?: number }) {
  const [items, setItems] = useState<Headline[] | null>(null);
  const now = useNow(60_000);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/news")
      .then((r) => r.json())
      .then((b: { items: Headline[] }) => !cancelled && setItems(b.items))
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <section>
      <WidgetTitle href="/news">Headlines</WidgetTitle>
      <ul className="mt-1">
        {items === null ? <li className="py-4 text-sm text-ink-3">Loading…</li> : null}
        {items !== null && items.length === 0 ? <li className="py-4 text-sm text-ink-3">Newsrooms are not answering right now.</li> : null}
        {(items ?? []).slice(0, limit).map((h) => (
          <li key={h.id} className="border-b border-line py-2.5">
            <a href={h.link} target="_blank" rel="noreferrer" className="group block">
              <span className="line-clamp-2 text-[13.5px] leading-snug font-medium group-hover:underline">{h.title}</span>
              <span className="mt-0.5 block font-mono text-[11px] text-ink-3">
                {h.source} · {now ? ago(h.at, now) : ""}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
