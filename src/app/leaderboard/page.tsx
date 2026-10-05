import type { Metadata } from "next";
import { Leaderboard } from "@/components/pages/Leaderboard";

export const metadata: Metadata = { title: "Leaderboard", description: "Practice results of real Olaz traders, ranked by profit." };

export default function Page() {
  return <Leaderboard />;
}
