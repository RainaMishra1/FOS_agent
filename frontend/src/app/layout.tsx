import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FOS Agent | Field Agent Management System",
  description:
    "Location-based field agent tracking, geofenced customer visits, and multi-stop route optimization.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased selection:bg-indigo-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
