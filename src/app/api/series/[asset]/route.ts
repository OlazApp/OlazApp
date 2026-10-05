import { NextResponse } from "next/server";
import { findAsset } from "@/config/markets";
import { series } from "@/lib/prices";

export const dynamic = "force-dynamic";

const cache = new Map<string, { at: number; body: unknown }>();

export async function GET(request: Request, ctx: { params: Promise<{ asset: string }> }) {
  const { asset: id } = await ctx.params;
  const asset = findAsset(id);
  if (!asset) return NextResponse.json({ error: "Unknown asset." }, { status: 404 });
  const askedHours = Number(new URL(request.url).searchParams.get("hours"));
  const hours = [1, 6, 24, 168].includes(askedHours) ? askedHours : 1;
  const key = `${id}:${hours}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 20_000) return NextResponse.json(hit.body);
  const to = Date.now();
  const points = await series(asset, to - hours * 3600_000, to);
  const body = { asset: id, points: points.slice(-600) };
  cache.set(key, { at: Date.now(), body });
  return NextResponse.json(body);
}
