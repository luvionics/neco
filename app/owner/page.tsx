"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  AlertCircle,
  ArrowLeft,
  BadgeCheck,
  Bell,
  Bike,
  Calculator,
  ChevronRight,
  Clock,
  ExternalLink,
  Home,
  Info,
  Loader2,
  MapPin,
  Package,
  Plus,
  Receipt,
  Settings,
  Star,
  Store,
  User,
  UtensilsCrossed,
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
  buka: boolean; // shops.is_open
  terverifikasi: boolean; // shops.is_verified (label tambahan)
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

type Statistik = { produk: number; pesananBaru: number };

// ---------- Konstanta ----------

// Sesuai constraint shops.status: pending, active, suspended, closed
const STATUS_INFO: Record<string, { label: string; kelas: string }> = {
  active: { label: "Aktif", kelas: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" },
  pending: { label: "Diproses", kelas: "bg-amber-50 text-amber-700 ring-1 ring-amber-100" },
  suspended: { label: "Ditangguhkan", kelas: "bg-red-50 text-red-700 ring-1 ring-red-100" },
  closed: { label: "Ditutup", kelas: "bg-gray-100 text-gray-600 ring-1 ring-gray-200" },
};

const HARI_KUNCI = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const TOMBOL_UTAMA =
  "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/25 transition-all hover:shadow-lg hover:shadow-orange-500/30 active:scale-[0.98]";

// ---------- Fungsi bantu ----------

const teks = (v: unknown) => (typeof v === "string" ? v : "");
const angka = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

// Kunci hari ini (mon..sun) menurut waktu Jakarta
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

function Saklar({
  nyala,
  onChange,
  label,
  nonaktif,
}: {
  nyala: boolean;
  onChange: () => void;
  label: string;
  nonaktif?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={nyala}
      aria-label={label}
      disabled={nonaktif}
      onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-500/20 disabled:cursor-not-allowed disabled:opacity-60 ${
        nyala ? "bg-emerald-500" : "bg-gray-300"
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
          nyala ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
}

function MenuCepat({
  ikon: Ikon,
  judul,
  ket,
  href,
  badge,
}: {
  ikon: React.ComponentType<{ className?: string }>;
  judul: string;
  ket: string;
  href: string;
  badge?: number;
}) {
  return (
    <a
      href={href}
      className="group flex items-center gap-3.5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-all duration-200 hover:border-orange-200 hover:shadow-lg hover:shadow-orange-500/10"
    >
      <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-500 ring-1 ring-orange-100 transition-colors group-hover:bg-orange-500 group-hover:text-white">
        <Ikon className="h-5 w-5" />
        {badge !== undefined && badge > 0 && (
          <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-orange-500 px-1 text-center text-[10px] font-bold leading-5 text-white ring-2 ring-white">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-gray-900">{judul}</span>
        <span className="block truncate text-xs text-gray-500">{ket}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-orange-500" />
    </a>
  );
}

function Kerangka() {
  return (
    <div className="space-y-5" aria-busy="true">
      <span className="sr-only">Memuat toko</span>
      <div className="h-52 animate-pulse rounded-3xl bg-gray-200/70" />
      <div className="h-56 animate-pulse rounded-2xl bg-gray-200/70" />
      <div className="grid gap-3 md:grid-cols-2">
        <div className="h-20 animate-pulse rounded-2xl bg-gray-200/70" />
        <div className="h-20 animate-pulse rounded-2xl bg-gray-200/70" />
      </div>
    </div>
  );
}

// ---------- Halaman ----------

export default function TokoSayaPage() {
  const supabase = useMemo(() => createClient(), []);

  const [memuat, setMemuat] = useState(true);
  const [galatMuat, setGalatMuat] = useState(false);
  const [toko, setToko] = useState<Toko | null>(null);
  const [stat, setStat] = useState<Statistik>({ produk: 0, pesananBaru: 0 });
  const [mengubah, setMengubah] = useState(false);
  const [galatBuka, setGalatBuka] = useState("");

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

      // shops punya UNIQUE (owner_id): paling banyak satu baris
      const resToko = await supabase
        .from("shops")
        .select(
          "id, slug, name, village, city, status, is_open, is_verified, opening_hours, rating_avg, rating_count, total_sales, logo_url, delivery_enabled, pickup_enabled, dine_in_enabled, pos_enabled"
        )
        .eq("owner_id", user.id)
        .maybeSingle();

      if (batal) return;

      if (resToko.error) {
        setGalatMuat(true);
        setMemuat(false);
        return;
      }

      if (!resToko.data) {
        setMemuat(false);
        return;
      }

      const t = dariDb(resToko.data as Record<string, unknown>);

      const [resProduk, resPesanan] = await Promise.all([
        supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("shop_id", t.id)
          .eq("is_active", true),
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("shop_id", t.id)
          .eq("status", "pending"),
      ]);

      if (batal) return;

      setToko(t);
      setStat({
        produk: resProduk.count ?? 0,
        pesananBaru: resPesanan.count ?? 0,
      });
      setGalatMuat(Boolean(resProduk.error || resPesanan.error));
      setMemuat(false);
    }

    muat();
    return () => {
      batal = true;
    };
  }, [supabase]);

  const ubahBuka = async () => {
    if (!toko || mengubah) return;
    const baru = !toko.buka;

    setMengubah(true);
    setGalatBuka("");
    setToko({ ...toko, buka: baru }); // optimistis

    const { error } = await supabase
      .from("shops")
      .update({ is_open: baru, updated_at: new Date().toISOString() })
      .eq("id", toko.id);

    if (error) {
      setToko((t) => (t ? { ...t, buka: !baru } : t));
      setGalatBuka("Gagal mengubah status buka, coba lagi");
    }
    setMengubah(false);
  };

  const punyaToko = Boolean(toko);
  const aktif = toko?.status === "active";
  const info = toko ? STATUS_INFO[toko.status] ?? STATUS_INFO.closed : null;
  const lokasi = toko ? [toko.area, toko.kota].filter(Boolean).join(", ") : "";

  const layanan = toko
    ? [
        toko.antar && { ikon: Bike, label: "Antar" },
        toko.ambil && { ikon: Store, label: "Ambil di toko" },
        toko.makan && { ikon: UtensilsCrossed, label: "Makan di tempat" },
        toko.kasir && { ikon: Calculator, label: "Kasir" },
      ].filter(Boolean) as { ikon: React.ComponentType<{ className?: string }>; label: string }[]
    : [];

  // Menu navigasi. Pesanan butuh id toko, jadi nonaktif bila belum punya toko.
  const NAV = [
    { id: "beranda", nama: "Beranda", ikon: Home, href: "/owner", aktif: true, badge: 0 },
    {
      id: "pesanan",
      nama: "Pesanan",
      ikon: Receipt,
      href: toko ? `/owner/toko/${toko.id}/pesanan` : "/owner",
      aktif: false,
      badge: stat.pesananBaru,
    },
    { id: "notifikasi", nama: "Notifikasi", ikon: Bell, href: "/notifikasi", aktif: false, badge: 0 },
    { id: "akun", nama: "Akun", ikon: User, href: "/akun", aktif: false, badge: 0 },
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-24 text-gray-800 md:pb-0">
      {/* HEADER */}
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-3 py-2.5 md:px-4">
          <a
            href="/"
            aria-label="Kembali ke halaman belanja"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-700 transition-colors hover:bg-gray-200"
          >
            <ArrowLeft className="h-5 w-5" />
          </a>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-50 to-amber-50 p-1.5 ring-1 ring-orange-100">
            <Image
              src="/logo.png"
              alt="NECAS"
              width={40}
              height={40}
              className="h-full w-full object-contain"
            />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-bold leading-tight text-gray-900">Toko saya</h1>
            <p className="truncate text-xs text-gray-500 md:hidden">
              {toko ? toko.nama : "Kelola tokomu di sini"}
            </p>
          </div>

          {/* MENU (desktop) */}
          <nav aria-label="Navigasi utama" className="hidden items-center gap-1 md:flex">
            {NAV.map(({ id, nama, ikon: Ikon, href, aktif: sel, badge }) => (
              <a
                key={id}
                href={href}
                aria-current={sel ? "page" : undefined}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                  sel
                    ? "bg-orange-50 text-orange-600"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <Ikon className="h-4 w-4" />
                {nama}
                {badge > 0 && (
                  <span className="rounded-full bg-orange-500 px-1.5 text-[10px] font-bold leading-4 text-white">
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </a>
            ))}
          </nav>

          {!memuat && !punyaToko && !galatMuat && (
            <a
              href="/owner/daftar"
              className={`hidden items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold md:ml-2 md:flex ${TOMBOL_UTAMA}`}
            >
              <Plus className="h-4 w-4" />
              Daftarkan toko
            </a>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-3 py-5 md:space-y-6 md:px-4 md:py-8">
        {memuat ? (
          <Kerangka />
        ) : galatMuat && !toko ? (
          /* ---------- GAGAL MEMUAT ---------- */
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-100 bg-white px-6 py-14 text-center shadow-sm">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
              <AlertCircle className="h-6 w-6" />
            </span>
            <p className="text-sm text-gray-500">
              Data toko gagal dimuat. Muat ulang halaman, atau periksa aturan RLS
              tabel shops di Supabase.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 text-xs font-medium text-orange-600 transition-colors hover:bg-orange-100"
            >
              Muat ulang
            </button>
          </div>
        ) : !toko ? (
          /* ---------- BELUM PUNYA TOKO ---------- */
          <div className="flex flex-col items-center gap-4 rounded-3xl border border-gray-100 bg-white px-6 py-16 text-center shadow-sm">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-orange-50 ring-8 ring-orange-50/60">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/30">
                <Store className="h-7 w-7" />
              </span>
            </span>
            <div>
              <p className="text-base font-bold text-gray-900">Kamu belum punya toko</p>
              <p className="mt-1 text-sm text-gray-500">
                Daftarkan tokomu gratis, langsung aktif dan mudah ditemukan tetangga
                sekitar.
              </p>
            </div>
            <a
              href="/owner/daftar"
              className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold ${TOMBOL_UTAMA}`}
            >
              <Plus className="h-4 w-4" />
              Daftarkan toko
            </a>
          </div>
        ) : (
          <>
            {galatMuat && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700 ring-1 ring-amber-100"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                Sebagian data gagal dimuat. Jumlah produk atau pesanan mungkin belum
                akurat.
              </p>
            )}

            {/* RINGKASAN */}
            <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-500 via-orange-500 to-amber-500 p-5 text-white shadow-lg shadow-orange-500/20 md:p-7">
              <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10" />
              <div className="pointer-events-none absolute -bottom-16 right-16 h-40 w-40 rounded-full bg-white/10" />

              <div className="relative">
                <div className="flex items-center gap-2 text-sm font-medium text-orange-50">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20">
                    <Store className="h-4 w-4" />
                  </span>
                  Tokomu
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <p className="truncate text-2xl font-extrabold tracking-tight md:text-3xl">
                    {toko.nama}
                  </p>
                  {toko.terverifikasi && (
                    <BadgeCheck
                      className="h-6 w-6 shrink-0 text-white"
                      aria-label="Terverifikasi"
                    />
                  )}
                </div>
                <p className="mt-1 text-xs text-orange-100">
                  {toko.terverifikasi
                    ? "Toko terverifikasi"
                    : "Kelola tokomu dari satu tempat"}
                </p>

                <div className="mt-5 grid grid-cols-3 gap-3">
                  <div className="rounded-2xl bg-white/15 p-3.5 ring-1 ring-white/20 backdrop-blur-sm">
                    <div className="flex items-center gap-1.5 text-xs text-orange-50">
                      <Receipt className="h-4 w-4" />
                      Pesanan baru
                    </div>
                    <p className="mt-1.5 text-2xl font-bold leading-none">
                      {stat.pesananBaru}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white/15 p-3.5 ring-1 ring-white/20 backdrop-blur-sm">
                    <div className="flex items-center gap-1.5 text-xs text-orange-50">
                      <Package className="h-4 w-4" />
                      Produk
                    </div>
                    <p className="mt-1.5 text-2xl font-bold leading-none">{stat.produk}</p>
                  </div>
                  <div className="rounded-2xl bg-white/15 p-3.5 ring-1 ring-white/20 backdrop-blur-sm">
                    <div className="flex items-center gap-1.5 text-xs text-orange-50">
                      <Star className="h-4 w-4" />
                      Rating
                    </div>
                    <p className="mt-1.5 text-2xl font-bold leading-none">
                      {toko.jumlahRating > 0 ? toko.rating.toFixed(1) : "-"}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* KARTU TOKO */}
            <article
              className={`flex flex-col gap-3.5 rounded-2xl border bg-white p-4 shadow-sm md:p-5 ${
                stat.pesananBaru > 0
                  ? "border-orange-200 ring-1 ring-orange-100"
                  : "border-gray-100"
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
                    <h2 className="truncate text-sm font-bold text-gray-900 md:text-base">
                      {toko.nama}
                    </h2>
                    {toko.terverifikasi && (
                      <BadgeCheck
                        className="h-4 w-4 shrink-0 text-sky-500"
                        aria-label="Terverifikasi"
                      />
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {info && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${info.kelas}`}
                      >
                        {info.label}
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

              {/* Statistik */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                <span className="flex items-center gap-1 rounded-xl bg-gray-50 px-2.5 py-1.5">
                  <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                  <b className="text-gray-800">
                    {toko.jumlahRating > 0 ? toko.rating.toFixed(1) : "-"}
                  </b>
                  {toko.jumlahRating > 0 && (
                    <span className="text-gray-400">({toko.jumlahRating})</span>
                  )}
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

              {/* Layanan */}
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

              {/* Catatan status */}
              {toko.status === "suspended" && (
                <p className="flex items-start gap-2.5 rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  Tokomu sedang ditangguhkan dan tidak tampil untuk pembeli. Hubungi
                  kami lewat Pusat bantuan untuk informasi lebih lanjut.
                </p>
              )}
              {toko.status === "closed" && (
                <p className="flex items-start gap-2.5 rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  Tokomu sedang ditutup dan tidak tampil untuk pembeli.
                </p>
              )}
              {!toko.terverifikasi && aktif && (
                <p className="flex items-start gap-2.5 rounded-xl border border-sky-100 bg-sky-50 p-3 text-xs text-sky-800">
                  <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  Tokomu sudah aktif dan bisa dipesan. Label Terverifikasi bisa
                  didapat nanti sebagai tanda tambahan agar lebih dipercaya pembeli.
                </p>
              )}

              {galatBuka && (
                <p
                  role="alert"
                  className="flex items-center gap-1 text-xs text-red-600"
                >
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {galatBuka}
                </p>
              )}

              {/* Aksi */}
              <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3.5">
                {aktif && (
                  <div className="mr-auto flex items-center gap-2 rounded-full bg-gray-50 py-1 pl-3 pr-1.5 text-xs">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        toko.buka
                          ? "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.2)]"
                          : "bg-gray-400"
                      }`}
                    />
                    <span
                      className={`font-semibold ${
                        toko.buka ? "text-emerald-600" : "text-gray-500"
                      }`}
                    >
                      {toko.buka ? "Buka sekarang" : "Tutup"}
                    </span>
                    {mengubah && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
                    )}
                    <Saklar
                      nyala={toko.buka}
                      onChange={ubahBuka}
                      nonaktif={mengubah}
                      label={`Status buka ${toko.nama}`}
                    />
                  </div>
                )}

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
                  className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold ${TOMBOL_UTAMA} ${
                    aktif ? "" : "ml-auto"
                  }`}
                >
                  <Settings className="h-3.5 w-3.5" />
                  Masuk toko
                </a>
              </div>
            </article>

            {/* MENU CEPAT */}
            <section aria-label="Menu cepat" className="grid gap-3 md:grid-cols-2 md:gap-4">
              <MenuCepat
                ikon={Receipt}
                judul="Pesanan"
                ket={
                  stat.pesananBaru > 0
                    ? `${stat.pesananBaru} pesanan menunggu`
                    : "Belum ada pesanan baru"
                }
                href={`/owner/toko/${toko.id}/pesanan`}
                badge={stat.pesananBaru}
              />
              <MenuCepat
                ikon={Package}
                judul="Produk"
                ket={stat.produk > 0 ? `${stat.produk} produk aktif` : "Tambahkan produk pertama"}
                href={`/owner/toko/${toko.id}/produk`}
              />
              {toko.kasir && (
                <MenuCepat
                  ikon={Calculator}
                  judul="Kasir"
                  ket="Catat penjualan langsung di toko"
                  href={`/owner/toko/${toko.id}/kasir`}
                />
              )}
              <MenuCepat
                ikon={Info}
                judul="Info toko"
                ket="Alamat, jam buka, layanan, dan kontak"
                href={`/owner/toko/${toko.id}/info`}
              />
            </section>
          </>
        )}
      </main>

      {/* NAVIGASI BAWAH (mobile) */}
      <nav
        aria-label="Navigasi utama"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-100 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      >
        <ul className="mx-auto grid max-w-md grid-cols-4">
          {NAV.map(({ id, nama, ikon: Ikon, href, aktif: sel, badge }) => (
            <li key={id}>
              <a
                href={href}
                aria-current={sel ? "page" : undefined}
                className={`relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors ${
                  sel ? "text-orange-600" : "text-gray-500 hover:text-gray-800"
                }`}
              >
                <span className="relative">
                  <Ikon className="h-5 w-5" />
                  {badge > 0 && (
                    <span className="absolute -right-2 -top-1.5 min-w-4 rounded-full bg-orange-500 px-1 text-center text-[9px] font-bold leading-4 text-white ring-2 ring-white">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  )}
                </span>
                {nama}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}