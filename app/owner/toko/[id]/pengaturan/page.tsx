"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  AlertCircle,
  Bike,
  Calculator,
  Camera,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  ImageIcon,
  Link2,
  Loader2,
  LocateFixed,
  Mail,
  MapPin,
  Phone,
  Plus,
  QrCode,
  Save,
  Store,
  Trash2,
  Upload,
  Wallet,
  X,
  ZoomIn,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/toast";
import { useModal } from "@/components/modal";
import { urlHalamanToko, useToko } from "../components/toko-context";
import { JENIS_PESANAN, Saklar } from "../ui";

// ---------- Konstanta ----------

// Harus sama dengan allowed_mime_types pada bucket
const TIPE_GAMBAR = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

// Satu bucket (publik) untuk semua gambar toko.
// Path file: <shop_id>/<folder>/<timestamp>-<acak>.<ekstensi>
const BUCKET_TOKO = "shops";

const KONFIG_GAMBAR = {
  logo: { folder: "logo", maksMB: 2, label: "Logo" },
  banner: { folder: "banner", maksMB: 2, label: "Banner" },
  tempat: { folder: "tempat", maksMB: 5, label: "Foto tempat" },
} as const;

type JenisGambar = keyof typeof KONFIG_GAMBAR;
type JenisGambarTunggal = "logo" | "banner";

// Harus sama dengan check constraint shops_place_photos_max di database
const MAKS_FOTO_TEMPAT = 6;

// Sisi terpanjang maksimal (px) saat gambar dikompres
const SISI_MAKS_KOMPRES = 2560;

// Halaman tujuan tombol "Atur dan cetak kode QR", relatif terhadap alamat toko.
// Ubah bila folder halamannya bernama lain.
const RUTE_QR_MEJA = "/meja";

// Posisi tombol simpan melayang. Di layar kecil dinaikkan agar tidak tertimpa
// navigasi bawah (tinggi navbar + jarak aman). Sesuaikan 6rem bila navbar-mu lebih tinggi.
const POSISI_TOMBOL_SIMPAN = "bottom-[calc(6rem+env(safe-area-inset-bottom))] md:bottom-8";

const INPUT_MODERN =
  "w-full rounded-xl border border-gray-200 bg-gray-50/70 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-500/10";

const HARI = [
  { k: "mon", label: "Senin" },
  { k: "tue", label: "Selasa" },
  { k: "wed", label: "Rabu" },
  { k: "thu", label: "Kamis" },
  { k: "fri", label: "Jumat" },
  { k: "sat", label: "Sabtu" },
  { k: "sun", label: "Minggu" },
] as const;

type HariKunci = (typeof HARI)[number]["k"];
type JamHari = { buka: boolean; open: string; close: string };

type Form = {
  nama: string;
  deskripsi: string;
  telepon: string;
  whatsapp: string;
  email: string;
  alamat: string;
  desa: string;
  kecamatan: string;
  kota: string;
  provinsi: string;
  kodePos: string;
  petaUrl: string;
  lintang: string;
  bujur: string;
  minPesan: string;
  ongkir: string;
  logo: string;
  banner: string;
  fotoTempat: string[];
  antar: boolean;
  ambil: boolean;
  meja: boolean;
  kasir: boolean;
  jam: Record<HariKunci, JamHari>;
};

type StatePratinjau = { urls: string[]; index: number };

type HasilUnggah = { url: string; path: string };

// ---------- Fungsi bantu ----------

const teks = (v: unknown) => (typeof v === "string" ? v : "");
const jamPendek = (v: unknown) => (typeof v === "string" ? v.slice(0, 5) : "");
const strAngka = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const bersihNomor = (s: string) => s.replace(/[\s-]/g, "");
const kosongJadiNull = (s: string) => (s.trim() === "" ? null : s.trim());

// "" -> null, angka valid -> number, selain itu NaN
function angkaAtauNull(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  return Number(t);
}

function formatUkuran(byte: number): string {
  if (byte < 1024 * 1024) return `${Math.max(1, Math.round(byte / 1024))} KB`;
  return `${(byte / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

// Bagian form yang disimpan lewat tombol Simpan (tanpa gambar, karena gambar
// tersimpan otomatis). Dipakai untuk mendeteksi ada tidaknya perubahan.
function bidangNonGambar(f: Form): string {
  const salinan: Partial<Form> = { ...f };
  delete salinan.logo;
  delete salinan.banner;
  delete salinan.fotoTempat;
  return JSON.stringify(salinan);
}

// Ambil path file di bucket dari URL publik Supabase
function pathDariUrl(url: string): string | null {
  const penanda = `/storage/v1/object/public/${BUCKET_TOKO}/`;
  const i = url.indexOf(penanda);
  if (i === -1) return null;
  try {
    return decodeURIComponent(url.slice(i + penanda.length).split("?")[0]);
  } catch {
    return null;
  }
}

// Kompres gambar lewat canvas: turunkan kualitas dulu, lalu perkecil dimensi,
// sampai ukurannya di bawah batas. Hasil WebP (JPEG bila peramban tidak mendukung).
async function kompresGambar(file: File, maksBytes: number): Promise<File | null> {
  const urlObjek = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Gambar tidak bisa dibaca"));
      el.src = urlObjek;
    });

    const lebarAsli = img.naturalWidth;
    const tinggiAsli = img.naturalHeight;
    if (!lebarAsli || !tinggiAsli) return null;

    const dukungWebp = document
      .createElement("canvas")
      .toDataURL("image/webp")
      .startsWith("data:image/webp");
    const tipe = dukungWebp ? "image/webp" : "image/jpeg";
    const ekstensi = dukungWebp ? "webp" : "jpg";

    const target = maksBytes * 0.95;
    let skala = Math.min(1, SISI_MAKS_KOMPRES / Math.max(lebarAsli, tinggiAsli));

    for (let putaran = 0; putaran < 6; putaran++) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(lebarAsli * skala));
      canvas.height = Math.max(1, Math.round(tinggiAsli * skala));
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      // JPEG tidak punya transparansi, beri latar putih
      if (!dukungWebp) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      for (const kualitas of [0.85, 0.75, 0.65, 0.55, 0.45]) {
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, tipe, kualitas)
        );
        if (blob && blob.size <= target) {
          const namaDasar = file.name.replace(/\.[^.]+$/, "") || "gambar";
          return new File([blob], `${namaDasar}.${ekstensi}`, { type: tipe });
        }
      }

      skala *= 0.8;
    }
    return null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(urlObjek);
  }
}

// Terjemahkan pesan error Storage menjadi kalimat yang jelas
function pesanGalatUnggah(pesan: string, jenis: JenisGambar): string {
  const { maksMB } = KONFIG_GAMBAR[jenis];
  if (/bucket not found/i.test(pesan))
    return `Bucket "${BUCKET_TOKO}" belum dibuat di Supabase.`;
  if (/row-level security|unauthorized|not authorized/i.test(pesan))
    return `Tidak punya izin mengunggah ke bucket "${BUCKET_TOKO}". Periksa policy Storage di Supabase.`;
  if (/mime/i.test(pesan))
    return "Format gambar tidak didukung. Gunakan JPG, PNG, WebP, GIF, atau AVIF.";
  if (/exceed|too large|size/i.test(pesan)) return `Ukuran gambar melebihi batas ${maksMB} MB.`;
  return pesan || "Terjadi kesalahan yang tidak diketahui.";
}

// Terjemahkan error Postgres menjadi kalimat yang jelas
function pesanGalatDb(error: { code?: string; message?: string }): string {
  if (error.code === "42501") return "Kamu tidak punya izin mengubah toko ini.";
  if (error.code === "42703")
    return "Kolom database belum lengkap. Pastikan kolom place_photos sudah dibuat.";
  if (error.code === "23514")
    return "Ada isian yang tidak memenuhi aturan database, misalnya foto tempat lebih dari 6.";
  if (error.code === "23505") return "Data yang sama sudah dipakai.";
  return error.message || "Coba lagi beberapa saat.";
}

// ---------- Komponen kecil ----------

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

function Bidang({
  id,
  label,
  ikon: Ikon,
  bantuan,
  children,
}: {
  id: string;
  label: string;
  ikon?: LucideIcon;
  bantuan?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="flex items-center gap-1.5 text-sm font-medium text-gray-700"
      >
        {Ikon && <Ikon className="h-4 w-4 text-gray-400" />}
        {label}
      </label>
      {children}
      {bantuan && <p className="text-xs text-gray-400">{bantuan}</p>}
    </div>
  );
}

function BarisFitur({
  ikon: Ikon,
  judul,
  deskripsi,
  nyala,
  onChange,
  aksi,
}: {
  ikon: LucideIcon;
  judul: string;
  deskripsi?: string;
  nyala: boolean;
  onChange: () => void;
  /** Konten tambahan di bawah baris, hanya tampil saat fitur menyala */
  aksi?: ReactNode;
}) {
  return (
    <li className="transition-colors hover:bg-gray-50/70">
      <div className="flex items-center gap-3.5 px-5 py-3.5">
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
      </div>
      {nyala && aksi && <div className="px-5 pb-4 md:pl-[4.625rem]">{aksi}</div>}
    </li>
  );
}

function BidangGambar({
  label,
  bantuan,
  url,
  lebar,
  sedangUnggah,
  onPilih,
  onHapus,
  onLihat,
}: {
  label: string;
  bantuan: string;
  url: string;
  lebar: boolean;
  sedangUnggah: boolean;
  onPilih: (file: File) => void;
  onHapus: () => void;
  onLihat: () => void;
}) {
  const pilih = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onPilih(file);
  };

  const kelasKotak = `relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-gray-200 bg-gray-50 ${
    lebar ? "h-20 w-36" : "h-20 w-20"
  }`;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">{label}</p>
      <div className="flex items-center gap-3.5">
        {url ? (
          <button
            type="button"
            onClick={onLihat}
            aria-label={`Lihat pratinjau ${label}`}
            className={`${kelasKotak} group cursor-zoom-in`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={label} className="h-full w-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
              <ZoomIn className="h-5 w-5" />
            </span>
          </button>
        ) : (
          <div className={kelasKotak}>
            <ImageIcon className="h-6 w-6 text-gray-300" />
          </div>
        )}
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <label
              className={`inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition-colors ${
                sedangUnggah
                  ? "cursor-wait opacity-70"
                  : "cursor-pointer hover:border-orange-200 hover:bg-orange-50/50 hover:text-orange-600"
              }`}
            >
              {sedangUnggah ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              {sedangUnggah ? "Memproses..." : url ? "Ganti" : "Unggah"}
              <input
                type="file"
                accept={TIPE_GAMBAR.join(",")}
                className="sr-only"
                disabled={sedangUnggah}
                onChange={pilih}
              />
            </label>
            {url && !sedangUnggah && (
              <button
                type="button"
                onClick={onHapus}
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Hapus
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400">{bantuan}</p>
        </div>
      </div>
    </div>
  );
}

function GaleriFoto({
  urls,
  maks,
  sedangUnggah,
  onTambah,
  onHapus,
  onLihat,
}: {
  urls: string[];
  maks: number;
  sedangUnggah: boolean;
  onTambah: (files: File[]) => void;
  onHapus: (index: number) => void;
  onLihat: (index: number) => void;
}) {
  const pilih = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length > 0) onTambah(files);
  };

  const penuh = urls.length >= maks;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-gray-700">Foto bagian depan atau suasana tempat</p>
        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
          {urls.length} / {maks}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {urls.map((url, i) => (
          <div
            key={url}
            className="group relative aspect-[4/3] overflow-hidden rounded-2xl border border-gray-200 bg-gray-50"
          >
            <button
              type="button"
              onClick={() => onLihat(i)}
              aria-label={`Lihat pratinjau foto tempat ${i + 1}`}
              className="absolute inset-0 cursor-zoom-in"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Foto tempat ${i + 1}`}
                className="h-full w-full object-cover"
              />
              <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                <ZoomIn className="h-6 w-6" />
              </span>
            </button>
            {i === 0 && (
              <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">
                Utama
              </span>
            )}
            <button
              type="button"
              onClick={() => onHapus(i)}
              disabled={sedangUnggah}
              aria-label={`Hapus foto tempat ${i + 1}`}
              className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-red-600 shadow transition-colors hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        {!penuh && (
          <label
            className={`flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-gray-300 bg-gray-50 text-xs font-medium text-gray-500 transition-colors ${
              sedangUnggah
                ? "cursor-wait opacity-70"
                : "cursor-pointer hover:border-orange-300 hover:bg-orange-50/50 hover:text-orange-600"
            }`}
          >
            {sedangUnggah ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Plus className="h-5 w-5" />
            )}
            {sedangUnggah ? "Memproses..." : "Tambah foto"}
            <input
              type="file"
              multiple
              accept={TIPE_GAMBAR.join(",")}
              className="sr-only"
              disabled={sedangUnggah}
              onChange={pilih}
            />
          </label>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Foto bangunan, papan nama, atau area toko. Maksimal {maks} foto, masing-masing 5 MB.
        Foto pertama menjadi foto utama.
      </p>
    </div>
  );
}

// Pratinjau layar penuh. Tutup dengan Esc, klik latar, atau tombol X.
// Panah kiri/kanan untuk berpindah bila ada lebih dari satu gambar.
function PratinjauGambar({
  urls,
  index,
  onTutup,
  onGeser,
}: {
  urls: string[];
  index: number;
  onTutup: () => void;
  onGeser: (arah: 1 | -1) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onTutup();
      else if (e.key === "ArrowLeft") onGeser(-1);
      else if (e.key === "ArrowRight") onGeser(1);
    };
    window.addEventListener("keydown", onKey);

    // Kunci scroll halaman selama pratinjau terbuka
    const overflowLama = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflowLama;
    };
  }, [onTutup, onGeser]);

  const banyak = urls.length > 1;
  const tombolBulat =
    "absolute flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/30";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pratinjau gambar"
      onClick={onTutup}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 sm:p-8"
    >
      <button
        type="button"
        onClick={onTutup}
        aria-label="Tutup pratinjau"
        className={`${tombolBulat} right-4 top-4`}
      >
        <X className="h-5 w-5" />
      </button>

      {banyak && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onGeser(-1);
          }}
          aria-label="Gambar sebelumnya"
          className={`${tombolBulat} left-3 top-1/2 -translate-y-1/2 sm:left-5`}
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={urls[index]}
        src={urls[index]}
        alt={`Pratinjau ${index + 1} dari ${urls.length}`}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] max-w-full rounded-xl object-contain shadow-2xl"
      />

      {banyak && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onGeser(1);
          }}
          aria-label="Gambar berikutnya"
          className={`${tombolBulat} right-3 top-1/2 -translate-y-1/2 sm:right-5`}
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      {banyak && (
        <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white">
          {index + 1} / {urls.length}
        </span>
      )}
    </div>
  );
}

function Kerangka() {
  return (
    <div className="space-y-6" aria-busy="true">
      <span className="sr-only">Memuat pengaturan toko</span>
      <div className="h-10 w-48 animate-pulse rounded-xl bg-gray-200/70" />
      <div className="h-48 animate-pulse rounded-2xl bg-gray-200/70" />
      <div className="h-64 animate-pulse rounded-2xl bg-gray-200/70" />
      <div className="h-64 animate-pulse rounded-2xl bg-gray-200/70" />
    </div>
  );
}

// ---------- Halaman ----------

export default function PengaturanTokoPage() {
  const { id, base, toko, perbaruiToko } = useToko();
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const modal = useModal();

  const [form, setForm] = useState<Form | null>(null);
  // Cuplikan bidang non-gambar yang terakhir tersimpan, pembanding untuk deteksi perubahan
  const [awal, setAwal] = useState<string | null>(null);
  const [mejaTersimpan, setMejaTersimpan] = useState(false);
  const [memuat, setMemuat] = useState(true);
  const [galatMuat, setGalatMuat] = useState(false);

  const [menyimpan, setMenyimpan] = useState(false);
  const [unggah, setUnggah] = useState<JenisGambar | null>(null);
  const [mencariLokasi, setMencariLokasi] = useState(false);
  const [pratinjau, setPratinjau] = useState<StatePratinjau | null>(null);

  const aktif = toko.status === "aktif";

  // Alamat dasar halaman toko ini, dipakai untuk tombol ke halaman lain
  const alamatDasar = base ?? `/owner/toko/${id}`;

  // Ada perubahan bidang non-gambar yang belum disimpan
  const adaPerubahan = form !== null && awal !== null && bidangNonGambar(form) !== awal;

  // Peringatkan sebelum meninggalkan halaman bila ada perubahan belum tersimpan
  useEffect(() => {
    if (!adaPerubahan) return;
    const onSebelumTutup = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onSebelumTutup);
    return () => window.removeEventListener("beforeunload", onSebelumTutup);
  }, [adaPerubahan]);

  // Tampilkan galat validasi sebagai toast
  const gagal = (pesan: string) => {
    toast.galat(pesan);
  };

  const bukaPratinjau = (urls: string[], index = 0) => {
    if (urls.length === 0) return;
    setPratinjau({ urls, index });
  };

  const tutupPratinjau = useCallback(() => setPratinjau(null), []);

  const geserPratinjau = useCallback((arah: 1 | -1) => {
    setPratinjau((p) =>
      p && p.urls.length > 1
        ? { ...p, index: (p.index + arah + p.urls.length) % p.urls.length }
        : p
    );
  }, []);

  // Muat data lengkap toko dari tabel shops
  useEffect(() => {
    let batal = false;

    async function muat() {
      const { data, error } = await supabase
        .from("shops")
        .select(
          "name, description, phone, whatsapp, email, address_line, village, district, city, province, postal_code, maps_url, latitude, longitude, min_order, delivery_fee, logo_url, banner_url, place_photos, opening_hours, delivery_enabled, pickup_enabled, dine_in_enabled, pos_enabled"
        )
        .eq("id", id)
        .maybeSingle();

      if (batal) return;

      if (error || !data) {
        if (error) console.error("Gagal memuat data toko:", error);
        setGalatMuat(true);
        setMemuat(false);
        return;
      }

      const r = data as Record<string, unknown>;
      const mentah =
        r.opening_hours && typeof r.opening_hours === "object"
          ? (r.opening_hours as Record<string, unknown>)
          : {};
      const belumDiatur = Object.keys(mentah).length === 0;

      const jam = {} as Record<HariKunci, JamHari>;
      HARI.forEach(({ k }) => {
        const j = mentah[k] as { open?: unknown; close?: unknown } | null | undefined;
        if (belumDiatur) {
          // Awalan bila jam buka belum pernah diatur: semua hari buka kecuali Minggu
          jam[k] = { buka: k !== "sun", open: "08:00", close: "17:00" };
        } else if (j && j.open && j.close) {
          jam[k] = { buka: true, open: jamPendek(j.open), close: jamPendek(j.close) };
        } else {
          jam[k] = { buka: false, open: "08:00", close: "17:00" };
        }
      });

      const fotoTempat = Array.isArray(r.place_photos)
        ? (r.place_photos as unknown[]).filter(
            (u): u is string => typeof u === "string" && u !== ""
          )
        : [];

      const formAwal: Form = {
        nama: teks(r.name),
        deskripsi: teks(r.description),
        telepon: teks(r.phone),
        whatsapp: teks(r.whatsapp),
        email: teks(r.email),
        alamat: teks(r.address_line),
        desa: teks(r.village),
        kecamatan: teks(r.district),
        kota: teks(r.city),
        provinsi: teks(r.province),
        kodePos: teks(r.postal_code),
        petaUrl: teks(r.maps_url),
        lintang: strAngka(r.latitude),
        bujur: strAngka(r.longitude),
        minPesan: strAngka(r.min_order ?? 0),
        ongkir: strAngka(r.delivery_fee ?? 0),
        logo: teks(r.logo_url),
        banner: teks(r.banner_url),
        fotoTempat,
        antar: r.delivery_enabled === true,
        ambil: r.pickup_enabled === true,
        meja: r.dine_in_enabled === true,
        kasir: r.pos_enabled === true,
        jam,
      };

      setMejaTersimpan(r.dine_in_enabled === true);
      setForm(formAwal);
      setAwal(bidangNonGambar(formAwal));
      setMemuat(false);
    }

    muat();
    return () => {
      batal = true;
    };
  }, [supabase, id]);

  const ubah = <K extends keyof Form>(kunci: K, nilai: Form[K]) =>
    setForm((f) => (f ? { ...f, [kunci]: nilai } : f));

  const ubahHari = (k: HariKunci, bagian: Partial<JamHari>) =>
    setForm((f) => (f ? { ...f, jam: { ...f.jam, [k]: { ...f.jam[k], ...bagian } } } : f));

  const samakanSemuaHari = () => {
    if (!form) return;
    const acuan = HARI.map(({ k }) => form.jam[k]).find((j) => j.buka);
    if (!acuan) {
      toast.peringatan("Belum ada hari buka", "Aktifkan minimal satu hari dulu.");
      return;
    }
    setForm((f) => {
      if (!f) return f;
      const jam = { ...f.jam };
      HARI.forEach(({ k }) => {
        if (jam[k].buka) jam[k] = { ...jam[k], open: acuan.open, close: acuan.close };
      });
      return { ...f, jam };
    });
    toast.info("Jam disamakan", `Semua hari buka sekarang ${acuan.open} - ${acuan.close}.`);
  };

  const gunakanLokasiSaya = () => {
    if (!navigator.geolocation) {
      toast.galat("Lokasi tidak didukung", "Peramban ini tidak mendukung pencarian lokasi.");
      return;
    }
    setMencariLokasi(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        ubah("lintang", pos.coords.latitude.toFixed(6));
        ubah("bujur", pos.coords.longitude.toFixed(6));
        setMencariLokasi(false);
        toast.sukses("Lokasi berhasil diambil", "Jangan lupa simpan perubahan.");
      },
      () => {
        setMencariLokasi(false);
        toast.galat(
          "Lokasi tidak bisa diambil",
          "Izinkan akses lokasi di peramban, atau isi lintang dan bujur secara manual."
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // ----- Gambar: tersimpan otomatis ke database -----

  // Hapus file dari bucket (best effort, hanya file milik toko ini)
  const hapusDariBucket = async (paths: (string | null)[]) => {
    const aman = paths.filter(
      (p): p is string => typeof p === "string" && p.startsWith(`${id}/`)
    );
    if (aman.length === 0) return;
    const { error } = await supabase.storage.from(BUCKET_TOKO).remove(aman);
    if (error) console.error("Gagal menghapus file lama dari bucket:", error);
  };

  // Update satu kolom gambar saja, isian form lain tidak ikut tertulis
  const simpanKolomGambar = async (
    kolom: "logo_url" | "banner_url" | "place_photos",
    nilai: string | null | string[]
  ): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from("shops")
        .update({ [kolom]: nilai, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("id");

      if (error) {
        console.error("Gagal menyimpan gambar:", error);
        toast.galat("Gagal menyimpan gambar", pesanGalatDb(error));
        return false;
      }
      if (!data || data.length === 0) {
        toast.galat(
          "Gambar tidak tersimpan",
          "Kamu tidak punya izin mengubah toko ini, atau toko tidak ditemukan."
        );
        return false;
      }
      return true;
    } catch (e) {
      console.error("Gagal menyimpan gambar:", e);
      toast.galat("Gagal menyimpan gambar", "Periksa koneksi internet lalu coba lagi.");
      return false;
    }
  };

  // Validasi format, lalu tangani file yang melebihi batas lewat modal
  // (batal, atau unggah dan kompres). Mengembalikan file yang siap diunggah.
  const siapkanFile = async (files: File[], jenis: JenisGambar): Promise<File[]> => {
    const { maksMB, label } = KONFIG_GAMBAR[jenis];
    const maksBytes = maksMB * 1024 * 1024;

    const valid: File[] = [];
    for (const f of files) {
      if (!TIPE_GAMBAR.includes(f.type)) {
        toast.galat(`${f.name}: format tidak didukung`, "Gunakan JPG, PNG, WebP, GIF, atau AVIF.");
        continue;
      }
      valid.push(f);
    }

    const besar = valid.filter((f) => f.size > maksBytes);
    if (besar.length === 0) return valid;

    const adaGif = besar.some((f) => f.type === "image/gif");
    const daftar = besar.map((f) => `• ${f.name} (${formatUkuran(f.size)})`).join("\n");
    const adaYangKecil = valid.length > besar.length;

    const lanjut = await modal.konfirmasi({
      jenis: "peringatan",
      judul:
        besar.length === 1
          ? "Ukuran gambar melebihi batas"
          : `${besar.length} gambar melebihi batas`,
      deskripsi:
        `${label} maksimal ${maksMB} MB.\n${daftar}\n\n` +
        `Pilih "Unggah dan kompres" untuk memperkecil ukurannya otomatis sebelum diunggah.` +
        (adaGif ? " Animasi GIF akan menjadi gambar diam." : "") +
        (adaYangKecil ? "\nGambar yang ukurannya sudah sesuai tetap diunggah." : ""),
      teksBatal: "Batal",
      teksSetuju: "Unggah dan kompres",
    });

    if (!lanjut) return valid.filter((f) => f.size <= maksBytes);

    setUnggah(jenis); // tampilkan indikator selama kompresi

    const siap: File[] = [];
    const ringkasan: string[] = [];
    for (const f of valid) {
      if (f.size <= maksBytes) {
        siap.push(f);
        continue;
      }
      const hasil = await kompresGambar(f, maksBytes);
      if (!hasil) {
        toast.galat(`${f.name} gagal dikompres`, "Coba pilih gambar lain yang lebih kecil.");
        continue;
      }
      siap.push(hasil);
      ringkasan.push(`${formatUkuran(f.size)} → ${formatUkuran(hasil.size)}`);
    }

    if (ringkasan.length === 1) {
      toast.info("Gambar dikompres", ringkasan[0]);
    } else if (ringkasan.length > 1) {
      toast.info(`${ringkasan.length} gambar dikompres`, "Ukurannya sudah di bawah batas.");
    }

    return siap;
  };

  // Unggah satu file ke bucket. Mengembalikan URL publik dan path, atau null bila gagal
  // (toast galat sudah ditampilkan).
  const kirimGambar = async (file: File, jenis: JenisGambar): Promise<HasilUnggah | null> => {
    const { folder, maksMB, label } = KONFIG_GAMBAR[jenis];

    if (file.size > maksMB * 1024 * 1024) {
      toast.galat(`${file.name}: terlalu besar`, `Ukuran gambar maksimal ${maksMB} MB.`);
      return null;
    }

    const ekstensi = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${id}/${folder}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ekstensi || "jpg"}`;

    try {
      const { error } = await supabase.storage
        .from(BUCKET_TOKO)
        .upload(path, file, { contentType: file.type, upsert: false });

      if (error) {
        console.error(`Gagal mengunggah ${label}:`, error);
        toast.galat(`${label} gagal diunggah`, pesanGalatUnggah(error.message, jenis));
        return null;
      }

      const url = supabase.storage.from(BUCKET_TOKO).getPublicUrl(path).data.publicUrl;
      return { url, path };
    } catch (e) {
      console.error(`Gagal mengunggah ${label}:`, e);
      toast.galat(`${label} gagal diunggah`, "Periksa koneksi internet lalu coba lagi.");
      return null;
    }
  };

  // Logo dan banner: satu gambar, langsung tersimpan
  const unggahGambar = async (file: File, jenis: JenisGambarTunggal) => {
    try {
      const siap = await siapkanFile([file], jenis);
      if (siap.length === 0) return;

      setUnggah(jenis);
      const hasil = await kirimGambar(siap[0], jenis);
      if (!hasil) return;

      const kolom = jenis === "logo" ? "logo_url" : "banner_url";
      const lama = form ? form[jenis] : "";

      if (!(await simpanKolomGambar(kolom, hasil.url))) {
        await hapusDariBucket([hasil.path]); // jangan tinggalkan file yatim
        return;
      }

      ubah(jenis, hasil.url);
      if (lama) await hapusDariBucket([pathDariUrl(lama)]);
      toast.sukses(`${KONFIG_GAMBAR[jenis].label} berhasil disimpan`);
    } finally {
      setUnggah(null);
    }
  };

  const hapusGambar = async (jenis: JenisGambarTunggal) => {
    if (!form) return;
    const kolom = jenis === "logo" ? "logo_url" : "banner_url";
    const lama = form[jenis];

    setUnggah(jenis);
    try {
      if (!(await simpanKolomGambar(kolom, null))) return;
      ubah(jenis, "");
      if (lama) await hapusDariBucket([pathDariUrl(lama)]);
      toast.info(`${KONFIG_GAMBAR[jenis].label} dihapus`);
    } finally {
      setUnggah(null);
    }
  };

  // Foto tempat: sampai MAKS_FOTO_TEMPAT foto, boleh pilih banyak file sekaligus
  const tambahFotoTempat = async (files: File[]) => {
    if (!form) return;

    const sisa = MAKS_FOTO_TEMPAT - form.fotoTempat.length;
    if (sisa <= 0) {
      toast.peringatan("Foto sudah penuh", `Maksimal ${MAKS_FOTO_TEMPAT} foto tempat.`);
      return;
    }

    const dipilih = files.slice(0, sisa);
    if (files.length > sisa) {
      toast.peringatan(
        "Sebagian foto dilewati",
        `Hanya ${sisa} foto yang bisa ditambahkan lagi (maksimal ${MAKS_FOTO_TEMPAT}).`
      );
    }

    try {
      const siap = await siapkanFile(dipilih, "tempat");
      if (siap.length === 0) return;

      setUnggah("tempat");
      const hasil = await Promise.all(siap.map((f) => kirimGambar(f, "tempat")));
      const berhasil = hasil.filter((h): h is HasilUnggah => h !== null);
      if (berhasil.length === 0) return;

      const gabungan = [...form.fotoTempat, ...berhasil.map((h) => h.url)].slice(
        0,
        MAKS_FOTO_TEMPAT
      );

      if (!(await simpanKolomGambar("place_photos", gabungan))) {
        await hapusDariBucket(berhasil.map((h) => h.path));
        return;
      }

      setForm((f) => (f ? { ...f, fotoTempat: gabungan } : f));
      toast.sukses(
        berhasil.length === 1
          ? "Foto berhasil disimpan"
          : `${berhasil.length} foto berhasil disimpan`
      );
    } finally {
      setUnggah(null);
    }
  };

  const hapusFotoTempat = async (index: number) => {
    if (!form) return;
    const url = form.fotoTempat[index];
    const sisa = form.fotoTempat.filter((_, i) => i !== index);

    setUnggah("tempat");
    try {
      if (!(await simpanKolomGambar("place_photos", sisa))) return;
      setForm((f) => (f ? { ...f, fotoTempat: sisa } : f));
      if (url) await hapusDariBucket([pathDariUrl(url)]);
      toast.info("Foto dihapus");
    } finally {
      setUnggah(null);
    }
  };

  // ----- Simpan bidang non-gambar -----

  const simpan = async () => {
    if (!form) return;

    // ----- Validasi (sesuai constraint tabel shops) -----
    const nama = form.nama.trim();
    if (nama.length < 3) return gagal("Nama toko minimal 3 huruf");
    if (nama.length > 100) return gagal("Nama toko maksimal 100 huruf");

    const alamat = form.alamat.trim();
    if (alamat.length < 8)
      return gagal("Tulis alamat yang cukup jelas, misalnya nama jalan dan nomor");

    const telepon = bersihNomor(form.telepon);
    const whatsapp = bersihNomor(form.whatsapp);
    const polaNomor = /^\+?[0-9]{9,15}$/;
    if (telepon && !polaNomor.test(telepon))
      return gagal("Nomor telepon harus 9–15 angka, boleh diawali +");
    if (whatsapp && !polaNomor.test(whatsapp))
      return gagal("Nomor WhatsApp harus 9–15 angka, boleh diawali +");

    const email = form.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return gagal("Format email belum benar");

    const kodePos = form.kodePos.trim();
    if (kodePos && !/^[0-9]{5}$/.test(kodePos)) return gagal("Kode pos harus 5 angka");

    const petaUrl = form.petaUrl.trim();
    if (petaUrl && !/^https?:\/\//i.test(petaUrl))
      return gagal("Tautan peta harus diawali http:// atau https://");

    const lintang = angkaAtauNull(form.lintang);
    const bujur = angkaAtauNull(form.bujur);
    if (lintang !== null && (!Number.isFinite(lintang) || lintang < -90 || lintang > 90))
      return gagal("Lintang harus berupa angka antara -90 dan 90");
    if (bujur !== null && (!Number.isFinite(bujur) || bujur < -180 || bujur > 180))
      return gagal("Bujur harus berupa angka antara -180 dan 180");
    if ((lintang === null) !== (bujur === null))
      return gagal("Isi lintang dan bujur sekaligus, atau kosongkan keduanya");

    const minPesan = angkaAtauNull(form.minPesan) ?? 0;
    const ongkir = angkaAtauNull(form.ongkir) ?? 0;
    if (!Number.isFinite(minPesan) || minPesan < 0)
      return gagal("Minimal pesanan tidak boleh negatif");
    if (!Number.isFinite(ongkir) || ongkir < 0)
      return gagal("Ongkos kirim tidak boleh negatif");

    if (form.fotoTempat.length > MAKS_FOTO_TEMPAT)
      return gagal(`Foto tempat maksimal ${MAKS_FOTO_TEMPAT}`);

    if (!form.antar && !form.ambil && !form.meja)
      return gagal("Aktifkan minimal satu layanan untuk pembeli");

    const hariBuka = HARI.filter(({ k }) => form.jam[k].buka);
    if (hariBuka.length === 0) return gagal("Aktifkan minimal satu hari buka");
    for (const { k, label } of hariBuka) {
      const j = form.jam[k];
      if (!j.open || !j.close) return gagal(`Isi jam buka dan tutup hari ${label}`);
      if (j.open === j.close)
        return gagal(`Jam tutup hari ${label} harus berbeda dari jam buka`);
    }

    setMenyimpan(true);

    // Cuplikan yang akan menjadi pembanding setelah berhasil tersimpan
    const cuplikan = bidangNonGambar(form);

    // Susun jam buka per hari untuk kolom jsonb
    const openingHours: Record<string, { open: string; close: string } | null> = {};
    HARI.forEach(({ k }) => {
      const j = form.jam[k];
      openingHours[k] = j.buka ? { open: j.open, close: j.close } : null;
    });

    try {
      // Gambar (logo, banner, foto tempat) sudah tersimpan otomatis saat diunggah,
      // jadi tidak ikut ditulis di sini.
      const { data, error } = await supabase
        .from("shops")
        .update({
          name: nama,
          description: kosongJadiNull(form.deskripsi),
          phone: kosongJadiNull(telepon),
          whatsapp: kosongJadiNull(whatsapp),
          email: kosongJadiNull(email),
          address_line: alamat,
          village: kosongJadiNull(form.desa),
          district: kosongJadiNull(form.kecamatan),
          city: kosongJadiNull(form.kota),
          province: kosongJadiNull(form.provinsi),
          postal_code: kosongJadiNull(kodePos),
          maps_url: kosongJadiNull(petaUrl),
          latitude: lintang,
          longitude: bujur,
          min_order: minPesan,
          delivery_fee: ongkir,
          opening_hours: openingHours,
          delivery_enabled: form.antar,
          pickup_enabled: form.ambil,
          dine_in_enabled: form.meja,
          pos_enabled: form.kasir,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("id");

      if (error) {
        console.error("Gagal menyimpan toko:", error);
        toast.galat("Gagal menyimpan perubahan", pesanGalatDb(error));
        return;
      }

      // RLS yang menolak update tidak mengembalikan error, hanya 0 baris
      if (!data || data.length === 0) {
        toast.galat(
          "Perubahan tidak tersimpan",
          "Kamu tidak punya izin mengubah toko ini, atau toko tidak ditemukan."
        );
        return;
      }

      // Sinkronkan data ringkas ke context toko setelah database berhasil
      // (jam di context diambil dari hari buka pertama)
      const acuan = form.jam[hariBuka[0].k];
      perbaruiToko({
        nama,
        alamat,
        area: form.desa.trim(),
        buka: acuan.open,
        tutup: acuan.close,
        antar: form.antar,
        ambil: form.ambil,
        meja: form.meja,
        kasir: form.kasir,
      });

      setMejaTersimpan(form.meja);
      setAwal(cuplikan);
      toast.sukses("Perubahan tersimpan", "Pengaturan toko berhasil diperbarui.");
    } catch (e) {
      console.error("Gagal menyimpan toko:", e);
      toast.galat("Gagal menyimpan perubahan", "Periksa koneksi internet lalu coba lagi.");
    } finally {
      setMenyimpan(false);
    }
  };

  if (memuat) return <Kerangka />;

  if (galatMuat || !form) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-100 bg-white px-6 py-14 text-center shadow-sm">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <AlertCircle className="h-6 w-6" />
        </span>
        <p className="text-sm text-gray-500">
          Data toko gagal dimuat. Muat ulang halaman, periksa aturan RLS tabel shops di
          Supabase, dan pastikan kolom place_photos sudah dibuat.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 text-xs font-medium text-orange-600 transition-colors hover:bg-orange-100"
        >
          Muat ulang
        </button>
      </div>
    );
  }

  const lokasi = [form.desa, form.kota].filter(Boolean).join(", ");

  // Tombol ke halaman kode QR meja. Baru bisa dibuka setelah layanan meja tersimpan.
  const mejaBelumTersimpan = form.meja !== mejaTersimpan;
  const aksiMeja = mejaBelumTersimpan ? (
    <p className="flex items-start gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-100">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      Simpan perubahan dulu, setelah itu tombol atur dan cetak kode QR bisa dibuka.
    </p>
  ) : (
    <Link
      href={`${alamatDasar}${RUTE_QR_MEJA}`}
      className="inline-flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3.5 py-2 text-xs font-semibold text-orange-700 transition-colors hover:bg-orange-100"
    >
      <QrCode className="h-4 w-4" />
      Atur dan cetak kode QR
    </Link>
  );

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Header */}
      <header>
        <p className="text-sm text-gray-500">Atur profil dan layanan toko Anda</p>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">
          Pengaturan toko
        </h2>
      </header>

      {/* Gambar toko */}
      <KartuSection
        ikon={ImageIcon}
        judul="Gambar toko"
        deskripsi="Logo dan banner agar toko lebih dikenali"
      >
        <div className="grid gap-6 p-5 md:grid-cols-2">
          <BidangGambar
            label="Logo"
            bantuan="Persegi, maksimal 2 MB. Tersimpan otomatis."
            url={form.logo}
            lebar={false}
            sedangUnggah={unggah === "logo"}
            onPilih={(f) => unggahGambar(f, "logo")}
            onHapus={() => hapusGambar("logo")}
            onLihat={() => bukaPratinjau([form.logo])}
          />
          <BidangGambar
            label="Banner"
            bantuan="Persegi panjang, maksimal 2 MB. Tersimpan otomatis."
            url={form.banner}
            lebar
            sedangUnggah={unggah === "banner"}
            onPilih={(f) => unggahGambar(f, "banner")}
            onHapus={() => hapusGambar("banner")}
            onLihat={() => bukaPratinjau([form.banner])}
          />
        </div>
      </KartuSection>

      {/* Foto tempat */}
      <KartuSection
        ikon={Camera}
        judul="Foto tempat"
        deskripsi="Bantu pembeli dan kurir mengenali lokasi tokomu"
      >
        <div className="p-5">
          <GaleriFoto
            urls={form.fotoTempat}
            maks={MAKS_FOTO_TEMPAT}
            sedangUnggah={unggah === "tempat"}
            onTambah={tambahFotoTempat}
            onHapus={hapusFotoTempat}
            onLihat={(i) => bukaPratinjau(form.fotoTempat, i)}
          />
        </div>
      </KartuSection>

      {/* Profil toko */}
      <KartuSection
        ikon={Store}
        judul="Profil toko"
        deskripsi={lokasi ? `Area ${lokasi}` : undefined}
      >
        <div className="space-y-5 p-5">
          <Bidang id="nama-toko" label="Nama toko">
            <input
              id="nama-toko"
              value={form.nama}
              maxLength={100}
              onChange={(e) => ubah("nama", e.target.value)}
              className={INPUT_MODERN}
            />
          </Bidang>

          <Bidang
            id="deskripsi-toko"
            label="Deskripsi"
            ikon={FileText}
            bantuan="Ceritakan singkat tentang tokomu: menu andalan, keunggulan, dan sebagainya"
          >
            <textarea
              id="deskripsi-toko"
              rows={3}
              maxLength={500}
              value={form.deskripsi}
              onChange={(e) => ubah("deskripsi", e.target.value)}
              className={`${INPUT_MODERN} resize-none`}
            />
          </Bidang>
        </div>
      </KartuSection>

      {/* Kontak */}
      <KartuSection ikon={Phone} judul="Kontak" deskripsi="Agar pembeli mudah menghubungi">
        <div className="grid gap-5 p-5 md:grid-cols-2">
          <Bidang id="telepon" label="Telepon" ikon={Phone} bantuan="Contoh: 081234567890">
            <input
              id="telepon"
              type="tel"
              inputMode="tel"
              value={form.telepon}
              onChange={(e) => ubah("telepon", e.target.value)}
              className={INPUT_MODERN}
            />
          </Bidang>
          <Bidang id="whatsapp" label="WhatsApp" ikon={Phone} bantuan="Contoh: 081234567890">
            <input
              id="whatsapp"
              type="tel"
              inputMode="tel"
              value={form.whatsapp}
              onChange={(e) => ubah("whatsapp", e.target.value)}
              className={INPUT_MODERN}
            />
          </Bidang>
          <div className="md:col-span-2">
            <Bidang id="email" label="Email" ikon={Mail}>
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => ubah("email", e.target.value)}
                className={INPUT_MODERN}
              />
            </Bidang>
          </div>
        </div>
      </KartuSection>

      {/* Alamat dan lokasi */}
      <KartuSection
        ikon={MapPin}
        judul="Alamat dan lokasi"
        deskripsi="Dipakai pembeli untuk menemukan tokomu"
      >
        <div className="space-y-5 p-5">
          <Bidang id="alamat-toko" label="Alamat lengkap" ikon={MapPin}>
            <textarea
              id="alamat-toko"
              rows={2}
              value={form.alamat}
              onChange={(e) => ubah("alamat", e.target.value)}
              className={`${INPUT_MODERN} resize-none`}
            />
          </Bidang>

          <div className="grid gap-5 md:grid-cols-2">
            <Bidang id="desa" label="Desa / Kelurahan">
              <input
                id="desa"
                value={form.desa}
                onChange={(e) => ubah("desa", e.target.value)}
                className={INPUT_MODERN}
              />
            </Bidang>
            <Bidang id="kecamatan" label="Kecamatan">
              <input
                id="kecamatan"
                value={form.kecamatan}
                onChange={(e) => ubah("kecamatan", e.target.value)}
                className={INPUT_MODERN}
              />
            </Bidang>
            <Bidang id="kota" label="Kota / Kabupaten">
              <input
                id="kota"
                value={form.kota}
                onChange={(e) => ubah("kota", e.target.value)}
                className={INPUT_MODERN}
              />
            </Bidang>
            <Bidang id="provinsi" label="Provinsi">
              <input
                id="provinsi"
                value={form.provinsi}
                onChange={(e) => ubah("provinsi", e.target.value)}
                className={INPUT_MODERN}
              />
            </Bidang>
            <Bidang id="kode-pos" label="Kode pos">
              <input
                id="kode-pos"
                inputMode="numeric"
                maxLength={5}
                value={form.kodePos}
                onChange={(e) => ubah("kodePos", e.target.value.replace(/\D/g, ""))}
                className={INPUT_MODERN}
              />
            </Bidang>
            <Bidang id="peta-url" label="Tautan Google Maps" ikon={Link2}>
              <input
                id="peta-url"
                type="url"
                inputMode="url"
                placeholder="https://maps.app.goo.gl/..."
                value={form.petaUrl}
                onChange={(e) => ubah("petaUrl", e.target.value)}
                className={INPUT_MODERN}
              />
            </Bidang>
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3 md:gap-4">
              <Bidang id="lintang" label="Lintang (latitude)">
                <input
                  id="lintang"
                  inputMode="decimal"
                  placeholder="-7.250445"
                  value={form.lintang}
                  onChange={(e) => ubah("lintang", e.target.value)}
                  className={INPUT_MODERN}
                />
              </Bidang>
              <Bidang id="bujur" label="Bujur (longitude)">
                <input
                  id="bujur"
                  inputMode="decimal"
                  placeholder="112.768845"
                  value={form.bujur}
                  onChange={(e) => ubah("bujur", e.target.value)}
                  className={INPUT_MODERN}
                />
              </Bidang>
            </div>
            <button
              type="button"
              onClick={gunakanLokasiSaya}
              disabled={mencariLokasi}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:border-orange-200 hover:bg-orange-50/50 hover:text-orange-600 disabled:opacity-60"
            >
              {mencariLokasi ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <LocateFixed className="h-3.5 w-3.5" />
              )}
              Gunakan lokasi saya sekarang
            </button>
          </div>
        </div>
      </KartuSection>

      {/* Jam buka */}
      <KartuSection
        ikon={Clock}
        judul="Jam buka"
        deskripsi="Atur jam tiap hari, matikan untuk hari libur"
      >
        <ul className="divide-y divide-gray-100">
          {HARI.map(({ k, label }) => {
            const j = form.jam[k];
            return (
              <li
                key={k}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3.5"
              >
                <span className="w-20 text-sm font-medium text-gray-900">{label}</span>
                <Saklar
                  nyala={j.buka}
                  onChange={() => ubahHari(k, { buka: !j.buka })}
                  label={`Buka hari ${label}`}
                />
                {j.buka ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      aria-label={`Jam buka ${label}`}
                      value={j.open}
                      onChange={(e) => ubahHari(k, { open: e.target.value })}
                      className={`${INPUT_MODERN} !w-auto`}
                    />
                    <span className="text-gray-400">-</span>
                    <input
                      type="time"
                      aria-label={`Jam tutup ${label}`}
                      value={j.close}
                      onChange={(e) => ubahHari(k, { close: e.target.value })}
                      className={`${INPUT_MODERN} !w-auto`}
                    />
                  </div>
                ) : (
                  <span className="text-sm text-gray-400">Libur</span>
                )}
              </li>
            );
          })}
        </ul>
        <div className="border-t border-gray-100 px-5 py-3">
          <button
            type="button"
            onClick={samakanSemuaHari}
            className="text-xs font-medium text-orange-600 transition-colors hover:text-orange-700"
          >
            Samakan jam semua hari buka dengan hari buka pertama
          </button>
        </div>
      </KartuSection>

      {/* Layanan untuk pembeli */}
      <KartuSection
        ikon={Store}
        judul="Layanan untuk pembeli"
        deskripsi="Pilih cara pembeli memesan"
      >
        <ul className="divide-y divide-gray-100">
          {JENIS_PESANAN.map(({ id: k, label, ikon }) => (
            <BarisFitur
              key={k}
              ikon={ikon}
              judul={label}
              nyala={form[k]}
              onChange={() => ubah(k, !form[k])}
              aksi={k === "meja" ? aksiMeja : undefined}
            />
          ))}
        </ul>
      </KartuSection>

      {/* Biaya pesanan */}
      <KartuSection
        ikon={Wallet}
        judul="Biaya pesanan"
        deskripsi="Minimal belanja dan ongkos kirim"
      >
        <div className="grid gap-5 p-5 md:grid-cols-2">
          <Bidang
            id="min-pesan"
            label="Minimal pesanan (Rp)"
            bantuan="Isi 0 jika tidak ada minimal"
          >
            <input
              id="min-pesan"
              type="number"
              inputMode="numeric"
              min={0}
              step={500}
              value={form.minPesan}
              onChange={(e) => ubah("minPesan", e.target.value)}
              className={INPUT_MODERN}
            />
          </Bidang>
          {form.antar && (
            <Bidang
              id="ongkir"
              label="Ongkos kirim (Rp)"
              ikon={Bike}
              bantuan="Isi 0 untuk gratis ongkir"
            >
              <input
                id="ongkir"
                type="number"
                inputMode="numeric"
                min={0}
                step={500}
                value={form.ongkir}
                onChange={(e) => ubah("ongkir", e.target.value)}
                className={INPUT_MODERN}
              />
            </Bidang>
          )}
        </div>
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
            onChange={() => ubah("kasir", !form.kasir)}
          />
        </ul>
      </KartuSection>

      {/* Aksi */}
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

      {/* Ruang kosong agar konten terakhir tidak tertutup tombol simpan melayang */}
      <div aria-hidden className="h-16" />

      {/* Tombol simpan melayang: muncul hanya bila ada perubahan non-gambar */}
      <div
        aria-hidden={!adaPerubahan}
        className={`pointer-events-none fixed right-4 z-40 transition-all duration-200 md:right-8 ${POSISI_TOMBOL_SIMPAN} ${
          adaPerubahan ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
        }`}
      >
        <button
          type="button"
          onClick={simpan}
          tabIndex={adaPerubahan ? 0 : -1}
          disabled={!adaPerubahan || menyimpan || unggah !== null}
          className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/30 transition-all hover:shadow-xl hover:shadow-orange-500/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {menyimpan ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {menyimpan ? "Menyimpan..." : "Simpan perubahan"}
        </button>
      </div>

      {/* Pratinjau gambar */}
      {pratinjau && (
        <PratinjauGambar
          urls={pratinjau.urls}
          index={pratinjau.index}
          onTutup={tutupPratinjau}
          onGeser={geserPratinjau}
        />
      )}
    </div>
  );
}