"use client";

import { CHAIN } from "@/config/brand";
import { ROUNDS_CONTRACT } from "@/config/onchain";
import { rpc } from "@/lib/rpc";
import { decodeEntries, decodeRounds, encodeEntries, encodeEntryCount, encodeGetRounds, type ChainEntry, type ChainRound } from "@/lib/onchain/calls";
import { readWord } from "@/lib/abi";

/*
 * Browser side of the real-ETH rounds: reads through the public RPC, and a
 * dry run of every transaction before the wallet is asked to sign, so a
 * closed round or a full pot is explained here instead of failing on chain.
 */

const REASONS: Record<string, string> = {
  "0xd8ac9325": "This market is not in the contract.",
  "0xddafad98": "This round is not taking positions any more. Entries go to the next round.",
  "0x1bf15b6f": "Stake must be between 0.0005 and 0.25 ETH per entry.",
  "0x8f3723ea": "You already hold the other side in this round.",
  "0xdd2194fd": "This round's pot is full. Try a smaller stake or the next round.",
  "0xd3018d18": "The round has not ended yet.",
  "0x560ff900": "Already settled.",
  "0x9fe7bfd9": "Nobody staked in this round.",
  "0xcb08be81": "The pool price for this round is not readable yet. Try again shortly.",
  "0x3fb35286": "The Chainlink round hint did not match. Refresh and try again.",
  "0x6247a84e": "Nothing to claim here (not settled yet, or already claimed).",
  "0x90b8ec18": "The payout transfer failed.",
};

async function rawCall(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  if (!res.ok) throw new Error(`RPC ${res.status}`);
  return (await res.json()) as { result?: string; error?: { message?: string; data?: unknown } };
}

function revertData(error: { message?: string; data?: unknown } | undefined) {
  const d = error?.data;
  if (typeof d === "string" && d.startsWith("0x")) return d;
  if (d && typeof d === "object" && typeof (d as { data?: unknown }).data === "string") return (d as { data: string }).data;
  return null;
}

/** eth_call as `from` with `value`; throws a readable reason when it would revert. */
export async function simulate(tx: { from: string; to?: string; data: string; value?: bigint }) {
  const params = [{ from: tx.from, ...(tx.to ? { to: tx.to } : {}), data: tx.data, ...(tx.value ? { value: `0x${tx.value.toString(16)}` } : {}) }, "latest"];
  let lastError: unknown;
  for (const url of [CHAIN.rpc, CHAIN.fallbackRpc]) {
    try {
      const body = await rawCall(url, { jsonrpc: "2.0", id: 1, method: "eth_call", params });
      if (!body.error) return body.result ?? "0x";
      const data = revertData(body.error);
      const reason = data ? REASONS[data.slice(0, 10).toLowerCase()] : null;
      if (reason) throw new Error(reason);
      if (/insufficient funds/i.test(body.error.message ?? "")) throw new Error("Not enough ETH for this stake plus gas.");
      throw new Error(body.error.message ?? "The transaction would fail.");
    } catch (error) {
      if (error instanceof Error && !/^RPC \d+|fetch/i.test(error.message)) throw error;
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Could not reach the chain.");
}

export type Receipt = { status: string; contractAddress: string | null; blockNumber: string; transactionHash: string };

export async function waitReceipt(hash: string, timeoutMs = 180_000): Promise<Receipt> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const receipt = await rpc<Receipt | null>("eth_getTransactionReceipt", [hash]).catch(() => null);
    if (receipt) {
      if (receipt.status !== "0x1") throw new Error("The transaction reverted on chain.");
      return receipt;
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
  throw new Error("Still waiting for the block. Check the explorer for the result.");
}

export async function readRounds(keys: bigint[]): Promise<ChainRound[]> {
  if (!keys.length) return [];
  return decodeRounds(await rpc<string>("eth_call", [{ to: ROUNDS_CONTRACT, data: encodeGetRounds(keys) }, "latest"]));
}

/** A wallet's rounds, newest first (up to `max`). */
export async function readEntries(user: string, max = 200): Promise<ChainEntry[]> {
  const count = Number(readWord(await rpc<string>("eth_call", [{ to: ROUNDS_CONTRACT, data: encodeEntryCount(user) }, "latest"]), 0));
  const out: ChainEntry[] = [];
  for (let offset = 0; offset < Math.min(count, max); offset += 50) {
    out.push(...decodeEntries(await rpc<string>("eth_call", [{ to: ROUNDS_CONTRACT, data: encodeEntries(user, offset, 50) }, "latest"])));
  }
  return out;
}
