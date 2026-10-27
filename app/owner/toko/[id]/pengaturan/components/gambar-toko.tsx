"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  Camera,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  Loader2,
  Plus,
  Trash2,
  Upload,
  X,
  ZoomIn,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/toast";
import { useModal } from "@/components/modal";
import { useToko } from "../../components/toko-context";

// ---------- Konstanta & tipe ----------

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

type DataGambar = { logo: string; banner: string; fotoTempat: string[] };
type StatePratinjau = { urls: string[]; index: number };
type HasilUnggah = { url: string; path: string };

// ---------- Fungsi bantu ----------

const teks = (v: unknown) => (typeof v === "string" ? v : "");

function formatUkuran(byte: number): string {
  if (byte < 1024 * 1024) return `${Math.max(1, Math.round(byte / 1024))} KB`;
  return `${(byte / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
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
              <img src={url} alt={`Foto tempat ${i + 1}`} className="h-full w-full object-cover" />
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
        Foto bangunan, papan nama, atau area toko. Maksimal {maks} foto, masing-masing 5 MB. Foto
        pertama menjadi foto utama.
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

// ---------- Komponen utama ----------

export default function GambarToko() {
  const { id } = useToko();
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const modal = useModal();

  const [data, setData] = useState<DataGambar | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [unggah, setUnggah] = useState<JenisGambar | null>(null);
  const [pratinjau, setPratinjau] = useState<StatePratinjau | null>(null);

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

  // Muat gambar dari tabel shops
  useEffect(() => {
    let batal = false;

    async function muat() {
      const { data: baris, error } = await supabase
        .from("shops")
        .select("logo_url, banner_url, place_photos")
        .eq("id", id)
        .maybeSingle();

      if (batal) return;

      if (error || !baris) {
        if (error) console.error("Gagal memuat gambar toko:", error);
        setMemuat(false);
        return;
      }

      const r = baris as Record<string, unknown>;
      const fotoTempat = Array.isArray(r.place_photos)
        ? (r.place_photos as unknown[]).filter(
            (u): u is string => typeof u === "string" && u !== ""
          )
        : [];

      setData({ logo: teks(r.logo_url), banner: teks(r.banner_url), fotoTempat });
      setMemuat(false);
    }

    muat();
    return () => {
      batal = true;
    };
  }, [supabase, id]);

  const ubah = <K extends keyof DataGambar>(kunci: K, nilai: DataGambar[K]) =>
    setData((d) => (d ? { ...d, [kunci]: nilai } : d));

  // Hapus file dari bucket (best effort, hanya file milik toko ini)
  const hapusDariBucket = async (paths: (string | null)[]) => {
    const aman = paths.filter(
      (p): p is string => typeof p === "string" && p.startsWith(`${id}/`)
    );
    if (aman.length === 0) return;
    const { error } = await supabase.storage.from(BUCKET_TOKO).remove(aman);
    if (error) console.error("Gagal menghapus file lama dari bucket:", error);
  };

  // Update satu kolom gambar saja
  const simpanKolomGambar = async (
    kolom: "logo_url" | "banner_url" | "place_photos",
    nilai: string | null | string[]
  ): Promise<boolean> => {
    try {
      const { data: hasil, error } = await supabase
        .from("shops")
        .update({ [kolom]: nilai, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("id");

      if (error) {
        console.error("Gagal menyimpan gambar:", error);
        toast.galat("Gagal menyimpan gambar", pesanGalatDb(error));
        return false;
      }
      if (!hasil || hasil.length === 0) {
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
      const lama = data ? data[jenis] : "";

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
    if (!data) return;
    const kolom = jenis === "logo" ? "logo_url" : "banner_url";
    const lama = data[jenis];

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
    if (!data) return;

    const sisa = MAKS_FOTO_TEMPAT - data.fotoTempat.length;
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

      const gabungan = [...data.fotoTempat, ...berhasil.map((h) => h.url)].slice(
        0,
        MAKS_FOTO_TEMPAT
      );

      if (!(await simpanKolomGambar("place_photos", gabungan))) {
        await hapusDariBucket(berhasil.map((h) => h.path));
        return;
      }

      ubah("fotoTempat", gabungan);
      toast.sukses(
        berhasil.length === 1 ? "Foto berhasil disimpan" : `${berhasil.length} foto berhasil disimpan`
      );
    } finally {
      setUnggah(null);
    }
  };

  const hapusFotoTempat = async (index: number) => {
    if (!data) return;
    const url = data.fotoTempat[index];
    const sisa = data.fotoTempat.filter((_, i) => i !== index);

    setUnggah("tempat");
    try {
      if (!(await simpanKolomGambar("place_photos", sisa))) return;
      ubah("fotoTempat", sisa);
      if (url) await hapusDariBucket([pathDariUrl(url)]);
      toast.info("Foto dihapus");
    } finally {
      setUnggah(null);
    }
  };

  if (memuat) {
    return (
      <div className="space-y-6" aria-busy="true">
        <span className="sr-only">Memuat gambar toko</span>
        <div className="h-48 animate-pulse rounded-2xl bg-gray-200/70" />
        <div className="h-64 animate-pulse rounded-2xl bg-gray-200/70" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-100 bg-white px-6 py-14 text-center shadow-sm">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <AlertCircle className="h-6 w-6" />
        </span>
        <p className="text-sm text-gray-500">
          Gambar toko gagal dimuat. Muat ulang halaman, periksa aturan RLS tabel shops di Supabase,
          dan pastikan kolom place_photos sudah dibuat.
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

  return (
    <div className="space-y-6 md:space-y-8">
      <KartuSection
        ikon={ImageIcon}
        judul="Gambar toko"
        deskripsi="Logo dan banner agar toko lebih dikenali"
      >
        <div className="grid gap-6 p-5 md:grid-cols-2">
          <BidangGambar
            label="Logo"
            bantuan="Persegi, maksimal 2 MB. Tersimpan otomatis."
            url={data.logo}
            lebar={false}
            sedangUnggah={unggah === "logo"}
            onPilih={(f) => unggahGambar(f, "logo")}
            onHapus={() => hapusGambar("logo")}
            onLihat={() => bukaPratinjau([data.logo])}
          />
          <BidangGambar
            label="Banner"
            bantuan="Persegi panjang, maksimal 2 MB. Tersimpan otomatis."
            url={data.banner}
            lebar
            sedangUnggah={unggah === "banner"}
            onPilih={(f) => unggahGambar(f, "banner")}
            onHapus={() => hapusGambar("banner")}
            onLihat={() => bukaPratinjau([data.banner])}
          />
        </div>
      </KartuSection>

      <KartuSection
        ikon={Camera}
        judul="Foto tempat"
        deskripsi="Bantu pembeli dan kurir mengenali lokasi tokomu"
      >
        <div className="p-5">
          <GaleriFoto
            urls={data.fotoTempat}
            maks={MAKS_FOTO_TEMPAT}
            sedangUnggah={unggah === "tempat"}
            onTambah={tambahFotoTempat}
            onHapus={hapusFotoTempat}
            onLihat={(i) => bukaPratinjau(data.fotoTempat, i)}
          />
        </div>
      </KartuSection>

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