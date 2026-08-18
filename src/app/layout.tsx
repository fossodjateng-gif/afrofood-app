import type { Metadata } from "next";
import "./globals.css";

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
        {children}
      </body>
    </html>
  );
}
