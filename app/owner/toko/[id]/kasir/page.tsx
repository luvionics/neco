"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronDown,
  Loader2,
  Minus,
  Package,
  Plus,
  Search,
  Settings2,
  ShoppingCart,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToko } from "../components/toko-provider";
import { rupiah, useProdukToko, type Produk } from "../components/toko";
import { Dialog } from "../ui";

// ---------- Tipe & konstanta ----------

/** Produk beserta data diskonnya. */
type ProdukKasir = Produk & {
  diskonTipe?: string | null;
  diskonNilai?: number | null;
  diskonMulai?: string | null;
  diskonSelesai?: string | null;
};

/** harga = harga satuan setelah diskon, potong = potongan per satuan. */
type Baris = { produk: ProdukKasir; qty: number; harga: number; potong: number };

/** Pembayaran saat ini hanya tunai. */
type DataBayar = {
  diterima: number;
  nama: string;
  catatan: string;
};

type Struk = {
  kode: string;
  baris: Baris[];
  total: number;
  hemat: number;
  diterima: number;
  kembalian: number;
};

/** Bentuk hasil fungsi database buat_transaksi_kasir. */
type HasilTransaksi = {
  order_id: string;
  order_number: string;
  total: number;
  change: number;
};

const BATAS_STOK = 5;
const MAKS_NON_STOK = 99;

const INPUT =
  "w-full rounded-xl border border-gray-200 bg-gray-50/70 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-500/10";

const TOMBOL_UTAMA =
  "flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-orange-500/25 transition-all hover:shadow-lg hover:shadow-orange-500/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60";

/** Jumlah maksimal yang boleh dimasukkan ke keranjang. */
const maksQty = (p: Produk) => (p.nonStok ? MAKS_NON_STOK : p.stok);

/**
 * Potongan per satuan jika diskon sedang aktif.
 * Harus sama dengan perhitungan di fungsi database (server tetap penentu akhir).
 */
function diskonSatuan(p: ProdukKasir, sekarang = Date.now()): number {
  const nilai = Number(p.diskonNilai ?? 0);
  if (!p.diskonTipe || !(nilai > 0)) return 0;
  if (p.diskonMulai && new Date(p.diskonMulai).getTime() > sekarang) return 0;
  if (p.diskonSelesai && new Date(p.diskonSelesai).getTime() < sekarang)
    return 0;
  const potong =
    p.diskonTipe === "percent" ? Math.round((p.harga * nilai) / 100) : nilai;
  return Math.min(Math.max(potong, 0), p.harga);
}

/** Label singkat untuk lencana diskon, mis. "-20%" atau "-Rp 5.000". */
function labelDiskon(p: ProdukKasir): string {
  const nilai = Number(p.diskonNilai ?? 0);
  return p.diskonTipe === "percent" ? `-${nilai}%` : `-${rupiah(nilai)}`;
}

// ---------- Panel keranjang (dipakai di desktop & sheet mobile) ----------

function PanelKeranjang({
  baris,
  total,
  hemat,
  jumlahItem,
  onUbah,
  onHapus,
  onKosongkan,
  onBayar,
  onTutup,
}: {
  baris: Baris[];
  total: number;
  hemat: number;
  jumlahItem: number;
  onUbah: (id: string, delta: number) => void;
  onHapus: (id: string) => void;
  onKosongkan: () => void;
  onBayar: () => void;
  onTutup?: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-3.5">
        <div>
          <h3 className="text-base font-bold text-gray-900">Keranjang</h3>
          <p className="text-xs text-gray-500">{jumlahItem} item</p>
        </div>
        <div className="flex items-center gap-2">
          {baris.length > 0 && (
            <button
              type="button"
              onClick={onKosongkan}
              className="text-xs font-medium text-red-600 hover:underline"
            >
              Kosongkan
            </button>
          )}
          {onTutup && (
            <button
              type="button"
              onClick={onTutup}
              aria-label="Tutup keranjang"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {baris.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
            <ShoppingCart className="h-6 w-6" />
          </span>
          <p className="text-sm text-gray-500">
            Pilih produk untuk memulai transaksi.
          </p>
        </div>
      ) : (
        <ul className="flex-1 divide-y divide-gray-100 overflow-y-auto px-4">
          {baris.map(({ produk: p, qty, harga, potong }) => (
            <li key={p.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900">
                  {p.nama}
                </p>
                <p className="text-xs text-gray-500">
                  {potong > 0 && (
                    <span className="mr-1.5 text-gray-400 line-through">
                      {rupiah(p.harga)}
                    </span>
                  )}
                  {rupiah(harga)}
                </p>
                <p className="mt-0.5 text-sm font-bold text-orange-600">
                  {rupiah(harga * qty)}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onUbah(p.id, -1)}
                  aria-label={`Kurangi ${p.nama}`}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-7 text-center text-sm font-semibold tabular-nums">
                  {qty}
                </span>
                <button
                  type="button"
                  onClick={() => onUbah(p.id, 1)}
                  disabled={qty >= maksQty(p)}
                  aria-label={`Tambah ${p.nama}`}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onHapus(p.id)}
                  aria-label={`Hapus ${p.nama}`}
                  className="ml-0.5 flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-3 border-t border-gray-100 p-4">
        {hemat > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-emerald-600">
              <Tag className="h-3.5 w-3.5" />
              Hemat
            </span>
            <span className="font-semibold text-emerald-600">
              -{rupiah(hemat)}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">Total</span>
          <span className="text-xl font-extrabold text-gray-900">
            {rupiah(total)}
          </span>
        </div>
        <button
          type="button"
          onClick={onBayar}
          disabled={baris.length === 0}
          className={`${TOMBOL_UTAMA} w-full`}
        >
          Bayar
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </>
  );
}

// ---------- Dialog pembayaran (tunai) ----------

function DialogBayar({
  total,
  hemat,
  jumlahItem,
  onTutup,
  onBayar,
}: {
  total: number;
  hemat: number;
  jumlahItem: number;
  onTutup: () => void;
  onBayar: (data: DataBayar) => Promise<void>;
}) {
  const [diterima, setDiterima] = useState("");
  const [nama, setNama] = useState("");
  const [catatan, setCatatan] = useState("");
  const [lanjutan, setLanjutan] = useState(false);
  const [proses, setProses] = useState(false);
  const [galat, setGalat] = useState("");

  const uang = Number(diterima);
  const kurang = !diterima || !Number.isFinite(uang) || uang < total;
  const kembalian = kurang ? 0 : uang - total;

  // Saran nominal uang: uang pas + pembulatan ke atas
  const saran = useMemo(() => {
    const s = new Set<number>([total]);
    for (const d of [5000, 10000, 20000, 50000, 100000]) {
      s.add(Math.ceil(total / d) * d);
    }
    return Array.from(s)
      .sort((a, b) => a - b)
      .slice(0, 4);
  }, [total]);

  const bayar = async () => {
    if (kurang) {
      setGalat("Uang yang diterima kurang dari total.");
      return;
    }
    setProses(true);
    setGalat("");
    try {
      await onBayar({
        diterima: uang,
        nama: nama.trim(),
        catatan: catatan.trim(),
      });
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal memproses transaksi.");
      setProses(false);
    }
  };

  return (
    <Dialog judul="Pembayaran" onTutup={onTutup}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">Pembayaran</h2>
        <button
          onClick={onTutup}
          disabled={proses}
          aria-label="Tutup"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700 disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="rounded-2xl bg-orange-50 px-4 py-3 text-center ring-1 ring-orange-100">
        <p className="text-xs text-orange-700">Total ({jumlahItem} item)</p>
        <p className="text-3xl font-extrabold text-orange-600">
          {rupiah(total)}
        </p>
        {hemat > 0 && (
          <p className="mt-0.5 text-xs font-medium text-emerald-600">
            Sudah hemat {rupiah(hemat)}
          </p>
        )}
      </div>

      {/* Uang diterima */}
      <div className="space-y-2">
        <label
          htmlFor="k-diterima"
          className="block text-sm font-medium text-gray-700"
        >
          Uang diterima (Rp)
        </label>
        <input
          id="k-diterima"
          type="number"
          inputMode="numeric"
          min={0}
          value={diterima}
          onChange={(e) => {
            setDiterima(e.target.value);
            setGalat("");
          }}
          placeholder={String(total)}
          className={INPUT}
        />
        <div className="flex flex-wrap gap-2">
          {saran.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => {
                setDiterima(String(n));
                setGalat("");
              }}
              className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:border-orange-300 hover:bg-orange-50"
            >
              {n === total ? "Uang pas" : rupiah(n)}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between rounded-xl bg-gray-50 px-3.5 py-2.5 text-sm">
          <span className="text-gray-500">Kembalian</span>
          <span className="font-bold text-gray-900">
            {kurang ? "-" : rupiah(kembalian)}
          </span>
        </div>
      </div>

      {/* Lanjutan: nama pembeli & catatan (disembunyikan sampai dibuka) */}
      <div>
        <button
          type="button"
          onClick={() => setLanjutan((v) => !v)}
          aria-expanded={lanjutan}
          aria-controls="k-lanjutan"
          className="inline-flex items-center gap-1 rounded-md py-1 text-sm font-medium text-orange-600 hover:text-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
        >
          Lanjutan
          <ChevronDown
            className={`h-4 w-4 transition-transform ${
              lanjutan ? "rotate-180" : ""
            }`}
          />
        </button>

        {lanjutan && (
          <div id="k-lanjutan" className="mt-2 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="k-nama"
                className="block text-sm font-medium text-gray-700"
              >
                Nama pembeli
              </label>
              <input
                id="k-nama"
                value={nama}
                onChange={(e) => setNama(e.target.value)}
                placeholder="Contoh: Budi"
                className={INPUT}
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="k-catatan"
                className="block text-sm font-medium text-gray-700"
              >
                Catatan
              </label>
              <input
                id="k-catatan"
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                placeholder="Contoh: tidak pedas"
                className={INPUT}
              />
            </div>
          </div>
        )}
      </div>

      {galat && (
        <p
          role="alert"
          className="flex items-start gap-1.5 text-xs text-red-600"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {galat}
        </p>
      )}

      <div className="flex gap-2.5 pt-1">
        <button
          onClick={onTutup}
          disabled={proses}
          className="flex-1 rounded-xl border border-gray-200 bg-white py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          Batal
        </button>
        <button
          onClick={bayar}
          disabled={proses || kurang}
          className={`${TOMBOL_UTAMA} flex-1`}
        >
          {proses && <Loader2 className="h-4 w-4 animate-spin" />}
          {proses ? "Memproses..." : "Konfirmasi"}
        </button>
      </div>
    </Dialog>
  );
}

// ---------- Dialog struk ----------

function DialogStruk({
  struk,
  onTutup,
}: {
  struk: Struk;
  onTutup: () => void;
}) {
  return (
    <Dialog judul="Transaksi berhasil" onTutup={onTutup}>
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/60">
          <Check className="h-7 w-7" />
        </span>
        <h2 className="text-lg font-bold text-gray-900">Transaksi berhasil</h2>
        <p className="text-xs text-gray-500">No. pesanan {struk.kode}</p>
      </div>

      <ul className="max-h-48 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-100 px-3.5">
        {struk.baris.map(({ produk: p, qty, harga, potong }) => (
          <li
            key={p.id}
            className="flex items-center justify-between gap-3 py-2 text-sm"
          >
            <span className="min-w-0 truncate text-gray-700">
              {qty} × {p.nama}
              {potong > 0 && (
                <span className="ml-1.5 text-xs text-emerald-600">
                  (diskon)
                </span>
              )}
            </span>
            <span className="shrink-0 font-medium text-gray-900">
              {rupiah(harga * qty)}
            </span>
          </li>
        ))}
      </ul>

      <dl className="space-y-1.5 text-sm">
        {struk.hemat > 0 && (
          <div className="flex justify-between">
            <dt className="text-gray-500">Hemat</dt>
            <dd className="font-medium text-emerald-600">
              -{rupiah(struk.hemat)}
            </dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt className="text-gray-500">Total</dt>
          <dd className="font-bold text-gray-900">{rupiah(struk.total)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-500">Uang diterima</dt>
          <dd className="font-medium text-gray-900">
            {rupiah(struk.diterima)}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-500">Kembalian</dt>
          <dd className="font-bold text-emerald-600">
            {rupiah(struk.kembalian)}
          </dd>
        </div>
      </dl>

      <button onClick={onTutup} className={`${TOMBOL_UTAMA} w-full`}>
        Transaksi baru
      </button>
    </Dialog>
  );
}

// ---------- Kasir aktif ----------

function KasirAktif() {
  const { id, base, toko } = useToko();
  const { produk, kategori, muatUlangProduk } = useProdukToko(id);
  const supabase = useMemo(() => createClient(), []);

  const [cari, setCari] = useState("");
  const [kategoriAktif, setKategoriAktif] = useState<string>("semua");
  const [keranjang, setKeranjang] = useState<Record<string, number>>({});
  const [panelBuka, setPanelBuka] = useState(false);
  const [bayarBuka, setBayarBuka] = useState(false);
  const [struk, setStruk] = useState<Struk | null>(null);
  const [sekarang, setSekarang] = useState(0);

  useEffect(() => {
    const pembaru = () => setSekarang(Date.now());
    const pemuatan = window.setTimeout(pembaru, 0);
    const timer = window.setInterval(pembaru, 60000);
    return () => {
      window.clearTimeout(pemuatan);
      window.clearInterval(timer);
    };
  }, []);

  // Hanya produk yang ditampilkan ke pembeli yang bisa dijual
  const dijual = useMemo(
    () => (produk as ProdukKasir[]).filter((p) => p.tersedia),
    [produk]
  );

  const kategoriAda = useMemo(
    () => kategori.filter((k) => dijual.some((p) => p.kategoriId === k.id)),
    [kategori, dijual]
  );

  const tampil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return dijual.filter((p) => {
      if (kategoriAktif !== "semua" && p.kategoriId !== kategoriAktif)
        return false;
      return (
        q === "" ||
        p.nama.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q)
      );
    });
  }, [dijual, cari, kategoriAktif]);

  const baris: Baris[] = useMemo(() => {
    const peta = new Map((produk as ProdukKasir[]).map((p) => [p.id, p]));
    return Object.entries(keranjang).flatMap(([pid, qty]) => {
      const p = peta.get(pid);
      if (!p) return [];
      const potong = diskonSatuan(p, sekarang);
      return [{ produk: p, qty, harga: p.harga - potong, potong }];
    });
  }, [keranjang, produk, sekarang]);

  const total = baris.reduce((n, b) => n + b.harga * b.qty, 0);
  const hemat = baris.reduce((n, b) => n + b.potong * b.qty, 0);
  const jumlahItem = baris.reduce((n, b) => n + b.qty, 0);

  const tambah = (p: Produk) => {
    setKeranjang((k) => {
      const sekarang = k[p.id] ?? 0;
      if (sekarang >= maksQty(p)) return k;
      return { ...k, [p.id]: sekarang + 1 };
    });
  };

  const ubahQty = (pid: string, delta: number) => {
    const p = produk.find((x) => x.id === pid);
    if (!p) return;
    setKeranjang((k) => {
      const baru = (k[pid] ?? 0) + delta;
      if (baru <= 0) {
        return Object.fromEntries(Object.entries(k).filter(([id]) => id !== pid));
      }
      if (baru > maksQty(p)) return k;
      return { ...k, [pid]: baru };
    });
  };

  const hapus = (pid: string) =>
    setKeranjang((k) =>
      Object.fromEntries(Object.entries(k).filter(([id]) => id !== pid))
    );

  const bukaBayar = () => {
    setPanelBuka(false);
    setBayarBuka(true);
  };

  const prosesBayar = async (d: DataBayar) => {
    const { data, error } = await supabase.rpc("buat_transaksi_kasir", {
      p_shop_id: id,
      p_items: baris.map((b) => ({ product_id: b.produk.id, qty: b.qty })),
      p_method: "cash",
      p_amount_paid: d.diterima,
      p_customer_name: d.nama || null,
      p_notes: d.catatan || null,
      p_reference: null,
    });
    if (error) throw new Error(error.message);

    // Total & kembalian memakai hasil server (sumber kebenaran)
    const hasil = data as HasilTransaksi;
    setStruk({
      kode: hasil.order_number,
      baris,
      total: Number(hasil.total),
      hemat,
      diterima: d.diterima,
      kembalian: Number(hasil.change),
    });
    setKeranjang({});
    setBayarBuka(false);

    // Segarkan stok; gagal memuat ulang tidak boleh membatalkan struk
    try {
      await muatUlangProduk();
    } catch {
      /* diabaikan */
    }
  };

  if (produk.length === 0) {
    return (
      <section className="flex flex-col items-center gap-4 rounded-3xl border border-gray-100 bg-white px-6 py-16 text-center shadow-sm">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/30">
          <Package className="h-8 w-8" />
        </span>
        <div>
          <p className="text-base font-bold text-gray-900">Belum ada produk</p>
          <p className="mt-1 text-sm text-gray-500">
            Tambahkan produk dulu agar bisa dijual lewat kasir.
          </p>
        </div>
        <Link
          href={`${base}/produk`}
          className={`${TOMBOL_UTAMA} inline-flex px-5`}
        >
          Ke halaman Produk
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    );
  }

  return (
    <>
      <div className="grid gap-6 pb-32 lg:grid-cols-[1fr_380px] lg:pb-0">
        {/* Daftar produk */}
        <div className="min-w-0 space-y-4">
          <div className="relative">
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
                className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {kategoriAda.length > 0 && (
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {[{ id: "semua", nama: "Semua" }, ...kategoriAda].map((k) => (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => setKategoriAktif(k.id)}
                  className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                    kategoriAktif === k.id
                      ? "border-orange-500 bg-orange-500 text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {k.nama}
                </button>
              ))}
            </div>
          )}

          {dijual.length === 0 ? (
            <p className="rounded-2xl border border-gray-100 bg-white px-6 py-12 text-center text-sm text-gray-500 shadow-sm">
              Semua produk sedang disembunyikan. Aktifkan produk di halaman
              Produk.
            </p>
          ) : tampil.length === 0 ? (
            <p className="rounded-2xl border border-gray-100 bg-white px-6 py-12 text-center text-sm text-gray-500 shadow-sm">
              Tidak ada produk yang cocok.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
              {tampil.map((p) => {
                const habis = !p.nonStok && p.stok <= 0;
                const menipis = !p.nonStok && !habis && p.stok <= BATAS_STOK;
                const qty = keranjang[p.id] ?? 0;
                const potong = diskonSatuan(p);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => tambah(p)}
                      disabled={habis}
                      className={`relative flex w-full flex-col overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition-all ${
                        habis
                          ? "cursor-not-allowed opacity-60"
                          : "hover:border-orange-300 hover:shadow-md active:scale-[0.98]"
                      } ${
                        qty > 0
                          ? "border-orange-400 ring-2 ring-orange-500/20"
                          : "border-gray-100"
                      }`}
                    >
                      <div className="aspect-[4/3] w-full bg-gray-100">
                        {p.gambarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.gambarUrl}
                            alt={p.nama}
                            loading="lazy"
                            className={`h-full w-full object-cover ${
                              habis ? "grayscale" : ""
                            }`}
                          />
                        ) : (
                          <span
                            className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${toko.warna}`}
                          >
                            <Package className="h-8 w-8 text-white/90" />
                          </span>
                        )}
                      </div>
                      {potong > 0 && !habis && (
                        <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-bold text-white shadow">
                          <Tag className="h-3 w-3" />
                          {labelDiskon(p)}
                        </span>
                      )}
                      {qty > 0 && (
                        <span className="absolute right-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-orange-500 px-1.5 text-xs font-bold text-white shadow">
                          {qty}
                        </span>
                      )}
                      <div className="space-y-0.5 p-3">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {p.nama}
                        </p>
                        <p className="text-sm font-extrabold text-orange-600">
                          {rupiah(p.harga - potong)}
                          {potong > 0 && (
                            <span className="ml-1.5 text-xs font-medium text-gray-400 line-through">
                              {rupiah(p.harga)}
                            </span>
                          )}
                        </p>
                        <p
                          className={`text-[11px] font-medium ${
                            habis
                              ? "text-red-600"
                              : menipis
                              ? "text-amber-600"
                              : "text-gray-400"
                          }`}
                        >
                          {p.nonStok
                            ? "Tanpa stok"
                            : habis
                            ? "Stok habis"
                            : `Stok ${p.stok}`}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Keranjang (desktop) */}
        <aside className="hidden lg:block">
          <div className="sticky top-4 flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <PanelKeranjang
              baris={baris}
              total={total}
              hemat={hemat}
              jumlahItem={jumlahItem}
              onUbah={ubahQty}
              onHapus={hapus}
              onKosongkan={() => setKeranjang({})}
              onBayar={bukaBayar}
            />
          </div>
        </aside>
      </div>

      {/* Tombol keranjang bulat melayang (mobile).
          bottom-24 = di atas navigasi bawah. Sesuaikan jika tinggi navigasi berubah. */}
      {!panelBuka && !bayarBuka && !struk && (
        <button
          type="button"
          onClick={() => setPanelBuka(true)}
          aria-label={
            jumlahItem > 0
              ? `Buka keranjang, ${jumlahItem} item, total ${rupiah(total)}`
              : "Buka keranjang"
          }
          className="fixed bottom-24 right-4 z-30 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-xl shadow-orange-500/40 transition-all hover:shadow-2xl active:scale-95 lg:hidden"
        >
          <ShoppingCart className="h-7 w-7" />
          {jumlahItem > 0 && (
            <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-1.5 text-xs font-extrabold text-orange-600 shadow-md ring-2 ring-orange-500">
              {jumlahItem > 99 ? "99+" : jumlahItem}
            </span>
          )}
        </button>
      )}

      {/* Sheet keranjang (mobile). z-[60] agar menutupi navigasi bawah. */}
      {panelBuka && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <button
            type="button"
            aria-label="Tutup keranjang"
            onClick={() => setPanelBuka(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div
            role="dialog"
            aria-label="Keranjang"
            className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl"
          >
            <PanelKeranjang
              baris={baris}
              total={total}
              hemat={hemat}
              jumlahItem={jumlahItem}
              onUbah={ubahQty}
              onHapus={hapus}
              onKosongkan={() => setKeranjang({})}
              onBayar={bukaBayar}
              onTutup={() => setPanelBuka(false)}
            />
          </div>
        </div>
      )}

      {bayarBuka && (
        <DialogBayar
          total={total}
          hemat={hemat}
          jumlahItem={jumlahItem}
          onTutup={() => setBayarBuka(false)}
          onBayar={prosesBayar}
        />
      )}

      {struk && <DialogStruk struk={struk} onTutup={() => setStruk(null)} />}
    </>
  );
}

// ---------- Halaman ----------

export default function KasirPage() {
  const { base, toko } = useToko();

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Header */}
      <header>
        <p className="text-sm text-gray-500">Transaksi langsung di toko</p>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">
          Kasir
        </h2>
      </header>

      {!toko.kasir ? (
        <section className="flex flex-col gap-4 rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-orange-50 p-5 sm:flex-row sm:items-center md:p-6">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-amber-500 shadow-sm ring-1 ring-amber-100">
            <Settings2 className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-gray-900">
              Fitur kasir belum diaktifkan
            </h3>
            <p className="mt-0.5 text-sm text-gray-600">
              Aktifkan saklar kasir di pengaturan Info toko untuk mulai
              menggunakannya.
            </p>
          </div>
          <Link
            href={`${base}/info`}
            className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-orange-500/25 transition-all hover:shadow-lg hover:shadow-orange-500/30"
          >
            Buka Info toko
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </section>
      ) : (
        <KasirAktif />
      )}
    </div>
  );
}