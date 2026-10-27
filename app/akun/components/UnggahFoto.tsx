"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Camera, Home, Loader2, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/toast";
import { useModal } from "@/components/modal";

// ---------- Konstanta ----------

// Harus sama dengan allowed_mime_types pada bucket
const TIPE_GAMBAR = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

// Bucket publik untuk semua foto pengguna.
// Path file: <userId>/<folder>/<timestamp>-<acak>.<ekstensi>
const BUCKET = "users";

// Bucket lama, hanya dipakai untuk membersihkan file lama saat foto diganti/dihapus
const BUCKET_LAMA = "profil";

const KONFIG = {
  avatar: {
    folder: "avatar",
    kolom: "avatar_url",
    maksMB: 2,
    sisiMaks: 512,
    label: "Foto profil",
  },
  rumah: {
    folder: "rumah",
    kolom: "house_photo_url",
    maksMB: 5,
    sisiMaks: 1600,
    label: "Foto rumah",
  },
} as const;

type Jenis = keyof typeof KONFIG;

// Batas file mentah yang masih mau dibaca browser (sebelum dikompres)
const MAKS_MENTAH_MB = 15;

// ---------- Fungsi bantu ----------

function formatUkuran(byte: number): string {
  if (byte < 1024 * 1024) return `${Math.max(1, Math.round(byte / 1024))} KB`;
  return `${(byte / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

// Ambil path file di bucket dari URL publik Supabase
function pathDariUrl(url: string, bucket: string): string | null {
  const penanda = `/storage/v1/object/public/${bucket}/`;
  const i = url.indexOf(penanda);
  if (i === -1) return null;
  try {
    return decodeURIComponent(url.slice(i + penanda.length).split("?")[0]);
  } catch {
    return null;
  }
}

// Konversi ke WebP (JPEG bila tidak didukung), perkecil dimensi ke sisiMaks,
// lalu turunkan kualitas dan dimensi sampai ukurannya di bawah maksBytes.
async function konversiGambar(
  file: File,
  sisiMaks: number,
  maksBytes: number
): Promise<File | null> {
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
    let skala = Math.min(1, sisiMaks / Math.max(lebarAsli, tinggiAsli));

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
          const namaDasar = file.name.replace(/\.[^.]+$/, "") || "foto";
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
function pesanGalatUnggah(pesan: string, jenis: Jenis): string {
  const { maksMB } = KONFIG[jenis];
  if (/bucket not found/i.test(pesan)) return `Bucket "${BUCKET}" belum dibuat di Supabase.`;
  if (/row-level security|unauthorized|not authorized/i.test(pesan))
    return `Tidak punya izin mengunggah ke bucket "${BUCKET}". Periksa policy Storage di Supabase.`;
  if (/mime/i.test(pesan))
    return "Format gambar tidak didukung. Gunakan JPG, PNG, WebP, GIF, atau AVIF.";
  if (/exceed|too large|size/i.test(pesan)) return `Ukuran foto melebihi batas ${maksMB} MB.`;
  return pesan || "Terjadi kesalahan yang tidak diketahui.";
}

// ---------- Komponen ----------

type Props = {
  id: string;
  jenis: Jenis;
  userId: string;
  value: string;
  /** Dipanggil setelah foto berhasil tersimpan di bucket dan database ("" bila dihapus) */
  onTersimpan: (url: string) => void;
  /** Memberi tahu induk bahwa proses unggah/hapus sedang berjalan */
  onSibuk?: (sibuk: boolean) => void;
  inisial?: string; // dipakai sebagai cadangan foto profil
  kosong?: boolean;
};

export default function UnggahFoto({
  id,
  jenis,
  userId,
  value,
  onTersimpan,
  onSibuk,
  inisial = "?",
  kosong,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const modal = useModal();
  const inputRef = useRef<HTMLInputElement>(null);
  const [memproses, setMemproses] = useState(false);

  const bulat = jenis === "avatar";
  const { folder, kolom, maksMB, sisiMaks, label } = KONFIG[jenis];

  useEffect(() => {
    onSibuk?.(memproses);
  }, [memproses, onSibuk]);

  // Hapus file lama dari bucket (best effort, hanya file milik pengguna ini)
  const hapusDariBucket = async (url: string) => {
    if (!url) return;
    for (const bucket of [BUCKET, BUCKET_LAMA]) {
      const path = pathDariUrl(url, bucket);
      if (path && path.startsWith(`${userId}/`)) {
        const { error } = await supabase.storage.from(bucket).remove([path]);
        if (error) console.error("Gagal menghapus file lama dari bucket:", error);
        return;
      }
    }
  };

  // Update satu kolom foto saja, isian teks lain tidak ikut tertulis
  const simpanKolom = async (nilai: string | null): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .update({ [kolom]: nilai, updated_at: new Date().toISOString() })
        .eq("id", userId)
        .select("id");

      if (error) {
        console.error("Gagal menyimpan foto:", error);
        toast.galat(
          "Gagal menyimpan foto",
          error.code === "42501"
            ? "Tidak punya izin menyimpan, periksa aturan RLS tabel profiles."
            : error.message || "Coba lagi beberapa saat."
        );
        return false;
      }
      if (!data || data.length === 0) {
        toast.galat(
          "Foto tidak tersimpan",
          "Data profilmu belum ada. Isi data diri dan simpan dulu, lalu unggah foto."
        );
        return false;
      }
      return true;
    } catch (e) {
      console.error("Gagal menyimpan foto:", e);
      toast.galat("Gagal menyimpan foto", "Periksa koneksi internet lalu coba lagi.");
      return false;
    }
  };

  const pilih = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // agar file yang sama bisa dipilih lagi
    if (!file) return;

    // ----- Validasi -----
    if (!TIPE_GAMBAR.includes(file.type)) {
      toast.galat("Format tidak didukung", "Gunakan JPG, PNG, WebP, GIF, atau AVIF.");
      return;
    }
    if (file.size > MAKS_MENTAH_MB * 1024 * 1024) {
      toast.galat(
        "Ukuran foto terlalu besar",
        `Maksimal ${MAKS_MENTAH_MB} MB, fotomu ${formatUkuran(file.size)}.`
      );
      return;
    }

    const maksBytes = maksMB * 1024 * 1024;
    const melebihi = file.size > maksBytes;

    // ----- Konfirmasi kompres bila melebihi batas -----
    if (melebihi) {
      const lanjut = await modal.konfirmasi({
        jenis: "peringatan",
        judul: "Ukuran foto melebihi batas",
        deskripsi:
          `${label} maksimal ${maksMB} MB.\n• ${file.name} (${formatUkuran(file.size)})\n\n` +
          `Pilih "Unggah dan kompres" untuk memperkecil ukurannya otomatis sebelum diunggah.` +
          (file.type === "image/gif" ? " Animasi GIF akan menjadi gambar diam." : ""),
        teksBatal: "Batal",
        teksSetuju: "Unggah dan kompres",
      });
      if (!lanjut) return;
    }

    setMemproses(true);
    try {
      // ----- Konversi ke WebP + perkecil -----
      const siap = await konversiGambar(file, sisiMaks, maksBytes);
      if (!siap) {
        toast.galat(
          "Foto gagal diproses",
          melebihi
            ? "Coba pilih foto lain yang lebih kecil."
            : "Format foto tidak bisa dibaca, coba JPG atau PNG."
        );
        return;
      }

      if (melebihi) {
        toast.info("Foto dikompres", `${formatUkuran(file.size)} → ${formatUkuran(siap.size)}`);
      }

      // ----- Unggah ke bucket -----
      const ekstensi = siap.type === "image/webp" ? "webp" : "jpg";
      const path = `${userId}/${folder}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ekstensi}`;

      const { error } = await supabase.storage.from(BUCKET).upload(path, siap, {
        contentType: siap.type,
        cacheControl: "31536000",
        upsert: false,
      });

      if (error) {
        console.error(`Gagal mengunggah ${label}:`, error);
        toast.galat(`${label} gagal diunggah`, pesanGalatUnggah(error.message, jenis));
        return;
      }

      const urlBaru = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

      // ----- Simpan ke database (otomatis) -----
      if (!(await simpanKolom(urlBaru))) {
        // jangan tinggalkan file yatim
        await supabase.storage.from(BUCKET).remove([path]);
        return;
      }

      const lama = value;
      onTersimpan(urlBaru);

      // ----- Ganti: hapus foto sebelumnya dari bucket -----
      if (lama && lama !== urlBaru) await hapusDariBucket(lama);

      toast.sukses(`${label} berhasil disimpan`);
    } catch (err) {
      console.error(`Gagal mengunggah ${label}:`, err);
      toast.galat(`${label} gagal diunggah`, "Periksa koneksi internet lalu coba lagi.");
    } finally {
      setMemproses(false);
    }
  };

  const hapus = async () => {
    const setuju = await modal.konfirmasi({
      jenis: "peringatan",
      judul: `Hapus ${label.toLowerCase()}?`,
      deskripsi: "Foto akan dihapus permanen dan tidak bisa dikembalikan.",
      teksBatal: "Batal",
      teksSetuju: "Hapus",
    });
    if (!setuju) return;

    setMemproses(true);
    try {
      const lama = value;
      if (!(await simpanKolom(null))) return;

      onTersimpan("");
      if (lama) await hapusDariBucket(lama);
      toast.info(`${label} dihapus`);
    } finally {
      setMemproses(false);
    }
  };

  const pratinjau = (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br from-orange-400 to-red-500 text-white ${
        bulat ? "h-20 w-20 rounded-full text-3xl font-extrabold" : "h-24 w-36 rounded-2xl"
      } ${kosong ? "ring-2 ring-amber-300" : "ring-1 ring-gray-200"}`}
    >
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="" className="h-full w-full object-cover" />
      ) : bulat ? (
        <span aria-hidden="true">{inisial}</span>
      ) : (
        <Home className="h-8 w-8 text-white/90" />
      )}
      {memproses && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/40">
          <Loader2 className="h-6 w-6 animate-spin text-white" />
        </span>
      )}
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4">
        {pratinjau}
        <div className="flex min-w-0 flex-col items-start gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={TIPE_GAMBAR.join(",")}
            onChange={pilih}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
          />
          <button
            id={id}
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={memproses}
            className="flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-xs font-medium text-orange-600 transition-colors hover:bg-orange-100 disabled:opacity-60"
          >
            {memproses ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Camera className="h-3.5 w-3.5" />
            )}
            {memproses ? "Memproses..." : value ? "Ganti foto" : "Pilih foto"}
          </button>
          {value && !memproses && (
            <button
              type="button"
              onClick={hapus}
              className="flex items-center gap-1.5 text-xs font-medium text-gray-500 transition-colors hover:text-red-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Hapus foto
            </button>
          )}
          {kosong && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              Belum diisi
            </span>
          )}
          <p className="text-xs text-gray-400">
            Maksimal {maksMB} MB, tersimpan otomatis. Dikonversi ke WebP.
          </p>
        </div>
      </div>
    </div>
  );
}