// Real-ETH rounds: the OlazRounds contract and the markets it was deployed with.
//
// Deployed 5 Oct 2026 and verified on Blockscout. While no address is set
// the site runs in practice mode only. NEXT_PUBLIC_ROUNDS_CONTRACT is only a
// fallback for local test builds against a devnet.
// Keep this file free of "@/" imports: scripts/onchain-args.ts runs it with
// plain Node to produce the constructor arguments for the fork test.

const DEPLOYED = "0xee42017b063ccFBEAE06A319a629D2A023dAFd10";
const DEPLOYED_BLOCK = 80279800;

export const ROUNDS_CONTRACT: string = DEPLOYED || process.env.NEXT_PUBLIC_ROUNDS_CONTRACT || "";
/** Block the contract was deployed in (for explorers and log scans). */
export const ROUNDS_DEPLOY_BLOCK = DEPLOYED_BLOCK;

export const roundsLive = () => /^0x[0-9a-fA-F]{40}$/.test(ROUNDS_CONTRACT);

/** Canonical WETH on Robinhood Chain and its deepest Uniswap v3 pool against USDG (0.01% tier). */
export const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
export const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
export const ETH_USD_POOL = "0x52e65B17fB6E5BA00Ed806f37Afcd2DaA50271Ca";
/** WETH is token0 of that pool; USDG has 6 decimals. */
export const ETH_USD_POOL_WETH_IS_TOKEN0 = true;
export const USDG_DECIMALS = 6;

export const TWAP_SECONDS = 60;
export const POOL_GRACE_S = 24 * 60 * 60;
export const VOID_AFTER_S = 7 * 24 * 60 * 60;

/** Contract enums, in Solidity order. */
export const KIND = { EthPool: 1, TokenPool: 2, Feed: 3 } as const;
export const SIDE = { up: 1, down: 2 } as const;
export const OUTCOME = ["open", "up", "down", "refund"] as const;
export type OnchainOutcome = (typeof OUTCOME)[number];

export type OnchainMarket = {
  /** Same id as the practice market in config/markets.ts. */
  id: string;
  kind: (typeof KIND)[keyof typeof KIND];
  /** Token pool or Chainlink feed. Empty for the ETH market itself. */
  source: string;
  tokenIsToken0: boolean;
  durationS: number;
  /** Feed markets: a price older than this at a boundary refunds the round. */
  maxAgeS: number;
  /** Cap on the total staked in one round, in ETH. Lower for thinner pools. */
  maxPotEth: number;
};

const FRAMES = [
  ["5m", 300],
  ["15m", 900],
  ["1h", 3600],
] as const;

const pool = (asset: string, source: string, tokenIsToken0: boolean, maxPotEth: number): OnchainMarket[] =>
  FRAMES.map(([f, s]) => ({ id: `${asset}-${f}`, kind: KIND.TokenPool, source, tokenIsToken0, durationS: s, maxAgeS: 0, maxPotEth }));

const feed = (asset: string, source: string): OnchainMarket => ({
  id: `${asset}-1h`,
  kind: KIND.Feed,
  source,
  tokenIsToken0: false,
  durationS: 3600,
  maxAgeS: 4 * 60 * 60,
  maxPotEth: 5,
});

/**
 * Index in this list = market number in the contract. Never reorder after a
 * deployment; a new list needs a new contract. BTC and SOL have no on-chain
 * price that moves inside five minutes on this chain, and chain pace has no
 * on-chain source, so those markets stay practice-only.
 */
export const ONCHAIN_MARKETS: OnchainMarket[] = [
  ...FRAMES.map(([f, s]): OnchainMarket => ({
    id: `eth-${f}`,
    kind: KIND.EthPool,
    source: "",
    tokenIsToken0: false,
    durationS: s,
    maxAgeS: 0,
    maxPotEth: 25,
  })),
  ...pool("cashcat", "0xA70fc67C9F69da90B63a0e4C05D229954574E313", true, 5),
  ...pool("pons", "0x10CC6BD38112cAc182db90B6a71d8Bb5939526bA", false, 5),
  ...pool("ai", "0xc4a21f9d6485FC5893DD4A491B320a83DAF4Da1D", false, 2),
  ...pool("index", "0xD29893fFac8b29eC4Db2cfE0CDB3FE1377c028Ff", false, 1),
  feed("nvda", "0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15"),
  feed("tsla", "0x4A1166a659A55625345e9515b32adECea5547C38"),
  feed("aapl", "0x6B22A786bAa607d76728168703a39Ea9C99f2cD0"),
  feed("googl", "0xF6f373a037c30F0e5010d854385cA89185AE638b"),
];

export const onchainIndex = (marketId: string) => ONCHAIN_MARKETS.findIndex((m) => m.id === marketId);
export const isOnchainMarket = (marketId: string) => onchainIndex(marketId) >= 0;

/** Round number of the round that starts at `startMs`. */
export const roundNumber = (m: OnchainMarket, startMs: number) => Math.floor(startMs / 1000 / m.durationS);
/** Storage key the contract uses for (market, round). */
export const roundKey = (index: number, round: number) => (BigInt(index) << 64n) | BigInt(round);
export const splitKey = (key: bigint) => ({ index: Number(key >> 64n), round: Number(key & 0xffffffffffffffffn) });

/**
 * Turns a stored lock/close value into a USD price for display. Pool markets
 * store summed 60-second tick cumulatives (log price); feeds store 8-decimal answers.
 */
export function valueToUsd(m: OnchainMarket, value: bigint): number | null {
  if (m.kind === KIND.Feed) return value > 0n ? Number(value) / 1e8 : null;
  if (value === 0n) return null;
  // value / 60 = average tick of (ETH in USD) + (token in ETH), raw units.
  const tick = Number(value) / TWAP_SECONDS;
  const raw = Math.pow(1.0001, tick);
  // ETH/USDG raw price is USDG units per wei: shift by 18 - 6. Tokens use 18 decimals like WETH.
  return raw * Math.pow(10, 18 - USDG_DECIMALS);
}

const w = (n: bigint | number | boolean) =>
  BigInt(typeof n === "boolean" ? (n ? 1 : 0) : n)
    .toString(16)
    .padStart(64, "0");
const addr = (a: string) => (a ? a.slice(2).toLowerCase() : "").padStart(64, "0");
const label = (s: string) =>
  Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .padEnd(64, "0");
const toWei = (eth: number) => BigInt(Math.round(eth * 1e6)) * 10n ** 12n;

/**
 * ABI-encoded constructor arguments (no 0x) for
 * constructor(address treasury, address weth, address ethUsdPool, MarketConfig[] markets).
 */
export function constructorArgs(treasury: string, markets: OnchainMarket[] = ONCHAIN_MARKETS) {
  let out = addr(treasury) + addr(WETH) + addr(ETH_USD_POOL) + w(4 * 32) + w(markets.length);
  for (const m of markets) {
    out += label(m.id) + w(m.kind) + addr(m.source) + w(m.tokenIsToken0) + w(m.durationS) + w(m.maxAgeS) + w(toWei(m.maxPotEth));
  }
  return out;
}
