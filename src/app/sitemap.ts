import type { MetadataRoute } from "next";
import { BRAND } from "@/config/brand";
import { MARKETS, WEEK_MARKETS } from "@/config/markets";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
    "",
    "/weekly",
    "/leaderboard",
    "/news",
    "/how-it-works",
    "/chat",
    "/swap",
    "/terms",
    ...MARKETS.map((m) => `/market/${m.id}`),
    ...WEEK_MARKETS.map((w) => `/week/${w.id}`),
  ];
  return paths.map((path) => ({ url: `${BRAND.url}${path}`, lastModified: new Date("2026-10-04") }));
}
