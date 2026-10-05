import { NextResponse } from "next/server";
import { getStore } from "@/lib/chat/store";
import { recentActivity } from "@/lib/practice/ledger";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const store = getStore();
  if (!store) return NextResponse.json({ items: [], storage: false });
  const market = new URL(request.url).searchParams.get("market") ?? undefined;
  const items = await recentActivity(store, market && /^[a-z0-9-]{2,24}$/.test(market) ? market : undefined).catch(() => []);
  return NextResponse.json({ items, storage: true });
}
