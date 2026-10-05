import { NextResponse } from "next/server";
import { allow, clientIp, tooMany } from "@/lib/guard";
import { openAccount } from "@/lib/practice/ledger";
import { accountResponse, signedIn } from "@/lib/practice/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await signedIn();
  if (ctx instanceof NextResponse) return ctx;
  return accountResponse(ctx.store, ctx.session.address);
}

/** Opens the practice account on first sign-in (no-op later) and returns it. */
export async function POST(request: Request) {
  const ctx = await signedIn();
  if (ctx instanceof NextResponse) return ctx;
  if (!(await allow(ctx.store, "account", [ctx.session.address, clientIp(request)], 120, 60))) return tooMany();
  await openAccount(ctx.store, ctx.session);
  return accountResponse(ctx.store, ctx.session.address);
}
