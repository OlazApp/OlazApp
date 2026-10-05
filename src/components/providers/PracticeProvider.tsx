"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useWallet } from "@/components/wallet/WalletProvider";
import type { Side } from "@/lib/rounds";

/*
 * Practice account in the browser. Signing in is one free personal_sign of a
 * server-issued message (the same session the chat uses); after that the
 * server keeps the practice balance and positions for that address.
 */

export type Position = {
  id: string;
  kind: "round" | "week";
  market: string;
  start: number;
  end: number;
  side: Side | number;
  stake: number;
  at: number;
  outcome?: Side | "refund" | number;
  payout?: number;
  claimed?: boolean;
};

export type Stats = {
  wagered: number;
  pnl: number;
  weekPnl: number;
  wins: number;
  losses: number;
  refunds: number;
  open: number;
  claimable: number;
};

export type Account = {
  address: string;
  name: string | null;
  balance: number;
  createdAt: number;
  lastTopUp: number;
  positions: Position[];
  stats: Stats;
};

export type PracticeStatus = "disconnected" | "checking" | "signed_out" | "signing" | "ready" | "not_configured" | "offline";

type Result = { ok: true; account: Account; claimed?: number } | { ok: false; error: string };

type PracticeState = {
  status: PracticeStatus;
  account: Account | null;
  error: string | null;
  signIn: () => Promise<boolean>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  enter: (market: string, side: Side, stake: number) => Promise<Result>;
  enterWeek: (week: string, bucket: number, stake: number) => Promise<Result>;
  claim: (ids?: string[]) => Promise<Result>;
  topUp: () => Promise<Result>;
  rename: (name: string) => Promise<Result>;
};

const PracticeContext = createContext<PracticeState | null>(null);

async function call<T>(path: string, init?: RequestInit) {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json" }, cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
  return { ok: res.ok, status: res.status, body };
}

export function PracticeProvider({ children }: { children: React.ReactNode }) {
  const { address, signMessage } = useWallet();
  const me = address?.toLowerCase() ?? null;
  const [status, setStatus] = useState<PracticeStatus>("disconnected");
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hadSession = useRef(false);

  const load = useCallback(async () => {
    if (!me) return;
    const session = await call<{ address?: string }>("/api/chat/session").catch(() => null);
    if (!session) return setStatus("offline");
    if (session.status === 503) return setStatus("not_configured");
    if (!session.ok || session.body.address !== me) {
      setAccount(null);
      return setStatus("signed_out");
    }
    hadSession.current = true;
    const res = await call<Account>("/api/practice/account", { method: "POST" }).catch(() => null);
    if (res?.ok) {
      setAccount(res.body);
      setStatus("ready");
    } else if (res?.status === 401) {
      setStatus("signed_out");
    } else {
      setStatus("offline");
    }
  }, [me]);

  useEffect(() => {
    if (!me) {
      const t = window.setTimeout(() => {
        setStatus("disconnected");
        setAccount(null);
      }, 0);
      if (hadSession.current) {
        hadSession.current = false;
        fetch("/api/chat/session", { method: "DELETE" }).catch(() => {});
      }
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => {
      setStatus("checking");
      load();
    }, 0);
    return () => window.clearTimeout(t);
  }, [me, load]);

  // Keep the account fresh while signed in (settlements land on their own).
  useEffect(() => {
    if (status !== "ready") return;
    const t = window.setInterval(() => {
      if (!document.hidden) load();
    }, 15000);
    return () => window.clearInterval(t);
  }, [status, load]);

  const signIn = useCallback(async () => {
    if (!me || !address) return false;
    setError(null);
    setStatus("signing");
    try {
      const nonce = await call<{ message?: string }>("/api/chat/nonce", { method: "POST", body: JSON.stringify({ address }) });
      if (nonce.status === 503) {
        setStatus("not_configured");
        return false;
      }
      if (!nonce.ok || !nonce.body.message) throw new Error(nonce.body.error ?? "Could not start sign-in.");
      const signature = await signMessage(nonce.body.message);
      const res = await call("/api/chat/session", {
        method: "POST",
        body: JSON.stringify({ address, message: nonce.body.message, signature }),
      });
      if (!res.ok) throw new Error(res.body.error ?? "Sign-in failed.");
      await load();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-in failed.");
      setStatus("signed_out");
      return false;
    }
  }, [me, address, signMessage, load]);

  const signOut = useCallback(async () => {
    await fetch("/api/chat/session", { method: "DELETE" }).catch(() => {});
    hadSession.current = false;
    setAccount(null);
    setStatus(me ? "signed_out" : "disconnected");
  }, [me]);

  const mutate = useCallback(async (path: string, body?: unknown): Promise<Result> => {
    const res = await call<Account & { claimed?: number }>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }).catch(
      () => null,
    );
    if (!res) return { ok: false, error: "Network error. Try again." };
    if (res.status === 401) {
      setStatus("signed_out");
      return { ok: false, error: "Sign in with your wallet first." };
    }
    if (!res.ok) return { ok: false, error: res.body.error ?? res.body.message ?? "Something went wrong." };
    setAccount(res.body);
    return { ok: true, account: res.body, claimed: res.body.claimed };
  }, []);

  const value: PracticeState = {
    status,
    account,
    error,
    signIn,
    signOut,
    refresh: load,
    enter: (market, side, stake) => mutate("/api/practice/enter", { market, side, stake }),
    enterWeek: (week, bucket, stake) => mutate("/api/practice/week", { week, bucket, stake }),
    claim: (ids) => mutate("/api/practice/claim", ids ? { ids } : {}),
    topUp: () => mutate("/api/practice/topup"),
    rename: (name) => mutate("/api/practice/name", { name }),
  };

  return <PracticeContext.Provider value={value}>{children}</PracticeContext.Provider>;
}

export function usePractice() {
  const ctx = useContext(PracticeContext);
  if (!ctx) throw new Error("usePractice outside PracticeProvider");
  return ctx;
}
