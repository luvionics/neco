// kode pesanan
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Header from "@/app/components/Header";
import { NavBawah } from "@/app/components/Navbar";
import {
  AlertTriangle,
  Banknote,
  Bike,
  Check,
  ChevronDown,
  MessageCircle,
  Receipt,
  Store,
} from "lucide-react";
import TeksBerjalan from "@/app/components/TeksBerjalan";

type StatusPesanan =
  | "menunggu"
  | "diproses"
  | "dikirim"
  | "siap"
  | "selesai"
  | "dibatalkan";

type Item = { nama: string; qty: number; harga: number };

type Pesanan = {
  id: string;
  tokoId: number;
  toko: string;
  warna: string;
  wa: string; // nomor WhatsApp toko, format internasional tanpa +
  tanggal: string;
  metode: "antar" | "ambil";
  bayar: "cod" | "transfer";
  item: Item[];
  ongkir: number;
  status: StatusPesanan;
};

// Data contoh, nanti ganti dengan pesanan milik user yang sedang login
const DATA_AWAL: Pesanan[] = [
  { id: "NEC-221026-003", tokoId: 2, toko: "Dapur Mak Nyah", warna: "from-red-400 to-rose-500", wa: "6281234567801", tanggal: "22 Okt 2026, 11.20", metode: "antar", bayar: "cod", item: [{ nama: "Nasi ayam geprek", qty: 2, harga: 18000 }, { nama: "Es teh manis", qty: 2, harga: 4000 }], ongkir: 3000, status: "menunggu" },
  { id: "NEC-221026-002", tokoId: 1, toko: "Warung Bu Siti", warna: "from-amber-400 to-orange-500", wa: "6281234567802", tanggal: "22 Okt 2026, 09.15", metode: "antar", bayar: "cod", item: [{ nama: "Beras 5 kg", qty: 1, harga: 68000 }, { nama: "Minyak goreng 1 L", qty: 2, harga: 17000 }, { nama: "Gula pasir 1 kg", qty: 1, harga: 16000 }], ongkir: 2000, status: "dikirim" },
  { id: "NEC-211026-001", tokoId: 4, toko: "Toko Buku Pelita", warna: "from-violet-400 to-purple-600", wa: "6281234567803", tanggal: "21 Okt 2026, 15.40", metode: "ambil", bayar: "transfer", item: [{ nama: "Buku tulis 38 lembar", qty: 5, harga: 4500 }, { nama: "Pulpen gel hitam", qty: 3, harga: 3500 }], ongkir: 0, status: "siap" },
  { id: "NEC-181026-004", tokoId: 3, toko: "Berkah Fashion", warna: "from-pink-400 to-fuchsia-500", wa: "6281234567804", tanggal: "18 Okt 2026, 13.05", metode: "ambil", bayar: "cod", item: [{ nama: "Kaos polos hitam L", qty: 2, harga: 45000 }], ongkir: 0, status: "selesai" },
  { id: "NEC-121026-002", tokoId: 1, toko: "Warung Bu Siti", warna: "from-amber-400 to-orange-500", wa: "6281234567802", tanggal: "12 Okt 2026, 07.30", metode: "antar", bayar: "cod", item: [{ nama: "Telur 1 kg", qty: 1, harga: 29000 }, { nama: "Mie instan goreng", qty: 10, harga: 3200 }], ongkir: 2000, status: "selesai" },
  { id: "NEC-051026-001", tokoId: 5, toko: "Gadget Corner", warna: "from-blue-400 to-indigo-600", wa: "6281234567805", tanggal: "5 Okt 2026, 19.45", metode: "antar", bayar: "transfer", item: [{ nama: "Kabel charger Type-C", qty: 1, harga: 35000 }], ongkir: 5000, status: "dibatalkan" },
];

const STATUS: Record<StatusPesanan, { label: string; kelas: string }> = {
  menunggu: { label: "Menunggu konfirmasi", kelas: "bg-amber-50 text-amber-700 ring-1 ring-amber-100" },
  diproses: { label: "Sedang diproses", kelas: "bg-blue-50 text-blue-700 ring-1 ring-blue-100" },
  dikirim: { label: "Sedang diantar", kelas: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100" },
  siap: { label: "Siap diambil", kelas: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" },
  selesai: { label: "Selesai", kelas: "bg-gray-100 text-gray-600 ring-1 ring-gray-200" },
  dibatalkan: { label: "Dibatalkan", kelas: "bg-red-50 text-red-700 ring-1 ring-red-100" },
};

const BERLANGSUNG: StatusPesanan[] = ["menunggu", "diproses", "dikirim", "siap"];

type TabId = "semua" | "berlangsung" | "selesai" | "dibatalkan";

const TAB: { id: TabId; label: string }[] = [
  { id: "semua", label: "Semua" },
  { id: "berlangsung", label: "Berlangsung" },
  { id: "selesai", label: "Selesai" },
  { id: "dibatalkan", label: "Dibatalkan" },
];

const SEMBUNYIKAN_SCROLLBAR =
  "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

const TOMBOL_UTAMA =
  "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/25 transition-all hover:shadow-lg hover:shadow-orange-500/30 active:scale-[0.98]";

// ---------- Fungsi bantu ----------

const rupiah = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

const subtotal = (p: Pesanan) =>
  p.item.reduce((n, i) => n + i.harga * i.qty, 0);

const cocokTab = (p: Pesanan, tab: TabId) =>
  tab === "semua" ||
  (tab === "berlangsung" && BERLANGSUNG.includes(p.status)) ||
  (tab === "selesai" && p.status === "selesai") ||
  (tab === "dibatalkan" && p.status === "dibatalkan");

// ---------- Komponen kecil ----------

function Progres({ p }: { p: Pesanan }) {
  const langkah = [
    "Menunggu",
    "Diproses",
    p.metode === "antar" ? "Diantar" : "Siap diambil",
    "Selesai",
  ];
  const posisi: Record<StatusPesanan, number> = {
    menunggu: 0,
    diproses: 1,
    dikirim: 2,
    siap: 2,
    selesai: 3,
    dibatalkan: -1,
  };
  const sekarang = posisi[p.status];

  return (
    <ol className="flex items-start" aria-label="Tahap pesanan">
      {langkah.map((nama, i) => {
        const lewat = i < sekarang;
        const aktif = i === sekarang;
        return (
          <li key={nama} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full items-center">
              <span
                className={`h-1 flex-1 rounded-full ${
                  i === 0
                    ? "invisible"
                    : lewat || aktif
                    ? "bg-gradient-to-r from-orange-400 to-orange-500"
                    : "bg-gray-200"
                }`}
              />
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white transition-all ${
                  aktif
                    ? "bg-gradient-to-br from-orange-500 to-amber-500 shadow-md shadow-orange-500/30 ring-4 ring-orange-100"
                    : lewat
                    ? "bg-orange-500"
                    : "bg-gray-200"
                }`}
              >
                {lewat && <Check className="h-3.5 w-3.5" />}
                {aktif && <span className="h-2 w-2 rounded-full bg-white" />}
              </span>
              <span
                className={`h-1 flex-1 rounded-full ${
                  i === langkah.length - 1
                    ? "invisible"
                    : lewat
                    ? "bg-gradient-to-r from-orange-500 to-orange-400"
                    : "bg-gray-200"
                }`}
              />
            </div>
            <span
              className={`text-center text-[10px] leading-tight ${
                aktif ? "font-semibold text-orange-600" : "text-gray-500"
              }`}
            >
              {nama}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ---------- Halaman ----------

export default function PesananPage() {
  const [daftar, setDaftar] = useState<Pesanan[]>(DATA_AWAL);
  const [tab, setTab] = useState<TabId>("semua");
  const [terbuka, setTerbuka] = useState<string | null>(null);
  const [batal, setBatal] = useState<Pesanan | null>(null);

  const hasil = useMemo(() => daftar.filter((p) => cocokTab(p, tab)), [daftar, tab]);
  const hitung = (id: TabId) => daftar.filter((p) => cocokTab(p, id)).length;

  const konfirmasiBatal = () => {
    if (!batal) return;
    // TODO: kirim pembatalan ke database
    setDaftar((d) =>
      d.map((p) => (p.id === batal.id ? { ...p, status: "dibatalkan" } : p))
    );
    setBatal(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-28 text-gray-800 md:pb-0">
      {/* HEADER */}
      <Header
        aktif="Pesanan"
        bawah={
          <div className="border-b border-gray-100 bg-white">
            <div
              role="tablist"
              className={`mx-auto flex max-w-4xl overflow-x-auto px-1 md:px-4 ${SEMBUNYIKAN_SCROLLBAR}`}
            >
              {TAB.map((t) => {
                const aktif = tab === t.id;
                return (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={aktif}
                    onClick={() => setTab(t.id)}
                    className={`relative flex shrink-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap px-4 py-3 text-sm transition-colors md:flex-none md:px-6 ${
                      aktif
                        ? "font-semibold text-orange-600"
                        : "text-gray-500 hover:text-gray-800"
                    }`}
                  >
                    {t.label}
                    <span
                      className={`min-w-5 rounded-full px-1.5 text-center text-[11px] font-bold leading-5 ${
                        aktif
                          ? "bg-orange-100 text-orange-600"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {hitung(t.id)}
                    </span>
                    {aktif && (
                      <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-gradient-to-r from-orange-500 to-amber-500" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        }
      >
        {/* Judul halaman, disembunyikan secara visual untuk pembaca layar */}
        <h1 className="sr-only">Pesanan saya</h1>

        {/* Teks berjalan: keterangan tentang pencarian */}
        <TeksBerjalan className="min-w-0 flex-1" />
      </Header>

      <main className="mx-auto max-w-4xl space-y-3 px-3 py-4 md:space-y-4 md:px-4 md:py-6">
        {hasil.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-3xl border border-gray-100 bg-white px-6 py-16 text-center shadow-sm">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-orange-50 ring-8 ring-orange-50/60">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/30">
                <Receipt className="h-7 w-7" />
              </span>
            </span>
            <div>
              <p className="text-base font-bold text-gray-900">
                {tab === "semua" ? "Belum ada pesanan" : "Tidak ada pesanan di sini"}
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Pesanan dari toko sekitarmu akan muncul di halaman ini.
              </p>
            </div>
            <Link
              href="/"
              className={`rounded-xl px-5 py-2.5 text-sm font-semibold ${TOMBOL_UTAMA}`}
            >
              Cari toko terdekat
            </Link>
          </div>
        ) : (
          hasil.map((p) => {
            const info = STATUS[p.status];
            const berjalan = BERLANGSUNG.includes(p.status);
            const buka = terbuka === p.id;
            const total = subtotal(p) + p.ongkir;
            const pertama = p.item[0];
            const sisa = p.item.length - 1;

            return (
              <article
                key={p.id}
                className={`space-y-3.5 rounded-2xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md md:p-5 ${
                  berjalan ? "border-orange-100" : "border-gray-100"
                }`}
              >
                {/* Kepala */}
                <div className="flex items-center gap-3">
                  <a
                    href={`/toko/${p.tokoId}`}
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-sm ${p.warna}`}
                    aria-label={`Buka ${p.toko}`}
                  >
                    <Store className="h-5 w-5 text-white" />
                  </a>
                  <div className="min-w-0 flex-1">
                    <a
                      href={`/toko/${p.tokoId}`}
                      className="block truncate text-sm font-bold text-gray-900 transition-colors hover:text-orange-600"
                    >
                      {p.toko}
                    </a>
                    <p className="truncate text-xs text-gray-500">
                      {p.id} · {p.tanggal}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${info.kelas}`}
                  >
                    {info.label}
                  </span>
                </div>

                {/* Progres untuk pesanan berlangsung */}
                {berjalan && (
                  <div className="rounded-xl bg-gray-50 px-2 py-3.5 ring-1 ring-gray-100">
                    <Progres p={p} />
                  </div>
                )}

                {/* Ringkasan */}
                <div className="flex items-end justify-between gap-3 border-t border-gray-100 pt-3.5">
                  <div className="min-w-0 text-sm">
                    <p className="truncate text-gray-900">
                      {pertama.nama}
                      <span className="font-medium text-gray-400"> ×{pertama.qty}</span>
                    </p>
                    {sisa > 0 && (
                      <p className="text-xs text-gray-500">+ {sisa} produk lainnya</p>
                    )}
                    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        {p.metode === "antar" ? (
                          <Bike className="h-3.5 w-3.5 text-orange-500" />
                        ) : (
                          <Store className="h-3.5 w-3.5 text-orange-500" />
                        )}
                        {p.metode === "antar" ? "Diantar" : "Ambil di toko"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Banknote className="h-3.5 w-3.5 text-orange-500" />
                        {p.bayar === "cod" ? "Bayar di tempat" : "Transfer"}
                      </span>
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[11px] text-gray-400">Total</p>
                    <p className="text-lg font-extrabold leading-tight text-gray-900">
                      {rupiah(total)}
                    </p>
                  </div>
                </div>

                {/* Rincian */}
                <button
                  onClick={() => setTerbuka(buka ? null : p.id)}
                  aria-expanded={buka}
                  className="flex w-full items-center justify-center gap-1 rounded-xl py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-orange-50/60 hover:text-orange-600"
                >
                  {buka ? "Sembunyikan rincian" : "Lihat rincian"}
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-200 ${
                      buka ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {buka && (
                  <div className="space-y-2 rounded-xl bg-gray-50 p-3.5 text-sm ring-1 ring-gray-100">
                    {p.item.map((i) => (
                      <div key={i.nama} className="flex justify-between gap-3">
                        <span className="text-gray-800">
                          {i.nama}{" "}
                          <span className="font-medium text-gray-400">×{i.qty}</span>
                        </span>
                        <span className="shrink-0 text-gray-600">
                          {rupiah(i.harga * i.qty)}
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-between border-t border-dashed border-gray-200 pt-2 text-gray-600">
                      <span>Subtotal</span>
                      <span>{rupiah(subtotal(p))}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Ongkos antar</span>
                      <span>{p.ongkir === 0 ? "Gratis" : rupiah(p.ongkir)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-gray-900">
                      <span>Total</span>
                      <span>{rupiah(total)}</span>
                    </div>
                  </div>
                )}

                {/* Aksi */}
                <div className="flex flex-wrap justify-end gap-2">
                  {berjalan && (
                    <a
                      href={`https://wa.me/${p.wa}?text=${encodeURIComponent(
                        `Halo, saya mau tanya pesanan ${p.id}`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mr-auto flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3.5 py-2 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100 transition-colors hover:bg-emerald-100"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      Hubungi toko
                    </a>
                  )}
                  {p.status === "menunggu" && (
                    <button
                      onClick={() => setBatal(p)}
                      className="rounded-xl border border-red-200 bg-white px-4 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                    >
                      Batalkan pesanan
                    </button>
                  )}
                  {p.status === "selesai" && (
                    <a
                      href={`/pesanan/${p.id}/ulasan`}
                      className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-2 text-xs font-semibold text-orange-600 transition-colors hover:bg-orange-100"
                    >
                      Beri ulasan
                    </a>
                  )}
                  {(p.status === "selesai" || p.status === "dibatalkan") && (
                    <a
                      href={`/toko/${p.tokoId}`}
                      className={`rounded-xl px-4 py-2 text-xs font-semibold ${TOMBOL_UTAMA}`}
                    >
                      Pesan lagi
                    </a>
                  )}
                </div>
              </article>
            );
          })
        )}
      </main>

      {/* BOTTOM NAV */}
      <NavBawah aktif="Pesanan" />

      {/* KONFIRMASI BATAL */}
      {batal && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/40 backdrop-blur-sm md:items-center md:justify-center"
          onClick={() => setBatal(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="judul-batal"
            onClick={(e) => e.stopPropagation()}
            className="w-full space-y-4 rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl md:max-w-sm md:rounded-3xl"
          >
            <div className="mx-auto h-1.5 w-10 rounded-full bg-gray-200 md:hidden" />
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-500 ring-1 ring-red-100">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div className="space-y-1">
                <h2 id="judul-batal" className="text-lg font-bold text-gray-900">
                  Batalkan pesanan ini?
                </h2>
                <p className="text-sm text-gray-500">
                  Pesanan {batal.id} dari {batal.toko} akan dibatalkan. Kamu perlu
                  memesan ulang kalau berubah pikiran.
                </p>
              </div>
            </div>
            <div className="flex gap-2.5">
              <button
                onClick={() => setBatal(null)}
                className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Tidak jadi
              </button>
              <button
                onClick={konfirmasiBatal}
                className="flex-1 rounded-xl bg-gradient-to-r from-red-500 to-rose-500 py-2.5 text-sm font-semibold text-white shadow-md shadow-red-500/25 transition-all hover:shadow-lg hover:shadow-red-500/30 active:scale-[0.98]"
              >
                Ya, batalkan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}