import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WeekView } from "@/components/week/WeekView";
import { findWeek, WEEK_MARKETS } from "@/config/markets";

export function generateStaticParams() {
  return WEEK_MARKETS.map((w) => ({ id: w.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const w = findWeek((await params).id);
  return w ? { title: w.title, description: `${w.title} Six price ranges, settled Monday 00:00 UTC.` } : {};
}

export default async function WeekPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!findWeek(id)) notFound();
  return <WeekView id={id} />;
}
