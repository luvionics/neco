"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  Calculator,
  CheckCircle2,
  ChevronRight,
  Inbox,
  Package,
  Receipt,
  TrendingUp,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { rupiah, useToko } from "./components/toko-context";
import { JENIS_PESANAN } from "./ui";

const BATAS_STOK = 5;
const JEDA_MUAT_ULANG = 30_000; // 30 detik

// ---------- Tipe & pemetaan ke database ----------

type OrderTerbaru = {
  id: string;
  order_number: string;
  order_type: string;
  status: string;
  customer_name: string | null;
  total: number;
  created_at: string;
};

type Ringkas = { order_type: string; status: string; total: number };

/** id jenis di UI -> nilai orders.order_type */
const TIPE_DB: Record<string, string> = {
  antar: "delivery",
  ambil: "pickup",
  meja: "dine_in",
};

/** Kebalikannya, untuk tautan dari pesanan terbaru. */
const JENIS_UI: Record<string, string> = {
  delivery: "antar",
  pickup: "ambil",
  dine_in: "meja",
};

const LABEL_TIPE: Record<string, string> = {
  pos: "Kasir",
  delivery: "Antar",
  pickup: "Ambil",
  dine_in: "Makan di tempat",
};

const STATUS_BARU = "pending";
const STATUS_BERJALAN = ["confirmed", "preparing", "ready", "on_delivery"];
const STATUS_AKTIF = [STATUS_BARU, ...STATUS_BERJALAN];

const STATUS_PESANAN: Record<string, { label: string; kelas: string }> = {
  pending: { label: "Pesanan baru", kelas: "bg-amber-100 text-amber-700" },
  confirmed: { label: "Dikonfirmasi", kelas: "bg-blue-100 text-blue-700" },
  preparing: { label: "Diproses", kelas: "bg-blue-100 text-blue-700" },
  ready: { label: "Siap", kelas: "bg-emerald-100 text-emerald-700" },
  on_delivery: { label: "Sedang diantar", kelas: "bg-indigo-100 text-indigo-700" },
  completed: { label: "Selesai", kelas: "bg-gray-200 text-gray-600" },
  cancelled: { label: "Dibatalkan", kelas: "bg-red-100 text-red-700" },
};

// ---------- Fungsi bantu ----------

function sapaan() {
  const jam = new Date().getHours();
  if (jam < 11) return "Selamat pagi";
  if (jam < 15) return "Selamat siang";
  if (jam < 18) return "Selamat sore";
  return "Selamat malam";
}

function inisial(nama: string) {
  return nama
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((k) => k[0]?.toUpperCase())
    .join("");
}

/** Awal hari ini (00:00 WIB) dalam format ISO. WIB = UTC+7 tanpa DST. */
function awalHariIni() {
  const tgl = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Jakarta",
  });
  return new Date(`${tgl}T00:00:00+07:00`).toISOString();
}

function formatWaktu(iso: string) {
  const d = new Date(iso);
  const tgl = (x: Date) =>
    x.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  const jam = d.toLocaleTimeString("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
  });
  if (tgl(d) === tgl(new Date())) return `Hari ini ${jam}`;
  return `${d.toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
  })} ${jam}`;
}

// ---------- Halaman ----------

export default function RingkasanPage() {
  const { id, base, toko, produk } = useToko();
  const supabase = useMemo(() => createClient(), []);

  const [hariIni, setHariIni] = useState<Ringkas[]>([]);
  const [aktif, setAktif] = useState<Ringkas[]>([]);
  const [terbaru, setTerbaru] = useState<OrderTerbaru[]>([]);
  const [galat, setGalat] = useState("");

  useEffect(() => {
    let batal = false;

    async function muat() {
      const [resHariIni, resAktif, resTerbaru] = await Promise.all([
        supabase
          .from("orders")
          .select("order_type, status, total")
          .eq("shop_id", id)
          .gte("created_at", awalHariIni()),
        supabase
          .from("orders")
          .select("order_type, status, total")
          .eq("shop_id", id)
          .in("status", STATUS_AKTIF),
        supabase
          .from("orders")
          .select(
            "id, order_number, order_type, status, customer_name, total, created_at"
          )
          .eq("shop_id", id)
          .order("created_at", { ascending: false })
          .limit(4),
      ]);

      if (batal) return;

      const gagal = resHariIni.error ?? resAktif.error ?? resTerbaru.error;
      if (gagal) {
        setGalat(gagal.message);
        return;
      }

      const angka = <T extends { total: unknown }>(baris: T[] | null) =>
        (baris ?? []).map((r) => ({ ...r, total: Number(r.total) || 0 }));

      setGalat("");
      setHariIni(angka(resHariIni.data) as Ringkas[]);
      setAktif(angka(resAktif.data) as Ringkas[]);
      setTerbaru(angka(resTerbaru.data) as OrderTerbaru[]);
    }

    void muat();
    const timer = setInterval(() => void muat(), JEDA_MUAT_ULANG);
    return () => {
      batal = true;
      clearInterval(timer);
    };
  }, [supabase, id]);

  // Angka hero
  const selesaiHariIni = hariIni.filter((o) => o.status === "completed");
  const pendapatan = selesaiHariIni.reduce((n, o) => n + o.total, 0);
  const jumlahHariIni = hariIni.filter((o) => o.status !== "cancelled").length;
  const totalBaru = aktif.filter((o) => o.status === STATUS_BARU).length;
  const kasirHariIni = selesaiHariIni.filter((o) => o.order_type === "pos");
  const pendapatanKasir = kasirHariIni.reduce((n, o) => n + o.total, 0);

  // Hanya produk yang melacak stok yang bisa "menipis"
  const stokPerhatian = produk
    .filter((p) => !p.nonStok && p.stok <= BATAS_STOK)
    .sort((a, b) => a.stok - b.stok);

  // Hanya jenis pesanan yang diaktifkan
  const jenisAktif = JENIS_PESANAN.filter((j) => toko[j.id]);

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Header */}
      <header>
        <p className="text-sm text-gray-500">{sapaan()} 👋</p>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">
          Ringkasan
        </h2>
      </header>

      {galat && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600"
        >
          Gagal memuat data pesanan: {galat}
        </p>
      )}

      {/* Hero: pendapatan + statistik */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-500 via-orange-500 to-amber-500 p-5 text-white shadow-lg shadow-orange-500/20 md:p-7">
        {/* dekorasi */}
        <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-16 right-16 h-40 w-40 rounded-full bg-white/10" />

        <div className="relative">
          <div className="flex items-center gap-2 text-sm font-medium text-orange-50">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20">
              <Banknote className="h-4 w-4" />
            </span>
            Pendapatan hari ini
          </div>
          <p className="mt-3 text-3xl font-extrabold tracking-tight md:text-4xl">
            {rupiah(pendapatan)}
          </p>
          <p className="mt-1 flex items-center gap-1 text-xs text-orange-100">
            <TrendingUp className="h-3.5 w-3.5" />
            Dari pesanan yang sudah selesai
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/15 p-3.5 backdrop-blur-sm ring-1 ring-white/20">
              <div className="flex items-center gap-2 text-xs text-orange-50">
                <Receipt className="h-4 w-4" />
                Pesanan baru
              </div>
              <p className="mt-1.5 text-2xl font-bold leading-none">
                {totalBaru}
              </p>
            </div>
            <div className="rounded-2xl bg-white/15 p-3.5 backdrop-blur-sm ring-1 ring-white/20">
              <div className="flex items-center gap-2 text-xs text-orange-50">
                <Package className="h-4 w-4" />
                Pesanan hari ini
              </div>
              <p className="mt-1.5 text-2xl font-bold leading-none">
                {jumlahHariIni}
              </p>
            </div>

            {toko.kasir && (
              <Link
                href={`${base}/kasir`}
                className="col-span-2 flex items-center justify-between rounded-2xl bg-white/15 p-3.5 ring-1 ring-white/20 backdrop-blur-sm transition-colors hover:bg-white/20"
              >
                <div>
                  <div className="flex items-center gap-2 text-xs text-orange-50">
                    <Calculator className="h-4 w-4" />
                    Transaksi kasir hari ini
                  </div>
                  <p className="mt-1.5 text-2xl font-bold leading-none">
                    {kasirHariIni.length}
                  </p>
                </div>
                <p className="text-sm font-semibold">
                  {rupiah(pendapatanKasir)}
                </p>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Pesanan per jenis (hanya yang aktif) */}
      {jenisAktif.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-base font-semibold text-gray-900">
            Pesanan per jenis
          </h3>
          <div className="grid gap-3 md:grid-cols-3">
            {jenisAktif.map(({ id: jenis, label, ikon: Ikon }) => {
              const tipe = TIPE_DB[jenis];
              const baru = aktif.filter(
                (o) => o.order_type === tipe && o.status === STATUS_BARU
              ).length;
              const berjalan = aktif.filter(
                (o) =>
                  o.order_type === tipe && STATUS_BERJALAN.includes(o.status)
              ).length;
              return (
                <Link
                  key={jenis}
                  href={`${base}/pesanan?jenis=${jenis}`}
                  className="group flex items-center gap-3.5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-lg hover:shadow-orange-500/10"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-500 transition-colors group-hover:bg-orange-500 group-hover:text-white">
                    <Ikon className="h-6 w-6" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {label}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {berjalan} sedang berjalan
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-extrabold leading-none text-gray-900">
                      {baru}
                    </p>
                    <p className="mt-1 text-[11px] font-medium text-orange-600">
                      baru
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-orange-500" />
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-2 md:gap-5">
        {/* Pesanan terbaru */}
        <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center justify-between px-5 pb-2 pt-4">
            <h3 className="text-base font-semibold text-gray-900">
              Pesanan terbaru
            </h3>
            <Link
              href={`${base}/pesanan`}
              className="flex items-center gap-0.5 text-xs font-medium text-orange-600 hover:text-orange-700"
            >
              Lihat semua
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {terbaru.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
                <Inbox className="h-6 w-6" />
              </span>
              <p className="text-sm text-gray-500">Belum ada pesanan</p>
            </div>
          ) : (
            <ul className="p-2">
              {terbaru.map((o) => {
                const nama =
                  o.customer_name ||
                  (o.order_type === "pos" ? "Pembeli kasir" : "Pembeli");
                const status = STATUS_PESANAN[o.status] ?? {
                  label: o.status,
                  kelas: "bg-gray-200 text-gray-600",
                };
                const href =
                  o.order_type === "pos"
                    ? `${base}/kasir`
                    : `${base}/pesanan?jenis=${JENIS_UI[o.order_type] ?? ""}`;
                return (
                  <li key={o.id}>
                    <Link
                      href={href}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-gray-50"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-100 to-amber-100 text-xs font-bold text-orange-700">
                        {inisial(nama)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">
                          {nama}
                        </p>
                        <p className="truncate text-xs text-gray-500">
                          {LABEL_TIPE[o.order_type] ?? o.order_type} ·{" "}
                          {formatWaktu(o.created_at)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold text-gray-900">
                          {rupiah(o.total)}
                        </p>
                        <span
                          className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${status.kelas}`}
                        >
                          {status.label}
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Stok perlu perhatian */}
        <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center justify-between px-5 pb-2 pt-4">
            <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-50 text-amber-500">
                <AlertTriangle className="h-4 w-4" />
              </span>
              Stok perlu perhatian
            </h3>
            <Link
              href={`${base}/produk`}
              className="flex items-center gap-0.5 text-xs font-medium text-orange-600 hover:text-orange-700"
            >
              Kelola
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {stokPerhatian.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
                <CheckCircle2 className="h-6 w-6" />
              </span>
              <p className="text-sm text-gray-500">Semua stok aman</p>
            </div>
          ) : (
            <ul className="p-2">
              {stokPerhatian.map((p) => {
                const habis = p.stok === 0;
                const persen = Math.max(
                  6,
                  Math.min(100, (p.stok / BATAS_STOK) * 100)
                );
                return (
                  <li key={p.id}>
                    <Link
                      href={`${base}/produk`}
                      className="block rounded-xl px-3 py-2.5 transition-colors hover:bg-gray-50"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-medium text-gray-900">
                          {p.nama}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                            habis
                              ? "bg-red-50 text-red-600"
                              : "bg-amber-50 text-amber-600"
                          }`}
                        >
                          {habis ? "Habis" : `Sisa ${p.stok}`}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className={`h-full rounded-full transition-all ${
                            habis ? "bg-red-400" : "bg-amber-400"
                          }`}
                          style={{ width: habis ? "100%" : `${persen}%` }}
                        />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}