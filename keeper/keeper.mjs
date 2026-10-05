// Settles ended OlazRounds rounds so players only ever need to claim.
//
// settle() is permissionless and the contract proves every price itself, so
// this bot holds no power: it only pays gas. It reads the market list from
// the contract, scans recent rounds, and settles any that ended with stakes.
//
// Config (environment):
//   ROUNDS_CONTRACT   OlazRounds address (bot idles while empty)
//   KEEPER_RPC_URL    Robinhood Chain RPC (default: public endpoint)
//   KEEPER_KEY_FILE   file holding the keeper's private key (0x + 64 hex)
//   KEEPER_CHAIN_ID   default 4663
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, defineChain, http, parseAbi, formatEther, BaseError, ContractFunctionRevertedError } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const CONTRACT = (process.env.ROUNDS_CONTRACT || "").trim();
const RPC = process.env.KEEPER_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
const CHAIN_ID = Number(process.env.KEEPER_CHAIN_ID || 4663);
const KEY_FILE = process.env.KEEPER_KEY_FILE || "/run/keeper/keeper.key";
const TICK_MS = 15_000;
const FULL_SCAN_MS = 10 * 60_000;
const LOOKBACK_S = 26 * 3600; // pool history is kept for days; a day of rounds is plenty
const FEED_SETTLE_DELAY_S = 5;

const abi = parseAbi([
  "function marketCount() view returns (uint256)",
  "function marketConfig(uint256) view returns ((bytes32 label, uint8 kind, address source, bool tokenIsToken0, uint32 duration, uint32 maxAge, uint128 maxPot))",
  "function getRounds(uint256[] keys) view returns ((uint128 up, uint128 down, int128 lockValue, int128 closeValue, uint8 outcome)[])",
  "function settle(uint256 market, uint64 round, uint80 lockHint, uint80 closeHint)",
  "error PriceUnavailable()",
  "error AlreadySettled()",
  "error NotEnded()",
  "error BadHint()",
  "error NothingStaked()",
]);
const feedAbi = parseAbi([
  "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)",
  "function getRoundData(uint80) view returns (uint80, int256, uint256, uint256, uint80)",
]);

// The RPC URL can carry an API key; it never reaches the logs.
const redact = (v) => (typeof v === "string" ? v.split(RPC).join("<rpc>").replace(/https?:\/\/[^\s"']+/g, "<url>") : v);
const log = (level, msg, extra = {}) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), level, msg: redact(msg), ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, redact(v)])) }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!/^0x[0-9a-fA-F]{40}$/.test(CONTRACT)) {
  log("info", "ROUNDS_CONTRACT not set yet; idling");
  // Stay up so the service manager does not restart-loop; check again hourly.
  setInterval(() => log("info", "still idle: set ROUNDS_CONTRACT and restart"), 3600_000);
} else {
  const key = readFileSync(KEY_FILE, "utf8").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error(`Bad key in ${KEY_FILE}`);
  const account = privateKeyToAccount(key);
  const chain = defineChain({ id: CHAIN_ID, name: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
  const pub = createPublicClient({ chain, transport: http(RPC, { timeout: 15_000, retryCount: 2 }) });
  const wallet = createWalletClient({ account, chain, transport: http(RPC, { timeout: 15_000, retryCount: 2 }) });
  main(pub, wallet, account).catch((e) => {
    log("error", "fatal", { error: String(e?.message ?? e) });
    process.exit(1);
  });
}

async function feedRoundAt(pub, feed, t) {
  const [id, , , updatedAt] = await pub.readContract({ address: feed, abi: feedAbi, functionName: "latestRoundData" });
  if (Number(updatedAt) <= t) return id;
  const phase = id >> 64n;
  let lo = 1n;
  let hi = (id & 0xffffffffffffffffn) - 1n;
  let found = null;
  while (lo <= hi) {
    const mid = (lo + hi) / 2n;
    const rid = (phase << 64n) | mid;
    const row = await pub.readContract({ address: feed, abi: feedAbi, functionName: "getRoundData", args: [rid] }).catch(() => null);
    if (row && Number(row[3]) > 0 && Number(row[3]) <= t) {
      found = rid;
      lo = mid + 1n;
    } else hi = mid - 1n;
  }
  return found;
}

function reason(error) {
  if (error instanceof BaseError) {
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) return revert.data?.errorName ?? "revert";
  }
  return String(error?.shortMessage ?? error?.message ?? error).slice(0, 200);
}

async function main(pub, wallet, account) {
  const count = Number(await pub.readContract({ address: CONTRACT, abi, functionName: "marketCount" }));
  const markets = [];
  for (let i = 0; i < count; i++) markets.push(await pub.readContract({ address: CONTRACT, abi, functionName: "marketConfig", args: [BigInt(i)] }));
  const balance = await pub.getBalance({ address: account.address });
  log("info", "keeper started", { contract: CONTRACT, keeper: account.address, markets: count, balance: formatEther(balance) });

  const waiting = new Map(); // key -> last "not readable yet" log time
  let lastFull = 0;
  for (;;) {
    const now = Math.floor(Date.now() / 1000);
    const full = Date.now() - lastFull > FULL_SCAN_MS;
    if (full) lastFull = Date.now();
    for (let i = 0; i < markets.length; i++) {
      const m = markets[i];
      const d = m.duration;
      const current = Math.floor(now / d);
      const back = full ? Math.ceil(LOOKBACK_S / d) : 3;
      const rounds = [];
      for (let r = current - back; r <= current; r++) rounds.push(r);
      const keys = rounds.map((r) => (BigInt(i) << 64n) | BigInt(r));
      let rows;
      try {
        rows = await pub.readContract({ address: CONTRACT, abi, functionName: "getRounds", args: [keys] });
      } catch (e) {
        log("warn", "read failed", { market: i, error: reason(e) });
        continue;
      }
      for (let k = 0; k < rows.length; k++) {
        const row = rows[k];
        if (row.outcome !== 0 || (row.up === 0n && row.down === 0n)) continue;
        const r = rounds[k];
        const start = r * d;
        const end = start + d;
        const oneSided = row.up === 0n || row.down === 0n;
        if (oneSided ? now < start : now < end + FEED_SETTLE_DELAY_S) continue;
        await settle(pub, wallet, i, m, r, oneSided, waiting);
      }
    }
    await sleep(TICK_MS);
  }
}

async function settle(pub, wallet, index, m, round, oneSided, waiting) {
  const key = `${index}:${round}`;
  let lockHint = 0n;
  let closeHint = 0n;
  try {
    if (m.kind === 3 && !oneSided) {
      const start = round * m.duration;
      lockHint = await feedRoundAt(pub, m.source, start);
      closeHint = await feedRoundAt(pub, m.source, start + m.duration);
      if (lockHint === null || closeHint === null) throw new Error("feed round not found");
    }
    const { request } = await pub.simulateContract({
      address: CONTRACT,
      abi,
      functionName: "settle",
      args: [BigInt(index), BigInt(round), lockHint, closeHint],
      account: wallet.account,
    });
    const hash = await wallet.writeContract(request);
    const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 });
    log("info", "settled", { market: index, round, tx: hash, status: receipt.status, gas: receipt.gasUsed.toString() });
    waiting.delete(key);
  } catch (e) {
    const why = reason(e);
    // Pool history not readable yet is normal for a few seconds; log it at most every 10 minutes.
    if (why === "PriceUnavailable" && Date.now() - (waiting.get(key) ?? 0) < 600_000) return;
    waiting.set(key, Date.now());
    log(why === "AlreadySettled" ? "info" : "warn", "settle skipped", { market: index, round, reason: why });
  }
}
