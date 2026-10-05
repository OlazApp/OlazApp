import "server-only";
import { findMarket, findWeek, FRAME_MS } from "@/config/markets";
import type { Session } from "@/lib/chat/auth";
import type { Store } from "@/lib/chat/store";
import { assetStatus, roundResult } from "@/lib/prices";
import {
  FEE_BPS,
  MAX_STAKE,
  MIN_STAKE,
  START_BALANCE,
  TOP_UP,
  TOP_UP_BELOW,
  TOP_UP_EVERY_MS,
  WEEK_MS,
  payout,
  rounds,
  toMicro,
  weekStart,
  type Outcome,
  type Pool,
  type Side,
} from "@/lib/rounds";
import { weekBuckets, weekResult, WEEK_ENTRY_CUTOFF_MS } from "@/lib/weeks";

/*
 * Practice ledger. There is no deployed contract yet, so every connected
 * wallet that signs in gets a practice ETH balance kept by this server (in
 * Redis when configured, a local file otherwise). Positions settle against
 * the same real prices a contract would read, and payouts follow the same
 * parimutuel rules (lib/rounds.ts). Nothing here moves real funds.
 */

export type Position = {
  id: string;
  kind: "round" | "week";
  /** Market id ("eth-5m") or week market id ("eth"). */
  market: string;
  start: number;
  end: number;
  /** "up" / "down" for rounds, bucket index for weekly ranges. */
  side: Side | number;
  stake: number; // micro-ETH
  at: number;
  outcome?: Outcome | number | "refund";
  payout?: number; // micro-ETH, set when settled
  claimed?: boolean;
};

export type Account = {
  address: string;
  name: string | null;
  balance: number; // micro-ETH
  createdAt: number;
  lastTopUp: number;
  positions: Position[];
};

export type Activity = {
  address: string;
  name: string | null;
  kind: "round" | "week";
  market: string;
  start: number;
  side: Side | number;
  stake: number;
  at: number;
};

const KEEP_POSITIONS = 300;
const acctKey = (a: string) => `practice:acct:${a}`;
export const poolKey = (market: string, start: number, side: string | number) => `practice:pool:${market}:${start}:${side}`;
export const countKey = (market: string, start: number) => `practice:count:${market}:${start}`;
const ACCOUNTS = "practice:accounts";
const ACTIVITY = "practice:activity";
export const marketActivityKey = (market: string) => `practice:activity:${market}`;

export async function loadAccount(store: Store, address: string): Promise<Account | null> {
  const raw = await store.get(acctKey(address.toLowerCase()));
  return raw ? (JSON.parse(raw) as Account) : null;
}

async function saveAccount(store: Store, account: Account) {
  account.positions = account.positions.slice(-KEEP_POSITIONS);
  await store.set(acctKey(account.address), JSON.stringify(account));
}

const LOCK_TTL = 30; // seconds; far above the time any locked section takes
const LOCK_WAIT_MS = 8000;

/**
 * Runs `fn` while holding the wallet's lock (SET NX EX with a random token),
 * so concurrent requests from one wallet never read the same balance. Every
 * read-modify-write of an account goes through here. Waiting too long
 * returns 409 instead of proceeding without the lock.
 */
async function withLock<T>(store: Store, address: string, fn: () => Promise<T>): Promise<T | { error: string; status: number }> {
  const key = `practice:lock:${address}`;
  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const deadline = Date.now() + LOCK_WAIT_MS;
  while (Date.now() < deadline) {
    if (await store.setNx(key, token, LOCK_TTL)) {
      try {
        return await fn();
      } finally {
        // Only release our own lock (it may have expired and been taken).
        if ((await store.get(key).catch(() => null)) === token) await store.del(key).catch(() => {});
      }
    }
    await new Promise((r) => setTimeout(r, 40 + Math.random() * 60));
  }
  return { error: "Another request from this wallet is still running. Try again.", status: 409 };
}

/**
 * Reads the results an account will need before taking the lock, so the
 * locked section only hits caches (price reads can take seconds).
 */
async function prewarm(store: Store, address: string) {
  const account = await loadAccount(store, address);
  if (!account) return;
  const now = Date.now();
  await Promise.all(
    account.positions
      .filter((p) => p.outcome === undefined && p.end <= now)
      .slice(0, 20)
      .map(async (p) => {
        if (p.kind === "round") {
          const m = findMarket(p.market);
          if (m) await roundResult(store, m, p.start).catch(() => null);
        } else {
          const w = findWeek(p.market);
          if (w) await weekResult(store, w, p.start).catch(() => null);
        }
      }),
  );
}

/** Positions still waiting for settlement, across all markets. */
export const MAX_OPEN_POSITIONS = 40;
/** Ranges one wallet may hold in a single weekly market. */
export const MAX_WEEK_BUCKETS = 3;
const claimKey = (positionId: string, address: string) => `practice:claim:${positionId}:${address}`;

export async function openAccount(store: Store, session: Session): Promise<Account> {
  const existing = await loadAccount(store, session.address);
  if (existing) return existing;
  const account: Account = {
    address: session.address,
    name: null,
    balance: toMicro(START_BALANCE),
    createdAt: Date.now(),
    lastTopUp: Date.now(),
    positions: [],
  };
  await saveAccount(store, account);
  if (await store.setNx(`practice:seen:${session.address}`, "1", 10 * 365 * 24 * 3600)) {
    await store.pushCapped(ACCOUNTS, session.address, 2000);
  }
  return account;
}

export async function readPools(store: Store, market: string, start: number, sides: (string | number)[]) {
  const values = await store.mget([...sides.map((s) => poolKey(market, start, s)), countKey(market, start)]);
  const pools = sides.map((_, i) => Number(values[i] ?? 0) || 0);
  return { pools, count: Number(values[sides.length] ?? 0) || 0 };
}

export async function roundPool(store: Store, market: string, start: number): Promise<Pool & { count: number }> {
  const { pools, count } = await readPools(store, market, start, ["up", "down"]);
  return { up: pools[0], down: pools[1], count };
}

/** Settles every ended position it can. Mutates and reports whether anything changed. */
export async function settle(store: Store, account: Account): Promise<boolean> {
  let changed = false;
  const now = Date.now();
  for (const p of account.positions) {
    if (p.outcome !== undefined || p.end > now) continue;
    if (p.kind === "round") {
      const m = findMarket(p.market);
      if (!m) continue;
      const result = await roundResult(store, m, p.start);
      if (!result) continue;
      const pool = await roundPool(store, p.market, p.start);
      // A round with an empty side is refunded whatever the price did.
      p.outcome = pool.up > 0 && pool.down > 0 ? result.outcome : "refund";
      p.payout = payout(pool, p.outcome, p.side as Side, p.stake);
      changed = true;
    } else {
      const w = findWeek(p.market);
      if (!w) continue;
      const result = await weekResult(store, w, p.start);
      if (!result) continue;
      const buckets = result.buckets;
      const { pools } = await readPools(store, p.market, p.start, buckets.map((_, i) => i));
      const total = pools.reduce((a, b) => a + b, 0);
      const winner = result.winner;
      const filled = pools.filter((x) => x > 0).length;
      if (winner === null || pools[winner] <= 0 || filled < 2) {
        p.outcome = "refund";
        p.payout = p.stake;
      } else {
        p.outcome = winner;
        p.payout = p.side === winner ? Math.floor((p.stake * total * (10_000 - FEE_BPS)) / 10_000 / pools[winner]) : 0;
      }
      changed = true;
    }
    if (p.payout === 0) p.claimed = true; // nothing to claim on a miss
  }
  return changed;
}

/** Loads, settles and persists an account (used by every read). */
export async function freshAccount(store: Store, address: string) {
  const account = await loadAccount(store, address);
  if (!account) return null;
  if (account.positions.some((p) => p.outcome === undefined && p.end <= Date.now())) {
    await prewarm(store, address);
    const result = await withLock(store, account.address, async () => {
      const again = (await loadAccount(store, address))!;
      if (await settle(store, again)) await saveAccount(store, again);
      return again;
    });
    return "error" in result ? account : result;
  }
  return account;
}

const openCount = (account: Account) => account.positions.filter((p) => p.outcome === undefined).length;

function checkStake(stakeEth: unknown): { error: string } | { micro: number } {
  if (typeof stakeEth !== "number" && typeof stakeEth !== "string") return { error: "Enter a stake." };
  const stake = typeof stakeEth === "number" ? stakeEth : Number(stakeEth);
  if (!Number.isFinite(stake) || stake < MIN_STAKE) return { error: `The smallest stake is ${MIN_STAKE} ETH.` };
  if (stake > MAX_STAKE) return { error: `The largest stake per round is ${MAX_STAKE} ETH.` };
  return { micro: toMicro(stake) };
}

async function recordActivity(store: Store, entry: Activity) {
  const json = JSON.stringify(entry);
  await Promise.all([store.pushCapped(ACTIVITY, json, 200), store.pushCapped(marketActivityKey(entry.market), json, 100)]);
}

export async function enterRound(store: Store, session: Session, marketId: unknown, side: unknown, stakeEth: unknown) {
  const m = typeof marketId === "string" ? findMarket(marketId) : null;
  if (!m) return { error: "Unknown market.", status: 404 } as const;
  if (side !== "up" && side !== "down") return { error: "Pick UP or DOWN.", status: 400 } as const;
  const stake = checkStake(stakeEth);
  if ("error" in stake) return { error: stake.error, status: 400 } as const;
  const status = await assetStatus(m.asset);
  if (!status.open) return { error: status.note ?? "This market is closed.", status: 409 } as const;
  const { open } = rounds(m.frame);
  if (open.start - Date.now() < 2000) return { error: "This round is locking. Take the next one.", status: 409 } as const;

  await prewarm(store, session.address);
  const result = await withLock(store, session.address, async () => {
    // Re-checked under the lock: the round may have locked while we waited.
    if (open.start - Date.now() < 1000) return { error: "This round is locking. Take the next one.", status: 409 } as const;
    const account = (await loadAccount(store, session.address)) ?? (await openAccount(store, session));
    await settle(store, account);
    if (account.balance < stake.micro) return { error: "Not enough practice ETH. Claim wins or top up.", status: 402 } as const;
    const mine = account.positions.find((p) => p.kind === "round" && p.market === m.id && p.start === open.start);
    if (!mine && openCount(account) >= MAX_OPEN_POSITIONS) {
      return { error: `At most ${MAX_OPEN_POSITIONS} open positions at a time.`, status: 409 } as const;
    }
    if (mine && mine.side !== side) return { error: "You already took the other side of this round.", status: 409 } as const;
    if (mine && mine.stake + stake.micro > toMicro(MAX_STAKE)) {
      return { error: `The largest stake per round is ${MAX_STAKE} ETH.`, status: 400 } as const;
    }
    account.balance -= stake.micro;
    if (mine) mine.stake += stake.micro;
    else
      account.positions.push({
        id: `${m.id}:${open.start}`,
        kind: "round",
        market: m.id,
        start: open.start,
        end: open.end,
        side,
        stake: stake.micro,
        at: Date.now(),
      });
    await saveAccount(store, account);
    await store.incrBy(poolKey(m.id, open.start, side), stake.micro);
    if (!mine) await store.incr(countKey(m.id, open.start));
    await recordActivity(store, {
      address: account.address,
      name: account.name,
      kind: "round",
      market: m.id,
      start: open.start,
      side,
      stake: stake.micro,
      at: Date.now(),
    });
    return { account } as const;
  });
  return result;
}

export async function enterWeek(store: Store, session: Session, weekId: unknown, bucket: unknown, stakeEth: unknown) {
  const w = typeof weekId === "string" ? findWeek(weekId) : null;
  if (!w) return { error: "Unknown market.", status: 404 } as const;
  const stake = checkStake(stakeEth);
  if ("error" in stake) return { error: stake.error, status: 400 } as const;
  const start = weekStart();
  if (Date.now() > start + WEEK_MS - WEEK_ENTRY_CUTOFF_MS) {
    return { error: "Entries for this week are closed. The next week opens Monday 00:00 UTC.", status: 409 } as const;
  }
  const buckets = await weekBuckets(store, w, start);
  if (!buckets) return { error: "The week's opening price is not readable yet.", status: 503 } as const;
  const index = Number(bucket);
  if (!Number.isInteger(index) || index < 0 || index >= buckets.length) return { error: "Pick a range.", status: 400 } as const;

  await prewarm(store, session.address);
  return withLock(store, session.address, async () => {
    if (Date.now() > start + WEEK_MS - WEEK_ENTRY_CUTOFF_MS) {
      return { error: "Entries for this week are closed. The next week opens Monday 00:00 UTC.", status: 409 } as const;
    }
    const account = (await loadAccount(store, session.address)) ?? (await openAccount(store, session));
    await settle(store, account);
    if (account.balance < stake.micro) return { error: "Not enough practice ETH. Claim wins or top up.", status: 402 } as const;
    const id = `week:${w.id}:${start}:${index}`;
    const mine = account.positions.find((p) => p.id === id);
    const sameWeek = account.positions.filter((p) => p.kind === "week" && p.market === w.id && p.start === start);
    if (!mine && sameWeek.length >= MAX_WEEK_BUCKETS) {
      return { error: `At most ${MAX_WEEK_BUCKETS} ranges per weekly market.`, status: 409 } as const;
    }
    if (sameWeek.reduce((s, p) => s + p.stake, 0) + stake.micro > toMicro(MAX_STAKE)) {
      return { error: `The largest total stake per weekly market is ${MAX_STAKE} ETH.`, status: 400 } as const;
    }
    if (!mine && openCount(account) >= MAX_OPEN_POSITIONS) {
      return { error: `At most ${MAX_OPEN_POSITIONS} open positions at a time.`, status: 409 } as const;
    }
    account.balance -= stake.micro;
    if (mine) mine.stake += stake.micro;
    else
      account.positions.push({ id, kind: "week", market: w.id, start, end: start + WEEK_MS, side: index, stake: stake.micro, at: Date.now() });
    await saveAccount(store, account);
    await store.incrBy(poolKey(w.id, start, index), stake.micro);
    if (!mine) await store.incr(countKey(w.id, start));
    await recordActivity(store, {
      address: account.address,
      name: account.name,
      kind: "week",
      market: w.id,
      start,
      side: index,
      stake: stake.micro,
      at: Date.now(),
    });
    return { account } as const;
  });
}

export async function claim(store: Store, session: Session, ids: unknown) {
  const wanted = Array.isArray(ids) ? new Set(ids.filter((x): x is string => typeof x === "string" && x.length <= 80).slice(0, 50)) : null;
  await prewarm(store, session.address);
  return withLock(store, session.address, async () => {
    const account = await loadAccount(store, session.address);
    if (!account) return { error: "No practice account yet.", status: 404 } as const;
    await settle(store, account);
    let total = 0;
    for (const p of account.positions) {
      if (p.claimed || p.payout === undefined || p.payout <= 0) continue;
      if (wanted && !wanted.has(p.id)) continue;
      // One credit per position, ever: the claim key is taken before crediting,
      // so a lost or repeated write can never pay the same position twice.
      if (!(await store.setNx(claimKey(p.id, account.address), String(p.payout), 400 * 24 * 3600))) {
        p.claimed = true;
        continue;
      }
      account.balance += p.payout;
      total += p.payout;
      p.claimed = true;
    }
    await saveAccount(store, account);
    return { account, claimed: total } as const;
  });
}

export async function topUp(store: Store, session: Session) {
  return withLock(store, session.address, async () => {
    const account = (await loadAccount(store, session.address)) ?? (await openAccount(store, session));
    if (account.balance >= toMicro(TOP_UP_BELOW)) return { error: `Top-ups unlock below ${TOP_UP_BELOW} practice ETH.`, status: 409 } as const;
    if (Date.now() - account.lastTopUp < TOP_UP_EVERY_MS) return { error: "One top-up per 24 hours.", status: 429 } as const;
    account.balance += toMicro(TOP_UP);
    account.lastTopUp = Date.now();
    await saveAccount(store, account);
    return { account } as const;
  });
}

const NAME = /^[a-z0-9_]{3,18}$/;

export async function rename(store: Store, session: Session, input: unknown) {
  const name = typeof input === "string" ? input.trim().toLowerCase().replace(/^@/, "") : "";
  if (name && !NAME.test(name)) return { error: "3 to 18 characters: a–z, 0–9 and underscore.", status: 400 } as const;
  return withLock(store, session.address, async () => {
    const account = (await loadAccount(store, session.address)) ?? (await openAccount(store, session));
    if (name === (account.name ?? "")) return { account } as const;
    if (name) {
      const owner = await store.get(`practice:name:${name}`);
      if (owner && owner !== account.address) return { error: "That name is taken.", status: 409 } as const;
      await store.set(`practice:name:${name}`, account.address);
    }
    if (account.name) await store.del(`practice:name:${account.name}`);
    account.name = name || null;
    await saveAccount(store, account);
    return { account } as const;
  });
}

export async function addressForName(store: Store, name: string) {
  return store.get(`practice:name:${name.toLowerCase()}`);
}

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

export function statsOf(account: Account, since = weekStart()): Stats {
  const s: Stats = { wagered: 0, pnl: 0, weekPnl: 0, wins: 0, losses: 0, refunds: 0, open: 0, claimable: 0 };
  for (const p of account.positions) {
    s.wagered += p.stake;
    if (p.payout === undefined) {
      s.open += p.stake;
      continue;
    }
    const net = p.payout - p.stake;
    s.pnl += net;
    if (p.end >= since) s.weekPnl += net;
    if (p.outcome === "refund") s.refunds++;
    else if (p.payout > 0) s.wins++;
    else s.losses++;
    if (!p.claimed && p.payout > 0) s.claimable += p.payout;
  }
  return s;
}

export async function listAccounts(store: Store, limit = 400) {
  const addresses = [...new Set(await store.range(ACCOUNTS, limit))];
  const raws = await store.mget(addresses.map(acctKey));
  return raws.filter((r): r is string => Boolean(r)).map((r) => JSON.parse(r) as Account);
}

export async function recentActivity(store: Store, market?: string, count = 40) {
  const raw = await store.range(market ? marketActivityKey(market) : ACTIVITY, count);
  return raw.map((r) => JSON.parse(r) as Activity);
}

export const roundEnd = (marketId: string, start: number) => {
  const m = findMarket(marketId);
  return m ? start + FRAME_MS[m.frame] : start;
};
