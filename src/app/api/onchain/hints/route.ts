import { NextResponse } from "next/server";
import { KIND, VOID_AFTER_S, roundsLive } from "@/config/onchain";
import { getStore } from "@/lib/chat/store";
import { allowPublic, tooMany } from "@/lib/guard";
import { marketByIndex, settleHints } from "@/lib/onchain/server";

export const dynamic = "force-dynamic";

const cache = new Map<string, { at: number; body: { lockHint: string; closeHint: string } }>();
const TTL_MS = 20_000;

/**
 * Chainlink round ids that settle() needs for a feed market: the rounds that
 * were current at the round's start and end. The contract verifies them, so a
 * wrong answer here can only make a settlement revert, never change a result.
 */
export async function GET(request: Request) {
  if (!roundsLive()) return NextResponse.json({ error: "Round contract is not deployed yet." }, { status: 404 });
  const params = new URL(request.url).searchParams;
  const index = Number(params.get("market"));
  const round = Number(params.get("round"));
  const m = Number.isInteger(index) ? marketByIndex(index) : null;
  if (!m || !Number.isSafeInteger(round) || round <= 0) return NextResponse.json({ error: "Unknown market or round." }, { status: 400 });
  const endSec = (round + 1) * m.durationS;
  if (endSec > Date.now() / 1000) return NextResponse.json({ error: "The round has not ended yet." }, { status: 409 });
  // Pool markets need no hints, and rounds older than the void window can no longer be settled.
  if (m.kind !== KIND.Feed) return NextResponse.json({ lockHint: "0", closeHint: "0" });
  if (Date.now() / 1000 - endSec > VOID_AFTER_S + 3600) return NextResponse.json({ error: "That round is too old to settle." }, { status: 410 });

  const key = `${index}:${round}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json(hit.body);
  // A lookup can take a couple of dozen RPC reads, so uncached ones are rate limited per caller.
  const store = getStore();
  if (store && !(await allowPublic(store, request, "hints", 20, 300))) return tooMany();
  const hints = await settleHints(m, round).catch(() => null);
  if (!hints) return NextResponse.json({ error: "Could not read the feed history. Try again." }, { status: 502 });
  const body = { lockHint: hints.lockHint.toString(), closeHint: hints.closeHint.toString() };
  if (cache.size > 500) cache.clear();
  cache.set(key, { at: Date.now(), body });
  return NextResponse.json(body);
}
