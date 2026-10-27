"use client";

import { useMemo, useState } from "react";
import { Package, Plus, Search, X } from "lucide-react";
import { rupiah, useToko, type InputProduk } from "../components/toko-context";
import { Saklar } from "../ui";
import FormProduct from "./components/formproduct";

const BATAS_STOK = 5;

export default function ProdukPage() {
  const { toko, produk, kategori, ubahTersedia, tambahProduk } = useToko();

  const [cari, setCari] = useState("");
  const [tambah, setTambah] = useState(false);

  const namaKategori = useMemo(
    () => new Map(kategori.map((k) => [k.id, k.nama])),
    [kategori]
  );

  const tampil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return produk.filter(
      (p) =>
        p.nama.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
    );
  }, [produk, cari]);

  const jumlahTersedia = produk.filter((p) => p.tersedia).length;

  // Jika gagal, error dilempar ke FormProduct yang menampilkannya di dalam dialog
  const simpanProduk = async (data: InputProduk) => {
    await tambahProduk(data);
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
            placeholder="Cari nama atau SKU..."
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
          onClick={() => setTambah(true)}
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
            onClick={() => setTambah(true)}
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
            const habis = !p.nonStok && p.stok === 0;
            const menipis = !p.nonStok && !habis && p.stok <= BATAS_STOK;

            const labelStok = p.nonStok
              ? "Tanpa stok"
              : habis
              ? "Stok habis"
              : `Stok ${p.stok}`;

            const warnaBadge = p.nonStok
              ? "bg-sky-50 text-sky-600"
              : habis
              ? "bg-red-50 text-red-600"
              : menipis
              ? "bg-amber-50 text-amber-600"
              : "bg-gray-100 text-gray-600";

            const warnaTitik = p.nonStok
              ? "bg-sky-500"
              : habis
              ? "bg-red-500"
              : menipis
              ? "bg-amber-500"
              : "bg-emerald-500";

            const infoTambahan = [
              p.kategoriId ? namaKategori.get(p.kategoriId) : null,
              p.sku ? `SKU ${p.sku}` : null,
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <li
                key={p.id}
                className="flex items-center gap-3.5 rounded-2xl border border-gray-100 bg-white p-3.5 shadow-sm transition-all duration-200 hover:border-orange-200 hover:shadow-lg hover:shadow-orange-500/10 md:p-4"
              >
                {p.gambarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.gambarUrl}
                    alt={p.nama}
                    loading="lazy"
                    className={`h-14 w-14 shrink-0 rounded-2xl object-cover shadow-sm ${
                      p.tersedia ? "" : "opacity-50 grayscale"
                    }`}
                  />
                ) : (
                  <span
                    className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br shadow-sm ${toko.warna} ${
                      p.tersedia ? "" : "opacity-50 grayscale"
                    }`}
                  >
                    <Package className="h-7 w-7 text-white" />
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-sm font-semibold ${
                      p.tersedia ? "text-gray-900" : "text-gray-400"
                    }`}
                  >
                    {p.nama}
                  </p>
                  {infoTambahan && (
                    <p className="truncate text-[11px] text-gray-400">
                      {infoTambahan}
                    </p>
                  )}
                  <p
                    className={`mt-0.5 text-base font-extrabold leading-tight ${
                      p.tersedia ? "text-orange-600" : "text-gray-400"
                    }`}
                  >
                    {rupiah(p.harga)}
                  </p>
                  <span
                    className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${warnaBadge}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${warnaTitik}`} />
                    {labelStok}
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
        <FormProduct onTutup={() => setTambah(false)} onSimpan={simpanProduk} />
      )}
    </div>
  );
}