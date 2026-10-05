"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { CHAIN } from "@/config/brand";
import { findMarket } from "@/config/markets";
import { KIND, ONCHAIN_MARKETS, ROUNDS_CONTRACT, splitKey, valueToUsd } from "@/config/onchain";
import { AssetLogo } from "@/components/AssetLogo";
import { useNow } from "@/components/providers/BoardProvider";
import { useClock } from "@/components/providers/useLocal";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useWalletModal } from "@/components/wallet/WalletButton";
import { encodeClaim, encodeSettle, weiToEth, type ChainEntry } from "@/lib/onchain/calls";
import { readEntries, simulate, waitReceipt } from "@/lib/onchain/client";
import { countdown, fmtEth, fmtPrice } from "@/lib/rounds";

type Row = ChainEntry & { marketId: string; index: number; round: number; start: number; end: number };
type State = "open" | "live" | "settle" | "won" | "lost" | "refund";

const CHIP: Record<State, string> = {
  open: "chip-flat",
  live: "chip-amber",
  settle: "chip-flat",
  won: "chip-up",
  lost: "chip-down",
  refund: "chip-amber",
};

function stateOf(r: Row, now: number): State {
  if (r.outcome === "refund") return "refund";
  if (r.outcome === "up" || r.outcome === "down") return r.outcome === r.side ? "won" : "lost";
  if (now < r.start) return "open";
  const oneSided = r.up === 0n || r.down === 0n;
  if (now < r.end && !oneSided) return "live";
  return "settle";
}

/** The wallet's real-ETH rounds, read from the contract, with settle and claim. */
export function ChainPositions() {
  const { address, onRobinhoodChain, switchNetwork, sendTransaction, refreshBalance } = useWallet();
  const { open } = useWalletModal();
  const now = useNow();
  const { time } = useClock();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; hash?: string } | null>(null);

  const load = useCallback(async () => {
    if (!address) return;
    try {
      const list = await readEntries(address);
      setRows(
        list.map((e) => {
          const { index, round } = splitKey(e.key);
          const m = ONCHAIN_MARKETS[index];
          const start = round * (m?.durationS ?? 0) * 1000;
          return { ...e, index, round, marketId: m?.id ?? `#${index}`, start, end: start + (m?.durationS ?? 0) * 1000 };
        }),
      );
      setError(null);
    } catch {
      setError("Could not read the round contract. Retrying…");
    }
  }, [address]);

  useEffect(() => {
    if (!address) return;
    const first = window.setTimeout(load, 0);
    const t = window.setInterval(() => !document.hidden && load(), 15_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(t);
    };
  }, [address, load]);

  const send = async (id: string, data: string, done: string) => {
    if (!address) return;
    setBusy(id);
    setMsg(null);
    try {
      const tx = { to: ROUNDS_CONTRACT, data };
      await simulate({ ...tx, from: address });
      const hash = await sendTransaction(tx);
      await waitReceipt(hash);
      setMsg({ ok: true, text: done, hash });
      refreshBalance();
      await load();
    } catch (cause) {
      setMsg({ ok: false, text: cause instanceof Error ? cause.message : "The transaction did not go through." });
    } finally {
      setBusy(null);
    }
  };

  const settle = async (r: Row) => {
    let lock = 0n;
    let close = 0n;
    if (ONCHAIN_MARKETS[r.index]?.kind === KIND.Feed && r.up > 0n && r.down > 0n) {
      const res = await fetch(`/api/onchain/hints?market=${r.index}&round=${r.round}`, { cache: "no-store" }).catch(() => null);
      const body = res?.ok ? ((await res.json()) as { lockHint: string; closeHint: string }) : null;
      if (!body) {
        setMsg({ ok: false, text: "Could not read the Chainlink round for this settlement. Try again in a minute." });
        return;
      }
      lock = BigInt(body.lockHint);
      close = BigInt(body.closeHint);
    }
    await send(`settle:${r.key}`, encodeSettle(r.index, r.round, lock, close), "Round settled. Your result is below.");
  };

  if (!address) {
    return (
      <section className="panel p-5" data-testid="chain-positions">
        <p className="text-[15px] font-semibold">Real ETH rounds</p>
        <p className="mt-1 text-[13.5px] text-ink-2">Connect your wallet to see the rounds you entered with ETH and claim payouts.</p>
        <button type="button" onClick={open} className="btn btn-ink mt-3 h-10 px-4 text-[14px]">
          Connect wallet
        </button>
      </section>
    );
  }

  const t = now ?? 0;
  const list = rows ?? [];
  const claimable = list.filter((r) => !r.claimed && r.outcome !== "open" && r.payout > 0n);
  const toClaim = claimable.reduce((s, r) => s + r.payout, 0n);
  const inRounds = list.filter((r) => r.outcome === "open").reduce((s, r) => s + r.stake, 0n);
  const wins = list.filter((r) => stateOf(r, t) === "won").length;
  const losses = list.filter((r) => stateOf(r, t) === "lost").length;
  const refunds = list.filter((r) => stateOf(r, t) === "refund").length;

  return (
    <section data-testid="chain-positions">
      <div className="board p-5">
        <p className="font-mono text-[10.5px] tracking-[0.08em] text-chalk/55 uppercase">Real ETH rounds · on-chain</p>
        <div className="mt-2 grid grid-cols-3 gap-3 font-mono text-[12px]">
          <div>
            <p className="text-chalk/50">In rounds</p>
            <p className="num mt-0.5 text-[20px] font-semibold">{fmtEth(weiToEth(inRounds), 5)}</p>
          </div>
          <div>
            <p className="text-chalk/50">To claim</p>
            <p className="num mt-0.5 text-[20px] font-semibold text-amber" data-testid="chain-to-claim">
              {fmtEth(weiToEth(toClaim), 5)}
            </p>
          </div>
          <div>
            <p className="text-chalk/50">Record</p>
            <p className="mt-0.5 text-[20px] font-semibold">
              {wins}W {losses}L {refunds}R
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {!onRobinhoodChain ? (
            <button type="button" onClick={switchNetwork} className="btn btn-accent h-10 px-4 text-[14px]">
              Switch to {CHAIN.name}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy !== null || claimable.length === 0}
              onClick={() => send("claim-all", encodeClaim(claimable.map((r) => r.key)), `Claimed ${fmtEth(weiToEth(toClaim), 5)} ETH.`)}
              className="btn btn-accent h-10 px-4 text-[14px]"
              data-testid="chain-claim-all"
            >
              {busy === "claim-all" ? "Claiming…" : `Claim all${claimable.length ? ` (${claimable.length})` : ""}`}
            </button>
          )}
        </div>
        {msg ? (
          <p className={`mt-3 text-[13px] ${msg.ok ? "text-chalk/85" : "text-[#ff8a73]"}`} data-testid="chain-msg">
            {msg.text}{" "}
            {msg.hash ? (
              <a href={`${CHAIN.explorer}/tx/${msg.hash}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline">
                tx <ExternalLink className="size-3" />
              </a>
            ) : null}
          </p>
        ) : null}
      </div>
      {error ? <p className="mt-3 text-[13px] text-down">{error}</p> : null}
      {rows === null ? (
        <p className="py-6 text-center text-[14px] text-ink-3">Reading the contract…</p>
      ) : list.length === 0 ? (
        <p className="py-6 text-center text-[14px] text-ink-3">No real-ETH rounds yet. Pick a market and switch the entry panel to Real ETH.</p>
      ) : (
        <ul className="mt-2">
          {list.map((r) => {
            const st = stateOf(r, t);
            const ref = findMarket(r.marketId);
            const m = ONCHAIN_MARKETS[r.index];
            const lock = m && r.outcome !== "open" ? valueToUsd(m, r.lockValue) : null;
            const close = m && r.outcome !== "open" ? valueToUsd(m, r.closeValue) : null;
            const net = r.outcome === "open" ? null : r.payout - r.stake;
            return (
              <li key={r.key.toString()} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line py-3" data-testid="chain-row">
                <AssetLogo src={ref?.asset.logo ?? null} symbol={ref?.asset.symbol ?? r.marketId} size={30} />
                <div className="min-w-0 flex-1">
                  <Link href={`/market/${r.marketId}`} className="block text-[14px] font-medium break-words hover:underline">
                    {ref ? `${ref.asset.symbol} · ${ref.frame}` : r.marketId}
                  </Link>
                  <p className="font-mono text-[11.5px] break-words text-ink-3">
                    <span className={r.side === "up" ? "text-up" : "text-down"}>{r.side.toUpperCase()}</span> · {fmtEth(weiToEth(r.stake))} ETH ·{" "}
                    {time(r.start, true)}
                    {lock !== null && close !== null ? ` · $${fmtPrice(lock)} → $${fmtPrice(close)}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`chip ${CHIP[st]}`}>
                    {st === "open" && now
                      ? `locks ${countdown(r.start - t)}`
                      : st === "live" && now
                        ? `ends ${countdown(r.end - t)}`
                        : st === "settle"
                          ? "to settle"
                          : st}
                  </span>
                  <span
                    className={`num w-[92px] text-right text-[13px] font-semibold ${net === null ? "text-ink-3" : net > 0n ? "text-up" : net < 0n ? "text-down" : "text-ink-2"}`}
                  >
                    {net === null ? "—" : `${net > 0n ? "+" : ""}${fmtEth(weiToEth(net), 5)}`}
                  </span>
                  {st === "settle" && onRobinhoodChain ? (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => settle(r)}
                      className="btn btn-ink h-8 px-3 text-[12px]"
                      data-testid="chain-settle"
                    >
                      {busy === `settle:${r.key}` ? "…" : "Settle"}
                    </button>
                  ) : null}
                  {!r.claimed && r.outcome !== "open" && r.payout > 0n && onRobinhoodChain ? (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => send(`claim:${r.key}`, encodeClaim([r.key]), `Claimed ${fmtEth(weiToEth(r.payout), 5)} ETH.`)}
                      className="btn btn-accent h-8 px-3 text-[12px]"
                      data-testid="chain-claim"
                    >
                      {busy === `claim:${r.key}` ? "…" : "Claim"}
                    </button>
                  ) : null}
                  {r.claimed ? <span className="font-mono text-[11px] text-ink-3">claimed</span> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
        Rounds settle automatically shortly after they end; the Settle button does the same thing yourself. Feed markets prove the Chainlink round on chain, so
        nobody can pick a price.
      </p>
    </section>
  );
}
