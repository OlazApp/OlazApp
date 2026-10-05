import { NextResponse } from "next/server";
import { findMarket, FRAME_MS } from "@/config/markets";
import { board } from "@/lib/board";
import { getStore } from "@/lib/chat/store";
import { roundPool } from "@/lib/practice/ledger";
import { lockValue, roundResult, series } from "@/lib/prices";
import { rounds } from "@/lib/rounds";

export const dynamic = "force-dynamic";

const PAST = 10;
/** How far back a past round can be opened (in rounds). */
const MAX_LOOKBACK = 96;
const TTL_MS = 5000;

const cache = new Map<string, { at: number; body: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

/**
 * One market: the board snapshot, recent settled rounds and a chart. Only
 * known market ids are served, the round is clamped to a bounded window, and
 * identical requests share one computation for a few seconds.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const m = findMarket(id);
  if (!m) return NextResponse.json({ error: "Unknown market." }, { status: 404 });
  const ms = FRAME_MS[m.frame];
  const live = rounds(m.frame).live.start;
  const asked = Number(new URL(request.url).searchParams.get("round"));
  const focus =
    Number.isFinite(asked) && asked > 0 && asked % ms === 0 && asked <= live && asked >= live - MAX_LOOKBACK * ms ? asked : live;
  const key = `${id}:${focus}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json(hit.body, { headers: { "cache-control": "no-store" } });
  let job = inflight.get(key);
  if (!job) {
    job = build(m, focus)
      .then((body) => {
        if (cache.size > 200) cache.clear();
        cache.set(key, { at: Date.now(), body });
        return body;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, job);
  }
  return NextResponse.json(await job, { headers: { "cache-control": "no-store" } });
}

async function build(m: NonNullable<ReturnType<typeof findMarket>>, focus: number) {
  const id = m.id;
  const store = getStore();
  const snap = (await board()).markets.find((x) => x.id === id)!;
  const ms = FRAME_MS[m.frame];
  const r = rounds(m.frame);

  const starts = Array.from({ length: PAST }, (_, i) => r.previous.start - i * ms);
  const past = await Promise.all(
    starts.map(async (start) => {
      const [result, pool] = await Promise.all([
        roundResult(store, m, start).catch(() => null),
        store ? roundPool(store, m.id, start).catch(() => ({ up: 0, down: 0, count: 0 })) : { up: 0, down: 0, count: 0 },
      ]);
      return { start, end: start + ms, result, pool };
    }),
  );

  let focusRound = null;
  if (focus !== r.live.start) {
    const [result, pool, lock] = await Promise.all([
      roundResult(store, m, focus).catch(() => null),
      store ? roundPool(store, m.id, focus) : { up: 0, down: 0, count: 0 },
      lockValue(m, focus).catch(() => null),
    ]);
    focusRound = { start: focus, end: focus + ms, result, pool, lock };
  }

  let chartFrom = focus - ms;
  const chartTo = Math.min(Date.now(), focus + ms);
  const points = m.asset.source.kind === "blocks" ? [] : await series(m.asset, chartFrom, chartTo);
  // Stock feeds publish a few times a day: widen the window to their last answers.
  if (m.asset.source.kind === "chainlink" && points.length) chartFrom = Math.min(chartFrom, points[0].t);
  return { market: snap, focus, focusRound, past, chart: { from: chartFrom, to: focus + ms, points: points.filter((p) => p.t >= chartFrom).slice(-600) } };
}
