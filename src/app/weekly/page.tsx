import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AssetLogo } from "@/components/AssetLogo";
import { findAsset, WEEK_MARKETS } from "@/config/markets";
import { FEE_LABEL } from "@/lib/rounds";

export const metadata: Metadata = { title: "Weekly ranges", description: "Where ETH, BTC and SOL close this week, in six price ranges." };

export default function WeeklyPage() {
  return (
    <main className="mx-auto max-w-[1320px] px-4 pt-8 pb-8 sm:px-6">
      <p className="label">Monday 00:00 → Monday 00:00 UTC</p>
      <h1 className="h-display mt-2 text-[56px] sm:text-[72px]">Weekly ranges</h1>
      <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-ink-2">
        Slower than the round board: pick the price range an asset closes the week in. Ranges are cut around the week&apos;s opening price in steps of about 3%.
        Entries close 48 hours before the end. {FEE_LABEL}.
      </p>
      <ul className="mt-8 border-t border-ink">
        {WEEK_MARKETS.map((w) => {
          const a = findAsset(w.assetId)!;
          return (
            <li key={w.id}>
              <Link href={`/week/${w.id}`} className="flex items-center gap-4 border-b border-line py-5 hover:bg-card/60">
                <AssetLogo src={a.logo} symbol={a.symbol} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[18px] font-semibold">{w.title}</span>
                  <span className="block text-[13px] text-ink-3">Settled from {a.sourceLabel} · six ranges · parimutuel</span>
                </span>
                <ArrowRight className="size-5 text-ink-3" />
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
