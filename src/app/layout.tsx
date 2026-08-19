import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "AI Scrum Master",
    template: "%s | AI Scrum Master",
  },
  description:
    "Multi-tenant delivery status, SDLC tracking, management dashboards, and meeting-to-proposal workflows.",
  metadataBase: new URL(process.env.APP_BASE_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000"),
  openGraph: {
    title: "AI Scrum Master",
    description:
      "Daily status agent, SDLC backlog, billing/GTS dashboards, and AI meeting proposals — multi-tenant.",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>{children}</body>
    </html>
  );
}
