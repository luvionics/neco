"use client";

import type { ReactNode } from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import Navbar from "./components/navbar";
import { TokoProvider, useToko } from "./components/toko-provider";

function Cangkang({ children }: { children: ReactNode }) {
  const { toko, base } = useToko();

  return (
    <div className="min-h-screen bg-gray-50 pb-24 text-gray-800 md:pb-0">
      <Navbar />

      <main className="mx-auto max-w-4xl px-3 py-4 md:ml-64 md:max-w-none md:px-8 md:py-8">
        <div className="mx-auto max-w-4xl space-y-3 md:space-y-4">
          {/* Catatan status toko, tampil di semua halaman.
              Status "menunggu" hanya label, tidak menampilkan banner. */}
          {toko.status === "ditolak" && (
            <p className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {toko.alasanTolak} Perbaiki lewat{" "}
                <Link href={`${base}/info`} className="font-semibold underline">
                  menu Info toko
                </Link>
                .
              </span>
            </p>
          )}
          {toko.status === "nonaktif" && (
            <p className="flex items-start gap-2 rounded-xl bg-gray-100 p-3 text-sm text-gray-600">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              Toko ini nonaktif dan tidak tampil ke pembeli.
            </p>
          )}

          {children}
        </div>
      </main>
    </div>
  );
}

function TokoLayoutContent({ children }: { children: ReactNode }) {
  const params = useParams<{ id: string }>();

  return (
    <TokoProvider key={params?.id}>
      <Cangkang>{children}</Cangkang>
    </TokoProvider>
  );
}

export default function TokoLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <TokoLayoutContent>{children}</TokoLayoutContent>
    </Suspense>
  );
}