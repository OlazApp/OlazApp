import { NextResponse } from "next/server";
import { allowPublic, readJson, tooMany } from "@/lib/guard";
import { isAddress } from "@/config/brand";
import { createChallenge, signInDomain } from "@/lib/chat/auth";
import { getStore } from "@/lib/chat/store";

export const dynamic = "force-dynamic";

/** Step 1 of sign-in: a one-time message for the wallet to sign. */
export async function POST(request: Request) {
  const store = getStore();
  if (!store) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (!(await allowPublic(store, request, "nonce", 20, 600))) return tooMany();
  const body = await readJson<{ address?: unknown }>(request, 512);
  const address = typeof body?.address === "string" ? body.address : "";
  if (!isAddress(address)) return NextResponse.json({ error: "A wallet address is required." }, { status: 400 });
  const host = signInDomain(request.headers.get("host"));
  return NextResponse.json({ message: await createChallenge(store, address, host) });
}
