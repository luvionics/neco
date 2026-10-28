// kode komponen header
"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  NavDesktop,
  NOTIF_BARU,
  TombolMasuk,
  type NamaNav,
} from "@/app/components/Navbar";
import { useSesi } from "@/app/components/useSesi";

type Props = {
  /** Menu yang sedang aktif, dipakai untuk menyorot navigasi */
  aktif: NamaNav;
  /** Jumlah notifikasi belum dibaca (default: contoh dari Navbar) */
  notifBaru?: number;
  /** Isi bagian tengah header, misalnya kolom pencarian atau teks berjalan */
  children: ReactNode;
  /** Tambahan di dalam bar oranye, di bawah baris utama (misalnya pemilih area) */
  tambahan?: ReactNode;
  /** Bagian di bawah bar oranye (misalnya tab) */
  bawah?: ReactNode;
};

export default function Header({
  aktif,
  notifBaru = NOTIF_BARU,
  children,
  tambahan,
  bawah,
}: Props) {
  const status = useSesi();

  return (
    <header className="sticky top-0 z-30 shadow-lg shadow-orange-500/10">
      <div className="bg-gradient-to-r from-orange-500 to-red-500">
        <div className="mx-auto max-w-6xl px-3 py-3 md:px-4">
          <div className="flex items-center gap-3 md:gap-6">
            {/* Logo */}
            <Link href="/" className="flex shrink-0 items-center gap-2 text-white">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white p-1 shadow-sm md:h-10 md:w-10">
                <Image
                  src="/logo.png"
                  alt="Necoku"
                  width={40}
                  height={40}
                  className="h-full w-full object-contain"
                />
              </span>
              <span className="hidden text-2xl font-extrabold tracking-widest md:inline">
                Necoku
              </span>
            </Link>

            {children}

            {/* Sudah login: menu navigasi. Belum login: hanya tombol Masuk */}
            {status === "masuk" && (
              <NavDesktop aktif={aktif} notifBaru={notifBaru} />
            )}
            {status === "keluar" && <TombolMasuk />}
          </div>

          {tambahan}
        </div>
      </div>

      {bawah}
    </header>
  );
}
