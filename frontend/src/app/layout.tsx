import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";
import { AuthProvider } from "@/context/AuthContext";
import { OperationsProvider } from "@/context/OperationsContext";

export const metadata: Metadata = {
  title: "FOS — Field Operations & Agent Management System",
  description:
    "Location-based field agent tracking, geofenced 100m customer visits, and multi-stop route optimization.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased selection:bg-beige-terracotta selection:text-white">
        <AuthProvider>
          <OperationsProvider>
            <AppShell>{children}</AppShell>
          </OperationsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
