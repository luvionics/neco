// kode halaman utama
"use client";

import { useMemo, useRef, useState } from "react";
import Header from "@/app/components/Header";
import { NavBawah } from "@/app/components/Navbar";
import {
  Search,
  Store,
  Star,
  MapPin,
  Package,
  BadgeCheck,
  Shirt,
  Smartphone,
  Utensils,
  Home,
  Sparkles,
  BookOpen,
  LayoutGrid,
  ShoppingBasket,
  ChevronRight,
  ChevronDown,
  Bike,
  Banknote,
  Clock,
  Check,
  X,
} from "lucide-react";

type Toko = {
  id: number;
  nama: string;
  kategori: string;
  area: string;
  jarakM: number; // jarak dari pengguna, dalam meter
  rating: number;
  produk: number;
  pengikut: string;
  terverifikasi: boolean;
  buka: boolean;
  jam: string;
  antar: boolean;
  ambil: boolean;
  cod: boolean;
  warna: string;
};

// Data contoh, nanti ganti dengan data dari database
const TOKO: Toko[] = [
  { id: 1, nama: "Warung Bu Siti", kategori: "Warung & Sembako", area: "Dusun Krajan", jarakM: 250, rating: 4.8, produk: 96, pengikut: "320", terverifikasi: true, buka: true, jam: "06.00 - 21.00", antar: true, ambil: true, cod: true, warna: "from-amber-400 to-orange-500" },
  { id: 2, nama: "Dapur Mak Nyah", kategori: "Makanan", area: "Dusun Krajan", jarakM: 400, rating: 4.9, produk: 28, pengikut: "540", terverifikasi: true, buka: true, jam: "07.00 - 20.00", antar: true, ambil: true, cod: true, warna: "from-red-400 to-rose-500" },
  { id: 3, nama: "Berkah Fashion", kategori: "Fashion", area: "Pasar Lama", jarakM: 800, rating: 4.7, produk: 320, pengikut: "1,2rb", terverifikasi: true, buka: true, jam: "08.00 - 17.00", antar: false, ambil: true, cod: true, warna: "from-pink-400 to-fuchsia-500" },
  { id: 4, nama: "Toko Buku Pelita", kategori: "Buku & ATK", area: "Pasar Lama", jarakM: 950, rating: 4.8, produk: 540, pengikut: "890", terverifikasi: false, buka: true, jam: "08.00 - 16.00", antar: false, ambil: true, cod: false, warna: "from-violet-400 to-purple-600" },
  { id: 5, nama: "Gadget Corner", kategori: "Elektronik", area: "Jl. Raya", jarakM: 1500, rating: 4.8, produk: 185, pengikut: "2,1rb", terverifikasi: true, buka: false, jam: "09.00 - 20.00", antar: true, ambil: true, cod: false, warna: "from-blue-400 to-indigo-600" },
  { id: 6, nama: "Santri Mart", kategori: "Warung & Sembako", area: "Dusun Baru", jarakM: 1800, rating: 4.6, produk: 120, pengikut: "410", terverifikasi: false, buka: true, jam: "05.30 - 22.00", antar: true, ambil: true, cod: true, warna: "from-sky-400 to-cyan-600" },
  { id: 7, nama: "Glow Beauty", kategori: "Kecantikan", area: "Perumahan Griya Asri", jarakM: 1900, rating: 4.9, produk: 142, pengikut: "760", terverifikasi: true, buka: true, jam: "09.00 - 18.00", antar: true, ambil: false, cod: true, warna: "from-pink-400 to-rose-500" },
  { id: 8, nama: "Rumah Asri", kategori: "Rumah Tangga", area: "Perumahan Griya Asri", jarakM: 2100, rating: 4.5, produk: 210, pengikut: "380", terverifikasi: false, buka: false, jam: "08.00 - 17.00", antar: true, ambil: true, cod: true, warna: "from-emerald-400 to-teal-600" },
];

const KATEGORI = [
  { nama: "Semua", ikon: LayoutGrid },
  { nama: "Warung & Sembako", ikon: ShoppingBasket },
  { nama: "Makanan", ikon: Utensils },
  { nama: "Fashion", ikon: Shirt },
  { nama: "Elektronik", ikon: Smartphone },
  { nama: "Rumah Tangga", ikon: Home },
  { nama: "Kecantikan", ikon: Sparkles },
  { nama: "Buku & ATK", ikon: BookOpen },
];

const AREA = ["Semua area", ...Array.from(new Set(TOKO.map((t) => t.area)))];

const RADIUS = [
  { id: "semua", label: "Semua jarak", maks: Infinity },
  { id: "500", label: "≤ 500 m", maks: 500 },
  { id: "1000", label: "≤ 1 km", maks: 1000 },
  { id: "3000", label: "≤ 3 km", maks: 3000 },
];

const URUTAN = [
  { id: "terdekat", label: "Terdekat" },
  { id: "rating", label: "Rating" },
  { id: "produk", label: "Produk Terbanyak" },
];

const SLIDE = [
  {
    judul: "Belanja dari toko tetanggamu",
    teks: "Temukan toko terdekat dan dukung usaha di sekitarmu.",
    warna: "from-orange-500 via-red-500 to-pink-500",
  },
  {
    judul: "Antar cepat atau ambil di toko",
    teks: "Pilih diantar ke rumah, ambil sendiri, atau bayar di tempat.",
    warna: "from-emerald-500 to-teal-600",
  },
  {
    judul: "Daftarkan tokomu, gratis",
    teks: "Biar tetangga sekitar mudah menemukan tokomu.",
    warna: "from-violet-500 to-indigo-600",
  },
];

const SEMBUNYIKAN_SCROLLBAR =
  "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

const PIL_AKTIF = "bg-gray-900 text-white shadow-md shadow-gray-900/20";
const PIL_NONAKTIF =
  "border border-gray-100 bg-white text-gray-600 shadow-sm hover:border-orange-200 hover:text-orange-600";

function formatJarak(m: number) {
  if (m < 1000) return `${m} m`;
  return `${(m / 1000).toFixed(1).replace(".", ",")} km`;
}

function Layanan({ t }: { t: Toko }) {
  const item =
    "flex items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5 text-[11px] text-gray-600";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {t.antar && (
        <span className={item}>
          <Bike className="h-3.5 w-3.5 text-orange-500" />
          Antar
        </span>
      )}
      {t.ambil && (
        <span className={item}>
          <Store className="h-3.5 w-3.5 text-orange-500" />
          Ambil
        </span>
      )}
      {t.cod && (
        <span className={item}>
          <Banknote className="h-3.5 w-3.5 text-orange-500" />
          COD
        </span>
      )}
    </div>
  );
}

export default function HalamanPublik() {
  const [cari, setCari] = useState("");
  const [kategori, setKategori] = useState("Semua");
  const [area, setArea] = useState("Semua area");
  const [radius, setRadius] = useState("semua");
  const [urutan, setUrutan] = useState("terdekat");
  const [sheetArea, setSheetArea] = useState(false);
  const [slideAktif, setSlideAktif] = useState(0);
  const slideRef = useRef<HTMLDivElement>(null);

  const hasil = useMemo(() => {
    const maks = RADIUS.find((r) => r.id === radius)?.maks ?? Infinity;
    const q = cari.toLowerCase();

    const data = TOKO.filter((t) => {
      const cocokKategori = kategori === "Semua" || t.kategori === kategori;
      const cocokArea = area === "Semua area" || t.area === area;
      const cocokJarak = t.jarakM <= maks;
      const cocokCari =
        t.nama.toLowerCase().includes(q) ||
        t.kategori.toLowerCase().includes(q) ||
        t.area.toLowerCase().includes(q);
      return cocokKategori && cocokArea && cocokJarak && cocokCari;
    });

    const urut = [...data];
    if (urutan === "terdekat") urut.sort((a, b) => a.jarakM - b.jarakM);
    if (urutan === "rating") urut.sort((a, b) => b.rating - a.rating);
    if (urutan === "produk") urut.sort((a, b) => b.produk - a.produk);
    return urut;
  }, [cari, kategori, area, radius, urutan]);

  const onScrollSlide = () => {
    const el = slideRef.current;
    if (!el) return;
    setSlideAktif(Math.round(el.scrollLeft / el.clientWidth));
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-28 text-gray-800 md:pb-0">
      {/* HEADER */}
      <Header
        aktif="Beranda"
        tambahan={
          /* Pemilih area */
          <button
            onClick={() => setSheetArea(true)}
            className="mt-2.5 flex items-center gap-1.5 rounded-full bg-white/15 py-1.5 pl-3 pr-2 text-xs text-white ring-1 ring-white/20 transition-colors hover:bg-white/20 md:mt-3 md:text-sm"
          >
            <MapPin className="h-4 w-4 shrink-0" />
            <span className="text-white/80">Area kamu:</span>
            <b className="max-w-[50vw] truncate md:max-w-none">
              {area === "Semua area" ? "Pilih area sekitarmu" : area}
            </b>
            <ChevronDown className="h-4 w-4 shrink-0" />
          </button>
        }
      >
        {/* Pencarian */}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Cari toko di sekitarmu..."
            aria-label="Cari toko"
            className="w-full rounded-xl bg-white py-2.5 pl-10 pr-3 text-sm shadow-sm outline-none transition placeholder:text-gray-400 focus:ring-4 focus:ring-white/30 md:pr-14"
          />
          <button
            aria-label="Cari"
            className="absolute right-1.5 top-1.5 hidden h-8 w-10 items-center justify-center rounded-lg bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-sm transition-all hover:shadow-md active:scale-95 md:flex"
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
      </Header>

      <main className="mx-auto max-w-6xl space-y-4 px-3 py-4 md:space-y-5 md:px-4 md:py-6">
        {/* BANNER MOBILE */}
        <section className="md:hidden">
          <div
            ref={slideRef}
            onScroll={onScrollSlide}
            className={`flex snap-x snap-mandatory overflow-x-auto rounded-3xl shadow-lg shadow-gray-900/10 ${SEMBUNYIKAN_SCROLLBAR}`}
          >
            {SLIDE.map((s, i) => (
              <div
                key={i}
                className={`relative flex h-36 w-full shrink-0 snap-center items-center overflow-hidden bg-gradient-to-r ${s.warna} p-5 text-white`}
              >
                <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10" />
                <div className="relative z-10 max-w-[70%]">
                  <h1 className="text-lg font-extrabold leading-tight">{s.judul}</h1>
                  <p className="mt-1 text-xs text-white/90">{s.teks}</p>
                </div>
                <Store className="absolute -bottom-4 -right-3 h-28 w-28 text-white/20" />
              </div>
            ))}
          </div>
          <div className="mt-2.5 flex justify-center gap-1.5">
            {SLIDE.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  slideAktif === i ? "w-5 bg-orange-500" : "w-1.5 bg-gray-300"
                }`}
              />
            ))}
          </div>
        </section>

        {/* BANNER DESKTOP */}
        <section className="hidden gap-4 md:grid md:grid-cols-3">
          <div className="relative flex min-h-56 items-center overflow-hidden rounded-3xl bg-gradient-to-r from-orange-500 via-red-500 to-pink-500 p-10 text-white shadow-lg shadow-orange-500/20 md:col-span-2">
            <div className="pointer-events-none absolute -left-10 -top-14 h-48 w-48 rounded-full bg-white/10" />
            <div className="pointer-events-none absolute -bottom-20 right-40 h-48 w-48 rounded-full bg-white/10" />
            <div className="relative z-10 max-w-md">
              <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-white ring-1 ring-white/20">
                <MapPin className="h-3.5 w-3.5" />
                Toko di sekitarmu
              </p>
              <h1 className="text-4xl font-extrabold leading-tight tracking-tight">
                Belanja dari toko tetanggamu
              </h1>
              <p className="mt-2 text-base text-white/90">
                Temukan toko terdekat, lihat jam buka, lalu pilih diantar atau
                ambil sendiri.
              </p>
            </div>
            <Store className="absolute -bottom-6 -right-4 h-64 w-64 text-white/15" />
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-1 items-center gap-4 rounded-3xl bg-gradient-to-br from-emerald-400 to-teal-600 p-5 text-white shadow-lg shadow-emerald-500/20">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/25">
                <Bike className="h-7 w-7" />
              </span>
              <div>
                <p className="font-bold">Antar atau Ambil</p>
                <p className="text-xs text-white/90">Dari toko sekitar, cepat sampai</p>
              </div>
            </div>
            <div className="flex flex-1 items-center gap-4 rounded-3xl bg-gradient-to-br from-violet-500 to-indigo-600 p-5 text-white shadow-lg shadow-violet-500/20">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/25">
                <Store className="h-7 w-7" />
              </span>
              <div>
                <p className="font-bold">Daftarkan Tokomu</p>
                <p className="text-xs text-white/90">Gratis, mudah ditemukan tetangga</p>
              </div>
            </div>
          </div>
        </section>

        {/* KATEGORI */}
        <section
          id="kategori"
          className="rounded-3xl border border-gray-100 bg-white py-1 shadow-sm"
        >
          <h2 className="hidden px-5 pb-1 pt-4 text-sm font-semibold text-gray-900 md:block">
            Kategori toko
          </h2>
          <div
            className={`grid auto-cols-[4.5rem] grid-flow-col grid-rows-2 gap-y-2 overflow-x-auto px-3 py-3 md:auto-cols-auto md:grid-flow-row md:grid-cols-8 md:grid-rows-none md:gap-2 md:overflow-visible md:p-4 ${SEMBUNYIKAN_SCROLLBAR}`}
          >
            {KATEGORI.map(({ nama, ikon: Ikon }) => {
              const aktif = kategori === nama;
              return (
                <button
                  key={nama}
                  onClick={() => setKategori(nama)}
                  aria-pressed={aktif}
                  className={`flex flex-col items-center gap-1.5 rounded-2xl p-1 text-[11px] font-medium transition-all duration-200 md:gap-2 md:border md:p-3 md:text-xs ${
                    aktif
                      ? "text-orange-600 md:border-orange-200 md:bg-orange-50"
                      : "text-gray-600 md:border-transparent md:hover:border-gray-100 md:hover:bg-gray-50"
                  }`}
                >
                  <span
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl transition-all duration-200 ${
                      aktif
                        ? "bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/30"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    <Ikon className="h-5 w-5" />
                  </span>
                  <span className="text-center leading-tight">{nama}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* FILTER JARAK DAN URUTAN */}
        <section className="space-y-3 rounded-3xl border border-gray-100 bg-white p-4 shadow-sm md:px-5">
          <div className="flex items-center gap-3">
            <span className="w-14 shrink-0 text-xs font-medium text-gray-500 md:w-16 md:text-sm">
              Jarak
            </span>
            <div
              className={`flex flex-1 gap-2 overflow-x-auto py-0.5 ${SEMBUNYIKAN_SCROLLBAR}`}
            >
              {RADIUS.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setRadius(r.id)}
                  aria-pressed={radius === r.id}
                  className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-all duration-200 md:text-sm ${
                    radius === r.id ? PIL_AKTIF : PIL_NONAKTIF
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="w-14 shrink-0 text-xs font-medium text-gray-500 md:w-16 md:text-sm">
              Urutkan
            </span>
            <div
              className={`flex flex-1 gap-2 overflow-x-auto py-0.5 ${SEMBUNYIKAN_SCROLLBAR}`}
            >
              {URUTAN.map((u) => (
                <button
                  key={u.id}
                  onClick={() => setUrutan(u.id)}
                  aria-pressed={urutan === u.id}
                  className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-all duration-200 md:text-sm ${
                    urutan === u.id ? PIL_AKTIF : PIL_NONAKTIF
                  }`}
                >
                  {u.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* HASIL TOKO */}
        <section className="space-y-3">
          <p className="px-1 text-sm text-gray-500">
            <b className="text-gray-900">{hasil.length}</b> toko di sekitarmu
          </p>

          {hasil.length === 0 ? (
            <div className="flex flex-col items-center gap-4 rounded-3xl border border-gray-100 bg-white px-6 py-16 text-center shadow-sm">
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-orange-50 ring-8 ring-orange-50/60">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/30">
                  <Store className="h-7 w-7" />
                </span>
              </span>
              <p className="text-sm text-gray-500">
                Belum ada toko yang cocok di area ini
              </p>
              <button
                onClick={() => {
                  setArea("Semua area");
                  setRadius("semua");
                  setKategori("Semua");
                  setCari("");
                }}
                className="rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 text-xs font-medium text-orange-600 transition-colors hover:bg-orange-100"
              >
                Reset filter
              </button>
            </div>
          ) : (
            <>
              {/* LIST MOBILE */}
              <div className="space-y-2.5 md:hidden">
                {hasil.map((t) => (
                  <a
                    key={t.id}
                    href={`/toko/${t.id}`}
                    className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm transition-all active:scale-[0.99] active:bg-gray-50"
                  >
                    <div
                      className={`relative flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br shadow-sm ${t.warna} ${
                        t.buka ? "" : "opacity-60 grayscale"
                      }`}
                    >
                      <Store className="h-8 w-8 text-white" />
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-1">
                        <h3 className="truncate text-sm font-bold text-gray-900">
                          {t.nama}
                        </h3>
                        {t.terverifikasi && (
                          <BadgeCheck className="h-4 w-4 shrink-0 text-sky-500" />
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <MapPin className="h-3 w-3 shrink-0 text-orange-500" />
                        <b className="shrink-0 text-gray-700">{formatJarak(t.jarakM)}</b>
                        <span className="truncate">· {t.area}</span>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            t.buka ? "bg-emerald-500" : "bg-gray-300"
                          }`}
                        />
                        <span
                          className={`font-semibold ${
                            t.buka ? "text-emerald-600" : "text-gray-400"
                          }`}
                        >
                          {t.buka ? "Buka" : "Tutup"}
                        </span>
                        <Clock className="h-3 w-3 text-gray-400" />
                        <span className="text-gray-500">{t.jam}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                          <b className="text-gray-700">{t.rating}</b>
                        </span>
                        <Layanan t={t} />
                      </div>
                    </div>

                    <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-600 ring-1 ring-orange-100">
                      Kunjungi
                      <ChevronRight className="h-3 w-3" />
                    </span>
                  </a>
                ))}
              </div>

              {/* GRID DESKTOP */}
              <div className="hidden grid-cols-3 gap-4 md:grid lg:grid-cols-4">
                {hasil.map((t) => (
                  <a
                    key={t.id}
                    href={`/toko/${t.id}`}
                    className="group overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-orange-200 hover:shadow-xl hover:shadow-orange-500/10"
                  >
                    <div
                      className={`relative flex h-36 items-center justify-center bg-gradient-to-br ${t.warna} ${
                        t.buka ? "" : "opacity-60 grayscale"
                      }`}
                    >
                      <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/10" />
                      <Store className="relative h-12 w-12 text-white/90 transition-transform duration-200 group-hover:scale-110" />
                      {t.terverifikasi && (
                        <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-gray-800 shadow-sm backdrop-blur-sm">
                          <BadgeCheck className="h-3 w-3 text-sky-500" />
                          Terverifikasi
                        </span>
                      )}
                      <span className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
                        <MapPin className="h-3 w-3" />
                        {formatJarak(t.jarakM)}
                      </span>
                    </div>

                    <div className="space-y-2.5 p-4">
                      <div>
                        <h3 className="line-clamp-1 text-sm font-bold text-gray-900 transition-colors group-hover:text-orange-600">
                          {t.nama}
                        </h3>
                        <span className="mt-1 inline-block rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-600 ring-1 ring-orange-100">
                          {t.kategori}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <MapPin className="h-3 w-3 shrink-0 text-orange-500" />
                        <span className="truncate">{t.area}</span>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            t.buka ? "bg-emerald-500" : "bg-gray-300"
                          }`}
                        />
                        <span
                          className={`font-semibold ${
                            t.buka ? "text-emerald-600" : "text-gray-400"
                          }`}
                        >
                          {t.buka ? "Buka" : "Tutup"}
                        </span>
                        <span className="text-gray-500">· {t.jam}</span>
                      </div>

                      <Layanan t={t} />

                      <div className="flex items-center justify-between border-t border-gray-100 pt-3 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                          <b className="text-gray-700">{t.rating}</b>
                        </span>
                        <span className="flex items-center gap-1">
                          <Package className="h-3.5 w-3.5 text-gray-400" />
                          {t.produk} produk
                        </span>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </>
          )}
        </section>
      </main>

      {/* FOOTER (desktop) */}
      <footer className="mt-8 hidden border-t border-gray-100 bg-white py-6 text-center text-xs text-gray-500 md:block">
        © 2026 Necoku. Belanja dari toko sekitarmu.
      </footer>

      {/* BOTTOM NAV */}
      <NavBawah aktif="Beranda" />

      {/* PEMILIH AREA */}
      {sheetArea && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/40 backdrop-blur-sm md:items-center md:justify-center"
          onClick={() => setSheetArea(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[80vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl md:max-w-md md:rounded-3xl"
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-gray-200 md:hidden" />
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                Pilih area sekitarmu
              </h2>
              <button
                onClick={() => setSheetArea(false)}
                aria-label="Tutup"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <ul className="space-y-1">
              {AREA.map((a) => {
                const aktif = area === a;
                const jumlah =
                  a === "Semua area"
                    ? TOKO.length
                    : TOKO.filter((t) => t.area === a).length;
                return (
                  <li key={a}>
                    <button
                      onClick={() => {
                        setArea(a);
                        setSheetArea(false);
                      }}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${
                        aktif ? "bg-orange-50" : "hover:bg-gray-50"
                      }`}
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                          aktif
                            ? "bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/25"
                            : "bg-gray-100 text-gray-400"
                        }`}
                      >
                        <MapPin className="h-4 w-4" />
                      </span>
                      <span
                        className={`flex-1 text-sm ${
                          aktif
                            ? "font-semibold text-orange-600"
                            : "font-medium text-gray-800"
                        }`}
                      >
                        {a}
                      </span>
                      <span className="text-xs text-gray-400">{jumlah} toko</span>
                      {aktif && <Check className="h-4 w-4 text-orange-500" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}