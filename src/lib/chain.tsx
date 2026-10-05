"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { rpc, rpcBatch } from "@/lib/rpc";

type Block = {
  number: string;
  timestamp: string;
  gasUsed: string;
  gasLimit: string;
  transactions: string[];
};

export type Pulse = {
  block: number | null;
  timestamp: number | null;
  gasGwei: number | null;
  txCount: number | null;
  gasUsedPct: number | null;
  /** Seconds per block, averaged over the last SPAN blocks. */
  blockTime: number | null;
  /** Transactions in the last RECENT blocks. */
  recentTx: number | null;
  ethUsd: number | null;
  ethChange: number | null;
  updatedAt: number | null;
  error: boolean;
};

const SPAN = 100;
const RECENT = 10;

const EMPTY: Pulse = {
  block: null,
  timestamp: null,
  gasGwei: null,
  txCount: null,
  gasUsedPct: null,
  blockTime: null,
  recentTx: null,
  ethUsd: null,
  ethChange: null,
  updatedAt: null,
  error: false,
};

const PulseContext = createContext<Pulse>(EMPTY);

const hex = (n: number) => `0x${n.toString(16)}`;

/**
 * Reads Robinhood Chain straight from its public RPC every few seconds.
 * Nothing on the page that says "live" comes from anywhere else.
 */
export function ChainPulseProvider({ children }: { children: React.ReactNode }) {
  const [pulse, setPulse] = useState<Pulse>(EMPTY);

  useEffect(() => {
    let cancelled = false;

    const loadChain = async () => {
      try {
        const [latest, gas] = await Promise.all([
          rpc<Block>("eth_getBlockByNumber", ["latest", false]),
          rpc<string>("eth_gasPrice"),
        ]);
        const n = Number.parseInt(latest.number, 16);
        const next: Partial<Pulse> = {
          block: n,
          timestamp: Number.parseInt(latest.timestamp, 16),
          gasGwei: Number(BigInt(gas)) / 1e9,
          txCount: latest.transactions.length,
          gasUsedPct:
            Number.parseInt(latest.gasLimit, 16) > 0
              ? (Number.parseInt(latest.gasUsed, 16) / Number.parseInt(latest.gasLimit, 16)) * 100
              : null,
          updatedAt: Date.now(),
          error: false,
        };
        try {
          const older = await rpcBatch<Block>([
            { method: "eth_getBlockByNumber", params: [hex(n - SPAN), false] },
            ...Array.from({ length: RECENT - 1 }, (_, i) => ({
              method: "eth_getBlockByNumber",
              params: [hex(n - 1 - i), false],
            })),
          ]);
          const [far, ...recent] = older;
          next.blockTime = (next.timestamp! - Number.parseInt(far.timestamp, 16)) / SPAN;
          next.recentTx = recent.reduce((sum, b) => sum + b.transactions.length, latest.transactions.length);
        } catch {
          // The extra reads are a nicety; the tiles fall back to "—".
        }
        if (!cancelled) setPulse((p) => ({ ...p, ...next }));
      } catch {
        if (!cancelled) setPulse((p) => ({ ...p, error: true }));
      }
    };

    const loadPrice = async () => {
      try {
        const res = await fetch("/api/eth-price");
        if (!res.ok) return;
        const body = (await res.json()) as { usd: number; change24h: number | null };
        if (!cancelled) setPulse((p) => ({ ...p, ethUsd: body.usd, ethChange: body.change24h }));
      } catch {
        // Price stays "—".
      }
    };

    loadChain();
    loadPrice();
    const a = window.setInterval(loadChain, 12000);
    const b = window.setInterval(loadPrice, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(a);
      window.clearInterval(b);
    };
  }, []);

  return <PulseContext.Provider value={pulse}>{children}</PulseContext.Provider>;
}

export function useChainPulse() {
  return useContext(PulseContext);
}

/** "12s ago" that re-renders once a second. */
export function useAgo(ms: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  if (!ms) return "—";
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

export const fmt = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
