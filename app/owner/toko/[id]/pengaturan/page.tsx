"use client";

import { useState, type ComponentType } from "react";
import Link from "next/link";
import {
  ClipboardList,
  Clock,
  ExternalLink,
  ImageIcon,
  Landmark,
  Store,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { useToko } from "../components/toko-provider";
import { urlHalamanToko } from "../components/toko";
import InfoToko from "./components/info-toko";
import GambarToko from "./components/gambar-toko";
import JamBuka from "./components/jam-buka";
import Layanan from "./components/layanan";
import Pesanan from "./components/pesanan";
import Karyawan from "./components/karyawan";
import Rekening from "./components/rekening";

// Daftar katalog. Menambah katalog baru: buat file di ./components,
// lalu tambahkan satu baris di sini.
const KATALOG: { id: string; label: string; ikon: LucideIcon; Konten: ComponentType }[] = [
  { id: "info", label: "Info toko", ikon: Store, Konten: InfoToko },
  { id: "gambar", label: "Gambar", ikon: ImageIcon, Konten: GambarToko },
  { id: "jam", label: "Jam buka", ikon: Clock, Konten: JamBuka },
  { id: "layanan", label: "Layanan", ikon: UtensilsCrossed, Konten: Layanan },
  { id: "pesanan", label: "Pesanan", ikon: ClipboardList, Konten: Pesanan },
  { id: "karyawan", label: "Karyawan", ikon: Users, Konten: Karyawan },
  { id: "rekening", label: "Rekening", ikon: Landmark, Konten: Rekening },
];

export default function PengaturanTokoPage() {
  const { id, toko } = useToko();
  const aktif = toko.status === "aktif";

  const [tabAktif, setTabAktif] = useState(KATALOG[0].id);
  // Katalog yang sudah pernah dibuka tetap terpasang (hanya disembunyikan),
  // supaya isian yang belum disimpan tidak hilang saat pindah tab.
  const [dibuka, setDibuka] = useState<string[]>([KATALOG[0].id]);

  const pilih = (k: string) => {
    setTabAktif(k);
    setDibuka((d) => (d.includes(k) ? d : [...d, k]));
  };

  return (
    <div className="space-y-5 md:space-y-6">
      <header>
        <p className="text-sm text-gray-500">Atur profil dan layanan toko Anda</p>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">
          Pengaturan toko
        </h2>
      </header>

      {/* Katalog */}
      <div
        role="tablist"
        aria-label="Katalog pengaturan"
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {KATALOG.map(({ id: k, label, ikon: Ikon }) => {
          const on = tabAktif === k;
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => pilih(k)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors ${
                on
                  ? "border-orange-500 bg-orange-500 text-white shadow-sm"
                  : "border-gray-200 bg-white text-gray-600 hover:border-orange-200 hover:text-orange-600"
              }`}
            >
              <Ikon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </div>

      {/* Isi katalog */}
      {KATALOG.map(({ id: k, Konten }) =>
        dibuka.includes(k) ? (
          <div key={k} role="tabpanel" hidden={tabAktif !== k}>
            <Konten />
          </div>
        ) : null
      )}

      {aktif && (
        <div className="flex flex-wrap items-center gap-3 md:hidden">
          <Link
            href={urlHalamanToko(id)}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:border-orange-200 hover:bg-orange-50/50 hover:text-orange-600"
          >
            <ExternalLink className="h-4 w-4" />
            Lihat halaman toko
          </Link>
        </div>
      )}
    </div>
  );
}