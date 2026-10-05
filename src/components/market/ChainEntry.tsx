"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { CHAIN } from "@/config/brand";
import { ROUNDS_CONTRACT, SIDE, roundKey } from "@/config/onchain";
import { PoolBar, fmtMult } from "@/components/market/ui";
import { useBoard } from "@/components/providers/BoardProvider";
import { STAKE_KEY, useLocal } from "@/components/providers/useLocal";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useWalletModal } from "@/components/wallet/WalletButton";
import type { MarketSnapshot } from "@/lib/board";
import { readEntries, simulate, waitReceipt } from "@/lib/onchain/client";
import { encodeEnter, ethToWei, weiToEth } from "@/lib/onchain/calls";
import { MAX_STAKE, MIN_STAKE, STAKE_PRESETS, estimateReturn, fmtEth, fromMicro, multiplier, toMicro, type Side } from "@/lib/rounds";

/** Take a side in the open round with real ETH, through the OlazRounds contract. */
export function ChainEntry({ market, side, setSide, ethUsd }: { market: MarketSnapshot; side: Side; setSide: (s: Side) => void; ethUsd: number | null }) {
  const chain = market.chain!;
  const { address, onRobinhoodChain, switchNetwork, switching, sendTransaction, balance, refreshBalance } = useWallet();
  const { open } = useWalletModal();
  const { refresh } = useBoard();
  const [stakePref, setStakePref] = useLocal<number>(STAKE_KEY, 0.005);
  const [draft, setDraft] = useState<string | null>(null);
  const [stage, setStage] = useState<"idle" | "checking" | "signing" | "mining">("idle");
  const [note, setNote] = useState<{ ok: boolean; text: string; hash?: string } | null>(null);
  const [mine, setMine] = useState<{ side: Side; stake: bigint } | null>(null);

  const stakeText = draft ?? String(stakePref);
  const wei = ethToWei(stakeText);
  const stake = wei === null ? NaN : weiToEth(wei);
  const valid = wei !== null && stake >= MIN_STAKE && stake <= MAX_STAKE;
  const pool = chain.open;
  const est = valid ? fromMicro(estimateReturn(pool, side, toMicro(stake))) : null;
  const closed = !market.status.open;
  const key = roundKey(chain.index, chain.openRound);

  // The wallet's own stake in the open round, read from the contract.
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    readEntries(address, 20)
      .then((list) => {
        const hit = list.find((e) => e.key === key);
        if (!cancelled) setMine(hit ? { side: hit.side, stake: hit.stake } : null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [address, key, note]);
  const holding = address ? mine : null;

  const submit = async () => {
    if (!address || wei === null || !valid) return;
    setNote(null);
    const tx = { to: ROUNDS_CONTRACT, data: encodeEnter(chain.index, chain.openRound, SIDE[side]), value: wei };
    try {
      setStage("checking");
      await simulate({ ...tx, from: address });
      setStage("signing");
      const hash = await sendTransaction(tx);
      setStage("mining");
      await waitReceipt(hash);
      setStakePref(stake);
      setDraft(null);
      setNote({ ok: true, text: `${side.toUpperCase()} · ${fmtEth(stake)} ETH is in the round that locks at the next boundary.`, hash });
      refresh();
      refreshBalance();
    } catch (cause) {
      setNote({ ok: false, text: cause instanceof Error ? cause.message : "The entry did not go through." });
    } finally {
      setStage("idle");
    }
  };

  const busy = stage !== "idle";
  const label = { idle: "", checking: "Checking…", signing: "Confirm in wallet…", mining: "Waiting for the block…" }[stage];

  return (
    <div className="space-y-4" data-testid="chain-entry">
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Side">
        {(["up", "down"] as Side[]).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={side === s}
            onClick={() => setSide(s)}
            disabled={Boolean(holding && holding.side !== s)}
            className={`btn h-14 flex-col gap-0 border text-[16px] ${
              side === s ? (s === "up" ? "btn-up border-up" : "btn-down border-down") : "border-line-2 bg-card text-ink hover:border-ink"
            }`}
            data-testid={`chain-side-${s}`}
          >
            {s === "up" ? "UP" : "DOWN"}
            <span className="num text-[11px] font-medium opacity-80">pays {fmtMult(multiplier(pool, s))}</span>
          </button>
        ))}
      </div>
      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor="chain-stake" className="label">
            Stake (ETH)
          </label>
          <span className="font-mono text-[11px] text-ink-3">Wallet {balance === null ? "—" : `${balance} ETH`}</span>
        </div>
        <input
          id="chain-stake"
          inputMode="decimal"
          value={stakeText}
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9.]/g, ""))}
          className="field num mt-1.5 text-[18px] font-semibold"
          data-testid="chain-stake-input"
        />
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {STAKE_PRESETS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setDraft(String(v))}
              className={`cursor-pointer rounded-md border py-1.5 font-mono text-[12px] ${stake === v ? "border-ink bg-ink text-chalk" : "border-line-2 bg-card hover:border-ink"}`}
            >
              {v}
            </button>
          ))}
        </div>
        <p className="mt-1.5 font-mono text-[11px] text-ink-3">
          {valid ? (ethUsd ? `≈ $${(stake * ethUsd).toFixed(2)} at the ETH price` : " ") : `Between ${MIN_STAKE} and ${MAX_STAKE} ETH per entry`}
        </p>
      </div>
      <div className="rounded-md bg-paper px-3 py-2.5">
        <div className="flex justify-between text-[13px]">
          <span className="text-ink-2">If {side.toUpperCase()} wins, you get</span>
          <span className="num font-semibold">{est === null ? "—" : `${fmtEth(est, 5)} ETH`}</span>
        </div>
        <p className="mt-1 text-[11.5px] leading-snug text-ink-3">
          Estimate from the on-chain pool now. It moves as others enter until the round locks. Empty other side = full refund.
        </p>
      </div>
      <PoolBar pool={pool} unit="ETH" />
      {!address ? (
        <button type="button" onClick={open} className="btn btn-ink h-12 w-full text-[15px]" data-testid="chain-connect">
          Connect wallet
        </button>
      ) : !onRobinhoodChain ? (
        <button type="button" onClick={switchNetwork} disabled={switching} className="btn btn-ink h-12 w-full text-[15px]">
          {switching ? "Switching…" : `Switch to ${CHAIN.name}`}
        </button>
      ) : (
        <button
          type="button"
          onClick={submit}
          disabled={busy || !valid || closed}
          className={`btn h-12 w-full text-[15px] ${side === "up" ? "btn-up" : "btn-down"}`}
          data-testid="chain-submit"
        >
          {busy ? label : holding ? `Add to ${side.toUpperCase()} · ETH` : `Place ${side.toUpperCase()} · ETH`}
        </button>
      )}
      {note ? (
        <p className={`text-[13px] ${note.ok ? "text-up" : "text-down"}`} data-testid="chain-note">
          {note.text}{" "}
          {note.hash ? (
            <a href={`${CHAIN.explorer}/tx/${note.hash}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline">
              tx <ExternalLink className="size-3" />
            </a>
          ) : null}
        </p>
      ) : null}
      {holding ? (
        <p className="text-[12.5px] text-ink-2">
          Your stake in this round:{" "}
          <span className="num font-semibold">
            {fmtEth(weiToEth(holding.stake))} ETH {holding.side.toUpperCase()}
          </span>{" "}
          ·{" "}
          <Link href="/positions" className="underline">
            Positions
          </Link>
        </p>
      ) : null}
      <p className="border-t border-line pt-3 text-[11.5px] leading-relaxed text-ink-3">
        Real ETH, held by the round contract until you claim. 3% fee on decided rounds only. The contract is unaudited: stake only what you can lose.{" "}
        <a href={`${CHAIN.explorer}/address/${ROUNDS_CONTRACT}?tab=contract`} target="_blank" rel="noreferrer" className="underline">
          Verified contract
        </a>
      </p>
    </div>
  );
}
