"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, ChevronLeft, ChevronRight, Settings2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToko } from "../components/toko-provider";
import type { JenisPesanan } from "../components/toko";
import { JENIS_PESANAN } from "../ui";
import PesanAntar from "./components/PesanAntar";
import AmbilSendiri from "./components/AmbilSendiri";
import PesanDariMeja from "./components/PesanDariMeja";

// orders.order_type <-> jenis layanan di aplikasi
const DARI_TIPE: Record<string, JenisPesanan> = {
  delivery: "antar",
  pickup: "ambil",
  dine_in: "meja",
};

// Status yang dianggap pesanan aktif (belum selesai atau dibatalkan)
const STATUS_AKTIF = ["pending", "confirmed", "preparing", "ready", "on_delivery"];

/**
 * - Satu layanan aktif: langsung dipakai (tanpa daftar).
 * - Lebih dari satu: pakai jenis dari URL jika valid, kalau tidak null
 *   (artinya tampilkan daftar layanan).
 * - Tidak ada layanan aktif: null.
 */
function pilihJenis(nilai: string | null, aktif: JenisPesanan[]): JenisPesanan | null {
  if (aktif.length === 0) return null;
  if (aktif.length === 1) return aktif[0];
  if (nilai && (aktif as string[]).includes(nilai)) return nilai as JenisPesanan;
  return null;
}

const formatJumlah = (n: number) => (n > 99 ? "99+" : String(n));

function IsiPesanan() {
  const { id, base, toko } = useToko();
  const supabase = useMemo(() => createClient(), []);
  const param = useSearchParams().get("jenis");

  // Hanya jenis pesanan yang diaktifkan toko
  const daftarAktif = JENIS_PESANAN.filter((j) => toko[j.id]);
  const jenis = pilihJenis(param, daftarAktif.map((j) => j.id));
  const banyakLayanan = daftarAktif.length > 1;

  // Jumlah pesanan aktif per layanan
  const [jumlahAktif, setJumlahAktif] = useState<Record<string, number>>({
    antar: 0,
    ambil: 0,
    meja: 0,
  });

  const hitung = useCallback(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select("order_type")
      .eq("shop_id", id)
      .in("status", STATUS_AKTIF);
    if (error) return; // pertahankan angka sebelumnya

    const hasil: Record<string, number> = { antar: 0, ambil: 0, meja: 0 };
    ((data ?? []) as { order_type: string }[]).forEach((r) => {
      const k = DARI_TIPE[r.order_type];
      if (k) hasil[k] += 1;
    });
    setJumlahAktif(hasil);
  }, [supabase, id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void hitung(), 0);
    return () => window.clearTimeout(timer);
  }, [hitung]);

  // Realtime, event dari komponen layanan, dan polling cadangan
  useEffect(() => {
    const kanal = supabase
      .channel(`pesanan-badge-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `shop_id=eq.${id}` },
        () => void hitung()
      )
      .subscribe();

    const saatBerubah = () => void hitung();
    window.addEventListener("pesanan:berubah", saatBerubah);

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void hitung();
    }, 60000);

    return () => {
      void supabase.removeChannel(kanal);
      window.removeEventListener("pesanan:berubah", saatBerubah);
      window.clearInterval(timer);
    };
  }, [supabase, id, hitung]);

  const totalAktif = daftarAktif.reduce((n, j) => n + (jumlahAktif[j.id] ?? 0), 0);

  // 1) Tidak ada layanan aktif
  if (daftarAktif.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">
            Pesanan
          </h2>
          <p className="mt-1 text-sm text-gray-500">Kelola pesanan masuk</p>
        </header>

        <section className="flex flex-col items-center rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-orange-50 text-orange-500">
            <Settings2 className="h-7 w-7" />
          </span>
          <h3 className="mt-4 text-base font-semibold text-gray-900">
            Belum ada layanan yang aktif
          </h3>
          <p className="mt-1 max-w-sm text-sm text-gray-500">
            Aktifkan antar, ambil sendiri, atau pesan di meja lewat pengaturan
            Info toko.
          </p>
          <Link
            href={`${base}/info`}
            className="group mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 sm:w-auto"
          >
            Buka Info toko
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </section>
      </div>
    );
  }

  // 2) Lebih dari satu layanan dan belum ada yang dipilih: daftar layanan
  if (!jenis) {
    return (
      <div className="space-y-6">
        <header>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">
            Pesanan
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {totalAktif > 0
              ? `${formatJumlah(totalAktif)} pesanan aktif sekarang`
              : "Tidak ada pesanan aktif"}
          </p>
        </header>

        <nav
          aria-label="Layanan pesanan"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {daftarAktif.map(({ id: k, label, ikon: Ikon }) => {
            const jumlah = jumlahAktif[k] ?? 0;
            const adaPesanan = jumlah > 0;

            return (
              <Link
                key={k}
                href={`${base}/pesanan?jenis=${k}`}
                className="group flex min-h-[76px] items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 transition-all hover:border-orange-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 active:scale-[0.99]"
              >
                <span
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                    adaPesanan
                      ? "bg-orange-500 text-white"
                      : "bg-orange-50 text-orange-500"
                  }`}
                >
                  <Ikon className="h-6 w-6" />
                </span>

                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-base font-semibold text-gray-900">
                    {label}
                  </h3>
                  <p
                    className={`text-sm ${
                      adaPesanan ? "font-medium text-orange-600" : "text-gray-500"
                    }`}
                  >
                    {adaPesanan
                      ? `${formatJumlah(jumlah)} pesanan aktif`
                      : "Tidak ada pesanan aktif"}
                  </p>
                </div>

                <ChevronRight className="h-5 w-5 shrink-0 text-gray-300 transition-all group-hover:translate-x-0.5 group-hover:text-orange-500" />
              </Link>
            );
          })}
        </nav>
      </div>
    );
  }

  // 3) Isi layanan: dari daftar yang dipilih, atau langsung jika hanya satu layanan
  const infoJenis = JENIS_PESANAN.find((j) => j.id === jenis)!;
  const jumlahJenis = jumlahAktif[jenis] ?? 0;

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        {banyakLayanan && (
          <Link
            href={`${base}/pesanan`}
            aria-label="Kembali ke semua layanan"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition-colors hover:border-orange-300 hover:text-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 active:scale-95"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
        )}

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-bold tracking-tight text-gray-900 md:text-2xl">
            {infoJenis.label}
          </h2>
          <p className="text-sm text-gray-500">
            {jumlahJenis > 0
              ? `${formatJumlah(jumlahJenis)} pesanan aktif`
              : "Tidak ada pesanan aktif"}
          </p>
        </div>
      </header>

      {jenis === "antar" && <PesanAntar />}
      {jenis === "ambil" && <AmbilSendiri />}
      {jenis === "meja" && <PesanDariMeja />}
    </div>
  );
}

// useSearchParams wajib dibungkus Suspense agar build tidak error
export default function PesananPage() {
  return (
    <Suspense fallback={null}>
      <IsiPesanan />
    </Suspense>
  );
}