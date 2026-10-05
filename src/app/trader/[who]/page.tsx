import type { Metadata } from "next";
import { Trader } from "@/components/pages/Trader";

export const metadata: Metadata = { title: "Trader", description: "Practice record of an Olaz trader." };

export default async function Page({ params }: { params: Promise<{ who: string }> }) {
  return <Trader who={(await params).who} />;
}
