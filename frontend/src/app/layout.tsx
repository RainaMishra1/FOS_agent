import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/AppShell";
import { AuthProvider } from "@/context/AuthContext";
import { OperationsProvider } from "@/context/OperationsContext";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FOS — Field Operations & Agent Management System",
  description:
    "Location-based field agent tracking, geofenced 750m customer visits, and multi-stop route optimization.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={plusJakartaSans.variable}>
      <body className="font-sans antialiased selection:bg-beige-terracotta selection:text-white">
        <AuthProvider>
          <OperationsProvider>
            <AppShell>{children}</AppShell>
          </OperationsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
