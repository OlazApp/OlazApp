import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createClient } from "redis";
import { BRAND } from "@/config/brand";

/*
 * Storage for the group chat, market comments and the practice ledger.
 *
 * Production uses Redis, configured with one of
 *   KV_REDIS_URL or REDIS_URL           a redis:// or rediss:// connection URL
 *                                       (Vercel's Redis integration), or
 *   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, or
 *   KV_REST_API_URL + KV_REST_API_TOKEN (Upstash over its REST API).
 * Every key is prefixed with the project name ("olaz:chat:…", or
 * CHAT_KEY_PREFIX when set), so several projects can share one Redis and a
 * per-project Redis user can be limited to its own keys.
 *
 * Without those, a local run keeps everything in memory and mirrors it to
 * .chat-data.json so a restart does not wipe the room. On Vercel there is no
 * shared disk or memory between functions, so the chat reports itself as not
 * configured instead of pretending to work.
 */

export type Store = {
  get(key: string): Promise<string | null>;
  /** Sets with an expiry in seconds. */
  setEx(key: string, value: string, ttl: number): Promise<void>;
  /** Sets only if the key is free; true when it was set. */
  setNx(key: string, value: string, ttl: number): Promise<boolean>;
  del(key: string): Promise<void>;
  incr(key: string): Promise<number>;
  /** Increments a counter that expires `ttl` seconds after it was created. */
  incrEx(key: string, ttl: number): Promise<number>;
  /** Adds an integer and returns the new total. */
  incrBy(key: string, by: number): Promise<number>;
  /** Several plain values at once, null where missing. */
  mget(keys: string[]): Promise<(string | null)[]>;
  /** Sets without expiry. */
  set(key: string, value: string): Promise<void>;
  /** Pushes to the head of a list and keeps the newest `keep` items. */
  pushCapped(key: string, value: string, keep: number): Promise<void>;
  /** Newest first. */
  range(key: string, count: number): Promise<string[]>;
};

function restConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

function redisStore(config: { url: string; token: string }): Store {
  const run = async <T>(...commands: (string | number)[][]): Promise<T[]> => {
    const res = await fetch(`${config.url}/pipeline`, {
      method: "POST",
      headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json" },
      body: JSON.stringify(commands.map((c) => c.map(String))),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Redis ${res.status}`);
    const body = (await res.json()) as { result?: T; error?: string }[];
    return body.map((entry) => {
      if (entry.error) throw new Error(entry.error);
      return entry.result as T;
    });
  };
  return {
    get: async (key) => (await run<string | null>(["GET", key]))[0],
    setEx: async (key, value, ttl) => void (await run(["SET", key, value, "EX", ttl])),
    setNx: async (key, value, ttl) => (await run<string | null>(["SET", key, value, "NX", "EX", ttl]))[0] === "OK",
    del: async (key) => void (await run(["DEL", key])),
    incr: async (key) => Number((await run<number>(["INCR", key]))[0]),
    incrBy: async (key, by) => Number((await run<number>(["INCRBY", key, Math.trunc(by)]))[0]),
    incrEx: async (key, ttl) => Number((await run<number>(["INCR", key], ["EXPIRE", key, ttl, "NX"]))[0]),
    mget: async (keys) => (keys.length ? ((await run<(string | null)[]>(["MGET", ...keys]))[0] ?? []) : []),
    set: async (key, value) => void (await run(["SET", key, value])),
    pushCapped: async (key, value, keep) => void (await run(["LPUSH", key, value], ["LTRIM", key, 0, keep - 1])),
    range: async (key, count) => (await run<string[]>(["LRANGE", key, 0, count - 1]))[0] ?? [],
  };
}

type RedisClient = ReturnType<typeof createClient>;
// One connection per server instance, reused across requests.
let connecting: Promise<RedisClient> | null = null;

function tcpStore(url: string): Store {
  const client = () => {
    connecting ??= createClient({ url, socket: { connectTimeout: 5000 } })
      .on("error", () => {
        // Reported per command; a broken socket reconnects on the next call.
      })
      .connect() as Promise<RedisClient>;
    connecting.catch(() => {
      connecting = null;
    });
    return connecting;
  };
  return {
    get: async (key) => (await client()).get(key),
    setEx: async (key, value, ttl) => void (await (await client()).set(key, value, { EX: ttl })),
    setNx: async (key, value, ttl) => (await (await client()).set(key, value, { NX: true, EX: ttl })) === "OK",
    del: async (key) => void (await (await client()).del(key)),
    incr: async (key) => (await client()).incr(key),
    incrBy: async (key, by) => (await client()).incrBy(key, Math.trunc(by)),
    incrEx: async (key, ttl) => {
      const [n] = (await (await client()).multi().incr(key).expire(key, ttl, "NX").exec()) as unknown as [number];
      return Number(n);
    },
    mget: async (keys) => (keys.length ? (await client()).mGet(keys) : []),
    set: async (key, value) => void (await (await client()).set(key, value)),
    pushCapped: async (key, value, keep) => {
      await (await client()).multi().lPush(key, value).lTrim(key, 0, keep - 1).exec();
    },
    range: async (key, count) => (await client()).lRange(key, 0, count - 1),
  };
}

type Entry = { value: string; expires: number | null };
type Data = { kv: Record<string, Entry>; lists: Record<string, string[]> };

const FILE = path.join(process.cwd(), ".chat-data.json");

function localStore(): Store {
  let data: Data | null = null;
  let writing: Promise<void> = Promise.resolve();

  const load = async () => {
    if (data) return data;
    try {
      data = JSON.parse(await fs.readFile(FILE, "utf8")) as Data;
    } catch {
      data = { kv: {}, lists: {} };
    }
    return data;
  };
  const persist = () => {
    // Writes are chained so two requests never interleave on the file.
    writing = writing.then(() => fs.writeFile(FILE, JSON.stringify(data)).catch(() => {}));
    return writing;
  };
  const live = (d: Data, key: string) => {
    const entry = d.kv[key];
    if (!entry) return null;
    if (entry.expires !== null && entry.expires < Date.now()) {
      delete d.kv[key];
      return null;
    }
    return entry;
  };

  return {
    get: async (key) => live(await load(), key)?.value ?? null,
    setEx: async (key, value, ttl) => {
      (await load()).kv[key] = { value, expires: Date.now() + ttl * 1000 };
      await persist();
    },
    setNx: async (key, value, ttl) => {
      const d = await load();
      if (live(d, key)) return false;
      d.kv[key] = { value, expires: Date.now() + ttl * 1000 };
      await persist();
      return true;
    },
    del: async (key) => {
      delete (await load()).kv[key];
      await persist();
    },
    incr: async (key) => {
      const d = await load();
      const next = Number(live(d, key)?.value ?? 0) + 1;
      d.kv[key] = { value: String(next), expires: null };
      await persist();
      return next;
    },
    incrEx: async (key, ttl) => {
      const d = await load();
      const current = live(d, key);
      const next = Number(current?.value ?? 0) + 1;
      d.kv[key] = { value: String(next), expires: current?.expires ?? Date.now() + ttl * 1000 };
      await persist();
      return next;
    },
    incrBy: async (key, by) => {
      const d = await load();
      const next = Number(live(d, key)?.value ?? 0) + Math.trunc(by);
      d.kv[key] = { value: String(next), expires: live(d, key)?.expires ?? null };
      await persist();
      return next;
    },
    mget: async (keys) => {
      const d = await load();
      return keys.map((key) => live(d, key)?.value ?? null);
    },
    set: async (key, value) => {
      (await load()).kv[key] = { value, expires: null };
      await persist();
    },
    pushCapped: async (key, value, keep) => {
      const d = await load();
      d.lists[key] = [value, ...(d.lists[key] ?? [])].slice(0, keep);
      await persist();
    },
    range: async (key, count) => ((await load()).lists[key] ?? []).slice(0, count),
  };
}

const KEY_PREFIX = process.env.CHAT_KEY_PREFIX || `${BRAND.ticker.toLowerCase()}:`;

/** Puts the project prefix in front of every key the chat touches. */
function prefixed(store: Store, prefix: string): Store {
  const k = (key: string) => `${prefix}${key}`;
  return {
    get: (key) => store.get(k(key)),
    setEx: (key, value, ttl) => store.setEx(k(key), value, ttl),
    setNx: (key, value, ttl) => store.setNx(k(key), value, ttl),
    del: (key) => store.del(k(key)),
    incr: (key) => store.incr(k(key)),
    incrBy: (key, by) => store.incrBy(k(key), by),
    incrEx: (key, ttl) => store.incrEx(k(key), ttl),
    mget: (keys) => store.mget(keys.map(k)),
    set: (key, value) => store.set(k(key), value),
    pushCapped: (key, value, keep) => store.pushCapped(k(key), value, keep),
    range: (key, count) => store.range(k(key), count),
  };
}

let cached: Store | null | undefined;

/** The configured store, or null when the chat has nowhere safe to keep data. */
export function getStore(): Store | null {
  if (cached !== undefined) return cached;
  const tcp = process.env.KV_REDIS_URL || process.env.REDIS_URL;
  const rest = restConfig();
  if (tcp) cached = prefixed(tcpStore(tcp), KEY_PREFIX);
  else if (rest) cached = prefixed(redisStore(rest), KEY_PREFIX);
  else if (process.env.VERCEL) cached = null;
  else cached = localStore();
  return cached;
}
