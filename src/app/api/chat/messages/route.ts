import { NextResponse } from "next/server";
import { allow, badBody, clientIp, readJson, tooMany } from "@/lib/guard";
import { readSession } from "@/lib/chat/auth";
import { findGroup } from "@/lib/chat/groups";
import { canEnter, listMessages, postMessage } from "@/lib/chat/messages";
import { getStore } from "@/lib/chat/store";

export const dynamic = "force-dynamic";

/** Every group is wallet-only: reading needs a session, just like writing. */
export async function GET(request: Request) {
  const store = getStore();
  if (!store) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const session = await readSession(store);
  if (!session) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const group = findGroup(params.get("group"));
  if (!group) return NextResponse.json({ error: "Unknown group." }, { status: 404 });
  if (!(await canEnter(store, session, group))) return NextResponse.json({ error: "holders_only" }, { status: 403 });
  const after = Number(params.get("after") ?? 0) || 0;
  return NextResponse.json({ messages: await listMessages(store, group.id, after) });
}

export async function POST(request: Request) {
  const store = getStore();
  if (!store) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const session = await readSession(store);
  if (!session) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  if (!(await allow(store, "chat", [session.address, clientIp(request)], 20, 60))) return tooMany();
  const body = await readJson<{ group?: unknown; text?: unknown }>(request);
  if (!body) return badBody();
  const group = findGroup(body?.group);
  if (!group) return NextResponse.json({ error: "Unknown group." }, { status: 404 });
  const result = await postMessage(store, session, group, body?.text);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
