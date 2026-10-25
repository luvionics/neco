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
  title: "NECA - Next E-Commerce & Cashier Application",
  description:
    "Platform kasir omnichannel & e-commerce terpadu. Mendukung pesan antar, ambil sendiri, pesan dari meja, dan toko online publik.",
  keywords: [
    "NECA",
    "Kasir Online",
    "POS System",
    "E-Commerce",
    "Pesan dari Meja",
    "Pesan Antar",
    "Aplikasi Kasir",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}