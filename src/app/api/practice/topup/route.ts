import { NextResponse } from "next/server";
import { allow, clientIp, tooMany } from "@/lib/guard";
import { topUp } from "@/lib/practice/ledger";
import { reply, signedIn } from "@/lib/practice/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ctx = await signedIn();
  if (ctx instanceof NextResponse) return ctx;
  if (!(await allow(ctx.store, "practice", [ctx.session.address, clientIp(request)], 60, 60))) return tooMany();
  return reply(await topUp(ctx.store, ctx.session));
}
