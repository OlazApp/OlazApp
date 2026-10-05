"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Movers } from "@/components/board/Widgets";
import { useNow } from "@/components/providers/BoardProvider";
import { ago } from "@/lib/rounds";

type Headline = { id: string; title: string; teaser: string; link: string; source: string; at: number; image: string | null; robinhood: boolean };

export function News() {
  const [items, setItems] = useState<Headline[] | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const now = useNow(60_000);
  useEffect(() => {
    fetch("/api/news")
      .then((r) => r.json())
      .then((b: { items: Headline[] }) => setItems(b.items))
      .catch(() => setItems([]));
  }, []);
  const sources = [...new Set((items ?? []).map((h) => h.source))];
  const shown = (items ?? []).filter((h) => filter === "all" || (filter === "robinhood" ? h.robinhood : h.source === filter));
  const tabs = [{ k: "all", l: "All" }, { k: "robinhood", l: "Robinhood" }, ...sources.map((s) => ({ k: s, l: s }))];
  return (
    <main className="mx-auto grid max-w-[1320px] gap-10 px-4 pt-8 pb-8 sm:px-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0">
        <p className="label">From crypto newsrooms, linked at the source</p>
        <h1 className="h-display mt-2 text-[56px] sm:text-[72px]">News</h1>
        <div className="scroll-x mt-6 flex gap-1">
          {tabs.map((t) => (
            <button key={t.k} type="button" onClick={() => setFilter(t.k)} className={`shrink-0 cursor-pointer rounded-md px-3 py-1.5 text-[14px] ${filter === t.k ? "bg-ink text-chalk" : "text-ink-2 hover:bg-card"}`}>
              {t.l}
            </button>
          ))}
        </div>
        <ul className="mt-4 border-t border-ink">
          {items === null ? <li className="py-10 text-center text-ink-3">Loading headlines…</li> : null}
          {items !== null && shown.length === 0 ? <li className="py-10 text-center text-ink-3">Nothing here right now.</li> : null}
          {shown.map((h) => (
            <li key={h.id} className="border-b border-line">
              <a href={h.link} target="_blank" rel="noreferrer" className="group flex gap-4 py-4">
                {h.image ? (
                  <img src={h.image} alt="" loading="lazy" className="hidden h-[84px] w-[140px] shrink-0 rounded-md object-cover sm:block" />
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className="font-mono text-[11px] text-ink-3">
                    {h.source} · {now ? ago(h.at, now) : ""}
                  </span>
                  <span className="mt-1 block text-[17px] leading-snug font-semibold group-hover:underline">{h.title}</span>
                  {h.teaser ? <span className="mt-1 line-clamp-2 block text-[14px] text-ink-2">{h.teaser}</span> : null}
                </span>
                <ArrowUpRight className="size-4 shrink-0 text-ink-3" />
              </a>
            </li>
          ))}
        </ul>
      </div>
      <aside>
        <Movers />
      </aside>
    </main>
  );
}
