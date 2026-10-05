import type { Metadata } from "next";
import { BRAND } from "@/config/brand";
import { ChatApp } from "@/components/chat/ChatApp";

export const metadata: Metadata = {
  title: "Chat",
  description: `Wallet-only community chat for ${BRAND.name} traders on Robinhood Chain. Connect, sign once, and join the groups.`,
};

export default function ChatPage() {
  return <ChatApp />;
}
