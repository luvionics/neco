"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import Bidang, { PesanGalat, kelasInput } from "./Bidang";
import PilihLokasi from "./PilihLokasi";
import UnggahFoto from "./UnggahFoto";
import {
  OPSI_GENDER,
  bersihkan,
  kolomKurang,
  validasi,
  type Galat,
  type Profil,
} from "./profil";

const TOMBOL_UTAMA =
  "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/25 transition-all hover:shadow-lg hover:shadow-orange-500/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70";

type Props = {
  userId: string;
  awal: Profil;
  mode: "ubah" | "lengkapi";
  daftarArea: string[];
  // Kembalikan pesan galat bila gagal, atau null bila berhasil
  onSimpan: (data: Profil) => Promise<string | null>;
  onTutup: () => void;
};

function Bagian({
  judul,
  ket,
  children,
}: {
  judul: string;
  ket?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-gray-900">{judul}</h2>
        {ket && <p className="text-xs text-gray-500">{ket}</p>}
      </div>
      {children}
    </section>
  );
}

export default function FormProfil({
  userId,
  awal,
  mode,
  daftarArea,
  onSimpan,
  onTutup,
}: Props) {
  const [draf, setDraf] = useState<Profil>(awal);
  const [galat, setGalat] = useState<Galat>({});
  const [galatSimpan, setGalatSimpan] = useState("");
  const [menyimpan, setMenyimpan] = useState(false);

  // Kolom yang kosong saat form dibuka (dipakai untuk penanda di mode lengkapi)
  const [kurangAwal] = useState<(keyof Profil)[]>(() =>
    kolomKurang(awal).map((k) => k.key)
  );

  const berubah = JSON.stringify(draf) !== JSON.stringify(awal);

  const tutup = () => {
    if (menyimpan) return;
    if (berubah && !window.confirm("Perubahan belum disimpan. Tutup tanpa menyimpan?"))
      return;
    onTutup();
  };
  const tutupRef = useRef(tutup);
  useEffect(() => {
    tutupRef.current = tutup;
  });

  // Kunci scroll halaman di belakang, dan tutup dengan tombol Esc
  useEffect(() => {
    const overflowAwal = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") tutupRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflowAwal;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const fokus = (key: string) => {
    const el = document.getElementById(`f-${key}`);
    el?.scrollIntoView({ block: "center" });
    (el as HTMLElement | null)?.focus({ preventScroll: true });
  };

  // Mode lengkapi: langsung arahkan ke kolom pertama yang kosong
  useEffect(() => {
    if (mode !== "lengkapi" || kurangAwal.length === 0) return;
    fokus(kurangAwal[0]);
  }, [mode, kurangAwal]);

  const ubah =
    (k: keyof Profil) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >
    ) =>
      setDraf((d) => ({ ...d, [k]: e.target.value }));

  const isi = (k: keyof Profil) => (v: string) => setDraf((d) => ({ ...d, [k]: v }));

  const kosong = (k: keyof Profil) =>
    mode === "lengkapi" && kurangAwal.includes(k) && !draf[k].trim();

  const simpan = async () => {
    const bersih = bersihkan(draf);
    const e = validasi(bersih);
    setGalat(e);
    setGalatSimpan("");

    if (Object.keys(e).length > 0) {
      fokus(Object.keys(e)[0]);
      return;
    }

    setMenyimpan(true);
    const pesan = await onSimpan(bersih);
    setMenyimpan(false);
    if (pesan) setGalatSimpan(pesan);
    // Kalau berhasil, halaman induk yang menutup form
  };

  const judul = mode === "lengkapi" ? "Lengkapi data" : "Ubah profil";
  const hariIni = new Date().toISOString().slice(0, 10);
  const inisial = draf.nama.trim().charAt(0).toUpperCase() || "?";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="judul-form-profil"
      className="fixed inset-0 z-50 flex flex-col bg-gray-50"
    >
      {/* BAR ATAS */}
      <header className="shrink-0 border-b border-gray-100 bg-white pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-3 py-3 md:px-4">
          <button
            type="button"
            onClick={tutup}
            disabled={menyimpan}
            aria-label="Kembali"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200 disabled:opacity-50"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h1
              id="judul-form-profil"
              className="truncate text-base font-bold text-gray-900"
            >
              {judul}
            </h1>
            <p className="truncate text-xs text-gray-500">
              {mode === "lengkapi"
                ? "Isi kolom bertanda kuning agar profilmu lengkap"
                : "Tanda * wajib diisi"}
            </p>
          </div>
        </div>
      </header>

      {/* ISI FORM */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-4 px-3 py-4 md:space-y-5 md:px-4 md:py-6">
          {galatSimpan && (
            <div className="rounded-xl bg-red-50 px-3.5 py-2.5 ring-1 ring-red-100">
              <PesanGalat>{galatSimpan}</PesanGalat>
            </div>
          )}

          <Bagian judul="Foto profil">
            <UnggahFoto
              id="f-avatar"
              jenis="avatar"
              userId={userId}
              value={draf.avatar}
              onChange={isi("avatar")}
              inisial={inisial}
              kosong={kosong("avatar")}
            />
          </Bagian>

          <Bagian judul="Data diri">
            <Bidang id="f-nama" label="Nama" wajib kosong={kosong("nama")} galat={galat.nama}>
              <input
                id="f-nama"
                value={draf.nama}
                onChange={ubah("nama")}
                autoComplete="name"
                className={kelasInput(!!galat.nama, kosong("nama"))}
              />
            </Bidang>

            <Bidang
              id="f-username"
              label="Username"
              kosong={kosong("username")}
              galat={galat.username}
              petunjuk="Opsional. Huruf, angka, titik, atau garis bawah"
            >
              <input
                id="f-username"
                value={draf.username}
                onChange={ubah("username")}
                autoCapitalize="none"
                autoComplete="username"
                className={kelasInput(!!galat.username, kosong("username"))}
              />
            </Bidang>

            <div className="grid gap-4 md:grid-cols-2">
              <Bidang id="f-gender" label="Jenis kelamin" kosong={kosong("gender")} galat={galat.gender}>
                <select
                  id="f-gender"
                  value={draf.gender}
                  onChange={ubah("gender")}
                  className={kelasInput(!!galat.gender, kosong("gender"))}
                >
                  <option value="">Pilih</option>
                  {OPSI_GENDER.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Bidang>

              <Bidang id="f-tglLahir" label="Tanggal lahir" kosong={kosong("tglLahir")} galat={galat.tglLahir}>
                <input
                  id="f-tglLahir"
                  type="date"
                  max={hariIni}
                  value={draf.tglLahir}
                  onChange={ubah("tglLahir")}
                  className={kelasInput(!!galat.tglLahir, kosong("tglLahir"))}
                />
              </Bidang>
            </div>
          </Bagian>

          <Bagian judul="Kontak">
            <Bidang
              id="f-whatsapp"
              label="Nomor WhatsApp"
              wajib
              kosong={kosong("whatsapp")}
              galat={galat.whatsapp}
            >
              <input
                id="f-whatsapp"
                type="tel"
                inputMode="tel"
                value={draf.whatsapp}
                onChange={ubah("whatsapp")}
                placeholder="0812 3456 7890"
                autoComplete="tel"
                className={kelasInput(!!galat.whatsapp, kosong("whatsapp"))}
              />
            </Bidang>

            <Bidang
              id="f-phone"
              label="Nomor telepon lain"
              kosong={kosong("phone")}
              galat={galat.phone}
              petunjuk="Opsional"
            >
              <input
                id="f-phone"
                type="tel"
                inputMode="tel"
                value={draf.phone}
                onChange={ubah("phone")}
                className={kelasInput(!!galat.phone, kosong("phone"))}
              />
            </Bidang>
          </Bagian>

          <Bagian
            judul="Alamat"
            ket="Dipakai untuk menemukan toko terdekat dan alamat pengantaran"
          >
            <Bidang
              id="f-penerima"
              label="Nama penerima"
              kosong={kosong("penerima")}
              galat={galat.penerima}
              petunjuk="Kosongkan jika sama dengan namamu"
            >
              <input
                id="f-penerima"
                value={draf.penerima}
                onChange={ubah("penerima")}
                className={kelasInput(!!galat.penerima, kosong("penerima"))}
              />
            </Bidang>

            <Bidang id="f-alamat" label="Alamat lengkap" kosong={kosong("alamat")} galat={galat.alamat}>
              <textarea
                id="f-alamat"
                rows={3}
                value={draf.alamat}
                onChange={ubah("alamat")}
                placeholder="Nama jalan, nomor rumah, RT/RW"
                className={`${kelasInput(!!galat.alamat, kosong("alamat"))} resize-none`}
              />
            </Bidang>

            <Bidang
              id="f-area"
              label="Area sekitarmu (desa/kelurahan)"
              wajib
              kosong={kosong("area")}
              galat={galat.area}
            >
              <input
                id="f-area"
                list="daftar-area"
                value={draf.area}
                onChange={ubah("area")}
                placeholder="Pilih dari saran atau ketik sendiri"
                className={kelasInput(!!galat.area, kosong("area"))}
              />
              <datalist id="daftar-area">
                {daftarArea.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </Bidang>

            <div className="grid gap-4 md:grid-cols-2">
              <Bidang id="f-kecamatan" label="Kecamatan" kosong={kosong("kecamatan")} galat={galat.kecamatan}>
                <input
                  id="f-kecamatan"
                  value={draf.kecamatan}
                  onChange={ubah("kecamatan")}
                  className={kelasInput(!!galat.kecamatan, kosong("kecamatan"))}
                />
              </Bidang>
              <Bidang id="f-kota" label="Kota/Kabupaten" kosong={kosong("kota")} galat={galat.kota}>
                <input
                  id="f-kota"
                  value={draf.kota}
                  onChange={ubah("kota")}
                  className={kelasInput(!!galat.kota, kosong("kota"))}
                />
              </Bidang>
              <Bidang id="f-provinsi" label="Provinsi" kosong={kosong("provinsi")} galat={galat.provinsi}>
                <input
                  id="f-provinsi"
                  value={draf.provinsi}
                  onChange={ubah("provinsi")}
                  className={kelasInput(!!galat.provinsi, kosong("provinsi"))}
                />
              </Bidang>
              <Bidang id="f-kodePos" label="Kode pos" kosong={kosong("kodePos")} galat={galat.kodePos}>
                <input
                  id="f-kodePos"
                  inputMode="numeric"
                  maxLength={5}
                  value={draf.kodePos}
                  onChange={ubah("kodePos")}
                  className={kelasInput(!!galat.kodePos, kosong("kodePos"))}
                />
              </Bidang>
            </div>

            <Bidang id="f-negara" label="Negara" wajib galat={galat.negara}>
              <input
                id="f-negara"
                value={draf.negara}
                onChange={ubah("negara")}
                autoComplete="country-name"
                className={kelasInput(!!galat.negara)}
              />
            </Bidang>

            <Bidang
              id="f-catatan"
              label="Patokan / catatan alamat"
              kosong={kosong("catatan")}
              galat={galat.catatan}
              petunjuk="Opsional, contoh: pagar hijau dekat masjid"
            >
              <textarea
                id="f-catatan"
                rows={2}
                value={draf.catatan}
                onChange={ubah("catatan")}
                className={`${kelasInput(!!galat.catatan, kosong("catatan"))} resize-none`}
              />
            </Bidang>
          </Bagian>

          <Bagian
            judul="Titik lokasi"
            ket="Membantu penjual dan kurir menemukan rumahmu"
          >
            <PilihLokasi
              lat={draf.lat}
              lng={draf.lng}
              kosong={kosong("lat")}
              galatLat={galat.lat}
              galatLng={galat.lng}
              onChange={(lat, lng) => setDraf((d) => ({ ...d, lat, lng }))}
            />

            <Bidang
              id="f-maps"
              label="Tautan Google Maps"
              kosong={kosong("maps")}
              galat={galat.maps}
              petunjuk="Opsional"
            >
              <input
                id="f-maps"
                type="url"
                inputMode="url"
                value={draf.maps}
                onChange={ubah("maps")}
                placeholder="https://maps.app.goo.gl/..."
                className={kelasInput(!!galat.maps, kosong("maps"))}
              />
            </Bidang>

            <div className="space-y-1.5">
              <p className="text-sm font-medium text-gray-700">Foto rumah</p>
              <UnggahFoto
                id="f-fotoRumah"
                jenis="rumah"
                userId={userId}
                value={draf.fotoRumah}
                onChange={isi("fotoRumah")}
              />
              <p className="text-xs text-gray-400">
                Opsional, membantu kurir mengenali rumahmu
              </p>
            </div>
          </Bagian>
        </div>
      </div>

      {/* BAR BAWAH */}
      <footer className="shrink-0 border-t border-gray-100 bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-2xl gap-2.5 px-3 py-3 md:px-4">
          <button
            type="button"
            onClick={tutup}
            disabled={menyimpan}
            className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={simpan}
            disabled={menyimpan}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold ${TOMBOL_UTAMA}`}
          >
            {menyimpan && <Loader2 className="h-4 w-4 animate-spin" />}
            Simpan perubahan
          </button>
        </div>
      </footer>
    </div>
  );
}