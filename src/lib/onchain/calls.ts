import { readInt, readWord, word } from "@/lib/abi";
import { OUTCOME, type OnchainOutcome } from "@/config/onchain";

/*
 * Calldata and result decoding for OlazRounds, without a library. Shared by
 * the browser (transactions, wallet history) and the server (board pools,
 * settlement hints). Selectors are keccak256 of the signatures noted beside them.
 */

const SEL = {
  enter: "4e5dbd82", // enter(uint256,uint64,uint8)
  settle: "dfd4ca8c", // settle(uint256,uint64,uint80,uint80)
  claim: "6ba4c138", // claim(uint256[])
  withdrawFees: "476343ee", // withdrawFees()
  getRounds: "0476828a", // getRounds(uint256[])
  entries: "77b86754", // entries(address,uint256,uint256)
  entryCount: "41dd1ef8", // entryCount(address)
  feesAccrued: "94db0595", // feesAccrued()
} as const;

const addressWord = (a: string) => a.slice(2).toLowerCase().padStart(64, "0");
const uintArray = (values: bigint[]) => word(32) + word(values.length) + values.map((v) => word(v)).join("");

export const encodeEnter = (index: number, round: number, side: 1 | 2) => `0x${SEL.enter}${word(index)}${word(round)}${word(side)}`;
export const encodeSettle = (index: number, round: number, lockHint: bigint, closeHint: bigint) =>
  `0x${SEL.settle}${word(index)}${word(round)}${word(lockHint)}${word(closeHint)}`;
export const encodeClaim = (keys: bigint[]) => `0x${SEL.claim}${uintArray(keys)}`;
export const encodeWithdrawFees = () => `0x${SEL.withdrawFees}`;
export const encodeGetRounds = (keys: bigint[]) => `0x${SEL.getRounds}${uintArray(keys)}`;
export const encodeEntries = (user: string, offset: number, limit: number) => `0x${SEL.entries}${addressWord(user)}${word(offset)}${word(limit)}`;
export const encodeEntryCount = (user: string) => `0x${SEL.entryCount}${addressWord(user)}`;
export const encodeFeesAccrued = () => `0x${SEL.feesAccrued}`;

export type ChainRound = { up: bigint; down: bigint; lockValue: bigint; closeValue: bigint; outcome: OnchainOutcome };

/** Round[] from getRounds: offset, length, then 5 words per struct. */
export function decodeRounds(hex: string): ChainRound[] {
  const n = Number(readWord(hex, 1));
  return Array.from({ length: n }, (_, i) => {
    const b = 2 + i * 5;
    return {
      up: readWord(hex, b),
      down: readWord(hex, b + 1),
      lockValue: readInt(hex, b + 2),
      closeValue: readInt(hex, b + 3),
      outcome: OUTCOME[Number(readWord(hex, b + 4))] ?? "open",
    };
  });
}

export type ChainEntry = ChainRound & { key: bigint; side: "up" | "down"; claimed: boolean; stake: bigint; payout: bigint };

/** Entry[] from entries(): offset, length, then 10 words per struct. */
export function decodeEntries(hex: string): ChainEntry[] {
  const n = Number(readWord(hex, 1));
  return Array.from({ length: n }, (_, i) => {
    const b = 2 + i * 10;
    return {
      key: readWord(hex, b),
      side: readWord(hex, b + 1) === 2n ? "down" : "up",
      claimed: readWord(hex, b + 2) === 1n,
      stake: readWord(hex, b + 3),
      up: readWord(hex, b + 4),
      down: readWord(hex, b + 5),
      outcome: OUTCOME[Number(readWord(hex, b + 6))] ?? "open",
      lockValue: readInt(hex, b + 7),
      closeValue: readInt(hex, b + 8),
      payout: readWord(hex, b + 9),
    };
  });
}

/** Wei to a JS number of ETH (display only). */
export const weiToEth = (wei: bigint) => Number(wei) / 1e18;
/** Wei to the micro-ETH unit the pool widgets use. */
export const weiToMicro = (wei: bigint) => Number(wei / 1_000_000_000_000n);

export function ethToWei(eth: string): bigint | null {
  if (!/^\d*(\.\d{0,18})?$/.test(eth) || eth === "" || eth === ".") return null;
  const [whole, frac = ""] = eth.split(".");
  return BigInt(whole || "0") * 10n ** 18n + BigInt(frac.padEnd(18, "0"));
}
