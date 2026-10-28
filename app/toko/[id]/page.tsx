"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ShoppingBag } from "lucide-react";
import InfoToko from "./components/InfoToko";
import ProdukToko from "./components/ProdukToko";
import Keranjang from "./components/Keranjang";

type Tab = "info" | "produk";

const TAB: { kode: Tab; label: string }[] = [
  { kode: "info", label: "Info toko" },
  { kode: "produk", label: "Produk" },
];

export default function HalamanTokoDenganSuspense() {
  // Suspense diperlukan karena Keranjang membaca useSearchParams
  return (
    <Suspense fallback={null}>
      <HalamanDetailToko />
    </Suspense>
  );
}

function HalamanDetailToko() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("info");

  return (
    <div className="min-h-screen bg-gray-50 pb-44 text-gray-800 md:pb-0">
      <main className="mx-auto max-w-6xl space-y-4 px-3 py-4 md:space-y-5 md:px-4 md:py-6">
        {/* Bilah atas: tombol kembali + tab */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/")}
            aria-label="Kembali ke halaman utama"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <div
            role="tablist"
            aria-label="Bagian halaman toko"
            className="flex gap-2"
          >
            {TAB.map((t) => {
              const aktif = tab === t.kode;
              return (
                <button
                  key={t.kode}
                  role="tab"
                  aria-selected={aktif}
                  onClick={() => setTab(t.kode)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                    aktif
                      ? "bg-gray-900 text-white shadow-md shadow-gray-900/20"
                      : "border border-gray-100 bg-white text-gray-600 shadow-sm hover:border-orange-200 hover:text-orange-600"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Kedua tab tetap terpasang (hanya disembunyikan) agar data
            tidak dimuat ulang dan pencarian/pilihan tidak hilang */}
        <div hidden={tab !== "info"}>
          <InfoToko />
        </div>
        <div hidden={tab !== "produk"}>
          <ProdukToko />
        </div>
      </main>

      <footer className="mt-8 hidden border-t border-gray-100 bg-white py-6 text-center text-xs text-gray-500 md:block">
        © 2026 Necoku. Belanja dari toko sekitarmu.
      </footer>

      {/* Bar keranjang, lembar keranjang, dan status pesanan (hanya di tab Produk) */}
      <div hidden={tab !== "produk"}>
        <Keranjang />
      </div>

      {/* Tombol melayang di tab Info */}
      {tab === "info" && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-3 md:bottom-6">
          <button
            onClick={() => {
              setTab("produk");
              window.scrollTo({ top: 0 });
            }}
            className="pointer-events-auto flex w-full max-w-lg items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-red-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/30 transition-all active:scale-[0.99]"
          >
            <ShoppingBag className="h-5 w-5" />
            Lihat Produk
          </button>
        </div>
      )}
    </div>
  );
}