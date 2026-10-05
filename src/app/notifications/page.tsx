import type { Metadata } from "next";
import { Notifications } from "@/components/pages/Notifications";

export const metadata: Metadata = { title: "Notifications" };

export default function Page() {
  return <Notifications />;
}
