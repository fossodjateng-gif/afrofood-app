import type { Metadata } from "next";
import "./globals.css";
import { StaffSessionBoundary } from "@/components/StaffSessionBoundary";

export const metadata: Metadata = {
  title: "AfroFood",
  description: "AfroFood ordering and staff tools",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <StaffSessionBoundary>{children}</StaffSessionBoundary>
      </body>
    </html>
  );
}
