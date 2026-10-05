import "server-only";

/*
 * OKX public market data (no key). Candle rows are
 * [ts, open, high, low, close, vol, volCcy, volCcyQuote, confirm] and the
 * newest row comes first. A round's lock price is the OPEN of the 1-minute
 * candle that starts at the round boundary, so the close of one round is the
 * lock of the next and anyone can check both on OKX.
 */

const BASE = "https://www.okx.com/api/v5/market";
type Row = [string, string, string, string, string, ...string[]];

async function get<T>(path: string, attempts = 4): Promise<T> {
  let last: unknown;
  for (let n = 0; n < attempts; n++) {
    try {
      const res = await fetch(`${BASE}${path}`, { cache: "no-store", signal: AbortSignal.timeout(6000) });
      if (!res.ok) throw new Error(`OKX ${res.status}`);
      const body = (await res.json()) as { code: string; data?: T; msg?: string };
      if (body.code !== "0" || !body.data) throw new Error(body.msg || "OKX error");
      return body.data;
    } catch (error) {
      last = error;
      // Network resets and rate limits both get a short, growing backoff.
      await new Promise((r) => setTimeout(r, 200 * (n + 1) + Math.random() * 150));
    }
  }
  throw last;
}

const MIN = 60_000;
const confirmed = new Map<string, number>(); // `${inst}:${minute}` -> open (never changes once the minute started)
const missed = new Map<string, number>(); // `${inst}:${minute}` -> time of the failed read
const pages = new Map<string, Promise<void>>();
const PAGE = 100; // minutes per batched read
const MISS_TTL_MS = 30_000;

/**
 * Loads 100 one-minute candles in one request and caches every open in it,
 * so a page of past rounds costs one call instead of one per round.
 * Concurrent callers for the same page share the request.
 */
function loadPage(inst: string, pageEnd: number) {
  const key = `${inst}:${pageEnd}`;
  let job = pages.get(key);
  if (!job) {
    const recent = Date.now() - pageEnd < 1300 * MIN;
    job = get<Row[]>(`/${recent ? "candles" : "history-candles"}?instId=${inst}&bar=1m&after=${pageEnd}&limit=${PAGE}`, 4)
      .then((rows) => {
        if (confirmed.size > 50_000) confirmed.clear();
        for (const r of rows) {
          const open = Number(r[1]);
          if (Number.isFinite(open) && open > 0) confirmed.set(`${inst}:${Number(r[0])}`, open);
        }
      })
      .catch(() => {})
      .finally(() => setTimeout(() => pages.delete(key), 1000));
    pages.set(key, job);
  }
  return job;
}

/** Open of the 1-minute candle starting at `minute` (ms), or null if it has not started. */
export async function minuteOpen(inst: string, minute: number): Promise<number | null> {
  const t = Math.floor(minute / MIN) * MIN;
  if (t > Date.now()) return null;
  const key = `${inst}:${t}`;
  const hit = confirmed.get(key);
  if (hit !== undefined) return hit;
  const miss = missed.get(key);
  if (miss !== undefined && Date.now() - miss < MISS_TTL_MS) return null;
  const pageEnd = (Math.floor(t / (PAGE * MIN)) + 1) * PAGE * MIN;
  await loadPage(inst, pageEnd);
  let found = confirmed.get(key);
  if (found === undefined) {
    // The newest candle can lag a moment behind the clock: one direct read.
    const rows = await get<Row[]>(`/candles?instId=${inst}&bar=1m&after=${t + MIN}&limit=1`, 3).catch(() => [] as Row[]);
    const row = rows.find((r) => Number(r[0]) === t);
    if (row && Number(row[1]) > 0) confirmed.set(key, (found = Number(row[1])));
  }
  if (found === undefined) {
    if (missed.size > 5000) missed.clear();
    missed.set(key, Date.now());
    return null;
  }
  missed.delete(key);
  return found;
}

export type Point = { t: number; p: number };

const BAR_MS = { "1m": MIN, "5m": 5 * MIN, "1H": 60 * MIN } as const;
export type Bar = keyof typeof BAR_MS;

/** Candle closes between two times, oldest first. 1-minute bars by default. */
export async function minuteSeries(inst: string, from: number, to: number, bar: Bar = "1m"): Promise<Point[]> {
  const out: Point[] = [];
  const step = BAR_MS[bar];
  let cursor = Math.min(to, Date.now()) + step;
  const start = Math.floor(from / step) * step;
  for (let page = 0; page < 6 && cursor > start; page++) {
    const recent = Date.now() - cursor < 1000 * step;
    const rows = await get<Row[]>(
      `/${recent ? "candles" : "history-candles"}?instId=${inst}&bar=${bar}&after=${cursor}&limit=300`,
    ).catch(() => [] as Row[]);
    if (rows.length === 0) break;
    for (const r of rows) {
      const t = Number(r[0]);
      if (t >= start) out.push({ t, p: Number(r[4]) });
    }
    cursor = Number(rows[rows.length - 1][0]);
  }
  return out.sort((a, b) => a.t - b.t);
}

export type Ticker = { last: number; open24h: number; change24h: number | null };
const tickers = new Map<string, { at: number; value: Ticker }>();

export async function ticker(inst: string): Promise<Ticker | null> {
  const hit = tickers.get(inst);
  if (hit && Date.now() - hit.at < 4000) return hit.value;
  try {
    const [row] = await get<{ last: string; open24h: string }[]>(`/ticker?instId=${inst}`, 2);
    const last = Number(row.last);
    const open24h = Number(row.open24h);
    if (!Number.isFinite(last) || last <= 0) return hit?.value ?? null;
    const value = { last, open24h, change24h: open24h > 0 ? ((last - open24h) / open24h) * 100 : null };
    tickers.set(inst, { at: Date.now(), value });
    return value;
  } catch {
    return hit?.value ?? null;
  }
}
