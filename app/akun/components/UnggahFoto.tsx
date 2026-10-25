"use client";

import { useMemo, useRef, useState } from "react";
import { Camera, Home, Loader2, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PesanGalat } from "./Bidang";

const BUCKET = "profil";

type Props = {
  id: string;
  jenis: "avatar" | "rumah";
  userId: string;
  value: string;
  onChange: (url: string) => void;
  inisial?: string; // dipakai sebagai cadangan foto profil
  kosong?: boolean;
};

// Perkecil gambar di browser agar unggahan cepat dan hemat kuota
async function perkecil(file: File, sisiMaks: number): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const skala = Math.min(1, sisiMaks / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * skala);
  const h = Math.round(bmp.height * skala);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();

  return new Promise((ok, gagal) =>
    canvas.toBlob(
      (b) => (b ? ok(b) : gagal(new Error("blob"))),
      "image/jpeg",
      0.85
    )
  );
}

export default function UnggahFoto({
  id,
  jenis,
  userId,
  value,
  onChange,
  inisial = "?",
  kosong,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mengunggah, setMengunggah] = useState(false);
  const [galat, setGalat] = useState("");

  const bulat = jenis === "avatar";

  const pilih = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // agar file yang sama bisa dipilih lagi
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setGalat("File harus berupa gambar");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setGalat("Ukuran foto terlalu besar (maksimal 15 MB)");
      return;
    }

    setMengunggah(true);
    setGalat("");

    let blob: Blob;
    try {
      blob = await perkecil(file, bulat ? 512 : 1280);
    } catch {
      setMengunggah(false);
      setGalat("Format foto tidak didukung, coba JPG atau PNG");
      return;
    }

    const path = `${userId}/${jenis}-${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });

    if (error) {
      setMengunggah(false);
      setGalat("Gagal mengunggah foto, coba lagi");
      return;
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    onChange(data.publicUrl);
    setMengunggah(false);
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
      {mengunggah && (
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
            accept="image/*"
            onChange={pilih}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
          />
          <button
            id={id}
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={mengunggah}
            className="flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-xs font-medium text-orange-600 transition-colors hover:bg-orange-100 disabled:opacity-60"
          >
            <Camera className="h-3.5 w-3.5" />
            {value ? "Ganti foto" : "Pilih foto"}
          </button>
          {value && !mengunggah && (
            <button
              type="button"
              onClick={() => onChange("")}
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
        </div>
      </div>
      {galat && <PesanGalat>{galat}</PesanGalat>}
    </div>
  );
}