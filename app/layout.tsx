import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ToastProvider } from "@/components/toast";
import { ModalProvider } from "@/components/modal";
import PwaRegister from "@/components/pwa-register";
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
  title: "NECOKU - Next Everyday Commerce & Order Key Unit",
  description:
    "Platform kasir omnichannel & e-commerce terpadu. Mendukung pesan antar, ambil sendiri, pesan dari meja, dan toko online publik.",
  keywords: [
    "NECOKU",
    "Kasir Online",
    "POS System",
    "E-Commerce",
    "Pesan dari Meja",
    "Pesan Antar",
    "Aplikasi Kasir",
  ],
  applicationName: "NECOKU",
  appleWebApp: {
    capable: true,
    title: "NECOKU",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#ff6a00",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
      <body className="min-h-full flex flex-col">
        <ToastProvider>
          <ModalProvider>{children}</ModalProvider>
        </ToastProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
