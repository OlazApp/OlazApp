import "server-only";
import { NextResponse } from "next/server";
import { readSession, type Session } from "@/lib/chat/auth";
import { getStore, type Store } from "@/lib/chat/store";
import { freshAccount, statsOf, type Account } from "@/lib/practice/ledger";

export const notConfigured = () =>
  NextResponse.json({ error: "not_configured", message: "Practice storage is not configured on this site yet." }, { status: 503 });

/** Store + session for a request that needs a signed-in wallet. */
export async function signedIn(): Promise<{ store: Store; session: Session } | NextResponse> {
  const store = getStore();
  if (!store) return notConfigured();
  const session = await readSession(store);
  if (!session) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  return { store, session };
}

export function accountView(account: Account) {
  return { ...account, stats: statsOf(account) };
}

export async function accountResponse(store: Store, address: string) {
  const account = await freshAccount(store, address);
  return account ? NextResponse.json(accountView(account)) : NextResponse.json({ error: "no_account" }, { status: 404 });
}

/** Turns a ledger result into a response. */
export function reply(result: { error: string; status: number } | { account: Account; claimed?: number }) {
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ...accountView(result.account), claimed: result.claimed ?? 0 });
}
