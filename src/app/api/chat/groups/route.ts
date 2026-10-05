import { NextResponse } from "next/server";
import { readSession } from "@/lib/chat/auth";
import { summarize } from "@/lib/chat/messages";
import { getStore } from "@/lib/chat/store";

export const dynamic = "force-dynamic";

/** The group list with each group's latest message and whether it is locked. */
export async function GET() {
  const store = getStore();
  if (!store) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const session = await readSession(store);
  if (!session) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  return NextResponse.json({ groups: await summarize(store, session) });
}
