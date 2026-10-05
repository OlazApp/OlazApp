import { NextResponse } from "next/server";
import { isAddress } from "@/config/brand";
import { getStore } from "@/lib/chat/store";
import { addressForName, freshAccount, statsOf } from "@/lib/practice/ledger";
import { notConfigured } from "@/lib/practice/http";

export const dynamic = "force-dynamic";

/** Public practice profile, by address or by chosen name. */
export async function GET(_: Request, ctx: { params: Promise<{ who: string }> }) {
  const { who } = await ctx.params;
  const store = getStore();
  if (!store) return notConfigured();
  const address = isAddress(who) ? who.toLowerCase() : /^[a-z0-9_]{3,18}$/i.test(who) ? await addressForName(store, who) : null;
  const account = address ? await freshAccount(store, address) : null;
  if (!account) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({
    address: account.address,
    name: account.name,
    createdAt: account.createdAt,
    stats: statsOf(account),
    positions: account.positions.slice(-120).reverse(),
  });
}
