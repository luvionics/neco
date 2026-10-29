"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Settings2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToko, type JenisPesanan } from "../components/toko-context";
import { JENIS_PESANAN, SEMBUNYIKAN_SCROLLBAR } from "../ui";
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

/** Pakai jenis dari URL jika aktif, kalau tidak pakai jenis aktif pertama. */
function pilihJenis(nilai: string | null, aktif: JenisPesanan[]): JenisPesanan | null {
  if (nilai && (aktif as string[]).includes(nilai)) return nilai as JenisPesanan;
  return aktif[0] ?? null;
}

function IsiPesanan() {
  const { id, base, toko } = useToko();
  const supabase = useMemo(() => createClient(), []);
  const param = useSearchParams().get("jenis");

  // Hanya jenis pesanan yang diaktifkan toko: satu tab per layanan aktif
  const daftarAktif = JENIS_PESANAN.filter((j) => toko[j.id]);
  const jenis = pilihJenis(param, daftarAktif.map((j) => j.id));

  // Jumlah pesanan aktif per layanan (badge pada tab)
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

  if (!jenis) {
    return (
      <div className="space-y-6 md:space-y-8">
        <header>
          <p className="text-sm text-gray-500">Kelola pesanan masuk</p>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">
            Pesanan
          </h2>
        </header>

        <section className="flex flex-col gap-4 rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-orange-50 p-5 sm:flex-row sm:items-center md:p-6">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-amber-500 shadow-sm ring-1 ring-amber-100">
            <Settings2 className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-gray-900">
              Belum ada layanan pesanan yang aktif
            </h3>
            <p className="mt-0.5 text-sm text-gray-600">
              Aktifkan layanan antar, ambil sendiri, atau pesan di meja di
              pengaturan Info toko.
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
      </div>
    );
  }

  const infoJenis = JENIS_PESANAN.find((j) => j.id === jenis)!;

  return (
    <div className="space-y-6 md:space-y-8">
      <header>
        <p className="text-sm text-gray-500">
          Pesanan {infoJenis.label.toLowerCase()}
        </p>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">
          Pesanan
        </h2>
      </header>

      {/* Tab layanan pembeli: hanya layanan yang diaktifkan */}
      <nav
        aria-label="Jenis pesanan"
        className={`flex gap-1 overflow-x-auto rounded-2xl border border-gray-100 bg-white p-1.5 shadow-sm ${SEMBUNYIKAN_SCROLLBAR}`}
      >
        {daftarAktif.map(({ id: k, label, ikon: Ikon }) => {
          const sel = k === jenis;
          const jumlah = jumlahAktif[k] ?? 0;
          return (
            <Link
              key={k}
              href={`${base}/pesanan?jenis=${k}`}
              scroll={false}
              aria-current={sel ? "page" : undefined}
              className={`flex flex-1 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm transition-all duration-200 ${
                sel
                  ? "bg-gradient-to-r from-orange-500 to-amber-500 font-semibold text-white shadow-md shadow-orange-500/25"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <Ikon className="h-4 w-4 shrink-0" />
              {label}
              {jumlah > 0 && (
                <span
                  className={`rounded-full px-1.5 text-[10px] font-bold leading-4 ${
                    sel ? "bg-white text-orange-600" : "bg-orange-500 text-white"
                  }`}
                >
                  {jumlah > 99 ? "99+" : jumlah}
                  <span className="sr-only"> pesanan aktif</span>
                </span>
              )}
            </Link>
          );
        })}
      </nav>

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