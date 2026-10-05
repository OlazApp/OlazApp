import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MarketView } from "@/components/market/MarketView";
import { findMarket, FRAME_LABEL, MARKETS, question } from "@/config/markets";

export function generateStaticParams() {
  return MARKETS.map((m) => ({ id: m.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const m = findMarket((await params).id);
  if (!m) return {};
  return {
    title: question(m.asset, m.frame),
    description: `${m.asset.name} ${FRAME_LABEL[m.frame]} UP/DOWN rounds, settled from ${m.asset.sourceLabel}.`,
  };
}

export default async function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!findMarket(id)) notFound();
  return (
    <Suspense fallback={<div className="mx-auto h-[80vh] max-w-[1320px]" />}>
      <MarketView id={id} />
    </Suspense>
  );
}
