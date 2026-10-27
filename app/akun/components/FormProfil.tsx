"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import Bidang, { kelasInput } from "./Bidang";
import PilihLokasi from "./PilihLokasi";
import UnggahFoto from "./UnggahFoto";
import { useToast } from "@/components/toast";
import { useModal } from "@/components/modal";
import {
  OPSI_GENDER,
  bersihkan,
  kolomKurang,
  validasi,
  type Galat,
  type Profil,
} from "./profil";

const TOMBOL_UTAMA =
  "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/30 transition-all hover:shadow-xl hover:shadow-orange-500/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70";

// Posisi tombol melayang di pojok kanan bawah (memperhitungkan safe area di HP)
const POSISI_TOMBOL = "bottom-[calc(1rem+env(safe-area-inset-bottom))] md:bottom-8";

type Props = {
  userId: string;
  awal: Profil;
  mode: "ubah" | "lengkapi";
  daftarArea: string[];
  // Kembalikan pesan galat bila gagal, atau null bila berhasil
  onSimpan: (data: Profil) => Promise<string | null>;
  // Dipanggil setiap kali foto berhasil tersimpan otomatis ("" bila dihapus)
  onGambarTersimpan: (kunci: "avatar" | "fotoRumah", url: string) => void;
  onTutup: () => void;
};

// Bagian teks saja. Foto tersimpan otomatis sehingga tidak dihitung sebagai perubahan.
function bidangTeks(p: Profil): string {
  const salinan: Partial<Profil> = { ...p };
  delete salinan.avatar;
  delete salinan.fotoRumah;
  return JSON.stringify(salinan);
}

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
  onGambarTersimpan,
  onTutup,
}: Props) {
  const toast = useToast();
  const modal = useModal();

  const [draf, setDraf] = useState<Profil>(awal);
  const [galat, setGalat] = useState<Galat>({});
  const [menyimpan, setMenyimpan] = useState(false);

  // Jumlah foto yang sedang diunggah/dihapus
  const [sibukAvatar, setSibukAvatar] = useState(false);
  const [sibukRumah, setSibukRumah] = useState(false);
  const sibukFoto = sibukAvatar || sibukRumah;

  // Pembanding perubahan teks. Diambil sekali saat form dibuka, lalu diperbarui
  // hanya bila simpan berhasil.
  const [teksAwal, setTeksAwal] = useState(() => bidangTeks(awal));

  // Kolom yang kosong saat form dibuka (dipakai untuk penanda di mode lengkapi)
  const [kurangAwal] = useState<(keyof Profil)[]>(() =>
    kolomKurang(awal).map((k) => k.key)
  );

  // Ada perubahan pada input teks yang belum disimpan
  const adaPerubahan = bidangTeks(draf) !== teksAwal;

  const tutup = async () => {
    if (menyimpan || sibukFoto) return;
    if (adaPerubahan) {
      const setuju = await modal.konfirmasi({
        jenis: "peringatan",
        judul: "Tutup tanpa menyimpan?",
        deskripsi: "Perubahan data yang belum disimpan akan hilang.",
        teksBatal: "Lanjut mengisi",
        teksSetuju: "Tutup",
      });
      if (!setuju) return;
    }
    onTutup();
  };
  const tutupRef = useRef(tutup);
  useEffect(() => {
    tutupRef.current = tutup;
  });

  // Peringatkan sebelum menutup tab bila ada perubahan teks belum tersimpan
  useEffect(() => {
    if (!adaPerubahan) return;
    const onSebelumTutup = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onSebelumTutup);
    return () => window.removeEventListener("beforeunload", onSebelumTutup);
  }, [adaPerubahan]);

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

  const kosong = (k: keyof Profil) =>
    mode === "lengkapi" && kurangAwal.includes(k) && !draf[k].trim();

  // Foto sudah tersimpan di bucket dan database: samakan draf dan beri tahu induk
  const gambarTersimpan = (kunci: "avatar" | "fotoRumah") => (url: string) => {
    setDraf((d) => ({ ...d, [kunci]: url }));
    onGambarTersimpan(kunci, url);
  };

  // Batalkan semua perubahan teks (foto tidak ikut, karena sudah tersimpan)
  const batalkanPerubahan = () => {
    setDraf((d) => ({ ...awal, avatar: d.avatar, fotoRumah: d.fotoRumah }));
    setGalat({});
  };

  const simpan = async () => {
    const bersih = bersihkan(draf);
    const e = validasi(bersih);
    setGalat(e);

    if (Object.keys(e).length > 0) {
      fokus(Object.keys(e)[0]);
      toast.peringatan("Data belum lengkap", "Periksa kolom yang ditandai merah.");
      return;
    }

    setMenyimpan(true);
    const pesan = await onSimpan(bersih);
    setMenyimpan(false);

    if (pesan) {
      toast.galat("Gagal menyimpan perubahan", pesan);
      return;
    }

    // Berhasil: induk menutup form
    setTeksAwal(bidangTeks(bersih));
    toast.sukses("Perubahan tersimpan", "Profilmu berhasil diperbarui.");
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
            disabled={menyimpan || sibukFoto}
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
          <Bagian judul="Foto profil">
            <UnggahFoto
              id="f-avatar"
              jenis="avatar"
              userId={userId}
              value={draf.avatar}
              onTersimpan={gambarTersimpan("avatar")}
              onSibuk={setSibukAvatar}
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
                onTersimpan={gambarTersimpan("fotoRumah")}
                onSibuk={setSibukRumah}
              />
              <p className="text-xs text-gray-400">
                Opsional, membantu kurir mengenali rumahmu
              </p>
            </div>
          </Bagian>

          {/* Ruang kosong agar konten terakhir tidak tertutup tombol melayang */}
          <div aria-hidden className="h-20" />
        </div>
      </div>

      {/* TOMBOL MELAYANG: muncul hanya bila ada perubahan pada input teks */}
      <div
        aria-hidden={!adaPerubahan}
        className={`pointer-events-none fixed right-4 z-[60] flex items-center gap-2 transition-all duration-200 md:right-8 ${POSISI_TOMBOL} ${
          adaPerubahan ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
        }`}
      >
        <button
          type="button"
          onClick={batalkanPerubahan}
          tabIndex={adaPerubahan ? 0 : -1}
          disabled={!adaPerubahan || menyimpan}
          className="pointer-events-auto rounded-full border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-lg transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          Batal
        </button>
        <button
          type="button"
          onClick={simpan}
          tabIndex={adaPerubahan ? 0 : -1}
          disabled={!adaPerubahan || menyimpan || sibukFoto}
          className={`pointer-events-auto inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold ${TOMBOL_UTAMA}`}
        >
          {menyimpan ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {menyimpan ? "Menyimpan..." : "Simpan perubahan"}
        </button>
      </div>
    </div>
  );
}