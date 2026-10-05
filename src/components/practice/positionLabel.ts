import { findMarket, findWeek, FRAME_LABEL } from "@/config/markets";
import type { Position } from "@/components/providers/PracticeProvider";

export function positionTitle(p: Position) {
  if (p.kind === "week") return findWeek(p.market)?.title ?? p.market;
  const m = findMarket(p.market);
  if (!m) return p.market;
  const sym = m.asset.unit === "blocks" ? "Chain pace" : m.asset.category === "stocks" ? m.asset.symbol : `$${m.asset.symbol}`;
  return `${sym} · ${FRAME_LABEL[m.frame]}`;
}

export function positionHref(p: Position) {
  return p.kind === "week" ? `/week/${p.market}` : `/market/${p.market}?round=${p.start}`;
}

export function positionLogo(p: Position) {
  if (p.kind === "week") {
    const w = findWeek(p.market);
    return w ? (findMarket(`${w.assetId}-1h`)?.asset.logo ?? null) : null;
  }
  return findMarket(p.market)?.asset.logo ?? null;
}

export type PositionState = "open" | "live" | "settling" | "won" | "lost" | "refund";

export function stateOf(p: Position, now: number): PositionState {
  if (p.payout !== undefined) {
    if (p.outcome === "refund") return "refund";
    return p.payout > 0 ? "won" : "lost";
  }
  if (now < p.start) return "open";
  if (now < p.end) return "live";
  return "settling";
}
