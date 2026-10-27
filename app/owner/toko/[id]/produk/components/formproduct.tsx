"use client";

import { useEffect, useId, useState } from "react";
import { AlertCircle, ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";
import {
  useToko,
  type InputProduk,
  type Produk,
} from "../../components/toko-context";
import { Saklar } from "../../ui";

/** Satu pilihan dalam grup, misalnya "Large" dengan tambahan harga 5000. */
export type OpsiInput = {
  id: string;
  nama: string;
  tambahHarga: number;
  tersedia: boolean;
};

/** Satu grup pilihan, misalnya "Ukuran" atau "Topping". */
export type GrupInput = {
  id: string;
  nama: string;
  wajib: boolean;
  /** Jumlah maksimal pilihan yang boleh dipilih pembeli. 1 = pilih satu saja. */
  maksPilih: number;
  opsi: OpsiInput[];
};

/** Data dari form. Foto sudah ada di bucket, jadi cukup kirim URL publiknya. */
export type InputUbahProduk = Omit<InputProduk, "gambar"> & {
  gambarUrl: string | null;
  grup: GrupInput[];
};

type Galat = Partial<Record<"nama" | "harga" | "stok" | "gambar", string>>;

type Props = {
  /** Jika diisi, form dalam mode ubah dan terisi data produk ini. */
  produk?: Produk;
  /** Mode ubah: grup pilihan produk yang sudah tersimpan (sudah dimuat induk). */
  grupAwal?: GrupInput[];
  onTutup: () => void;
  /** Boleh async. Jika melempar error, pesannya ditampilkan di form. */
  onSimpan: (data: InputUbahProduk) => void | Promise<void>;
  /**
   * Dipanggil saat pengguna memilih file. Induk yang memeriksa ukuran,
   * mengompres, mengunggah, dan (mode ubah) langsung menyimpan ke produk.
   * Mengembalikan URL foto baru, atau null jika pengguna membatalkan.
   * Jika melempar error, pesannya ditampilkan di bawah foto.
   */
  onPilihGambar: (file: File) => Promise<string | null>;
  /** Dipanggil saat foto dihapus. Induk menghapusnya dari bucket (dan produk di mode ubah). */
  onHapusGambar: () => Promise<void>;
};

type Draf = {
  nama: string;
  deskripsi: string;
  sku: string;
  kategoriId: string;
  harga: string;
  stok: string;
  nonStok: boolean;
  tersedia: boolean;
};

type DrafOpsi = { id: string; nama: string; harga: string; tersedia: boolean };
type DrafGrup = {
  id: string;
  nama: string;
  wajib: boolean;
  banyak: boolean;
  maks: string;
  opsi: DrafOpsi[];
};

const MAKS_GRUP = 10;
const MAKS_OPSI = 20;

function drafAwal(produk?: Produk): Draf {
  return {
    nama: produk?.nama ?? "",
    deskripsi: produk?.deskripsi ?? "",
    sku: produk?.sku ?? "",
    kategoriId: produk?.kategoriId ?? "",
    harga: produk ? String(produk.harga) : "",
    stok: produk && !produk.nonStok ? String(produk.stok) : "",
    nonStok: produk?.nonStok ?? false,
    tersedia: produk?.tersedia ?? true,
  };
}

function drafSama(a: Draf, b: Draf): boolean {
  return (Object.keys(a) as (keyof Draf)[]).every((k) => a[k] === b[k]);
}

function grupKeDraf(g: GrupInput): DrafGrup {
  const banyak = g.maksPilih > 1;
  return {
    id: g.id,
    nama: g.nama,
    wajib: g.wajib,
    banyak,
    maks: banyak ? String(g.maksPilih) : "",
    opsi: g.opsi.map((o) => ({
      id: o.id,
      nama: o.nama,
      harga: String(o.tambahHarga),
      tersedia: o.tersedia,
    })),
  };
}

function opsiBaru(): DrafOpsi {
  return { id: crypto.randomUUID(), nama: "", harga: "", tersedia: true };
}

function grupBaru(): DrafGrup {
  return {
    id: crypto.randomUUID(),
    nama: "",
    wajib: false,
    banyak: false,
    maks: "",
    opsi: [opsiBaru()],
  };
}

/** Memeriksa grup pilihan. Mengembalikan pesan galat pertama per grup (kunci = id grup). */
function periksaGrup(grup: DrafGrup[]): Record<string, string> {
  const hasil: Record<string, string> = {};
  for (const g of grup) {
    if (g.nama.trim().length === 0) {
      hasil[g.id] = "Isi nama grup, misalnya Ukuran atau Topping";
    } else if (g.opsi.length === 0) {
      hasil[g.id] = "Tambahkan minimal 1 pilihan";
    } else if (g.opsi.some((o) => o.nama.trim().length === 0)) {
      hasil[g.id] = "Semua pilihan harus diberi nama";
    } else if (
      g.opsi.some((o) => {
        if (o.harga === "") return false;
        const n = Number(o.harga);
        return !Number.isInteger(n) || n < 0;
      })
    ) {
      hasil[g.id] = "Tambahan harga harus angka bulat, minimal 0";
    } else if (g.banyak && g.maks !== "") {
      const m = Number(g.maks);
      if (!Number.isInteger(m) || m < 2) {
        hasil[g.id] = "Maksimal dipilih minimal 2, atau kosongkan";
      }
    }
  }
  return hasil;
}

function grupKeInput(grup: DrafGrup[]): GrupInput[] {
  return grup.map((g) => {
    const opsi = g.opsi.map((o) => ({
      id: o.id,
      nama: o.nama.trim(),
      tambahHarga: o.harga === "" ? 0 : Number(o.harga),
      tersedia: o.tersedia,
    }));
    const maks = g.maks === "" ? opsi.length : Number(g.maks);
    return {
      id: g.id,
      nama: g.nama.trim(),
      wajib: g.wajib,
      maksPilih: g.banyak ? Math.max(1, Math.min(maks, opsi.length)) : 1,
      opsi,
    };
  });
}

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

/** Bagian "Pilihan produk": grup pilihan beserta isinya. */
function BagianPilihan({
  grup,
  setGrup,
  galat,
}: {
  grup: DrafGrup[];
  setGrup: (g: DrafGrup[]) => void;
  galat: Record<string, string>;
}) {
  const ubahGrup = (id: string, ubah: Partial<DrafGrup>) =>
    setGrup(grup.map((g) => (g.id === id ? { ...g, ...ubah } : g)));

  const ubahOpsi = (gid: string, oid: string, ubah: Partial<DrafOpsi>) =>
    setGrup(
      grup.map((g) =>
        g.id === gid
          ? {
              ...g,
              opsi: g.opsi.map((o) => (o.id === oid ? { ...o, ...ubah } : o)),
            }
          : g
      )
    );

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-gray-700">
          Pilihan produk{" "}
          <span className="font-normal text-gray-400">(opsional)</span>
        </p>
        <p className="text-xs text-gray-500">
          Untuk ukuran, level pedas, panas atau dingin, dan topping. Harga akhir
          adalah harga produk ditambah tambahan harga pilihan.
        </p>
      </div>

      {grup.map((g, indeks) => (
        <div
          key={g.id}
          className="space-y-3 rounded-2xl border border-gray-200 p-3.5"
        >
          <div className="flex items-center gap-2">
            <input
              value={g.nama}
              maxLength={80}
              onChange={(e) => ubahGrup(g.id, { nama: e.target.value })}
              placeholder={
                indeks === 0 ? "Nama grup, contoh: Ukuran" : "Nama grup"
              }
              aria-label={`Nama grup pilihan ${indeks + 1}`}
              className={`${INPUT_MODERN} min-w-0 flex-1 font-medium`}
            />
            <button
              type="button"
              onClick={() => setGrup(grup.filter((x) => x.id !== g.id))}
              aria-label={`Hapus grup ${g.nama || indeks + 1}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 text-sm text-gray-700">
            <span>Wajib dipilih</span>
            <Saklar
              nyala={g.wajib}
              onChange={() => ubahGrup(g.id, { wajib: !g.wajib })}
              label={`Grup ${g.nama || indeks + 1} wajib dipilih`}
            />
          </div>

          <div className="flex items-center justify-between gap-3 text-sm text-gray-700">
            <span>Boleh pilih lebih dari satu</span>
            <Saklar
              nyala={g.banyak}
              onChange={() => ubahGrup(g.id, { banyak: !g.banyak, maks: "" })}
              label={`Grup ${g.nama || indeks + 1} boleh pilih lebih dari satu`}
            />
          </div>

          {g.banyak && (
            <input
              type="number"
              inputMode="numeric"
              min={2}
              value={g.maks}
              onChange={(e) => ubahGrup(g.id, { maks: e.target.value })}
              placeholder="Maksimal dipilih (kosong = tanpa batas)"
              aria-label="Maksimal pilihan yang boleh dipilih"
              className={INPUT_MODERN}
            />
          )}

          <div className="space-y-2">
            {g.opsi.map((o, i) => (
              <div key={o.id} className="space-y-2 rounded-xl bg-gray-50 p-2.5">
                <div className="flex items-center gap-2">
                  <input
                    value={o.nama}
                    maxLength={80}
                    onChange={(e) =>
                      ubahOpsi(g.id, o.id, { nama: e.target.value })
                    }
                    placeholder={`Pilihan ${i + 1}, contoh: Large`}
                    aria-label={`Nama pilihan ${i + 1}`}
                    className={`${INPUT_MODERN} min-w-0 flex-1 bg-white`}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      ubahGrup(g.id, {
                        opsi: g.opsi.filter((x) => x.id !== o.id),
                      })
                    }
                    aria-label={`Hapus pilihan ${o.nama || i + 1}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                      + Rp
                    </span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={o.harga}
                      onChange={(e) =>
                        ubahOpsi(g.id, o.id, { harga: e.target.value })
                      }
                      placeholder="0"
                      aria-label={`Tambahan harga pilihan ${i + 1}`}
                      className={`${INPUT_MODERN} bg-white pl-12`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      ubahOpsi(g.id, o.id, { tersedia: !o.tersedia })
                    }
                    aria-pressed={o.tersedia}
                    className={`shrink-0 rounded-full px-3 py-2 text-xs font-medium transition-colors ${
                      o.tersedia
                        ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        : "bg-gray-200 text-gray-500 hover:bg-gray-300"
                    }`}
                  >
                    {o.tersedia ? "Tersedia" : "Habis"}
                  </button>
                </div>
              </div>
            ))}

            {g.opsi.length < MAKS_OPSI && (
              <button
                type="button"
                onClick={() => ubahGrup(g.id, { opsi: [...g.opsi, opsiBaru()] })}
                className="flex items-center gap-1.5 text-xs font-semibold text-orange-600 hover:underline"
              >
                <Plus className="h-3.5 w-3.5" />
                Tambah pilihan
              </button>
            )}
          </div>

          {galat[g.id] && <PesanGalat>{galat[g.id]}</PesanGalat>}
        </div>
      ))}

      {grup.length < MAKS_GRUP && (
        <button
          type="button"
          onClick={() => setGrup([...grup, grupBaru()])}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-gray-200 py-2.5 text-sm font-medium text-gray-500 transition hover:border-orange-300 hover:text-orange-600"
        >
          <Plus className="h-4 w-4" />
          Tambah grup pilihan
        </button>
      )}
    </div>
  );
}

export default function FormProduct({
  produk,
  grupAwal,
  onTutup,
  onSimpan,
  onPilihGambar,
  onHapusGambar,
}: Props) {
  const { kategori } = useToko();
  const modeUbah = Boolean(produk);
  const idJudul = useId();

  // Nilai awal disimpan untuk mendeteksi ada tidaknya perubahan
  const [awal] = useState(() => drafAwal(produk));
  const [draf, setDraf] = useState<Draf>(awal);
  const [grupAwalDraf] = useState<DrafGrup[]>(() =>
    (grupAwal ?? []).map(grupKeDraf)
  );
  const [grupAwalJson] = useState(() => JSON.stringify(grupAwalDraf));
  const [grup, setGrup] = useState<DrafGrup[]>(grupAwalDraf);
  const [galatGrup, setGalatGrup] = useState<Record<string, string>>({});
  const [gambarUrl, setGambarUrl] = useState<string | null>(
    produk?.gambarUrl ?? null
  );
  const [mengunggah, setMengunggah] = useState(false);
  const [galat, setGalat] = useState<Galat>({});
  const [galatSimpan, setGalatSimpan] = useState("");
  const [menyimpan, setMenyimpan] = useState(false);

  const sibuk = menyimpan || mengunggah;

  // Ada perubahan yang belum disimpan?
  // Mode ubah: foto sudah tersimpan otomatis, jadi hanya isian dan pilihan yang dihitung.
  // Mode tambah: foto yang sudah dipilih juga dihitung karena belum jadi produk.
  const adaPerubahan =
    !drafSama(draf, awal) ||
    JSON.stringify(grup) !== grupAwalJson ||
    (!modeUbah && gambarUrl !== null);

  // Kunci scroll halaman di belakang selama form terbuka
  useEffect(() => {
    const lama = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = lama;
    };
  }, []);

  const pilihGambar = async (file: File | undefined) => {
    if (!file || sibuk) return;
    setGalat((g) => ({ ...g, gambar: undefined }));
    setMengunggah(true);
    try {
      const url = await onPilihGambar(file);
      if (url) setGambarUrl(url);
    } catch (err) {
      setGalat((g) => ({
        ...g,
        gambar: err instanceof Error ? err.message : "Gagal menyimpan foto.",
      }));
    } finally {
      setMengunggah(false);
    }
  };

  const hapusFoto = async () => {
    if (sibuk) return;
    setGalat((g) => ({ ...g, gambar: undefined }));
    setMengunggah(true);
    try {
      await onHapusGambar();
      setGambarUrl(null);
    } catch (err) {
      setGalat((g) => ({
        ...g,
        gambar: err instanceof Error ? err.message : "Gagal menghapus foto.",
      }));
    } finally {
      setMengunggah(false);
    }
  };

  const tutup = () => {
    if (sibuk) return;
    onTutup();
  };

  const simpan = async () => {
    if (sibuk) return;
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

    const eGrup = periksaGrup(grup);

    setGalat((g) => ({ ...e, gambar: g.gambar }));
    setGalatGrup(eGrup);
    if (Object.keys(e).length > 0 || Object.keys(eGrup).length > 0) return;

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
        gambarUrl,
        grup: grupKeInput(grup),
      });
    } catch (err) {
      setGalatSimpan(
        err instanceof Error ? err.message : "Gagal menyimpan produk."
      );
    } finally {
      setMenyimpan(false);
    }
  };

  const judul = modeUbah ? "Ubah produk" : "Tambah produk";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={idJudul}
      className="fixed inset-0 z-50 flex flex-col bg-white"
    >
      {/* Header */}
      <header className="shrink-0 border-b border-gray-100 bg-white">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 py-3.5">
          <h2 id={idJudul} className="text-lg font-bold text-gray-900">
            {judul}
          </h2>
          <button
            onClick={tutup}
            disabled={sibuk}
            aria-label="Tutup"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Isi form (bisa digulir) */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl space-y-5 px-4 pb-32 pt-5">
          {/* Foto produk */}
          <div className="space-y-1.5">
            <span className="block text-sm font-medium text-gray-700">
              Foto produk{" "}
              <span className="font-normal text-gray-400">(opsional)</span>
            </span>
            <div className="flex items-center gap-3">
              <label
                htmlFor="p-gambar"
                className="relative flex h-20 w-20 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 text-gray-400 transition hover:border-orange-300 hover:text-orange-500"
              >
                {gambarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={gambarUrl}
                    alt="Foto produk"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <ImagePlus className="h-6 w-6" />
                )}
                {mengunggah && (
                  <span className="absolute inset-0 flex items-center justify-center bg-white/70">
                    <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
                  </span>
                )}
              </label>
              <input
                id="p-gambar"
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={sibuk}
                onChange={(e) => {
                  void pilihGambar(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <div className="min-w-0 text-xs text-gray-500">
                <p>
                  {mengunggah
                    ? "Menyimpan foto..."
                    : modeUbah
                    ? "JPG, PNG, atau WebP. Maksimal 2 MB. Perubahan foto langsung tersimpan."
                    : "JPG, PNG, atau WebP. Maksimal 2 MB."}
                </p>
                {gambarUrl && !mengunggah && (
                  <button
                    type="button"
                    onClick={() => void hapusFoto()}
                    disabled={menyimpan}
                    className="mt-1 font-medium text-red-600 hover:underline disabled:opacity-50"
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
            <label
              htmlFor="p-nama"
              className="block text-sm font-medium text-gray-700"
            >
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
                Kategori{" "}
                <span className="font-normal text-gray-400">(opsional)</span>
              </label>
              <select
                id="p-kategori"
                value={draf.kategoriId}
                onChange={(e) =>
                  setDraf({ ...draf, kategoriId: e.target.value })
                }
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
              Deskripsi{" "}
              <span className="font-normal text-gray-400">(opsional)</span>
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
              <label
                htmlFor="p-sku"
                className="block text-sm font-medium text-gray-700"
              >
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

          {/* Pilihan produk (variant) */}
          <BagianPilihan grup={grup} setGrup={setGrup} galat={galatGrup} />

          {/* Saklar produk tanpa stok */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50/70 px-3.5 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800">
                Produk tanpa stok
              </p>
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
              <label
                htmlFor="p-stok"
                className="block text-sm font-medium text-gray-700"
              >
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
        </div>
      </div>

      {/* Tombol melayang di bawah, hanya muncul jika ada perubahan */}
      {adaPerubahan && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="pointer-events-auto mx-auto w-full max-w-2xl space-y-2 rounded-2xl border border-gray-100 bg-white p-3 shadow-2xl shadow-gray-900/15">
            {galatSimpan && <PesanGalat>{galatSimpan}</PesanGalat>}
            {Object.keys(galatGrup).length > 0 && (
              <PesanGalat>
                Periksa kembali grup pilihan yang ditandai.
              </PesanGalat>
            )}
            <div className="flex gap-2.5">
              <button
                onClick={tutup}
                disabled={sibuk}
                className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                onClick={simpan}
                disabled={sibuk}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 py-2.5 text-sm font-semibold text-white shadow-md shadow-orange-500/25 transition-all hover:shadow-lg hover:shadow-orange-500/30 active:scale-[0.98] disabled:opacity-60"
              >
                {menyimpan && <Loader2 className="h-4 w-4 animate-spin" />}
                {menyimpan
                  ? "Menyimpan..."
                  : modeUbah
                  ? "Simpan perubahan"
                  : "Simpan produk"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}