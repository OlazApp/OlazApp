// Shared setup for the examples: chain, contract, ABI and a few helpers.
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, defineChain, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const CONFIG = JSON.parse(readFileSync(new URL("./markets.json", import.meta.url), "utf8"));
export const CONTRACT = CONFIG.contract;
const RPC = process.env.OLAZ_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";

export const chain = defineChain({
  id: CONFIG.chainId,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
});

export const publicClient = createPublicClient({ chain, transport: http(RPC) });

/** A wallet from PRIVATE_KEY in your shell. Never commit a key. */
export function walletFromEnv() {
  const key = process.env.PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("Set PRIVATE_KEY (0x + 64 hex) in your shell, or use --dry-run --from <address>.");
  const account = privateKeyToAccount(key);
  return createWalletClient({ account, chain, transport: http(RPC) });
}

export const abi = parseAbi([
  "function enter(uint256 market, uint64 round, uint8 side) payable",
  "function settle(uint256 market, uint64 round, uint80 lockHint, uint80 closeHint)",
  "function claim(uint256[] keys)",
  "function keyOf(uint256 market, uint64 round) pure returns (uint256)",
  "function getRound(uint256 market, uint64 round) view returns ((uint128 up, uint128 down, int128 lockValue, int128 closeValue, uint8 outcome))",
  "function entryCount(address user) view returns (uint256)",
  "function entries(address user, uint256 offset, uint256 limit) view returns ((uint256 key, uint8 side, bool claimed, uint128 stake, uint128 up, uint128 down, uint8 outcome, int128 lockValue, int128 closeValue, uint256 payout)[])",
  "error NotOpen()",
  "error BadStake()",
  "error BadSide()",
  "error PotFull()",
  "error NotClaimable()",
]);

export const OUTCOME = ["open", "up", "down", "refund"];
export const SIDE = { up: 1, down: 2 };

export function market(id) {
  const m = CONFIG.markets.find((x) => x.id === id || String(x.index) === String(id));
  if (!m) throw new Error(`Unknown market "${id}". One of: ${CONFIG.markets.map((x) => x.id).join(", ")}`);
  return m;
}

/** Round numbers from the clock: round r runs from r * d to (r + 1) * d. */
export const now = () => Math.floor(Date.now() / 1000);
export const openRound = (m) => Math.floor(now() / m.durationSeconds) + 1;

/** Stored lock/close values as USD: pool markets keep summed 60-second ticks, feeds keep 8-decimal answers. */
export function toUsd(m, value) {
  const v = Number(value);
  if (v === 0) return null;
  if (m.kind === "chainlink-feed") return v / 1e8;
  return Math.pow(1.0001, v / 60) * 1e12;
}

export const eth = (wei) => (Number(wei) / 1e18).toFixed(6);
export const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
export const flag = (name) => process.argv.includes(`--${name}`);
