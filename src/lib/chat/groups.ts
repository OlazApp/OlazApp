// Groups of the community chat. Shared by the server (which enforces them)
// and the page (which lists them). Add a group here and it appears everywhere.

export type ChatGroup = {
  id: string;
  name: string;
  about: string;
  /** Only wallets holding the token can read or post. Checked on the server. */
  holdersOnly?: boolean;
};

export const GROUPS: ChatGroup[] = [
  { id: "floor", name: "Trading floor", about: "General talk for everyone with a wallet." },
  { id: "calls", name: "Round calls", about: "Post your call before the round locks. Receipts later." },
  { id: "feeds", name: "Feeds & settlement", about: "Oracles, lock prices, refunds and how a round was decided." },
  { id: "holders", name: "Holders' box", about: "Only wallets holding the token get in.", holdersOnly: true },
];

export const findGroup = (id: unknown) => GROUPS.find((g) => g.id === id) ?? null;

export const MAX_LENGTH = 280;
