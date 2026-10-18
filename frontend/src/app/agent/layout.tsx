import type { Metadata } from "next";
import { AgentProvider } from "@/context/AgentContext";
import AgentLayout from "@/components/agent/AgentLayout";

export const metadata: Metadata = {
  title: "Agent Portal — FOS Field Operations",
  description: "Mobile-first field agent dashboard for geofenced visits, route navigation, and check-in verification.",
};

export default function AgentRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AgentProvider>
      <AgentLayout>{children}</AgentLayout>
    </AgentProvider>
  );
}
