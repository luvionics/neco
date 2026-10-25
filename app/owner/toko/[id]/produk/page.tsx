"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Package, Plus, Search, X } from "lucide-react";
import { rupiah, useToko } from "../toko-context";
import { Dialog, Saklar } from "../ui";

type Galat = Partial<Record<"nama" | "harga" | "stok", string>>;

const BATAS_STOK = 5;

// Gaya input modern (menggantikan INPUT bawaan agar seragam dengan halaman lain)
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

export default function ProdukPage() {
  const { toko, produk, ubahTersedia, tambahProduk } = useToko();

  const [cari, setCari] = useState("");
  const [tambah, setTambah] = useState(false);
  const [draf, setDraf] = useState({ nama: "", harga: "", stok: "" });
  const [galat, setGalat] = useState<Galat>({});

  const tampil = useMemo(() => {
    const q = cari.toLowerCase();
    return produk.filter((p) => p.nama.toLowerCase().includes(q));
  }, [produk, cari]);

  const jumlahTersedia = produk.filter((p) => p.tersedia).length;

  const bukaTambah = () => {
    setDraf({ nama: "", harga: "", stok: "" });
    setGalat({});
    setTambah(true);
  };

  const simpan = () => {
    const e: Galat = {};
    const harga = Number(draf.harga);
    const stok = Number(draf.stok);
    if (draf.nama.trim().length < 2) e.nama = "Nama produk minimal 2 huruf";
    if (!draf.harga || !Number.isFinite(harga) || harga <= 0)
      e.harga = "Isi harga dengan angka lebih dari 0";
    if (draf.stok === "" || !Number.isInteger(stok) || stok < 0)
      e.stok = "Isi stok dengan angka bulat, minimal 0";
    setGalat(e);
    if (Object.keys(e).length > 0) return;

    tambahProduk({ nama: draf.nama.trim(), harga, stok, tersedia: stok > 0 });
    setTambah(false);
  };

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Header */}
      <header>
        <p className="text-sm text-gray-500">
          {produk.length} produk · {jumlahTersedia} tersedia
        </p>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">
          Produk
        </h2>
      </header>

      {/* Pencarian + tambah */}
      <section className="flex gap-2.5">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Cari produk..."
            aria-label="Cari produk"
            className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-10 text-sm shadow-sm outline-none transition placeholder:text-gray-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-500/10"
          />
          {cari && (
            <button
              onClick={() => setCari("")}
              aria-label="Hapus pencarian"
              className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          onClick={bukaTambah}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-orange-500/25 transition-all hover:shadow-lg hover:shadow-orange-500/30 active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Tambah produk</span>
          <span className="sm:hidden">Tambah</span>
        </button>
      </section>

      {produk.length === 0 ? (
        <section className="flex flex-col items-center gap-4 rounded-3xl border border-gray-100 bg-white px-6 py-16 text-center shadow-sm">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-orange-50 ring-8 ring-orange-50/60">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/30">
              <Package className="h-7 w-7" />
            </span>
          </span>
          <div>
            <p className="text-base font-bold text-gray-900">Belum ada produk</p>
            <p className="mt-1 text-sm text-gray-500">
              Tambahkan produk agar pembeli bisa memesan dari tokomu.
            </p>
          </div>
          <button
            onClick={bukaTambah}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-orange-500/25 transition-all hover:shadow-lg hover:shadow-orange-500/30 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            Tambah produk pertama
          </button>
        </section>
      ) : tampil.length === 0 ? (
        <section className="flex flex-col items-center gap-3 rounded-2xl border border-gray-100 bg-white px-6 py-12 text-center shadow-sm">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
            <Search className="h-6 w-6" />
          </span>
          <p className="text-sm text-gray-500">
            Tidak ada produk yang cocok dengan pencarian
          </p>
        </section>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {tampil.map((p) => {
            const habis = p.stok === 0;
            const menipis = !habis && p.stok <= BATAS_STOK;
            return (
              <li
                key={p.id}
                className="flex items-center gap-3.5 rounded-2xl border border-gray-100 bg-white p-3.5 shadow-sm transition-all duration-200 hover:border-orange-200 hover:shadow-lg hover:shadow-orange-500/10 md:p-4"
              >
                <span
                  className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br shadow-sm ${toko.warna} ${
                    p.tersedia ? "" : "opacity-50 grayscale"
                  }`}
                >
                  <Package className="h-7 w-7 text-white" />
                </span>

                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-sm font-semibold ${
                      p.tersedia ? "text-gray-900" : "text-gray-400"
                    }`}
                  >
                    {p.nama}
                  </p>
                  <p
                    className={`mt-0.5 text-base font-extrabold leading-tight ${
                      p.tersedia ? "text-orange-600" : "text-gray-400"
                    }`}
                  >
                    {rupiah(p.harga)}
                  </p>
                  <span
                    className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      habis
                        ? "bg-red-50 text-red-600"
                        : menipis
                        ? "bg-amber-50 text-amber-600"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        habis
                          ? "bg-red-500"
                          : menipis
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                      }`}
                    />
                    {habis ? "Stok habis" : `Stok ${p.stok}`}
                  </span>
                </div>

                <label className="flex shrink-0 flex-col items-center gap-1.5 text-[11px] font-medium text-gray-500">
                  <Saklar
                    nyala={p.tersedia}
                    onChange={() => ubahTersedia(p.id)}
                    label={`Produk ${p.nama} tersedia`}
                  />
                  {p.tersedia ? "Tersedia" : "Disembunyikan"}
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {tambah && (
        <Dialog judul="Tambah produk" onTutup={() => setTambah(false)}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Tambah produk</h2>
            <button
              onClick={() => setTambah(false)}
              aria-label="Tutup"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

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
              onChange={(e) => setDraf({ ...draf, nama: e.target.value })}
              placeholder="Contoh: Beras 5 kg"
              className={INPUT_MODERN}
            />
            {galat.nama && <PesanGalat>{galat.nama}</PesanGalat>}
          </div>

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
                placeholder="68000"
                className={INPUT_MODERN}
              />
              {galat.harga && <PesanGalat>{galat.harga}</PesanGalat>}
            </div>
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
          </div>

          <div className="flex gap-2.5 pt-1">
            <button
              onClick={() => setTambah(false)}
              className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Batal
            </button>
            <button
              onClick={simpan}
              className="flex-1 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 py-2.5 text-sm font-semibold text-white shadow-md shadow-orange-500/25 transition-all hover:shadow-lg hover:shadow-orange-500/30 active:scale-[0.98]"
            >
              Simpan produk
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}