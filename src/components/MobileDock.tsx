"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Copy, Check, LayoutGrid, ListChecks, MessageCircle, Trophy } from "lucide-react";
import { useCopyCa } from "@/components/CopyCa";

/** Bottom tab bar on phones: markets, positions, leaderboard, chat and Copy CA. */
export function MobileDock() {
  const pathname = usePathname();
  const { copied, copy, live } = useCopyCa();
  const tab = (on: boolean) =>
    `flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10.5px] font-medium ${on ? "text-ink" : "text-ink-3"}`;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line-2 bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden" aria-label="Quick actions">
      <div className="flex items-stretch">
        <Link href="/" className={tab(pathname === "/" || pathname.startsWith("/market"))}>
          <LayoutGrid className="size-[18px]" />
          Markets
        </Link>
        <Link href="/positions" className={tab(pathname.startsWith("/positions"))}>
          <ListChecks className="size-[18px]" />
          Positions
        </Link>
        <Link href="/leaderboard" className={tab(pathname.startsWith("/leaderboard"))}>
          <Trophy className="size-[18px]" />
          Leaders
        </Link>
        <Link href="/chat" className={tab(pathname.startsWith("/chat"))}>
          <MessageCircle className="size-[18px]" />
          Chat
        </Link>
        <button
          type="button"
          onClick={copy}
          disabled={!live}
          className={`${tab(false)} cursor-pointer disabled:cursor-default`}
          data-testid="dock-ca"
          aria-label={live ? "Copy contract address" : "Contract address at launch"}
        >
          {copied ? <Check className="size-[18px] text-up" /> : <Copy className="size-[18px]" />}
          {!live ? "CA soon" : copied ? "Copied" : "Copy CA"}
        </button>
      </div>
    </nav>
  );
}
