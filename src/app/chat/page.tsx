import type { Metadata } from "next";
import { ItChat } from "@/components/ItChat";

export const metadata: Metadata = {
  title: "AI Chat — AXON.MK",
  description: "Ask about PC builds, parts, and IT.",
};

export default function ChatPage() {
  return <ItChat />;
}
