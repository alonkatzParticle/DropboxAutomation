/**
 * layout.tsx — Root layout for the entire Next.js app.
 *
 * Wraps every page with:
 *   - Global fonts (Geist Sans + Geist Mono)
 *   - Global CSS (Tailwind + shadcn variables)
 *   - The persistent left sidebar (Sidebar component)
 *
 * The sidebar stays fixed on the left; the page content fills the remaining space.
 *
 * Depends on: web/components/Sidebar.tsx, web/app/globals.css
 */

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dropbox Automation",
  description: "Monday.com → Dropbox folder creator",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* Side-by-side layout: sidebar on the left, page content on the right */}
      <body className="min-h-full flex flex-row bg-background">
        <Sidebar />
        {/* The page content fills the remaining horizontal space */}
        <div className="flex-1 min-h-screen overflow-y-auto">
          {children}
        </div>
      </body>
    </html>
  );
}
