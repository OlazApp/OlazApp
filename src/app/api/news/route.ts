import { NextResponse } from "next/server";
import { headlines } from "@/lib/feeds/news";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ items: await headlines() });
}
