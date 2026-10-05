import { PONS } from "@/config/brand";
import { address, bytes, bytesArray, dynamic, encode, fixed, readAddress, readInt, readWord, word } from "@/lib/abi";
import { rpc } from "@/lib/rpc";

/*
 * Trading a Pons V2 launch from the browser.
 *
 * Before graduation the token trades on its own bonding curve:
 *   buy(quoteIn, minTokensOut, recipient)  payable, msg.value must equal quoteIn
 *   sell(tokensIn, minQuoteOut, recipient) after token.approve(curve, amount)
 * After graduation it trades in a Uniswap v4 pool with the Pons meme hook,
 * through the Universal Router (V4_SWAP), selling via Permit2.
 */

const ETH = "0x0000000000000000000000000000000000000000";
const BPS = 10_000n;

const SEL = {
  getLaunchedToken: "0x3cf28b5a",
  buy: "0x59a87bc1",
  sell: "0xd04c6983",
  getReserves: "0x0902f1ac",
  feeBps: "0x24a9d853",
  creatorTaxBps: "0xc1bb8901",
  graduated: "0xe7c2b772",
  readyToGraduate: "0xc68360a5",
  realQuoteReserve: "0x4f1f58fd",
  graduationThreshold: "0x8b0bc501",
  balanceOf: "0x70a08231",
  allowance: "0xdd62ed3e",
  approve: "0x095ea7b3",
  permit2Allowance: "0x927da105",
  permit2Approve: "0x87517c45",
  quoteExactInputSingle: "0xaa9d21cb",
  execute: "0x3593564c",
} as const;

const call = (to: string, data: string, value?: bigint) =>
  rpc<string>("eth_call", [{ to, data, ...(value ? { value: `0x${value.toString(16)}` } : {}) }, "latest"]);

export type Venue = "curve" | "pool" | "graduating" | "unavailable";

export type Market = {
  token: string;
  curve: string;
  venue: Venue;
  /** Why trading here is not possible, when venue is "unavailable". */
  reason?: string;
  /** 0–1, how far the curve is towards graduation. */
  progress: number | null;
  feeBps: bigint;
  creatorTaxBps: bigint;
  quoteReserve: bigint;
  tokenReserve: bigint;
  poolKey: { fee: bigint; tickSpacing: bigint } | null;
};

/** Reads the launch record and decides where the token trades right now. */
export async function loadMarket(token: string): Promise<Market> {
  const record = await call(PONS.factory, SEL.getLaunchedToken + address(token));
  // Static tuple: curve is word 1, pairToken 4, poolFee 6, tickSpacing 7, phase 10, exists 14.
  const exists = readWord(record, 14) === 1n;
  const curve = readAddress(record, 1);
  const base: Market = {
    token,
    curve,
    venue: "unavailable",
    progress: null,
    feeBps: 0n,
    creatorTaxBps: 0n,
    quoteReserve: 0n,
    tokenReserve: 0n,
    poolKey: null,
  };
  if (!exists) return { ...base, reason: "This token was not launched through Pons V2." };
  if (readAddress(record, 4) !== ETH) {
    return { ...base, reason: "This launch is priced in another asset, so trade it on Pons directly." };
  }
  const phase = Number(readWord(record, 10));
  const poolKey = { fee: readWord(record, 6), tickSpacing: readInt(record, 7) };

  const [fee, tax, graduated, ready, reserves, real, threshold] = await Promise.all([
    call(curve, SEL.feeBps),
    call(curve, SEL.creatorTaxBps),
    call(curve, SEL.graduated),
    call(curve, SEL.readyToGraduate),
    call(curve, SEL.getReserves),
    call(curve, SEL.realQuoteReserve),
    call(curve, SEL.graduationThreshold),
  ]);
  const market: Market = {
    ...base,
    feeBps: readWord(fee, 0),
    creatorTaxBps: readWord(tax, 0),
    quoteReserve: readWord(reserves, 0),
    tokenReserve: readWord(reserves, 1),
    poolKey,
  };
  if (phase === 2) return { ...market, venue: "pool", progress: 1 };
  if (phase === 3) return { ...market, reason: "This launch was rescued and has no pool." };
  if (phase === 1 || readWord(graduated, 0) === 1n || readWord(ready, 0) === 1n) {
    return { ...market, venue: "graduating", progress: 1 };
  }
  const goal = readWord(threshold, 0);
  const progress = goal > 0n ? Math.min(1, Number((readWord(real, 0) * 10_000n) / goal) / 10_000) : null;
  return { ...market, venue: "curve", progress };
}

/* ------------------------------------------------------------------ */
/* Quotes                                                              */
/* ------------------------------------------------------------------ */

function poolKeyWords(m: Market) {
  // ETH sorts below every token address, so it is always currency0.
  return (
    address(ETH) + address(m.token) + word(m.poolKey!.fee) + word(m.poolKey!.tickSpacing) + address(PONS.memeHook)
  );
}

/**
 * Amount out for `amountIn` (wei of ETH when buying, token base units when
 * selling). Fees, creator tax and any launch snipe tax are already deducted.
 */
export async function quote(m: Market, buying: boolean, amountIn: bigint, recipient: string): Promise<bigint> {
  if (amountIn <= 0n) return 0n;
  if (m.venue === "curve") {
    if (buying) {
      // The curve has no quote view; running buy() itself is exact, snipe tax included.
      const out = await call(m.curve, SEL.buy + word(amountIn) + word(0) + address(recipient), amountIn);
      return readWord(out, 0);
    }
    const gross = (amountIn * m.quoteReserve) / (m.tokenReserve + amountIn);
    return gross - (gross * m.feeBps) / BPS - (gross * m.creatorTaxBps) / BPS;
  }
  if (m.venue === "pool") {
    const params = encode([fixed(poolKeyWords(m)), fixed(word(buying)), fixed(word(amountIn)), dynamic(bytes(""))]);
    const out = await call(PONS.v4Quoter, SEL.quoteExactInputSingle + encode([dynamic(params)]));
    return readWord(out, 0);
  }
  throw new Error("Trading is paused for this token.");
}

export function withSlippage(amount: bigint, slippageBps: number) {
  return (amount * (BPS - BigInt(slippageBps))) / BPS;
}

/* ------------------------------------------------------------------ */
/* Transactions                                                        */
/* ------------------------------------------------------------------ */

export type Tx = { to: string; data: string; value?: bigint; label: string };

export async function tokenBalance(token: string, owner: string) {
  return readWord(await call(token, SEL.balanceOf + address(owner)), 0);
}

/**
 * The transactions a trade needs, in order: approvals that are still missing,
 * then the swap itself. Approvals cover exactly this trade, never unlimited.
 */
export async function plan(
  m: Market,
  buying: boolean,
  amountIn: bigint,
  minOut: bigint,
  owner: string,
): Promise<Tx[]> {
  const txs: Tx[] = [];
  if (m.venue === "curve") {
    if (buying) {
      txs.push({ to: m.curve, data: SEL.buy + word(amountIn) + word(minOut) + address(owner), value: amountIn, label: "Buy" });
      return txs;
    }
    const allowed = readWord(await call(m.token, SEL.allowance + address(owner) + address(m.curve)), 0);
    if (allowed < amountIn) {
      txs.push({ to: m.token, data: SEL.approve + address(m.curve) + word(amountIn), label: "Approve" });
    }
    txs.push({ to: m.curve, data: SEL.sell + word(amountIn) + word(minOut) + address(owner), label: "Sell" });
    return txs;
  }
  if (m.venue !== "pool") throw new Error("Trading is paused for this token.");

  if (!buying) {
    // Universal Router pulls tokens through Permit2: token → Permit2, then Permit2 → router.
    const erc20 = readWord(await call(m.token, SEL.allowance + address(owner) + address(PONS.permit2)), 0);
    if (erc20 < amountIn) {
      txs.push({ to: m.token, data: SEL.approve + address(PONS.permit2) + word(amountIn), label: "Approve" });
    }
    const p2 = await call(
      PONS.permit2,
      SEL.permit2Allowance + address(owner) + address(m.token) + address(PONS.universalRouter),
    );
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (readWord(p2, 0) < amountIn || readWord(p2, 1) <= now + 60n) {
      txs.push({
        to: PONS.permit2,
        data:
          SEL.permit2Approve + address(m.token) + address(PONS.universalRouter) + word(amountIn) + word(now + 3600n),
        label: "Permit",
      });
    }
  }

  const tokenIn = buying ? ETH : m.token;
  const tokenOut = buying ? m.token : ETH;
  const swapParams = encode([
    fixed(poolKeyWords(m)),
    fixed(word(buying)),
    fixed(word(amountIn)),
    fixed(word(minOut)),
    fixed(word(0)), // minHopPriceX36: this router build has the extra field; 0 turns it off.
    dynamic(bytes("")),
  ]);
  // SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL
  const input = encode([
    dynamic(bytes("060c0f")),
    dynamic(
      bytesArray([
        encode([dynamic(swapParams)]),
        address(tokenIn) + word(amountIn),
        address(tokenOut) + word(minOut),
      ]),
    ),
  ]);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
  txs.push({
    to: PONS.universalRouter,
    data: SEL.execute + encode([dynamic(bytes("10")), dynamic(bytesArray([input])), fixed(word(deadline))]),
    value: buying ? amountIn : undefined,
    label: buying ? "Buy" : "Sell",
  });
  return txs;
}

/** Polls the chain until the transaction is mined; throws if it reverted. */
export async function waitForReceipt(hash: string, timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const receipt = await rpc<{ status: string } | null>("eth_getTransactionReceipt", [hash]).catch(() => null);
    if (receipt) {
      if (receipt.status !== "0x1") throw new Error("The transaction reverted on chain.");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error("Still waiting for the block. Check the explorer for the result.");
}

/* ------------------------------------------------------------------ */
/* Amount helpers                                                      */
/* ------------------------------------------------------------------ */

/** "1.5" → 1500000000000000000n for 18 decimals; null when not a number. */
export function parseUnits(text: string, decimals = 18): bigint | null {
  if (!/^\d*\.?\d*$/.test(text) || text === "" || text === ".") return null;
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fraction.slice(0, decimals).padEnd(decimals, "0") || "0");
}

export function formatUnits(value: bigint, decimals = 18, digits = 6): string {
  // Tiny amounts keep four significant digits instead of rounding to "0".
  if (value > 0n && value < 10n ** BigInt(decimals - Math.min(digits, decimals))) {
    const text = value.toString().padStart(decimals, "0");
    const lead = text.search(/[1-9]/);
    return `0.${text.slice(0, Math.min(decimals, lead + 4)).replace(/0+$/, "")}`;
  }
  const whole = value / 10n ** BigInt(decimals);
  const fraction = (value % 10n ** BigInt(decimals)).toString().padStart(decimals, "0").slice(0, digits).replace(/0+$/, "");
  const grouped = whole.toLocaleString("en-US");
  return fraction ? `${grouped}.${fraction}` : grouped;
}
