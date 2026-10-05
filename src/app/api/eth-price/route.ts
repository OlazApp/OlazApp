import { NextResponse } from "next/server";

export const revalidate = 60;

type Quote = { usd: number; change24h: number | null; source: string };

async function fromOkx(): Promise<Quote> {
  const res = await fetch("https://www.okx.com/api/v5/market/ticker?instId=ETH-USDT", {
    next: { revalidate: 60 },
  });
  const body = (await res.json()) as { data?: { last: string; open24h: string }[] };
  const row = body.data?.[0];
  if (!row) throw new Error("no ticker");
  const last = Number(row.last);
  const open = Number(row.open24h);
  if (!Number.isFinite(last) || last <= 0) throw new Error("bad price");
  return { usd: last, change24h: open > 0 ? ((last - open) / open) * 100 : null, source: "OKX" };
}

async function fromCoinGecko(): Promise<Quote> {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&include_24hr_change=true",
    { next: { revalidate: 60 } },
  );
  const body = (await res.json()) as { ethereum?: { usd: number; usd_24h_change?: number } };
  if (!body.ethereum?.usd) throw new Error("no price");
  return { usd: body.ethereum.usd, change24h: body.ethereum.usd_24h_change ?? null, source: "CoinGecko" };
}

/** ETH/USD for the live tiles. Returns 503 rather than a guessed number. */
export async function GET() {
  for (const source of [fromOkx, fromCoinGecko]) {
    try {
      return NextResponse.json(await source());
    } catch {
      // try the next source
    }
  }
  return NextResponse.json({ error: "price unavailable" }, { status: 503 });
}
