"use client";

import Link from "next/link";
import { ArrowRight, Calculator, Settings2, Sparkles } from "lucide-react";
import { useToko } from "../toko-context";

export default function KasirPage() {
  const { base, toko } = useToko();

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Header */}
      <header>
        <p className="text-sm text-gray-500">Transaksi langsung di toko</p>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">
          Kasir
        </h2>
      </header>

      {!toko.kasir ? (
        <section className="flex flex-col gap-4 rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-orange-50 p-5 sm:flex-row sm:items-center md:p-6">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-amber-500 shadow-sm ring-1 ring-amber-100">
            <Settings2 className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-gray-900">
              Fitur kasir belum diaktifkan
            </h3>
            <p className="mt-0.5 text-sm text-gray-600">
              Aktifkan saklar kasir di pengaturan Info toko untuk mulai
              menggunakannya.
            </p>
          </div>
          <Link
            href={`${base}/info`}
            className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-orange-500/25 transition-all hover:shadow-lg hover:shadow-orange-500/30"
          >
            Buka Info toko
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </section>
      ) : (
        <section className="relative overflow-hidden rounded-3xl border border-gray-100 bg-white px-6 py-16 text-center shadow-sm md:py-20">
          {/* dekorasi latar */}
          <div className="pointer-events-none absolute -left-12 -top-12 h-40 w-40 rounded-full bg-orange-50" />
          <div className="pointer-events-none absolute -bottom-14 -right-10 h-44 w-44 rounded-full bg-amber-50" />

          <div className="relative mx-auto flex max-w-sm flex-col items-center gap-4">
            <span className="flex h-24 w-24 items-center justify-center rounded-full bg-orange-50 ring-8 ring-orange-50/60">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/30">
                <Calculator className="h-8 w-8" />
              </span>
            </span>

            <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-600 ring-1 ring-orange-100">
              <Sparkles className="h-3.5 w-3.5" />
              Segera hadir
            </span>

            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-gray-900">
                Kasir segera hadir
              </h3>
              <p className="text-sm text-gray-500">
                Fitur ini sedang disiapkan. Kami akan memberi tahu Anda begitu
                sudah bisa digunakan.
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}