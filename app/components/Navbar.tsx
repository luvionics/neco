// kode navbar (navigasi desktop di header dan bottom nav mobile)
"use client";

import { Bell, Home, LogIn, Receipt, User } from "lucide-react";
import Lencana from "@/app/components/Lencana";
import { useSesi } from "@/app/components/useSesi";
import { usePesananAktif } from "@/app/components/usePesananAktif";

// Satu-satunya sumber menu navigasi, dipakai semua halaman
export const NAV = [
  { nama: "Beranda", ikon: Home, href: "/" },
  { nama: "Pesanan", ikon: Receipt, href: "/pesanan" },
  { nama: "Notifikasi", ikon: Bell, href: "/notifikasi" },
  { nama: "Akun", ikon: User, href: "/akun" },
] as const;

export type NamaNav = (typeof NAV)[number]["nama"];

// Contoh jumlah notifikasi belum dibaca, nanti ganti dengan data asli
export const NOTIF_BARU = 2;

type Props = {
  aktif: NamaNav;
  notifBaru?: number;
  /** Menimpa jumlah pesanan aktif dari database (opsional). */
  pesananBaru?: number;
};

// Tombol masuk, tampil di header saat user belum login
export function TombolMasuk() {
  return (
    <a
      href="/login"
      className="flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-sm font-semibold text-orange-600 shadow-sm transition-all hover:bg-orange-50 active:scale-95 md:px-4"
    >
      <LogIn className="h-4 w-4" />
      Masuk
    </a>
  );
}

// Navigasi utama (desktop), ditampilkan di dalam header
export function NavDesktop({ aktif, notifBaru = NOTIF_BARU, pesananBaru }: Props) {
  const pesananDb = usePesananAktif();
  const jumlahPesanan = pesananBaru ?? pesananDb;

  return (
    <nav
      aria-label="Navigasi utama"
      className="hidden shrink-0 items-center gap-1 md:flex"
    >
      {NAV.map(({ nama, ikon: Ikon, href }) => {
        const menyala = nama === aktif;
        const jumlah =
          nama === "Notifikasi" ? notifBaru : nama === "Pesanan" ? jumlahPesanan : 0;
        return (
          <a
            key={nama}
            href={href}
            aria-current={menyala ? "page" : undefined}
            aria-label={
              nama === "Pesanan" && jumlah > 0
                ? `${nama}, ${jumlah} pesanan aktif`
                : undefined
            }
            className={`flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-[11px] font-medium text-white transition-all ${
              menyala ? "bg-white/20 ring-1 ring-white/25" : "hover:bg-white/10"
            }`}
          >
            <span className="relative">
              <Ikon className="h-5 w-5" />
              {jumlah > 0 && (
                <Lencana
                  jumlah={jumlah}
                  kelas="bg-yellow-300 text-red-700"
                />
              )}
            </span>
            {nama}
          </a>
        );
      })}
    </nav>
  );
}

// Bottom nav (mobile, melayang), hanya tampil saat sudah login
export function NavBawah({ aktif, notifBaru = NOTIF_BARU, pesananBaru }: Props) {
  const status = useSesi();
  const pesananDb = usePesananAktif();
  const jumlahPesanan = pesananBaru ?? pesananDb;

  if (status !== "masuk") return null;

  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 rounded-2xl border border-gray-100 bg-white/90 shadow-xl shadow-gray-900/10 backdrop-blur-xl md:hidden"
    >
      <ul className="grid grid-cols-4 p-1.5">
        {NAV.map(({ nama, ikon: Ikon, href }) => {
          const menyala = nama === aktif;
          const jumlah =
            nama === "Notifikasi" ? notifBaru : nama === "Pesanan" ? jumlahPesanan : 0;
          return (
            <li key={nama}>
              <a
                href={href}
                aria-current={menyala ? "page" : undefined}
                aria-label={
                  nama === "Pesanan" && jumlah > 0
                    ? `${nama}, ${jumlah} pesanan aktif`
                    : undefined
                }
                className={`flex flex-col items-center gap-1 py-1.5 text-[10px] font-medium transition-colors ${
                  menyala ? "text-orange-600" : "text-gray-400"
                }`}
              >
                <span
                  className={`flex h-8 w-14 items-center justify-center rounded-full transition-all duration-200 ${
                    menyala ? "bg-orange-100" : ""
                  }`}
                >
                  <span className="relative">
                    <Ikon className={`h-5 w-5 ${menyala ? "stroke-[2.5]" : ""}`} />
                    {jumlah > 0 && (
                      <Lencana
                        jumlah={jumlah}
                        kelas="bg-red-500 text-white ring-2 ring-white"
                      />
                    )}
                  </span>
                </span>
                {nama}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}