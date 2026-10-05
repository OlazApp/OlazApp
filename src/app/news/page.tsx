import type { Metadata } from "next";
import { News } from "@/components/pages/News";

export const metadata: Metadata = { title: "News", description: "Crypto and Robinhood Chain headlines, linked at the source." };

export default function Page() {
  return <News />;
}
