import { NextResponse } from "next/server";
import { allow, badBody, clientIp, readJson, tooMany } from "@/lib/guard";
import { readSession } from "@/lib/chat/auth";
import { cleanText } from "@/lib/chat/messages";
import { getStore } from "@/lib/chat/store";
import { findAsset, findWeek } from "@/config/markets";

export const dynamic = "force-dynamic";

/*
 * Comments under a market. Anyone can read; posting needs a wallet sign-in.
 * Threads are per asset (all round lengths share one) or per weekly market.
 */

type Comment = { id: number; address: string; text: string; at: number };
const MAX = 400;
const key = (thread: string) => `comments:${thread}`;

function threadOf(raw: string | null) {
  if (!raw) return null;
  if (raw.startsWith("week-")) return findWeek(raw.slice(5)) ? raw : null;
  return findAsset(raw) ? raw : null;
}

export async function GET(request: Request) {
  const store = getStore();
  if (!store) return NextResponse.json({ items: [], storage: false });
  const thread = threadOf(new URL(request.url).searchParams.get("thread"));
  if (!thread) return NextResponse.json({ error: "Unknown market." }, { status: 404 });
  const items = (await store.range(key(thread), 100)).map((r) => JSON.parse(r) as Comment);
  return NextResponse.json({ items, storage: true });
}

export async function POST(request: Request) {
  const store = getStore();
  if (!store) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const session = await readSession(store);
  if (!session) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  if (!(await allow(store, "comment", [session.address, clientIp(request)], 6, 60))) return tooMany();
  const body = await readJson<{ thread?: unknown; text?: unknown }>(request);
  if (!body) return badBody();
  const thread = threadOf(typeof body?.thread === "string" ? body.thread : null);
  if (!thread) return NextResponse.json({ error: "Unknown market." }, { status: 404 });
  const text = cleanText(body?.text);
  if (!text) return NextResponse.json({ error: "Write something first." }, { status: 400 });
  if (text.length > MAX) return NextResponse.json({ error: `Keep it under ${MAX} characters.` }, { status: 400 });
  if (!(await store.setNx(`comments:cooldown:${session.address}`, "1", 10))) {
    return NextResponse.json({ error: "One comment every 10 seconds." }, { status: 429 });
  }
  const comment: Comment = { id: await store.incr("comments:seq"), address: session.address, text, at: Date.now() };
  await store.pushCapped(key(thread), JSON.stringify(comment), 300);
  return NextResponse.json({ comment });
}
