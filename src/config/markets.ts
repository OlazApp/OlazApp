// Every market on the board, and where its price comes from.
//
// A market is one asset at one round length ("eth-5m", "nvda-1h"). Rounds are
// cut from the clock (UTC boundaries), so every visitor and the server agree on
// which round is live without asking anyone. Only assets with a price source
// that can be read honestly, both now and at a past round boundary, are listed.

export type Frame = "5m" | "15m" | "1h";
export const FRAMES: Frame[] = ["5m", "15m", "1h"];
export const FRAME_MS: Record<Frame, number> = { "5m": 5 * 60_000, "15m": 15 * 60_000, "1h": 60 * 60_000 };
export const FRAME_LABEL: Record<Frame, string> = { "5m": "5 minutes", "15m": "15 minutes", "1h": "1 hour" };

export type Category = "crypto" | "chain" | "stocks" | "metrics";
export const CATEGORIES: { id: Category; label: string; blurb: string }[] = [
  { id: "crypto", label: "Crypto", blurb: "Majors, priced from OKX spot candles." },
  { id: "chain", label: "Chain tokens", blurb: "Robinhood Chain tokens, priced from their Uniswap v3 pool oracle." },
  { id: "stocks", label: "Stocks", blurb: "Stock tokens, priced from Chainlink feeds on Robinhood Chain." },
  { id: "metrics", label: "Chain metrics", blurb: "Robinhood Chain activity, read from the chain RPC." },
];

export type Source =
  /** OKX spot pair. Lock = open of the 1-minute candle at the boundary. */
  | { kind: "okx"; inst: string }
  /**
   * Uniswap v3 pool paired with WETH. Price = 30-second time-weighted average
   * tick from the pool's own oracle (observe), converted to USD with the OKX
   * ETH/USDT minute candle of the same moment.
   */
  | { kind: "pool"; pool: `0x${string}`; token: `0x${string}`; tokenIsToken0: boolean; decimals: number }
  /** Chainlink aggregator proxy on Robinhood Chain (8 decimals). */
  | { kind: "chainlink"; feed: `0x${string}`; hours: "24/5" | "24/7" }
  /** Blocks produced on Robinhood Chain in the round versus the round before. */
  | { kind: "blocks" };

export type Asset = {
  id: string;
  symbol: string;
  name: string;
  category: Category;
  frames: Frame[];
  source: Source;
  logo: string | null;
  /** How the question reads: "price" assets go up or down, metrics compare windows. */
  unit: "usd" | "blocks";
  /** Token contract on Robinhood Chain, when there is one. */
  address?: `0x${string}`;
  sourceLabel: string;
};

const cg = (path: string) => `https://assets.coingecko.com/coins/images/${path}`;
const dex = (id: string) => `https://cdn.dexscreener.com/cms/images/${id}?width=128&height=128&quality=90&format=auto`;
const stock = (s: string) => `https://financialmodelingprep.com/image-stock/${s}.png`;

export const ASSETS: Asset[] = [
  {
    id: "eth",
    symbol: "ETH",
    name: "Ether",
    category: "crypto",
    frames: FRAMES,
    source: { kind: "okx", inst: "ETH-USDT" },
    logo: cg("279/small/ethereum.png"),
    unit: "usd",
    sourceLabel: "OKX ETH-USDT",
  },
  {
    id: "btc",
    symbol: "BTC",
    name: "Bitcoin",
    category: "crypto",
    frames: FRAMES,
    source: { kind: "okx", inst: "BTC-USDT" },
    logo: cg("1/small/bitcoin.png"),
    unit: "usd",
    sourceLabel: "OKX BTC-USDT",
  },
  {
    id: "sol",
    symbol: "SOL",
    name: "Solana",
    category: "crypto",
    frames: FRAMES,
    source: { kind: "okx", inst: "SOL-USDT" },
    logo: cg("4128/small/solana.png"),
    unit: "usd",
    sourceLabel: "OKX SOL-USDT",
  },
  {
    id: "cashcat",
    symbol: "CASHCAT",
    name: "Cash Cat",
    category: "chain",
    frames: FRAMES,
    address: "0x020bfc650a365f8bb26819deaabf3e21291018b4",
    source: {
      kind: "pool",
      pool: "0xA70fc67C9F69da90B63a0e4C05D229954574E313",
      token: "0x020bfc650a365f8bb26819deaabf3e21291018b4",
      tokenIsToken0: true,
      decimals: 18,
    },
    logo: dex("Lq7a3pS9Wn8EuGp0"),
    unit: "usd",
    sourceLabel: "Uniswap v3 CASHCAT/WETH oracle",
  },
  {
    id: "pons",
    symbol: "PONS",
    name: "Pons",
    category: "chain",
    frames: FRAMES,
    address: "0x39dbed3a2bd333467115de45665cc57f813c4571",
    source: {
      kind: "pool",
      pool: "0x10CC6BD38112cAc182db90B6a71d8Bb5939526bA",
      token: "0x39dbed3a2bd333467115de45665cc57f813c4571",
      tokenIsToken0: false,
      decimals: 18,
    },
    logo: dex("dkmXs8KYMyMXjuU1"),
    unit: "usd",
    sourceLabel: "Uniswap v3 PONS/WETH oracle",
  },
  {
    id: "ai",
    symbol: "AI",
    name: "Artificial Inu",
    category: "chain",
    frames: FRAMES,
    address: "0x2e8c31162b855a2ffa90f6f8634643ad6f111e18",
    source: {
      kind: "pool",
      pool: "0xc4a21f9d6485FC5893DD4A491B320a83DAF4Da1D",
      token: "0x2e8c31162b855a2ffa90f6f8634643ad6f111e18",
      tokenIsToken0: false,
      decimals: 18,
    },
    logo: dex("U6RIzs8Fm7Jar6GE"),
    unit: "usd",
    sourceLabel: "Uniswap v3 AI/WETH oracle",
  },
  {
    id: "index",
    symbol: "INDEX",
    name: "The Index",
    category: "chain",
    frames: FRAMES,
    address: "0x56910d4409f3a0c78c64dd8d0545ff0705389870",
    source: {
      kind: "pool",
      pool: "0xD29893fFac8b29eC4Db2cfE0CDB3FE1377c028Ff",
      token: "0x56910d4409f3a0c78c64dd8d0545ff0705389870",
      tokenIsToken0: false,
      decimals: 18,
    },
    logo: dex("LTfdhAlnWijozhDa"),
    unit: "usd",
    sourceLabel: "Uniswap v3 INDEX/WETH oracle",
  },
  {
    id: "nvda",
    symbol: "NVDA",
    name: "NVIDIA",
    category: "stocks",
    frames: ["1h"],
    source: { kind: "chainlink", feed: "0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15", hours: "24/5" },
    logo: stock("NVDA"),
    unit: "usd",
    sourceLabel: "Chainlink NVDA/USD",
  },
  {
    id: "tsla",
    symbol: "TSLA",
    name: "Tesla",
    category: "stocks",
    frames: ["1h"],
    source: { kind: "chainlink", feed: "0x4A1166a659A55625345e9515b32adECea5547C38", hours: "24/5" },
    logo: stock("TSLA"),
    unit: "usd",
    sourceLabel: "Chainlink TSLA/USD",
  },
  {
    id: "aapl",
    symbol: "AAPL",
    name: "Apple",
    category: "stocks",
    frames: ["1h"],
    source: { kind: "chainlink", feed: "0x6B22A786bAa607d76728168703a39Ea9C99f2cD0", hours: "24/5" },
    logo: stock("AAPL"),
    unit: "usd",
    sourceLabel: "Chainlink AAPL/USD",
  },
  {
    id: "googl",
    symbol: "GOOGL",
    name: "Alphabet",
    category: "stocks",
    frames: ["1h"],
    source: { kind: "chainlink", feed: "0xF6f373a037c30F0e5010d854385cA89185AE638b", hours: "24/5" },
    logo: stock("GOOGL"),
    unit: "usd",
    sourceLabel: "Chainlink GOOGL/USD",
  },
  {
    id: "blocks",
    symbol: "BLOCKS",
    name: "Chain pace",
    category: "metrics",
    frames: ["15m", "1h"],
    source: { kind: "blocks" },
    logo: null,
    unit: "blocks",
    sourceLabel: "Robinhood Chain RPC block headers",
  },
];

export const findAsset = (id: string) => ASSETS.find((a) => a.id === id) ?? null;

export type MarketRef = { id: string; asset: Asset; frame: Frame };

export const MARKETS: MarketRef[] = ASSETS.flatMap((asset) =>
  asset.frames.map((frame) => ({ id: `${asset.id}-${frame}`, asset, frame })),
);

export function findMarket(id: string): MarketRef | null {
  return MARKETS.find((m) => m.id === id) ?? null;
}

export function question(asset: Asset, frame: Frame) {
  if (asset.unit === "blocks") {
    return `Will Robinhood Chain make more blocks in the next ${FRAME_LABEL[frame]} than the last?`;
  }
  const sym = asset.category === "stocks" ? asset.symbol : `$${asset.symbol}`;
  return `${sym} higher in ${FRAME_LABEL[frame]}?`;
}

/** Weekly range markets: where an asset closes on Sunday 23:59 UTC. */
export type WeekMarket = { id: string; assetId: string; title: string };
export const WEEK_MARKETS: WeekMarket[] = [
  { id: "eth", assetId: "eth", title: "Where does ETH close this week?" },
  { id: "btc", assetId: "btc", title: "Where does BTC close this week?" },
  { id: "sol", assetId: "sol", title: "Where does SOL close this week?" },
];
export const findWeek = (id: string) => WEEK_MARKETS.find((w) => w.id === id) ?? null;
