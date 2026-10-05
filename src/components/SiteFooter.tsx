import Link from "next/link";
import { BRAND, CHAIN } from "@/config/brand";
import { CopyCaBlock } from "@/components/CopyCa";
import { Wordmark } from "@/components/Mark";
import { XIcon } from "@/components/icons";
import { CATEGORIES } from "@/config/markets";
import { roundsLive } from "@/config/onchain";

const cols = [
  {
    title: "Markets",
    links: [
      { href: "/", label: "All markets" },
      ...CATEGORIES.map((c) => ({ href: `/?cat=${c.id}`, label: c.label })),
      { href: "/weekly", label: "Weekly ranges" },
    ],
  },
  {
    title: "Your desk",
    links: [
      { href: "/positions", label: "Positions" },
      { href: "/watching", label: "Watching" },
      { href: "/notifications", label: "Notifications" },
      { href: "/settings", label: "Settings" },
    ],
  },
  {
    title: "Olaz",
    links: [
      { href: "/how-it-works", label: "How it works" },
      { href: "/leaderboard", label: "Leaderboard" },
      { href: "/news", label: "News" },
      { href: "/chat", label: "Chat" },
      { href: "/swap", label: `Swap ${BRAND.symbol}` },
      { href: "/terms", label: "Terms" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line bg-card pb-24 md:pb-0">
      <div className="mx-auto grid max-w-[1320px] gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.3fr_2fr]">
        <div className="min-w-0">
          <Wordmark />
          <p className="mt-3 max-w-sm text-[15px] text-ink-2">
            {BRAND.slogan} Short UP/DOWN rounds on tokens, stocks and chain activity, on {CHAIN.name}.
          </p>
          <CopyCaBlock className="mt-5 max-w-md" />
          <a href={BRAND.x} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-ink hover:underline">
            <XIcon className="size-4" /> {BRAND.xHandle}
          </a>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {cols.map((c) => (
            <div key={c.title}>
              <p className="label">{c.title}</p>
              <ul className="mt-3 space-y-2">
                {c.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-[14px] text-ink-2 hover:text-ink">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-[1320px] px-4 py-5 text-[12.5px] leading-relaxed text-ink-3 sm:px-6">
          © 2026 {BRAND.name}.{" "}
          {roundsLive()
            ? "Real-ETH rounds run on an unaudited contract; practice balances are simulated. Prices are real."
            : "Practice mode: balances and payouts are simulated until the round contract is deployed; prices are real."}
          Not affiliated with Robinhood Markets, Inc. Nothing here is financial advice.
        </p>
      </div>
    </footer>
  );
}
