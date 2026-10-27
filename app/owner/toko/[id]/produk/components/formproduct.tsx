"use client";

import { useEffect, useState } from "react";
import { AlertCircle, ImagePlus, Loader2, X } from "lucide-react";
import { useToko, type InputProduk } from "../../components/toko-context";
import { Dialog, Saklar } from "../../ui";

type Galat = Partial<Record<"nama" | "harga" | "stok" | "gambar", string>>;

type Props = {
  onTutup: () => void;
  /** Boleh async. Jika melempar error, pesannya ditampilkan di form. */
  onSimpan: (data: InputProduk) => void | Promise<void>;
};

const MAKS_UKURAN_GAMBAR = 2 * 1024 * 1024; // 2 MB

// Gaya input modern (seragam dengan halaman lain)
const INPUT_MODERN =
  "w-full rounded-xl border border-gray-200 bg-gray-50/70 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-500/10";

function PesanGalat({ children }: { children: string }) {
  return (
    <p role="alert" className="flex items-center gap-1 text-xs text-red-600">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
      {children}
    </p>
  );
}

export default function FormProduct({ onTutup, onSimpan }: Props) {
  const { kategori } = useToko();

  const [draf, setDraf] = useState({
    nama: "",
    deskripsi: "",
    sku: "",
    kategoriId: "",
    harga: "",
    stok: "",
    nonStok: false,
    tersedia: true,
  });
  const [gambar, setGambar] = useState<File | null>(null);
  const [pratinjau, setPratinjau] = useState<string | null>(null);
  const [galat, setGalat] = useState<Galat>({});
  const [galatSimpan, setGalatSimpan] = useState("");
  const [menyimpan, setMenyimpan] = useState(false);

  // Buat & bersihkan URL pratinjau foto
  useEffect(() => {
    if (!gambar) {
      setPratinjau(null);
      return;
    }
    const url = URL.createObjectURL(gambar);
    setPratinjau(url);
    return () => URL.revokeObjectURL(url);
  }, [gambar]);

  const pilihGambar = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setGalat((g) => ({ ...g, gambar: "File harus berupa gambar" }));
      return;
    }
    if (file.size > MAKS_UKURAN_GAMBAR) {
      setGalat((g) => ({ ...g, gambar: "Ukuran foto maksimal 2 MB" }));
      return;
    }
    setGalat((g) => ({ ...g, gambar: undefined }));
    setGambar(file);
  };

  const simpan = async () => {
    const e: Galat = {};
    const harga = Number(draf.harga);
    const stok = Number(draf.stok);

    const nama = draf.nama.trim();
    if (nama.length < 2) e.nama = "Nama produk minimal 2 huruf";
    else if (nama.length > 150) e.nama = "Nama produk maksimal 150 huruf";

    if (!draf.harga || !Number.isFinite(harga) || harga <= 0)
      e.harga = "Isi harga dengan angka lebih dari 0";

    // Stok hanya divalidasi jika produk memiliki stok
    if (!draf.nonStok) {
      if (draf.stok === "" || !Number.isInteger(stok) || stok < 0)
        e.stok = "Isi stok dengan angka bulat, minimal 0";
    }

    setGalat((g) => ({ ...e, gambar: g.gambar }));
    if (Object.keys(e).length > 0 || galat.gambar) return;

    setGalatSimpan("");
    setMenyimpan(true);
    try {
      await onSimpan({
        nama,
        deskripsi: draf.deskripsi.trim(),
        sku: draf.sku.trim(),
        kategoriId: draf.kategoriId || null,
        harga,
        stok: draf.nonStok ? 0 : stok,
        nonStok: draf.nonStok,
        // Produk bertrack stok dengan stok 0 tidak bisa ditampilkan sebagai tersedia
        tersedia: draf.tersedia && (draf.nonStok || stok > 0),
        gambar,
      });
    } catch (err) {
      setGalatSimpan(
        err instanceof Error ? err.message : "Gagal menyimpan produk."
      );
    } finally {
      setMenyimpan(false);
    }
  };

  return (
    <Dialog judul="Tambah produk" onTutup={onTutup}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">Tambah produk</h2>
        <button
          onClick={onTutup}
          aria-label="Tutup"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Foto produk */}
      <div className="space-y-1.5">
        <span className="block text-sm font-medium text-gray-700">
          Foto produk <span className="font-normal text-gray-400">(opsional)</span>
        </span>
        <div className="flex items-center gap-3">
          <label
            htmlFor="p-gambar"
            className="flex h-20 w-20 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 text-gray-400 transition hover:border-orange-300 hover:text-orange-500"
          >
            {pratinjau ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={pratinjau}
                alt="Pratinjau foto produk"
                className="h-full w-full object-cover"
              />
            ) : (
              <ImagePlus className="h-6 w-6" />
            )}
          </label>
          <input
            id="p-gambar"
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              pilihGambar(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <div className="min-w-0 text-xs text-gray-500">
            <p>JPG, PNG, atau WebP. Maksimal 2 MB.</p>
            {gambar && (
              <button
                type="button"
                onClick={() => setGambar(null)}
                className="mt-1 font-medium text-red-600 hover:underline"
              >
                Hapus foto
              </button>
            )}
          </div>
        </div>
        {galat.gambar && <PesanGalat>{galat.gambar}</PesanGalat>}
      </div>

      {/* Nama */}
      <div className="space-y-1.5">
        <label htmlFor="p-nama" className="block text-sm font-medium text-gray-700">
          Nama produk
        </label>
        <input
          id="p-nama"
          value={draf.nama}
          maxLength={150}
          onChange={(e) => setDraf({ ...draf, nama: e.target.value })}
          placeholder="Contoh: Nasi goreng spesial"
          className={INPUT_MODERN}
        />
        {galat.nama && <PesanGalat>{galat.nama}</PesanGalat>}
      </div>

      {/* Kategori */}
      {kategori.length > 0 && (
        <div className="space-y-1.5">
          <label
            htmlFor="p-kategori"
            className="block text-sm font-medium text-gray-700"
          >
            Kategori <span className="font-normal text-gray-400">(opsional)</span>
          </label>
          <select
            id="p-kategori"
            value={draf.kategoriId}
            onChange={(e) => setDraf({ ...draf, kategoriId: e.target.value })}
            className={INPUT_MODERN}
          >
            <option value="">Tanpa kategori</option>
            {kategori.map((k) => (
              <option key={k.id} value={k.id}>
                {k.nama}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Deskripsi */}
      <div className="space-y-1.5">
        <label
          htmlFor="p-deskripsi"
          className="block text-sm font-medium text-gray-700"
        >
          Deskripsi <span className="font-normal text-gray-400">(opsional)</span>
        </label>
        <textarea
          id="p-deskripsi"
          rows={3}
          value={draf.deskripsi}
          onChange={(e) => setDraf({ ...draf, deskripsi: e.target.value })}
          placeholder="Contoh: Nasi goreng dengan telur, ayam suwir, dan kerupuk"
          className={`${INPUT_MODERN} resize-none`}
        />
      </div>

      {/* Harga + SKU */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label
            htmlFor="p-harga"
            className="block text-sm font-medium text-gray-700"
          >
            Harga (Rp)
          </label>
          <input
            id="p-harga"
            type="number"
            inputMode="numeric"
            min={0}
            value={draf.harga}
            onChange={(e) => setDraf({ ...draf, harga: e.target.value })}
            placeholder="25000"
            className={INPUT_MODERN}
          />
          {galat.harga && <PesanGalat>{galat.harga}</PesanGalat>}
        </div>
        <div className="space-y-1.5">
          <label htmlFor="p-sku" className="block text-sm font-medium text-gray-700">
            SKU <span className="font-normal text-gray-400">(opsional)</span>
          </label>
          <input
            id="p-sku"
            value={draf.sku}
            onChange={(e) => setDraf({ ...draf, sku: e.target.value })}
            placeholder="NSG-001"
            className={INPUT_MODERN}
          />
        </div>
      </div>

      {/* Saklar produk tanpa stok */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50/70 px-3.5 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800">Produk tanpa stok</p>
          <p className="text-xs text-gray-500">
            Untuk produk yang dibuat saat dipesan, seperti nasi goreng.
          </p>
        </div>
        <Saklar
          nyala={draf.nonStok}
          onChange={() => {
            setDraf({ ...draf, nonStok: !draf.nonStok, stok: "" });
            setGalat((g) => ({ ...g, stok: undefined }));
          }}
          label="Produk tanpa stok"
        />
      </div>

      {/* Input stok hanya muncul jika produk memiliki stok */}
      {!draf.nonStok && (
        <div className="space-y-1.5">
          <label htmlFor="p-stok" className="block text-sm font-medium text-gray-700">
            Stok
          </label>
          <input
            id="p-stok"
            type="number"
            inputMode="numeric"
            min={0}
            value={draf.stok}
            onChange={(e) => setDraf({ ...draf, stok: e.target.value })}
            placeholder="24"
            className={INPUT_MODERN}
          />
          {galat.stok && <PesanGalat>{galat.stok}</PesanGalat>}
        </div>
      )}

      {/* Saklar tersedia */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50/70 px-3.5 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800">
            Tampilkan ke pembeli
          </p>
          <p className="text-xs text-gray-500">
            Matikan untuk menyembunyikan produk sementara.
          </p>
        </div>
        <Saklar
          nyala={draf.tersedia}
          onChange={() => setDraf({ ...draf, tersedia: !draf.tersedia })}
          label="Tampilkan produk ke pembeli"
        />
      </div>

      {galatSimpan && <PesanGalat>{galatSimpan}</PesanGalat>}

      <div className="flex gap-2.5 pt-1">
        <button
          onClick={onTutup}
          disabled={menyimpan}
          className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          Batal
        </button>
        <button
          onClick={simpan}
          disabled={menyimpan}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 py-2.5 text-sm font-semibold text-white shadow-md shadow-orange-500/25 transition-all hover:shadow-lg hover:shadow-orange-500/30 active:scale-[0.98] disabled:opacity-60"
        >
          {menyimpan && <Loader2 className="h-4 w-4 animate-spin" />}
          {menyimpan ? "Menyimpan..." : "Simpan produk"}
        </button>
      </div>
    </Dialog>
  );
}