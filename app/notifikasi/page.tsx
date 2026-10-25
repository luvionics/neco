// kode notifikasi
"use client";

import { useMemo, useState } from "react";
import {
  BellOff,
  CheckCheck,
  Info,
  Receipt,
  Tag,
  X,
} from "lucide-react";
import Header from "@/app/components/Header";
import { NavBawah } from "@/app/components/Navbar";
import TeksBerjalan from "@/app/components/TeksBerjalan";

type Jenis = "pesanan" | "promo" | "info";
type Kelompok = "Hari ini" | "Kemarin" | "Sebelumnya";

type Notif = {
  id: number;
  jenis: Jenis;
  judul: string;
  isi: string;
  waktu: string;
  kelompok: Kelompok;
  dibaca: boolean;
  href: string;
};

// Data contoh, nanti ganti dengan notifikasi milik user yang sedang login
const DATA_AWAL: Notif[] = [
  { id: 1, jenis: "pesanan", judul: "Pesanan sedang diantar", isi: "Pesanan NEC-221026-002 dari Warung Bu Siti sedang dalam perjalanan ke rumahmu.", waktu: "10 menit lalu", kelompok: "Hari ini", dibaca: false, href: "/pesanan" },
  { id: 2, jenis: "pesanan", judul: "Menunggu konfirmasi toko", isi: "Dapur Mak Nyah belum mengonfirmasi pesanan NEC-221026-003. Kamu bisa menghubungi toko lewat WhatsApp.", waktu: "1 jam lalu", kelompok: "Hari ini", dibaca: false, href: "/pesanan" },
  { id: 3, jenis: "promo", judul: "Gratis ongkir dari Dapur Mak Nyah", isi: "Pesan hari ini dan ongkos antar Rp0 untuk jarak sampai 1 km.", waktu: "3 jam lalu", kelompok: "Hari ini", dibaca: false, href: "/toko/2" },
  { id: 4, jenis: "pesanan", judul: "Pesanan siap diambil", isi: "Pesananmu di Toko Buku Pelita sudah siap. Tunjukkan nomor NEC-211026-001 saat mengambil.", waktu: "16.10", kelompok: "Kemarin", dibaca: true, href: "/pesanan" },
  { id: 5, jenis: "info", judul: "Toko baru di sekitarmu", isi: "Glow Beauty sudah buka di Perumahan Griya Asri, sekitar 1,9 km dari tempatmu.", waktu: "08.30", kelompok: "Kemarin", dibaca: true, href: "/toko/7" },
  { id: 6, jenis: "pesanan", judul: "Pesanan selesai", isi: "Bagaimana belanjamu di Berkah Fashion? Beri ulasan agar tetangga lain ikut terbantu.", waktu: "18 Okt", kelompok: "Sebelumnya", dibaca: true, href: "/pesanan/NEC-181026-004/ulasan" },
  { id: 7, jenis: "pesanan", judul: "Pesanan dibatalkan", isi: "Pesanan NEC-051026-001 dari Gadget Corner dibatalkan.", waktu: "5 Okt", kelompok: "Sebelumnya", dibaca: true, href: "/pesanan" },
  { id: 8, jenis: "info", judul: "Selamat datang di NECAS", isi: "Temukan toko terdekat, lihat jam buka, lalu pilih diantar atau ambil sendiri.", waktu: "1 Okt", kelompok: "Sebelumnya", dibaca: true, href: "/" },
];

const KELOMPOK: Kelompok[] = ["Hari ini", "Kemarin", "Sebelumnya"];

const JENIS_INFO: Record<
  Jenis,
  { ikon: React.ComponentType<{ className?: string }>; kelas: string }
> = {
  pesanan: { ikon: Receipt, kelas: "bg-orange-50 text-orange-600 ring-1 ring-orange-100" },
  promo: { ikon: Tag, kelas: "bg-pink-50 text-pink-600 ring-1 ring-pink-100" },
  info: { ikon: Info, kelas: "bg-blue-50 text-blue-600 ring-1 ring-blue-100" },
};

type TabId = "semua" | Jenis;

const TAB: { id: TabId; label: string }[] = [
  { id: "semua", label: "Semua" },
  { id: "pesanan", label: "Pesanan" },
  { id: "promo", label: "Promo" },
  { id: "info", label: "Info" },
];

// Teks berjalan di header: keterangan seputar notifikasi
const TEKS_NOTIF = [
  "Cari notifikasi berdasarkan jenis lewat tab Pesanan, Promo, atau Info",
  "Titik oranye menandakan notifikasi yang belum kamu baca",
  "Ketuk notifikasi untuk langsung membuka halaman yang terkait",
  "Pakai Tandai semua dibaca untuk merapikan daftar sekaligus",
  "Hapus notifikasi yang sudah tidak perlu lewat tombol silang",
  "Kabar status pesananmu muncul di tab Pesanan",
  "Promo dari toko sekitar akan muncul di tab Promo",
  "Info toko baru di sekitarmu ada di tab Info",
];

const SEMBUNYIKAN_SCROLLBAR =
  "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

export default function NotifikasiPage() {
  const [daftar, setDaftar] = useState<Notif[]>(DATA_AWAL);
  const [tab, setTab] = useState<TabId>("semua");

  const belumDibaca = daftar.filter((n) => !n.dibaca).length;

  const hasil = useMemo(
    () => daftar.filter((n) => tab === "semua" || n.jenis === tab),
    [daftar, tab]
  );

  const belumPerTab = (id: TabId) =>
    daftar.filter((n) => !n.dibaca && (id === "semua" || n.jenis === id)).length;

  const tandaiDibaca = (id: number) => {
    // TODO: simpan ke database
    setDaftar((d) => d.map((n) => (n.id === id ? { ...n, dibaca: true } : n)));
  };

  const tandaiSemua = () => {
    // TODO: simpan ke database
    setDaftar((d) => d.map((n) => ({ ...n, dibaca: true })));
  };

  const hapus = (id: number) => {
    // TODO: hapus di database
    setDaftar((d) => d.filter((n) => n.id !== id));
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-28 text-gray-800 md:pb-0">
      {/* HEADER */}
      <Header
        aktif="Notifikasi"
        notifBaru={belumDibaca}
        bawah={
          <div className="border-b border-gray-100 bg-white">
            <div
              role="tablist"
              className={`mx-auto flex max-w-4xl overflow-x-auto px-1 md:px-4 ${SEMBUNYIKAN_SCROLLBAR}`}
            >
              {TAB.map((t) => {
                const aktif = tab === t.id;
                const belum = belumPerTab(t.id);
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
                    {belum > 0 && (
                      <span className="rounded-full bg-orange-500 px-1.5 text-[10px] font-bold leading-4 text-white">
                        {belum}
                      </span>
                    )}
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
        <h1 className="sr-only">Notifikasi</h1>

        {/* Teks berjalan: keterangan tentang notifikasi */}
        <TeksBerjalan teks={TEKS_NOTIF} className="min-w-0 flex-1" />
      </Header>

      <main className="mx-auto max-w-4xl space-y-5 px-3 py-4 md:px-4 md:py-6">
        {/* Baris aksi */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-gray-500" aria-live="polite">
            {belumDibaca > 0 ? (
              <>
                <b className="text-gray-900">{belumDibaca}</b> notifikasi belum
                dibaca
              </>
            ) : (
              "Semua notifikasi sudah dibaca"
            )}
          </p>
          <button
            onClick={tandaiSemua}
            disabled={belumDibaca === 0}
            className="flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-3.5 py-1.5 text-xs font-medium text-orange-600 transition-colors hover:bg-orange-100 disabled:cursor-not-allowed disabled:border-gray-100 disabled:bg-gray-50 disabled:text-gray-400 disabled:hover:bg-gray-50"
          >
            <CheckCheck className="h-4 w-4" />
            Tandai semua dibaca
          </button>
        </div>

        {hasil.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-3xl border border-gray-100 bg-white px-6 py-16 text-center shadow-sm">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-orange-50 ring-8 ring-orange-50/60">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/30">
                <BellOff className="h-7 w-7" />
              </span>
            </span>
            <div>
              <p className="text-base font-bold text-gray-900">
                Belum ada notifikasi
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Kabar soal pesanan, promo, dan toko sekitarmu akan muncul di sini.
              </p>
            </div>
          </div>
        ) : (
          KELOMPOK.map((k) => {
            const item = hasil.filter((n) => n.kelompok === k);
            if (item.length === 0) return null;
            return (
              <section key={k} className="space-y-2">
                <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {k}
                </h2>
                <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                  {item.map((n) => {
                    const { ikon: Ikon, kelas } = JENIS_INFO[n.jenis];
                    return (
                      <li
                        key={n.id}
                        className={`relative flex items-start transition-colors ${
                          n.dibaca ? "" : "bg-orange-50/60"
                        }`}
                      >
                        {!n.dibaca && (
                          <span className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-gradient-to-b from-orange-500 to-amber-500" />
                        )}
                        <a
                          href={n.href}
                          onClick={() => tandaiDibaca(n.id)}
                          className="flex min-w-0 flex-1 items-start gap-3.5 p-4 transition-colors hover:bg-gray-50/70 md:p-5"
                        >
                          <span
                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${kelas}`}
                          >
                            <Ikon className="h-5 w-5" />
                          </span>
                          <span className="min-w-0 flex-1 space-y-1">
                            <span className="flex items-center gap-2">
                              <span
                                className={`truncate text-sm text-gray-900 ${
                                  n.dibaca ? "font-medium" : "font-bold"
                                }`}
                              >
                                {n.judul}
                              </span>
                              {!n.dibaca && (
                                <span className="h-2 w-2 shrink-0 rounded-full bg-orange-500 shadow-[0_0_0_3px_rgba(249,115,22,0.2)]">
                                  <span className="sr-only">Belum dibaca</span>
                                </span>
                              )}
                            </span>
                            <span className="block text-xs leading-relaxed text-gray-600">
                              {n.isi}
                            </span>
                            <span className="block text-[11px] text-gray-400">
                              {n.waktu}
                            </span>
                          </span>
                        </a>
                        <button
                          onClick={() => hapus(n.id)}
                          aria-label={`Hapus notifikasi: ${n.judul}`}
                          className="m-2.5 shrink-0 rounded-full p-1.5 text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })
        )}
      </main>

      {/* BOTTOM NAV */}
      <NavBawah aktif="Notifikasi" notifBaru={belumDibaca} />
    </div>
  );
}