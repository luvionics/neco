"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  BarChart3,
  Calculator,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  Inbox,
  Package,
  Receipt,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToko } from "./components/toko-provider";
import { rupiah, useProdukToko } from "./components/toko";
import { JENIS_PESANAN } from "./ui";

const BATAS_STOK = 5;
const JEDA_MUAT_ULANG = 60_000; // 60 detik
const WIB = 7 * 3600_000; // WIB = UTC+7 tanpa DST

// ---------- Tipe hasil fungsi database ringkasan_toko ----------

type OrderTerbaru = {
  id: string;
  order_number: string;
  order_type: string;
  status: string;
  customer_name: string | null;
  total: number;
  created_at: string;
};

type HasilRingkasan = {
  hari_ini: {
    pendapatan: number;
    kemarin: number;
    pesanan: number;
    kasir_jumlah: number;
    kasir_pendapatan: number;
  };
  rentang: { total: number; jumlah: number; diskon: number };
  harian: { tgl: string; nilai: number; jumlah: number }[];
  per_jenis: { tipe: string; nilai: number }[];
  per_metode: { metode: string; nilai: number }[];
  per_jam: number[];
  terlaris: { nama: string; qty: number }[];
  aktif: { tipe: string; status: string; n: number }[];
  terbaru: OrderTerbaru[];
};

const KOSONG: HasilRingkasan = {
  hari_ini: {
    pendapatan: 0,
    kemarin: 0,
    pesanan: 0,
    kasir_jumlah: 0,
    kasir_pendapatan: 0,
  },
  rentang: { total: 0, jumlah: 0, diskon: 0 },
  harian: [],
  per_jenis: [],
  per_metode: [],
  per_jam: Array.from({ length: 24 }, () => 0),
  terlaris: [],
  aktif: [],
  terbaru: [],
};

// ---------- Pemetaan nilai database ----------

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

const WARNA_TIPE: Record<string, string> = {
  pos: "#f97316",
  delivery: "#6366f1",
  pickup: "#10b981",
  dine_in: "#f59e0b",
};

const LABEL_METODE: Record<string, string> = {
  cash: "Tunai",
  qris: "QRIS",
  transfer: "Transfer",
};

const WARNA_METODE: Record<string, string> = {
  cash: "#10b981",
  qris: "#f97316",
  transfer: "#6366f1",
};

const STATUS_BARU = "pending";
const STATUS_BERJALAN = ["confirmed", "preparing", "ready", "on_delivery"];

const STATUS_PESANAN: Record<string, { label: string; kelas: string }> = {
  pending: { label: "Pesanan baru", kelas: "bg-amber-100 text-amber-700" },
  confirmed: { label: "Dikonfirmasi", kelas: "bg-blue-100 text-blue-700" },
  preparing: { label: "Diproses", kelas: "bg-blue-100 text-blue-700" },
  ready: { label: "Siap", kelas: "bg-emerald-100 text-emerald-700" },
  on_delivery: { label: "Sedang diantar", kelas: "bg-indigo-100 text-indigo-700" },
  completed: { label: "Selesai", kelas: "bg-gray-200 text-gray-600" },
  cancelled: { label: "Dibatalkan", kelas: "bg-red-100 text-red-700" },
};

const PILIHAN_RENTANG = [7, 14, 30] as const;
type Rentang = (typeof PILIHAN_RENTANG)[number];

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

/** Tanggal (YYYY-MM-DD) menurut WIB. */
const tglWib = (waktu: string | number | Date) =>
  new Date(new Date(waktu).getTime() + WIB).toISOString().slice(0, 10);

/** Angka ringkas untuk sumbu grafik, mis. 1,5 jt / 250 rb. */
function ringkas(n: number) {
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1).replace(".0", "")} jt`;
  if (n >= 1_000) return `Rp ${Math.round(n / 1_000)} rb`;
  return `Rp ${n}`;
}

function formatWaktu(iso: string) {
  const d = new Date(iso);
  const jam = d.toLocaleTimeString("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
  });
  if (tglWib(d) === tglWib(new Date())) return `Hari ini ${jam}`;
  return `${d.toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
  })} ${jam}`;
}

function labelTanggal(tgl: string, opsi: Intl.DateTimeFormatOptions) {
  return new Date(`${tgl}T00:00:00Z`).toLocaleDateString("id-ID", {
    timeZone: "UTC",
    ...opsi,
  });
}

// ---------- Komponen grafik ----------

function Kartu({
  judul,
  ikon,
  aksi,
  children,
}: {
  judul: string;
  ikon: ReactNode;
  aksi?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
        <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-50 text-orange-500">
            {ikon}
          </span>
          {judul}
        </h3>
        {aksi}
      </div>
      <div className="px-5 pb-5 pt-1">{children}</div>
    </section>
  );
}

function Rangka({ tinggi }: { tinggi: number }) {
  return (
    <div
      className="animate-pulse rounded-xl bg-gray-100"
      style={{ height: tinggi }}
    />
  );
}

function KosongGrafik({ teks }: { teks: string }) {
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-400">
        <Inbox className="h-5 w-5" />
      </span>
      <p className="text-sm text-gray-500">{teks}</p>
    </div>
  );
}

type TitikBatang = { label: string; nilai: number; tip: string };

function GrafikBatang({
  data,
  format,
  labelSetiap = 1,
  sorot = null,
  tinggi = 176,
}: {
  data: TitikBatang[];
  format: (n: number) => string;
  labelSetiap?: number;
  /** Indeks batang yang diberi warna tegas (mis. hari ini). */
  sorot?: number | null;
  tinggi?: number;
}) {
  const [pilih, setPilih] = useState<number | null>(null);
  const maks = Math.max(...data.map((d) => d.nilai), 0);
  const skala = maks > 0 ? maks : 1;
  const terpilih = pilih !== null ? data[pilih] : null;

  return (
    <div>
      <p className="mb-2 h-4 truncate text-xs font-medium text-gray-600">
        {terpilih ? terpilih.tip : "Ketuk atau arahkan ke batang untuk melihat detail"}
      </p>

      <div className="relative" style={{ height: tinggi }}>
        {/* garis bantu */}
        {[0, 50, 100].map((p) => (
          <div
            key={p}
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-gray-100"
            style={{ top: `${p}%` }}
          />
        ))}
        <span className="pointer-events-none absolute left-0 top-0 -translate-y-1/2 bg-white pr-1 text-[10px] text-gray-400">
          {format(maks)}
        </span>

        <div
          className="relative flex h-full items-end gap-[3px] pl-0.5"
          onMouseLeave={() => setPilih(null)}
        >
          {data.map((d, i) => {
            const tinggiPersen =
              d.nilai > 0 ? Math.max((d.nilai / skala) * 100, 3) : 0;
            const aktif = pilih === i;
            const tegas = sorot === i;
            return (
              <button
                key={i}
                type="button"
                aria-label={d.tip}
                onClick={() => setPilih(aktif ? null : i)}
                onMouseEnter={() => setPilih(i)}
                onFocus={() => setPilih(i)}
                className="flex h-full min-w-0 flex-1 items-end outline-none"
              >
                <div
                  className={`w-full rounded-t-md transition-all ${
                    aktif
                      ? "bg-orange-600"
                      : tegas
                      ? "bg-orange-500"
                      : "bg-orange-200 hover:bg-orange-400"
                  }`}
                  style={{ height: `${tinggiPersen}%` }}
                />
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-1.5 flex gap-[3px] pl-0.5">
        {data.map((d, i) => (
          <span
            key={i}
            className="min-w-0 flex-1 whitespace-nowrap text-center text-[10px] text-gray-400"
          >
            {(data.length - 1 - i) % labelSetiap === 0 ? d.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

type IrisDonat = { label: string; nilai: number; warna: string };

function GrafikDonat({
  data,
  pusat,
  subpusat,
  format,
}: {
  data: IrisDonat[];
  pusat: string;
  subpusat: string;
  format: (n: number) => string;
}) {
  const total = data.reduce((n, d) => n + d.nilai, 0);
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="relative h-36 w-36 shrink-0">
        <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-label={subpusat}>
          <circle cx="50" cy="50" r="38" fill="none" stroke="#f3f4f6" strokeWidth="14" />
          {data.map((d, index) => {
            const persen = (d.nilai / total) * 100;
            const awal = data
              .slice(0, index)
              .reduce((jumlah, item) => jumlah + (item.nilai / total) * 100, 0);
            return (
              <circle
                key={d.label}
                cx="50"
                cy="50"
                r="38"
                fill="none"
                stroke={d.warna}
                strokeWidth="14"
                pathLength={100}
                strokeDasharray={`${persen} ${100 - persen}`}
                strokeDashoffset={-awal}
                transform="rotate(-90 50 50)"
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-base font-extrabold leading-tight text-gray-900">
            {pusat}
          </span>
          <span className="text-[10px] text-gray-500">{subpusat}</span>
        </div>
      </div>

      <ul className="w-full min-w-0 flex-1 space-y-2">
        {data.map((d) => (
          <li key={d.label} className="flex items-center gap-2.5 text-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: d.warna }}
            />
            <span className="min-w-0 flex-1 truncate text-gray-700">
              {d.label}
            </span>
            <span className="shrink-0 font-semibold text-gray-900">
              {format(d.nilai)}
            </span>
            <span className="w-10 shrink-0 text-right text-xs text-gray-400">
              {Math.round((d.nilai / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Halaman ----------

export default function RingkasanPage() {
  const { id, base, toko } = useToko();
  const { produk } = useProdukToko(id);
  const supabase = useMemo(() => createClient(), []);

  const [hasil, setHasil] = useState<HasilRingkasan | null>(null);
  const [galat, setGalat] = useState("");
  const [hari, setHari] = useState<Rentang>(7);

  const siap = hasil !== null;

  // Seluruh angka dihitung di database (fungsi ringkasan_toko)
  useEffect(() => {
    let batal = false;

    async function muat() {
      const { data, error } = await supabase.rpc("ringkasan_toko", {
        p_shop_id: id,
        p_hari: hari,
      });
      if (batal) return;

      if (error) {
        setGalat(error.message);
        // Biarkan halaman tampil (kosong) agar galat terlihat, bukan rangka terus
        setHasil((h) => h ?? KOSONG);
        return;
      }
      setGalat("");
      setHasil(data as HasilRingkasan);
    }

    void muat();
    const timer = setInterval(() => void muat(), JEDA_MUAT_ULANG);
    return () => {
      batal = true;
      clearInterval(timer);
    };
  }, [supabase, id, hari]);

  // ---------- Perhitungan tampilan ----------

  const d = hasil ?? KOSONG;

  const analisis = useMemo(() => {
    const n = d.harian.length;

    const harian: TitikBatang[] = d.harian.map((h) => ({
      label:
        n <= 7
          ? labelTanggal(h.tgl, { weekday: "short" })
          : String(Number(h.tgl.slice(8))),
      nilai: Number(h.nilai) || 0,
      tip: `${labelTanggal(h.tgl, {
        weekday: "short",
        day: "numeric",
        month: "short",
      })}: ${rupiah(Number(h.nilai) || 0)} · ${h.jumlah} pesanan`,
    }));

    const donatJenis: IrisDonat[] = d.per_jenis
      .map((j) => ({
        label: LABEL_TIPE[j.tipe] ?? j.tipe,
        nilai: Number(j.nilai) || 0,
        warna: WARNA_TIPE[j.tipe] ?? "#9ca3af",
      }))
      .filter((x) => x.nilai > 0)
      .sort((a, b) => b.nilai - a.nilai);

    const donatMetode: IrisDonat[] = d.per_metode
      .map((m) => ({
        label: LABEL_METODE[m.metode] ?? m.metode,
        nilai: Number(m.nilai) || 0,
        warna: WARNA_METODE[m.metode] ?? "#9ca3af",
      }))
      .filter((x) => x.nilai > 0)
      .sort((a, b) => b.nilai - a.nilai);

    const jam: TitikBatang[] = d.per_jam.map((v, j) => ({
      label: String(j),
      nilai: Number(v) || 0,
      tip: `Jam ${String(j).padStart(2, "0")}.00: ${Number(v) || 0} pesanan`,
    }));
    const maksJam = Math.max(...jam.map((x) => x.nilai), 0);
    const jamTersibuk = maksJam > 0 ? jam.findIndex((x) => x.nilai === maksJam) : null;

    return {
      jumlahHari: n,
      harian,
      donatJenis,
      donatMetode,
      totalMetode: donatMetode.reduce((s, x) => s + x.nilai, 0),
      jam,
      jamTersibuk,
      maksJam,
    };
  }, [d]);

  const pendapatan = Number(d.hari_ini.pendapatan) || 0;
  const kemarin = Number(d.hari_ini.kemarin) || 0;
  const totalRentang = Number(d.rentang.total) || 0;
  const jumlahSelesai = Number(d.rentang.jumlah) || 0;
  const diskonRentang = Number(d.rentang.diskon) || 0;
  const rataRata = jumlahSelesai ? Math.round(totalRentang / jumlahSelesai) : 0;

  const totalBaru = d.aktif
    .filter((a) => a.status === STATUS_BARU)
    .reduce((s, a) => s + Number(a.n), 0);

  // Perubahan dibanding kemarin (disembunyikan jika kemarin belum ada pendapatan)
  const perubahan =
    kemarin > 0 ? Math.round(((pendapatan - kemarin) / kemarin) * 100) : null;

  // Hanya produk yang melacak stok yang bisa "menipis"
  const stokPerhatian = produk
    .filter((p) => !p.nonStok && p.stok <= BATAS_STOK)
    .sort((a, b) => a.stok - b.stok);

  // Hanya jenis pesanan yang diaktifkan
  const jenisAktif = JENIS_PESANAN.filter((j) => toko[j.id]);

  const rangkuman = [
    { label: "Pendapatan", nilai: rupiah(totalRentang) },
    { label: "Pesanan selesai", nilai: String(jumlahSelesai) },
    { label: "Rata-rata/pesanan", nilai: rupiah(rataRata) },
    ...(diskonRentang > 0
      ? [{ label: "Total diskon", nilai: rupiah(diskonRentang) }]
      : []),
  ];

  const labelSetiap = analisis.jumlahHari <= 7 ? 1 : analisis.jumlahHari <= 14 ? 2 : 5;

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
          Gagal memuat ringkasan: {galat}
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
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-orange-100">
            <span className="flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" />
              Dari pesanan yang sudah selesai
            </span>
            {perubahan !== null && (
              <span className="flex items-center gap-0.5 rounded-full bg-white/20 px-2 py-0.5 font-semibold text-white">
                {perubahan >= 0 ? (
                  <ArrowUpRight className="h-3 w-3" />
                ) : (
                  <ArrowDownRight className="h-3 w-3" />
                )}
                {Math.abs(perubahan)}% dari kemarin
              </span>
            )}
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
                {Number(d.hari_ini.pesanan) || 0}
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
                    {Number(d.hari_ini.kasir_jumlah) || 0}
                  </p>
                </div>
                <p className="text-sm font-semibold">
                  {rupiah(Number(d.hari_ini.kasir_pendapatan) || 0)}
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
              const baru = d.aktif
                .filter((a) => a.tipe === tipe && a.status === STATUS_BARU)
                .reduce((s, a) => s + Number(a.n), 0);
              const berjalan = d.aktif
                .filter(
                  (a) => a.tipe === tipe && STATUS_BERJALAN.includes(a.status)
                )
                .reduce((s, a) => s + Number(a.n), 0);
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

      {/* Grafik penjualan */}
      <Kartu
        judul="Penjualan"
        ikon={<BarChart3 className="h-4 w-4" />}
        aksi={
          <div
            role="radiogroup"
            aria-label="Rentang waktu"
            className="flex rounded-full bg-gray-100 p-0.5"
          >
            {PILIHAN_RENTANG.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={hari === r}
                onClick={() => setHari(r)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  hari === r
                    ? "bg-white text-orange-600 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {r} hari
              </button>
            ))}
          </div>
        }
      >
        {!siap ? (
          <Rangka tinggi={260} />
        ) : (
          <div className="space-y-5">
            <dl
              className={`grid gap-2.5 ${
                rangkuman.length > 3 ? "grid-cols-2 md:grid-cols-4" : "grid-cols-3"
              }`}
            >
              {rangkuman.map((r) => (
                <div key={r.label} className="rounded-xl bg-gray-50 px-3 py-2.5">
                  <dt className="text-[11px] text-gray-500">{r.label}</dt>
                  <dd className="mt-0.5 truncate text-sm font-bold text-gray-900">
                    {r.nilai}
                  </dd>
                </div>
              ))}
            </dl>

            {jumlahSelesai === 0 ? (
              <KosongGrafik
                teks={`Belum ada penjualan dalam ${analisis.jumlahHari || hari} hari terakhir`}
              />
            ) : (
              <GrafikBatang
                // key agar pilihan batang direset saat rentang berganti
                key={analisis.jumlahHari}
                data={analisis.harian}
                format={ringkas}
                labelSetiap={labelSetiap}
                sorot={analisis.harian.length - 1}
              />
            )}
          </div>
        )}
      </Kartu>

      {/* Diagram: jenis pesanan & metode pembayaran */}
      <div className="grid gap-4 md:grid-cols-2 md:gap-5">
        <Kartu judul="Pendapatan per jenis" ikon={<Receipt className="h-4 w-4" />}>
          {!siap ? (
            <Rangka tinggi={150} />
          ) : analisis.donatJenis.length === 0 ? (
            <KosongGrafik teks="Belum ada data penjualan" />
          ) : (
            <GrafikDonat
              data={analisis.donatJenis}
              pusat={ringkas(totalRentang)}
              subpusat={`${analisis.jumlahHari} hari`}
              format={ringkas}
            />
          )}
        </Kartu>

        <Kartu judul="Metode pembayaran" ikon={<CreditCard className="h-4 w-4" />}>
          {!siap ? (
            <Rangka tinggi={150} />
          ) : analisis.donatMetode.length === 0 ? (
            <KosongGrafik teks="Belum ada data pembayaran" />
          ) : (
            <GrafikDonat
              data={analisis.donatMetode}
              pusat={ringkas(analisis.totalMetode)}
              subpusat={`${analisis.jumlahHari} hari`}
              format={ringkas}
            />
          )}
        </Kartu>
      </div>

      {/* Jam tersibuk & produk terlaris */}
      <div className="grid gap-4 md:grid-cols-2 md:gap-5">
        <Kartu judul="Jam tersibuk" ikon={<Clock className="h-4 w-4" />}>
          {!siap ? (
            <Rangka tinggi={190} />
          ) : analisis.jamTersibuk === null ? (
            <KosongGrafik teks="Belum ada pesanan" />
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                Paling ramai sekitar jam{" "}
                <span className="font-semibold text-gray-900">
                  {String(analisis.jamTersibuk).padStart(2, "0")}.00
                </span>{" "}
                ({analisis.maksJam} pesanan dalam {analisis.jumlahHari} hari)
              </p>
              <GrafikBatang
                key={analisis.jumlahHari}
                data={analisis.jam}
                format={(n) => `${n}`}
                labelSetiap={3}
                sorot={analisis.jamTersibuk}
                tinggi={140}
              />
            </div>
          )}
        </Kartu>

        <Kartu judul="Produk terlaris" ikon={<Trophy className="h-4 w-4" />}>
          {!siap ? (
            <Rangka tinggi={190} />
          ) : d.terlaris.length === 0 ? (
            <KosongGrafik teks="Belum ada produk terjual" />
          ) : (
            <ol className="space-y-3.5">
              {d.terlaris.map((p, i) => (
                <li key={p.nama}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                          i === 0
                            ? "bg-amber-100 text-amber-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <span className="truncate font-medium text-gray-900">
                        {p.nama}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-gray-600">
                      {Number(p.qty)} terjual
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-400"
                      style={{
                        width: `${(Number(p.qty) / Number(d.terlaris[0].qty)) * 100}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Kartu>
      </div>

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

          {d.terbaru.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
                <Inbox className="h-6 w-6" />
              </span>
              <p className="text-sm text-gray-500">Belum ada pesanan</p>
            </div>
          ) : (
            <ul className="p-2">
              {d.terbaru.map((o) => {
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
                          {rupiah(Number(o.total) || 0)}
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