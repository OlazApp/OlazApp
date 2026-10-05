import { NextResponse } from "next/server";
import { getStore } from "@/lib/chat/store";
import { freshAccount, listAccounts, statsOf } from "@/lib/practice/ledger";
import { notConfigured } from "@/lib/practice/http";
import { weekStart } from "@/lib/rounds";

export const dynamic = "force-dynamic";

let cache: { at: number; body: unknown } | null = null;

/** Practice results of real visitors only. Nobody is added who did not sign in and play. */
export async function GET() {
  const store = getStore();
  if (!store) return notConfigured();
  if (cache && Date.now() - cache.at < 15_000) return NextResponse.json(cache.body);
  const accounts = await listAccounts(store);
  // Settle a handful of accounts with ended rounds so standings stay current.
  const settled = await Promise.all(
    accounts.map((a) =>
      a.positions.some((p) => p.outcome === undefined && p.end <= Date.now()) ? freshAccount(store, a.address).catch(() => a) : a,
    ),
  );
  const since = weekStart();
  const rows = settled
    .filter((a): a is NonNullable<typeof a> => a !== null)
    .map((a) => ({ address: a.address, name: a.name, createdAt: a.createdAt, ...statsOf(a, since) }))
    .filter((r) => r.wins + r.losses + r.refunds > 0 || r.open > 0);
  const body = { since, rows, traders: accounts.length };
  cache = { at: Date.now(), body };
  return NextResponse.json(body);
}
