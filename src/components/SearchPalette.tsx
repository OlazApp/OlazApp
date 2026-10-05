"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";
import { ASSETS, FRAME_LABEL, MARKETS, WEEK_MARKETS, question } from "@/config/markets";
import { AssetLogo } from "@/components/AssetLogo";

const EVENT = "olaz:search";
export const openSearch = () => window.dispatchEvent(new Event(EVENT));

type Hit = { href: string; title: string; meta: string; logo: string | null; symbol: string };

const ALL: Hit[] = [
  ...MARKETS.map((m) => ({
    href: `/market/${m.id}`,
    title: question(m.asset, m.frame),
    meta: `${m.asset.name} · ${FRAME_LABEL[m.frame]} rounds`,
    logo: m.asset.logo,
    symbol: m.asset.symbol,
  })),
  ...WEEK_MARKETS.map((w) => {
    const a = ASSETS.find((x) => x.id === w.assetId)!;
    return { href: `/week/${w.id}`, title: w.title, meta: "Weekly range", logo: a.logo, symbol: a.symbol };
  }),
];

/** Market search, opened from the header button or the "/" key. */
export function SearchPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const show = () => {
      setQ("");
      setIndex(0);
      setOpen(true);
    };
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest("input, textarea, [contenteditable]");
      if (!typing && (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k"))) {
        e.preventDefault();
        show();
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener(EVENT, show);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(EVENT, show);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (open) window.setTimeout(() => input.current?.focus(), 10);
  }, [open]);

  const hits = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return ALL.filter((h) => words.every((w) => `${h.title} ${h.meta} ${h.symbol}`.toLowerCase().includes(w))).slice(0, 12);
  }, [q]);

  if (!open) return null;
  const go = (hit: Hit | undefined) => {
    if (!hit) return;
    setOpen(false);
    router.push(hit.href);
  };

  return createPortal(
    <div className="fixed inset-0 z-[75] flex items-start justify-center px-3 pt-[10vh]" role="dialog" aria-modal="true" aria-label="Search markets">
      <div className="absolute inset-0 bg-board/60" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-lg border border-line-2 bg-card shadow-xl">
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search className="size-4 text-ink-3" />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setIndex((i) => Math.min(hits.length - 1, i + 1));
              if (e.key === "ArrowUp") setIndex((i) => Math.max(0, i - 1));
              if (e.key === "Enter") go(hits[index]);
            }}
            placeholder="ETH, NVDA, 15 minutes, weekly…"
            className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-3"
            data-testid="search-input"
          />
          <kbd className="rounded border border-line px-1.5 font-mono text-[10px] text-ink-3">esc</kbd>
        </div>
        <ul className="max-h-[60vh] overflow-y-auto p-1.5">
          {hits.length === 0 ? <li className="px-3 py-6 text-center text-sm text-ink-3">No market matches “{q}”.</li> : null}
          {hits.map((h, i) => (
            <li key={h.href}>
              <button
                type="button"
                onMouseEnter={() => setIndex(i)}
                onClick={() => go(h)}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left ${i === index ? "bg-paper" : ""}`}
              >
                <AssetLogo src={h.logo} symbol={h.symbol} size={26} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{h.title}</span>
                  <span className="block truncate text-[12px] text-ink-3">{h.meta}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
