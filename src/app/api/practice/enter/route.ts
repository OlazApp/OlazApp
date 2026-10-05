import { NextResponse } from "next/server";
import { allow, badBody, clientIp, readJson, tooMany } from "@/lib/guard";
import { enterRound } from "@/lib/practice/ledger";
import { reply, signedIn } from "@/lib/practice/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ctx = await signedIn();
  if (ctx instanceof NextResponse) return ctx;
  if (!(await allow(ctx.store, "practice", [ctx.session.address, clientIp(request)], 60, 60))) return tooMany();
  const body = await readJson<{ market?: unknown; side?: unknown; stake?: unknown }>(request);
  if (!body) return badBody();
  return reply(await enterRound(ctx.store, ctx.session, body.market, body.side, body.stake));
}
