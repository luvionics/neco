"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  BadgeCheck,
  Bike,
  Calculator,
  ChartColumn,
  Clock,
  ExternalLink,
  Globe,
  Info,
  MapPin,
  Package,
  Plus,
  Receipt,
  Settings,
  Star,
  Store,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// ---------- Tipe ----------

type Jam = { open: string; close: string } | null;

type Toko = {
  id: string;
  slug: string;
  nama: string;
  area: string;
  kota: string;
  status: string;
  buka: boolean; // shops.is_open (diatur otomatis)
  terverifikasi: boolean;
  jam: Record<string, Jam>;
  rating: number;
  jumlahRating: number;
  totalJual: number;
  logo: string;
  antar: boolean;
  ambil: boolean;
  makan: boolean;
  kasir: boolean;
};

type StatToko = { produk: number; pesananBaru: number };

// ---------- Konstanta ----------

// Sesuaikan dengan kolom tabel orders Anda
const KOLOM_TOTAL_PESANAN = "total_amount";
const STATUS_PESANAN_SELESAI = "completed";

const STATUS_INFO: Record<string, { label: string; kelas: string }> = {
  active: { label: "Aktif", kelas: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" },
  pending: { label: "Diproses", kelas: "bg-amber-50 text-amber-700 ring-1 ring-amber-100" },
  suspended: { label: "Ditangguhkan", kelas: "bg-red-50 text-red-700 ring-1 ring-red-100" },
  closed: { label: "Ditutup", kelas: "bg-gray-100 text-gray-600 ring-1 ring-gray-200" },
};

const HARI_KUNCI = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const TOMBOL_UTAMA =
  "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/25 transition-all hover:shadow-lg hover:shadow-orange-500/30 active:scale-[0.98]";

const KEUNTUNGAN = [
  { ikon: Globe, judul: "Dilihat warga sekitar", ket: "Produk Anda tampil di internet dan mudah ditemukan tetangga." },
  { ikon: Calculator, judul: "Kasir", ket: "Catat penjualan langsung di toko dengan mudah." },
  { ikon: ChartColumn, judul: "Ringkasan", ket: "Pantau penjualan dan perkembangan toko dalam satu layar." },
  { ikon: Receipt, judul: "Pesanan online", ket: "Terima pesanan dari pembeli kapan saja." },
];

// ---------- Fungsi bantu ----------

const teks = (v: unknown) => (typeof v === "string" ? v : "");
const angka = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

function hariIni() {
  const nama = new Date()
    .toLocaleDateString("en-US", { weekday: "short", timeZone: "Asia/Jakarta" })
    .toLowerCase();
  return HARI_KUNCI.find((h) => h === nama.slice(0, 3).toLowerCase()) ?? "mon";
}

const formatJam = (v: string) => v.replace(":", ".");

function jamHariIni(jam: Record<string, Jam>) {
  const j = jam[hariIni()];
  if (!j || !j.open || !j.close) return "Libur hari ini";
  return `${formatJam(j.open)} - ${formatJam(j.close)}`;
}

function dariDb(r: Record<string, unknown>): Toko {
  const oh =
    r.opening_hours && typeof r.opening_hours === "object"
      ? (r.opening_hours as Record<string, Jam>)
      : {};
  return {
    id: teks(r.id),
    slug: teks(r.slug),
    nama: teks(r.name),
    area: teks(r.village),
    kota: teks(r.city),
    status: teks(r.status),
    buka: r.is_open === true,
    terverifikasi: r.is_verified === true,
    jam: oh,
    rating: angka(r.rating_avg),
    jumlahRating: angka(r.rating_count),
    totalJual: angka(r.total_sales),
    logo: teks(r.logo_url),
    antar: r.delivery_enabled === true,
    ambil: r.pickup_enabled === true,
    makan: r.dine_in_enabled === true,
    kasir: r.pos_enabled === true,
  };
}

// ---------- Komponen kecil ----------

function Kerangka() {
  return (
    <div className="space-y-5" aria-busy="true">
      <span className="sr-only">Memuat toko</span>
      <div className="h-40 animate-pulse rounded-3xl bg-gray-200/70" />
      <div className="h-48 animate-pulse rounded-2xl bg-gray-200/70" />
      <div className="h-48 animate-pulse rounded-2xl bg-gray-200/70" />
    </div>
  );
}

function KartuToko({ toko, stat }: { toko: Toko; stat: StatToko }) {
  const aktif = toko.status === "active";
  const info = STATUS_INFO[toko.status] ?? STATUS_INFO.closed;
  const lokasi = [toko.area, toko.kota].filter(Boolean).join(", ");

  const layanan = [
    toko.antar && { ikon: Bike, label: "Antar" },
    toko.ambil && { ikon: Store, label: "Ambil di toko" },
    toko.makan && { ikon: UtensilsCrossed, label: "Makan di tempat" },
    toko.kasir && { ikon: Calculator, label: "Kasir" },
  ].filter(Boolean) as { ikon: React.ComponentType<{ className?: string }>; label: string }[];

  return (
    <article
      className={`flex flex-col gap-3.5 rounded-2xl border bg-white p-4 shadow-sm md:p-5 ${
        stat.pesananBaru > 0 ? "border-orange-200 ring-1 ring-orange-100" : "border-gray-100"
      }`}
    >
      <div className="flex gap-3.5">
        {toko.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={toko.logo}
            alt=""
            className={`h-16 w-16 shrink-0 rounded-2xl object-cover shadow-sm md:h-[72px] md:w-[72px] ${
              aktif ? "" : "opacity-60 grayscale"
            }`}
          />
        ) : (
          <div
            className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-sm md:h-[72px] md:w-[72px] ${
              aktif ? "" : "opacity-60 grayscale"
            }`}
          >
            <Store className="h-7 w-7 text-white md:h-8 md:w-8" />
          </div>
        )}

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex min-w-0 items-center gap-1">
            <h2 className="truncate text-sm font-bold text-gray-900 md:text-base">{toko.nama}</h2>
            {toko.terverifikasi && (
              <BadgeCheck className="h-4 w-4 shrink-0 text-sky-500" aria-label="Terverifikasi" />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${info.kelas}`}>
              {info.label}
            </span>
            {aktif && (
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500">
                <span
                  className={`h-2 w-2 rounded-full ${toko.buka ? "bg-emerald-500" : "bg-gray-400"}`}
                />
                {toko.buka ? "Buka sekarang" : "Tutup"}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
            {lokasi && (
              <span className="flex min-w-0 items-center gap-1">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-orange-500" />
                <span className="truncate">{lokasi}</span>
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              {jamHariIni(toko.jam)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
        <span className="flex items-center gap-1 rounded-xl bg-gray-50 px-2.5 py-1.5">
          <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
          <b className="text-gray-800">{toko.jumlahRating > 0 ? toko.rating.toFixed(1) : "-"}</b>
          {toko.jumlahRating > 0 && <span className="text-gray-400">({toko.jumlahRating})</span>}
        </span>
        <span className="flex items-center gap-1 rounded-xl bg-gray-50 px-2.5 py-1.5">
          <Package className="h-3.5 w-3.5 text-gray-400" />
          {stat.produk} produk
        </span>
        <span className="flex items-center gap-1 rounded-xl bg-gray-50 px-2.5 py-1.5">
          <Receipt className="h-3.5 w-3.5 text-gray-400" />
          {toko.totalJual} terjual
        </span>
        {stat.pesananBaru > 0 && (
          <span className="ml-auto rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-2.5 py-1 font-semibold text-white shadow-sm shadow-orange-500/25">
            {stat.pesananBaru} pesanan baru
          </span>
        )}
      </div>

      {layanan.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {layanan.map(({ ikon: Ikon, label }) => (
            <span
              key={label}
              className="flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-medium text-orange-700 ring-1 ring-orange-100"
            >
              <Ikon className="h-3 w-3" />
              {label}
            </span>
          ))}
        </div>
      )}

      {toko.status === "suspended" && (
        <p className="flex items-start gap-2.5 rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          Toko ini sedang ditangguhkan dan tidak tampil untuk pembeli. Hubungi kami lewat
          Pusat bantuan untuk informasi lebih lanjut.
        </p>
      )}
      {toko.status === "closed" && (
        <p className="flex items-start gap-2.5 rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          Toko ini sedang ditutup dan tidak tampil untuk pembeli.
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3.5">
        {aktif && (
          <a
            href={`/toko/${toko.id}`}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-medium text-gray-700 transition-colors hover:border-orange-200 hover:bg-orange-50/50 hover:text-orange-600"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Lihat
          </a>
        )}
        <a
          href={`/owner/toko/${toko.id}`}
          className={`ml-auto flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold ${TOMBOL_UTAMA}`}
        >
          <Settings className="h-3.5 w-3.5" />
          Masuk toko
        </a>
      </div>
    </article>
  );
}

// ---------- Halaman ----------

export default function TokoSayaPage() {
  const supabase = useMemo(() => createClient(), []);

  const [memuat, setMemuat] = useState(true);
  const [galatMuat, setGalatMuat] = useState(false);
  const [galatSebagian, setGalatSebagian] = useState(false);
  const [daftar, setDaftar] = useState<Toko[]>([]);
  const [stat, setStat] = useState<Record<string, StatToko>>({});
  const [pendapatan, setPendapatan] = useState<number | null>(null);

  useEffect(() => {
    let batal = false;

    async function muat() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.replace("/login");
        return;
      }

      const resToko = await supabase
        .from("shops")
        .select(
          "id, slug, name, village, city, status, is_open, is_verified, opening_hours, rating_avg, rating_count, total_sales, logo_url, delivery_enabled, pickup_enabled, dine_in_enabled, pos_enabled, created_at"
        )
        .eq("owner_id", user.id)
        .order("created_at", { ascending: true });

      if (batal) return;

      if (resToko.error) {
        setGalatMuat(true);
        setMemuat(false);
        return;
      }

      const toko = ((resToko.data ?? []) as Record<string, unknown>[]).map(dariDb);

      if (toko.length === 0) {
        setMemuat(false);
        return;
      }

      const ids = toko.map((t) => t.id);

      const [resProduk, resBaru, resSelesai] = await Promise.all([
        supabase.from("products").select("shop_id").in("shop_id", ids).eq("is_active", true),
        supabase.from("orders").select("shop_id").in("shop_id", ids).eq("status", "pending"),
        supabase
          .from("orders")
          .select(KOLOM_TOTAL_PESANAN)
          .in("shop_id", ids)
          .eq("status", STATUS_PESANAN_SELESAI),
      ]);

      if (batal) return;

      const peta: Record<string, StatToko> = {};
      ids.forEach((id) => (peta[id] = { produk: 0, pesananBaru: 0 }));
      (resProduk.data ?? []).forEach((r: { shop_id: string }) => {
        if (peta[r.shop_id]) peta[r.shop_id].produk += 1;
      });
      (resBaru.data ?? []).forEach((r: { shop_id: string }) => {
        if (peta[r.shop_id]) peta[r.shop_id].pesananBaru += 1;
      });

      setDaftar(toko);
      setStat(peta);
      setPendapatan(
        resSelesai.error
          ? null
          : ((resSelesai.data ?? []) as unknown as Record<string, unknown>[]).reduce(
              (jml, r) => jml + angka(r[KOLOM_TOTAL_PESANAN]),
              0
            )
      );
      setGalatSebagian(Boolean(resProduk.error || resBaru.error));
      setMemuat(false);
    }

    muat();
    return () => {
      batal = true;
    };
  }, [supabase]);

  const totalProduk = Object.values(stat).reduce((j, s) => j + s.produk, 0);
  const totalPesananBaru = Object.values(stat).reduce((j, s) => j + s.pesananBaru, 0);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      {/* HEADER */}
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-3 py-2.5 md:px-4">
          <Link
            href="/"
            aria-label="Kembali ke halaman belanja"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-700 transition-colors hover:bg-gray-200"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-50 to-amber-50 p-1.5 ring-1 ring-orange-100">
            <Image
              src="/logo.png"
              alt="Necoku"
              width={40}
              height={40}
              className="h-full w-full object-contain"
            />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-bold leading-tight text-gray-900">Toko saya</h1>
            <p className="truncate text-xs text-gray-500">
              {daftar.length > 0 ? `${daftar.length} toko` : "Kelola toko Anda di sini"}
            </p>
          </div>

          {!memuat && !galatMuat && daftar.length > 0 && (
            <a
              href="/owner/daftar"
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold ${TOMBOL_UTAMA}`}
            >
              <Plus className="h-4 w-4" />
              Toko baru
            </a>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-3 py-5 md:space-y-6 md:px-4 md:py-8">
        {memuat ? (
          <Kerangka />
        ) : galatMuat ? (
          /* ---------- GAGAL MEMUAT ---------- */
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-100 bg-white px-6 py-14 text-center shadow-sm">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
              <AlertCircle className="h-6 w-6" />
            </span>
            <p className="text-sm text-gray-500">
              Data toko gagal dimuat. Muat ulang halaman, atau periksa aturan RLS tabel shops
              di Supabase.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 text-xs font-medium text-orange-600 transition-colors hover:bg-orange-100"
            >
              Muat ulang
            </button>
          </div>
        ) : daftar.length === 0 ? (
          /* ---------- BELUM PUNYA TOKO ---------- */
          <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
            <div className="flex flex-col items-center gap-4 px-6 pb-8 pt-12 text-center">
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-orange-50 ring-8 ring-orange-50/60">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/30">
                  <Store className="h-7 w-7" />
                </span>
              </span>
              <div>
                <p className="text-lg font-bold text-gray-900">Buat toko pertama Anda</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
                  Gratis dan langsung aktif. Ini yang akan Anda dapatkan:
                </p>
              </div>
            </div>

            <ul className="grid gap-3 px-4 pb-6 md:grid-cols-2 md:px-6">
              {KEUNTUNGAN.map(({ ikon: Ikon, judul, ket }) => (
                <li
                  key={judul}
                  className="flex items-start gap-3 rounded-2xl bg-gray-50 p-3.5"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-500 ring-1 ring-orange-100">
                    <Ikon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-gray-900">{judul}</span>
                    <span className="block text-xs text-gray-500">{ket}</span>
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex justify-center px-6 pb-10">
              <a
                href="/owner/daftar"
                className={`inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold ${TOMBOL_UTAMA}`}
              >
                <Plus className="h-4 w-4" />
                Buat toko pertama
              </a>
            </div>
          </div>
        ) : (
          <>
            {galatSebagian && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700 ring-1 ring-amber-100"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                Sebagian data gagal dimuat. Jumlah produk atau pesanan mungkin belum akurat.
              </p>
            )}

            {/* RINGKASAN */}
            <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-500 via-orange-500 to-amber-500 p-5 text-white shadow-lg shadow-orange-500/20 md:p-7">
              <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10" />
              <div className="pointer-events-none absolute -bottom-16 right-16 h-40 w-40 rounded-full bg-white/10" />

              <div className="relative">
                <div className="flex items-center gap-2 text-sm font-medium text-orange-50">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20">
                    <Wallet className="h-4 w-4" />
                  </span>
                  Total pendapatan
                </div>
                <p className="mt-3 truncate text-2xl font-extrabold tracking-tight md:text-3xl">
                  {pendapatan === null ? "-" : rupiah(pendapatan)}
                </p>

                <div className="mt-5 grid grid-cols-3 gap-3">
                  <div className="rounded-2xl bg-white/15 p-3.5 ring-1 ring-white/20">
                    <div className="flex items-center gap-1.5 text-xs text-orange-50">
                      <Store className="h-4 w-4" />
                      Toko
                    </div>
                    <p className="mt-1.5 text-2xl font-bold leading-none">{daftar.length}</p>
                  </div>
                  <div className="rounded-2xl bg-white/15 p-3.5 ring-1 ring-white/20">
                    <div className="flex items-center gap-1.5 text-xs text-orange-50">
                      <Receipt className="h-4 w-4" />
                      Pesanan baru
                    </div>
                    <p className="mt-1.5 text-2xl font-bold leading-none">{totalPesananBaru}</p>
                  </div>
                  <div className="rounded-2xl bg-white/15 p-3.5 ring-1 ring-white/20">
                    <div className="flex items-center gap-1.5 text-xs text-orange-50">
                      <Package className="h-4 w-4" />
                      Produk
                    </div>
                    <p className="mt-1.5 text-2xl font-bold leading-none">{totalProduk}</p>
                  </div>
                </div>
              </div>
            </section>

            {/* DAFTAR TOKO */}
            <section aria-label="Daftar toko" className="grid gap-4 md:grid-cols-2">
              {daftar.map((t) => (
                <KartuToko
                  key={t.id}
                  toko={t}
                  stat={stat[t.id] ?? { produk: 0, pesananBaru: 0 }}
                />
              ))}

              <a
                href="/owner/daftar"
                className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-orange-200 bg-orange-50/40 p-5 text-sm font-semibold text-orange-600 transition-colors hover:bg-orange-50"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-orange-100">
                  <Plus className="h-5 w-5" />
                </span>
                Toko baru
              </a>
            </section>
          </>
        )}
      </main>
    </div>
  );
}