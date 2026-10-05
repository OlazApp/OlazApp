import "server-only";
import { holdsToken, type Session } from "@/lib/chat/auth";
import { GROUPS, MAX_LENGTH, type ChatGroup } from "@/lib/chat/groups";
import type { Store } from "@/lib/chat/store";

export type ChatMessage = { id: number; address: string; holder: boolean; text: string; at: number };

const KEEP = 200;
const COOLDOWN = 3; // seconds between two messages from one address
const HOLDER_TTL = 60; // seconds a balance check is reused

const listKey = (group: string) => `chat:group:${group}`;

/**
 * Whether the address holds the token right now. Cached for a minute, so a
 * wallet that buys can enter the holders' group without signing in again and
 * one that sells loses it shortly after.
 */
export async function isHolder(store: Store, address: string) {
  const key = `chat:holder:${address}`;
  const cached = await store.get(key);
  if (cached !== null) return cached === "1";
  const holder = await holdsToken(address);
  await store.setEx(key, holder ? "1" : "0", HOLDER_TTL);
  return holder;
}

export async function canEnter(store: Store, session: Session, group: ChatGroup) {
  return !group.holdersOnly || (await isHolder(store, session.address));
}

/** Newest last, only those after `after` when given. */
export async function listMessages(store: Store, group: string, after = 0, count = 100) {
  const raw = await store.range(listKey(group), count);
  return raw
    .map((entry) => JSON.parse(entry) as ChatMessage)
    .filter((m) => m.id > after)
    .reverse();
}

/** Latest message per group, for the group list. */
export async function summarize(store: Store, session: Session) {
  const holder = await isHolder(store, session.address);
  return Promise.all(
    GROUPS.map(async (group) => {
      const locked = Boolean(group.holdersOnly && !holder);
      const [latest] = locked ? [] : await listMessages(store, group.id, 0, 1);
      return { id: group.id, locked, last: latest ?? null };
    }),
  );
}

/** Strips control and invisible characters, folds whitespace, trims. */
export function cleanText(input: unknown) {
  if (typeof input !== "string") return "";
  return input
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F​-‏‪-‮⁠-⁤﻿]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export async function postMessage(store: Store, session: Session, group: ChatGroup, input: unknown) {
  const text = cleanText(input);
  if (!text) return { error: "Say something first.", status: 400 } as const;
  if (text.length > MAX_LENGTH) return { error: `Keep it under ${MAX_LENGTH} characters.`, status: 400 } as const;
  if (!(await canEnter(store, session, group))) {
    return { error: "This group is for wallets holding the token.", status: 403 } as const;
  }
  if (!(await store.setNx(`chat:cooldown:${session.address}`, "1", COOLDOWN))) {
    return { error: "One message every few seconds, please.", status: 429 } as const;
  }
  const message: ChatMessage = {
    id: await store.incr("chat:seq"),
    address: session.address,
    holder: await isHolder(store, session.address),
    text,
    at: Date.now(),
  };
  await store.pushCapped(listKey(group.id), JSON.stringify(message), KEEP);
  return { message } as const;
}
