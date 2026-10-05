import { NextResponse } from "next/server";
import { allowPublic, readJson, tooMany } from "@/lib/guard";
import { isAddress } from "@/config/brand";
import { COOKIE, SESSION_TTL, completeSignIn, endSession, readSession } from "@/lib/chat/auth";
import { getStore } from "@/lib/chat/store";

export const dynamic = "force-dynamic";

const notConfigured = () => NextResponse.json({ error: "not_configured" }, { status: 503 });

/** Who is signed in to the chat in this browser, if anyone. */
export async function GET() {
  const store = getStore();
  if (!store) return notConfigured();
  const session = await readSession(store);
  return session ? NextResponse.json(session) : NextResponse.json({ error: "signed_out" }, { status: 401 });
}

/** Step 2 of sign-in: the signed message comes back and opens a session. */
export async function POST(request: Request) {
  const store = getStore();
  if (!store) return notConfigured();
  if (!(await allowPublic(store, request, "signin", 20, 600))) return tooMany();
  const body = await readJson<{ address?: unknown; message?: unknown; signature?: unknown }>(request, 2048);
  const address = typeof body?.address === "string" ? body.address : "";
  const message = typeof body?.message === "string" ? body.message.slice(0, 1000) : "";
  const signature = typeof body?.signature === "string" ? body.signature : "";
  if (!isAddress(address) || !message || !signature) {
    return NextResponse.json({ error: "Address, message and signature are required." }, { status: 400 });
  }
  const result = await completeSignIn(store, address, message, signature);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 401 });
  const response = NextResponse.json(result.session);
  response.cookies.set(COOKIE, result.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && Boolean(process.env.VERCEL),
    path: "/",
    maxAge: SESSION_TTL,
  });
  return response;
}

export async function DELETE() {
  const store = getStore();
  if (store) await endSession(store);
  return NextResponse.json({ ok: true });
}
