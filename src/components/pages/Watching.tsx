"use client";

import Link from "next/link";
import { AssetRow } from "@/components/board/AssetRow";
import { useBoard } from "@/components/providers/BoardProvider";
import { useWatchlist } from "@/components/providers/useLocal";

export function Watching() {
  const { board } = useBoard();
  const { list } = useWatchlist();
  const assets = (board?.assets ?? []).filter((a) => list.includes(a.id));
  return (
    <main className="mx-auto max-w-[1320px] px-4 pt-8 pb-8 sm:px-6">
      <p className="label">Saved in this browser</p>
      <h1 className="h-display mt-2 text-[56px] sm:text-[72px]">Watching</h1>
      <div className="mt-6 border-t border-ink">
        {board && assets.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-[16px] font-medium">Nothing on your watchlist.</p>
            <p className="mt-1 text-ink-3">Tap the eye next to any asset on the board to keep it here.</p>
            <Link href="/" className="btn btn-ink mt-5 h-10 px-5">
              Open the board
            </Link>
          </div>
        ) : null}
        {!board ? <p className="py-10 text-center text-ink-3">Loading…</p> : null}
        {assets.map((a) => (
          <AssetRow key={a.id} asset={a} markets={board!.markets.filter((m) => m.assetId === a.id)} frame={null} />
        ))}
      </div>
    </main>
  );
}
