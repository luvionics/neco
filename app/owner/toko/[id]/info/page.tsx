"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Banknote,
  Calculator,
  CheckCircle2,
  Clock,
  ExternalLink,
  MapPin,
  Save,
  Store,
  type LucideIcon,
} from "lucide-react";
import { urlHalamanToko, useToko } from "../toko-context";
import { JENIS_PESANAN, Saklar } from "../ui";

// Gaya input modern (menggantikan INPUT bawaan agar seragam dengan halaman lain)
const INPUT_MODERN =
  "w-full rounded-xl border border-gray-200 bg-gray-50/70 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-500/10";

function KartuSection({
  ikon: Ikon,
  judul,
  deskripsi,
  children,
}: {
  ikon: LucideIcon;
  judul: string;
  deskripsi?: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
          <Ikon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">{judul}</h3>
          {deskripsi && <p className="text-xs text-gray-500">{deskripsi}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function BarisFitur({
  ikon: Ikon,
  judul,
  deskripsi,
  nyala,
  onChange,
}: {
  ikon: LucideIcon;
  judul: string;
  deskripsi?: string;
  nyala: boolean;
  onChange: () => void;
}) {
  return (
    <li className="flex items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-gray-50/70">
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
          nyala ? "bg-orange-50 text-orange-500" : "bg-gray-100 text-gray-400"
        }`}
      >
        <Ikon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900">{judul}</p>
        {deskripsi && <p className="text-xs text-gray-500">{deskripsi}</p>}
      </div>
      <Saklar nyala={nyala} onChange={onChange} label={judul} />
    </li>
  );
}

export default function InfoTokoPage() {
  const { id, toko, perbaruiToko } = useToko();

  const [form, setForm] = useState({
    nama: toko.nama,
    alamat: toko.alamat,
    buka: toko.buka,
    tutup: toko.tutup,
    antar: toko.antar,
    ambil: toko.ambil,
    meja: toko.meja,
    cod: toko.cod,
    kasir: toko.kasir,
  });
  const [tersimpan, setTersimpan] = useState(false);
  const [galat, setGalat] = useState("");

  const aktif = toko.status === "aktif";

  const simpan = () => {
    if (form.nama.trim().length < 3) {
      setGalat("Nama toko minimal 3 huruf");
      return;
    }
    if (form.alamat.trim().length < 8) {
      setGalat("Tulis alamat yang cukup jelas, misalnya nama jalan dan nomor");
      return;
    }
    if (!form.antar && !form.ambil && !form.meja && !form.kasir) {
      setGalat("Aktifkan minimal satu layanan");
      return;
    }
    if (form.buka === form.tutup) {
      setGalat("Jam tutup harus berbeda dari jam buka");
      return;
    }
    setGalat("");
    perbaruiToko({
      ...form,
      nama: form.nama.trim(),
      alamat: form.alamat.trim(),
    });
    setTersimpan(true);
    setTimeout(() => setTersimpan(false), 2500);
  };

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Header */}
      <header>
        <p className="text-sm text-gray-500">Atur profil dan layanan toko Anda</p>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">
          Info toko
        </h2>
      </header>

      {/* Profil toko */}
      <KartuSection
        ikon={Store}
        judul="Profil toko"
        deskripsi={`Kategori ${toko.kategori} · Area ${toko.area}`}
      >
        <div className="space-y-5 p-5">
          <div className="space-y-1.5">
            <label
              htmlFor="nama-toko"
              className="block text-sm font-medium text-gray-700"
            >
              Nama toko
            </label>
            <input
              id="nama-toko"
              value={form.nama}
              onChange={(e) => setForm({ ...form, nama: e.target.value })}
              className={INPUT_MODERN}
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="alamat-toko"
              className="flex items-center gap-1.5 text-sm font-medium text-gray-700"
            >
              <MapPin className="h-4 w-4 text-gray-400" />
              Alamat lengkap
            </label>
            <textarea
              id="alamat-toko"
              rows={2}
              value={form.alamat}
              onChange={(e) => setForm({ ...form, alamat: e.target.value })}
              className={`${INPUT_MODERN} resize-none`}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 md:gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor="jam-buka"
                className="flex items-center gap-1.5 text-sm font-medium text-gray-700"
              >
                <Clock className="h-4 w-4 text-gray-400" />
                Jam buka
              </label>
              <input
                id="jam-buka"
                type="time"
                value={form.buka}
                onChange={(e) => setForm({ ...form, buka: e.target.value })}
                className={INPUT_MODERN}
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="jam-tutup"
                className="flex items-center gap-1.5 text-sm font-medium text-gray-700"
              >
                <Clock className="h-4 w-4 text-gray-400" />
                Jam tutup
              </label>
              <input
                id="jam-tutup"
                type="time"
                value={form.tutup}
                onChange={(e) => setForm({ ...form, tutup: e.target.value })}
                className={INPUT_MODERN}
              />
            </div>
          </div>
        </div>
      </KartuSection>

      {/* Layanan untuk pembeli */}
      <KartuSection
        ikon={Store}
        judul="Layanan untuk pembeli"
        deskripsi="Pilih cara pembeli memesan dan membayar"
      >
        <ul className="divide-y divide-gray-100">
          {JENIS_PESANAN.map(({ id: k, label, ikon }) => (
            <BarisFitur
              key={k}
              ikon={ikon}
              judul={label}
              nyala={form[k]}
              onChange={() => setForm({ ...form, [k]: !form[k] })}
            />
          ))}
          <BarisFitur
            ikon={Banknote}
            judul="Bayar di tempat (COD)"
            nyala={form.cod}
            onChange={() => setForm({ ...form, cod: !form.cod })}
          />
        </ul>
      </KartuSection>

      {/* Fitur toko */}
      <KartuSection
        ikon={Calculator}
        judul="Fitur toko"
        deskripsi="Tambahan untuk mengelola toko"
      >
        <ul>
          <BarisFitur
            ikon={Calculator}
            judul="Kasir"
            deskripsi="Munculkan menu Kasir di navigasi"
            nyala={form.kasir}
            onChange={() => setForm({ ...form, kasir: !form.kasir })}
          />
        </ul>
      </KartuSection>

      {galat && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{galat}</p>
        </div>
      )}

      {/* Aksi */}
      <div className="flex flex-wrap items-center gap-3">
        {aktif && (
          <Link
            href={urlHalamanToko(id)}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:border-orange-200 hover:bg-orange-50/50 hover:text-orange-600 md:hidden"
          >
            <ExternalLink className="h-4 w-4" />
            Lihat halaman toko
          </Link>
        )}

        <span aria-live="polite" className="min-h-6">
          {tersimpan && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-600 ring-1 ring-emerald-100">
              <CheckCircle2 className="h-4 w-4" />
              Perubahan tersimpan
            </span>
          )}
        </span>

        <button
          onClick={simpan}
          className="ml-auto inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-orange-500/25 transition-all hover:shadow-lg hover:shadow-orange-500/30 active:scale-[0.98]"
        >
          <Save className="h-4 w-4" />
          Simpan perubahan
        </button>
      </div>
    </div>
  );
}