import { BRAND, TOKEN } from "@/config/brand";

export const NAV = [
  { href: "/", label: "Markets" },
  { href: "/weekly", label: "Weekly" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/news", label: "News" },
  { href: "/chat", label: "Chat" },
] as const;

export const ACCOUNT_NAV = [
  { href: "/positions", label: "Positions" },
  { href: "/watching", label: "Watching" },
  { href: "/notifications", label: "Notifications" },
  { href: "/settings", label: "Settings" },
] as const;

export const LINKS = {
  x: BRAND.x,
  chart: () => TOKEN.chartUrl,
  explorer: () => TOKEN.explorerUrl,
};
