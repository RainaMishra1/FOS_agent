import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/AppShell";
import { AuthProvider } from "@/context/AuthContext";
import { OperationsProvider } from "@/context/OperationsContext";
import PwaSupport from "@/components/PwaSupport";

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
  applicationName: "FOS Agent",
  appleWebApp: {
    capable: true,
    title: "FOS Agent",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1E3F35",
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
            <PwaSupport />
          </OperationsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
