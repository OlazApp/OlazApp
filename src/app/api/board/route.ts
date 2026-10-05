import { NextResponse } from "next/server";
import { board } from "@/lib/board";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await board(), { headers: { "cache-control": "no-store" } });
}
