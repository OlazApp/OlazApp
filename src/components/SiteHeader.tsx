"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, Search, X } from "lucide-react";
import { CopyCaTag } from "@/components/CopyCa";
import { Wordmark } from "@/components/Mark";
import { ACCOUNT_NAV, NAV } from "@/components/site";
import { AssetLogo } from "@/components/AssetLogo";
import { useBoard } from "@/components/providers/BoardProvider";
import { usePractice } from "@/components/providers/PracticeProvider";
import { openSearch } from "@/components/SearchPalette";
import { NavWallet } from "@/components/wallet/WalletButton";
import { fmtEth, fmtPct, fmtPrice, fromMicro } from "@/lib/rounds";
import { roundsLive } from "@/config/onchain";

/** Row of live prices under the navbar, opening with the mode notice (practice, or real ETH once the contract is live). */
function Tape() {
  const { board } = useBoard();
  const { account } = usePractice();
  return (
    <div className="border-b border-line bg-board text-chalk">
      <div className="scroll-x mx-auto flex max-w-[1320px] items-center gap-5 px-4 py-1.5 font-mono text-[11px] sm:px-6">
        <Link href="/how-it-works" className="flex shrink-0 items-center gap-1.5 text-amber hover:underline">
          <span className="size-1.5 animate-pulse-dot rounded-full bg-amber" />
          {roundsLive() ? "Real ETH rounds live" : "Practice mode"}
        </Link>
        {account ? (
          <Link href="/positions" className="shrink-0 text-chalk/80 hover:text-chalk">
            Balance <span className="text-chalk">{fmtEth(fromMicro(account.balance))} pETH</span>
          </Link>
        ) : null}
        {(board?.assets ?? [])
          .filter((a) => a.unit === "usd")
          .map((a) => (
            <Link key={a.id} href={`/market/${a.id}-${a.category === "stocks" ? "1h" : "5m"}`} className="flex shrink-0 items-center gap-1.5 hover:text-amber">
              <AssetLogo src={a.logo} symbol={a.symbol} size={14} />
              <span className="text-chalk/70">{a.symbol}</span>
              <span>${fmtPrice(a.value)}</span>
              <span className={a.change24h === null ? "text-chalk/40" : a.change24h >= 0 ? "text-[#3fcf86]" : "text-[#ff6b4f]"}>{fmtPct(a.change24h)}</span>
            </Link>
          ))}
        {!board ? <span className="text-chalk/50">Reading feeds…</span> : null}
      </div>
    </div>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(t);
  }, [pathname]);

  const active = (href: string) => (href === "/" ? pathname === "/" || pathname.startsWith("/market") : pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-50 bg-paper/95 backdrop-blur-sm">
      <div className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-[1320px] items-center gap-3 px-4 sm:px-6">
          <Link href="/" aria-label="Olaz home" className="shrink-0">
            <Wordmark />
          </Link>
          <nav className="ml-4 hidden items-center gap-1 lg:flex" aria-label="Main">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-2.5 py-1.5 text-[14px] font-medium transition-colors ${active(item.href) ? "bg-ink text-chalk" : "text-ink-2 hover:text-ink"}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={openSearch}
              className="hidden h-9 cursor-pointer items-center gap-2 rounded-md border border-line-2 bg-card px-2.5 text-[13px] text-ink-3 transition-colors hover:border-ink md:flex"
              aria-label="Search markets"
            >
              <Search className="size-3.5" />
              <span className="hidden xl:inline">Search markets</span>
              <kbd className="hidden rounded border border-line px-1 font-mono text-[10px] xl:inline">/</kbd>
            </button>
            <CopyCaTag compact />
            <div className="hidden sm:block">
              <NavWallet />
            </div>
            <div className="sm:hidden">
              <NavWallet compact />
            </div>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-line-2 bg-card lg:hidden"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
            >
              {open ? <X className="size-4" /> : <Menu className="size-4" />}
            </button>
          </div>
        </div>
        {open ? (
          <div className="border-t border-line bg-card lg:hidden">
            <nav className="mx-auto grid max-w-[1320px] grid-cols-2 gap-1 px-4 py-3 sm:grid-cols-3 sm:px-6" aria-label="Mobile">
              {[...NAV, ...ACCOUNT_NAV, { href: "/how-it-works", label: "How it works" }, { href: "/swap", label: "Swap" }].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md px-3 py-2.5 text-[15px] font-medium ${active(item.href) ? "bg-ink text-chalk" : "text-ink hover:bg-paper"}`}
                >
                  {item.label}
                </Link>
              ))}
              <button
                type="button"
                onClick={openSearch}
                className="flex items-center gap-2 rounded-md px-3 py-2.5 text-left text-[15px] font-medium text-ink hover:bg-paper"
              >
                <Search className="size-4" /> Search
              </button>
            </nav>
          </div>
        ) : null}
      </div>
      <Tape />
    </header>
  );
}
