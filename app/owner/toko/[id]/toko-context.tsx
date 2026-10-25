"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { Store } from "lucide-react";

// ---------- Tipe ----------

export type StatusToko = "aktif" | "menunggu" | "ditolak" | "nonaktif";

export type JenisPesanan = "antar" | "ambil" | "meja";

export type DetailToko = {
  nama: string;
  kategori: string;
  area: string;
  alamat: string;
  buka: string; // HH:MM
  tutup: string; // HH:MM
  status: StatusToko;
  bukaSekarang: boolean;
  terverifikasi: boolean;
  warna: string;
  // jenis pesanan yang dilayani
  antar: boolean;
  ambil: boolean;
  meja: boolean;
  cod: boolean;
  kasir: boolean; // fitur kasir, memunculkan menu Kasir
  alasanTolak?: string;
};

export type StatusPesanan =
  | "menunggu"
  | "diproses"
  | "dikirim"
  | "siap"
  | "selesai"
  | "ditolak";

export type Item = { nama: string; qty: number; harga: number };

export type PesananMasuk = {
  id: string;
  pembeli: string;
  wa?: string; // pesanan dari meja boleh tanpa nomor WA
  waktu: string;
  jenis: JenisPesanan;
  meja?: string; // nomor meja, hanya untuk jenis "meja"
  bayar: "cod" | "transfer" | "kasir";
  item: Item[];
  ongkir: number;
  status: StatusPesanan;
};

export type Produk = {
  id: number;
  nama: string;
  harga: number;
  stok: number;
  tersedia: boolean;
};

// ---------- Data contoh, nanti ganti dengan data dari database ----------

const TOKO: Record<number, DetailToko> = {
  1: { nama: "Warung Bu Siti", kategori: "Warung & Sembako", area: "Dusun Krajan", alamat: "Jl. Mawar No. 12, RT 02/RW 01", buka: "06:00", tutup: "21:00", status: "aktif", bukaSekarang: true, terverifikasi: true, warna: "from-amber-400 to-orange-500", antar: true, ambil: true, meja: false, cod: true, kasir: true },
  2: { nama: "Dapur Mak Nyah", kategori: "Makanan", area: "Dusun Krajan", alamat: "Jl. Melati No. 5, RT 01/RW 01", buka: "07:00", tutup: "20:00", status: "aktif", bukaSekarang: false, terverifikasi: true, warna: "from-red-400 to-rose-500", antar: true, ambil: true, meja: true, cod: true, kasir: true },
  3: { nama: "Glow Beauty Griya Asri", kategori: "Kecantikan", area: "Perumahan Griya Asri", alamat: "Blok C No. 7, Griya Asri", buka: "09:00", tutup: "18:00", status: "menunggu", bukaSekarang: false, terverifikasi: false, warna: "from-pink-400 to-rose-500", antar: true, ambil: false, meja: false, cod: true, kasir: false },
  4: { nama: "Santri Mart 2", kategori: "Warung & Sembako", area: "Dusun Baru", alamat: "Dusun Baru", buka: "05:30", tutup: "22:00", status: "ditolak", bukaSekarang: false, terverifikasi: false, warna: "from-sky-400 to-cyan-600", antar: true, ambil: true, meja: false, cod: true, kasir: false, alasanTolak: "Alamat belum jelas. Tambahkan nama jalan dan patokan." },
  5: { nama: "Rumah Asri Lama", kategori: "Rumah Tangga", area: "Pasar Lama", alamat: "Jl. Pasar Lama No. 20", buka: "08:00", tutup: "17:00", status: "nonaktif", bukaSekarang: false, terverifikasi: false, warna: "from-emerald-400 to-teal-600", antar: true, ambil: true, meja: false, cod: true, kasir: false },
};

const PESANAN_AWAL: Record<number, PesananMasuk[]> = {
  1: [
    { id: "NEC-221026-006", pembeli: "Rina Wulandari", wa: "6281234567811", waktu: "Hari ini, 11.30", jenis: "ambil", bayar: "cod", item: [{ nama: "Teh celup", qty: 2, harga: 8500 }], ongkir: 0, status: "menunggu" },
    { id: "NEC-221026-005", pembeli: "Agus Pratama", wa: "6281234567812", waktu: "Hari ini, 11.05", jenis: "antar", bayar: "cod", item: [{ nama: "Gas LPG 3 kg", qty: 1, harga: 22000 }, { nama: "Air mineral galon", qty: 1, harga: 20000 }], ongkir: 2000, status: "menunggu" },
    { id: "NEC-221026-004", pembeli: "Siti Rahma", wa: "6281234567813", waktu: "Hari ini, 10.40", jenis: "ambil", bayar: "transfer", item: [{ nama: "Telur 1 kg", qty: 1, harga: 29000 }, { nama: "Mie instan goreng", qty: 10, harga: 3200 }], ongkir: 0, status: "menunggu" },
    { id: "NEC-221026-002", pembeli: "Budi Santoso", wa: "6281234567890", waktu: "Hari ini, 09.15", jenis: "antar", bayar: "cod", item: [{ nama: "Beras 5 kg", qty: 1, harga: 68000 }, { nama: "Minyak goreng 1 L", qty: 2, harga: 17000 }, { nama: "Gula pasir 1 kg", qty: 1, harga: 16000 }], ongkir: 2000, status: "dikirim" },
    { id: "NEC-211026-011", pembeli: "Dewi Lestari", wa: "6281234567814", waktu: "Kemarin, 16.20", jenis: "ambil", bayar: "cod", item: [{ nama: "Gula pasir 1 kg", qty: 2, harga: 16000 }], ongkir: 0, status: "selesai" },
  ],
  2: [
    { id: "NEC-221026-009", pembeli: "Fajar Nugroho", waktu: "Hari ini, 11.40", jenis: "meja", meja: "4", bayar: "kasir", item: [{ nama: "Nasi ayam geprek", qty: 2, harga: 18000 }, { nama: "Es teh manis", qty: 2, harga: 4000 }], ongkir: 0, status: "menunggu" },
    { id: "NEC-221026-008", pembeli: "Laila Hanum", wa: "6281234567816", waktu: "Hari ini, 11.10", jenis: "meja", meja: "7", bayar: "kasir", item: [{ nama: "Es teh manis", qty: 3, harga: 4000 }], ongkir: 0, status: "diproses" },
    { id: "NEC-221026-007", pembeli: "Yusuf Maulana", waktu: "Hari ini, 10.20", jenis: "meja", meja: "2", bayar: "kasir", item: [{ nama: "Nasi ayam geprek", qty: 1, harga: 18000 }], ongkir: 0, status: "selesai" },
    { id: "NEC-211026-008", pembeli: "Hendra Wijaya", wa: "6281234567815", waktu: "Kemarin, 12.10", jenis: "antar", bayar: "cod", item: [{ nama: "Nasi ayam geprek", qty: 2, harga: 18000 }], ongkir: 3000, status: "selesai" },
  ],
};

const PRODUK_AWAL: Record<number, Produk[]> = {
  1: [
    { id: 1, nama: "Beras 5 kg", harga: 68000, stok: 24, tersedia: true },
    { id: 2, nama: "Minyak goreng 1 L", harga: 17000, stok: 40, tersedia: true },
    { id: 3, nama: "Gula pasir 1 kg", harga: 16000, stok: 0, tersedia: false },
    { id: 4, nama: "Telur 1 kg", harga: 29000, stok: 12, tersedia: true },
    { id: 5, nama: "Mie instan goreng", harga: 3200, stok: 150, tersedia: true },
    { id: 6, nama: "Gas LPG 3 kg", harga: 22000, stok: 8, tersedia: true },
  ],
  2: [
    { id: 1, nama: "Nasi ayam geprek", harga: 18000, stok: 20, tersedia: true },
    { id: 2, nama: "Es teh manis", harga: 4000, stok: 50, tersedia: true },
    { id: 3, nama: "Soto ayam", harga: 15000, stok: 0, tersedia: false },
  ],
};

// ---------- Konstanta & fungsi bantu ----------

/** Alamat halaman toko yang dilihat pembeli. Sesuaikan dengan rute aslinya. */
export const urlHalamanToko = (id: number) => `/toko/${id}`;

export const STATUS_TOKO: Record<StatusToko, { label: string; kelas: string }> = {
  aktif: { label: "Aktif", kelas: "bg-white/25 text-white" },
  menunggu: { label: "Menunggu verifikasi", kelas: "bg-amber-100 text-amber-700" },
  ditolak: { label: "Perlu diperbaiki", kelas: "bg-red-100 text-red-700" },
  nonaktif: { label: "Nonaktif", kelas: "bg-gray-200 text-gray-600" },
};

export const KELAS_STATUS_PESANAN: Record<StatusPesanan, string> = {
  menunggu: "bg-amber-100 text-amber-700",
  diproses: "bg-blue-100 text-blue-700",
  dikirim: "bg-indigo-100 text-indigo-700",
  siap: "bg-emerald-100 text-emerald-700",
  selesai: "bg-gray-200 text-gray-600",
  ditolak: "bg-red-100 text-red-700",
};

export function labelStatusPesanan(p: PesananMasuk): string {
  switch (p.status) {
    case "menunggu":
      return "Pesanan baru";
    case "diproses":
      return "Diproses";
    case "dikirim":
      return "Sedang diantar";
    case "siap":
      return p.jenis === "meja" ? "Siap disajikan" : "Siap diambil";
    case "selesai":
      return "Selesai";
    case "ditolak":
      return "Ditolak";
  }
}

export const sedangBerjalan = (p: PesananMasuk) =>
  p.status === "diproses" || p.status === "dikirim" || p.status === "siap";

export const rupiah = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

export const subtotal = (p: PesananMasuk) =>
  p.item.reduce((n, i) => n + i.harga * i.qty, 0);

export const totalPesanan = (p: PesananMasuk) => subtotal(p) + p.ongkir;

// ---------- Context ----------

type NilaiToko = {
  id: number;
  /** Awalan URL dashboard toko ini, mis. /owner/toko/1 */
  base: string;
  toko: DetailToko;
  pesanan: PesananMasuk[];
  produk: Produk[];
  jumlahBaru: Record<JenisPesanan, number>;
  totalBaru: number;
  perbaruiToko: (patch: Partial<DetailToko>) => void;
  ubahBukaSekarang: () => void;
  ubahStatus: (pesananId: string, status: StatusPesanan) => void;
  ubahTersedia: (produkId: number) => void;
  tambahProduk: (p: Omit<Produk, "id">) => void;
};

const TokoContext = createContext<NilaiToko | null>(null);

export function useToko(): NilaiToko {
  const nilai = useContext(TokoContext);
  if (!nilai) throw new Error("useToko harus dipakai di dalam TokoProvider");
  return nilai;
}

function TokoTidakDitemukan() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 px-6 text-center">
      <Store className="h-14 w-14 text-gray-300" />
      <div>
        <p className="font-semibold">Toko tidak ditemukan</p>
        <p className="mt-1 text-sm text-gray-500">
          Toko ini tidak ada atau bukan milikmu.
        </p>
      </div>
      <Link
        href="/owner"
        className="rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
      >
        Kembali ke daftar toko
      </Link>
    </div>
  );
}

export function TokoProvider({ children }: { children: ReactNode }) {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const id = Number(params?.id);

  const [toko, setToko] = useState<DetailToko | undefined>(TOKO[id]);
  const [pesanan, setPesanan] = useState<PesananMasuk[]>(PESANAN_AWAL[id] ?? []);
  const [produk, setProduk] = useState<Produk[]>(PRODUK_AWAL[id] ?? []);

  const perbaruiToko = useCallback((patch: Partial<DetailToko>) => {
    // TODO: simpan ke database
    setToko((t) => (t ? { ...t, ...patch } : t));
  }, []);

  const ubahBukaSekarang = useCallback(() => {
    // TODO: simpan ke database
    setToko((t) => (t ? { ...t, bukaSekarang: !t.bukaSekarang } : t));
  }, []);

  const ubahStatus = useCallback((pesananId: string, status: StatusPesanan) => {
    // TODO: simpan ke database dan kabari pembeli
    setPesanan((d) => d.map((p) => (p.id === pesananId ? { ...p, status } : p)));
  }, []);

  const ubahTersedia = useCallback((produkId: number) => {
    // TODO: simpan ke database
    setProduk((d) =>
      d.map((p) => (p.id === produkId ? { ...p, tersedia: !p.tersedia } : p))
    );
  }, []);

  const tambahProduk = useCallback((p: Omit<Produk, "id">) => {
    // TODO: simpan ke database
    setProduk((d) => [{ ...p, id: Date.now() }, ...d]);
  }, []);

  const jumlahBaru = useMemo(() => {
    const hitung = (j: JenisPesanan) =>
      pesanan.filter((p) => p.jenis === j && p.status === "menunggu").length;
    return { antar: hitung("antar"), ambil: hitung("ambil"), meja: hitung("meja") };
  }, [pesanan]);

  if (!toko) return <TokoTidakDitemukan />;

  const base = pathname.match(/^(.*?\/toko\/[^/]+)/)?.[1] ?? `/toko/${id}`;

  return (
    <TokoContext.Provider
      value={{
        id,
        base,
        toko,
        pesanan,
        produk,
        jumlahBaru,
        totalBaru: jumlahBaru.antar + jumlahBaru.ambil + jumlahBaru.meja,
        perbaruiToko,
        ubahBukaSekarang,
        ubahStatus,
        ubahTersedia,
        tambahProduk,
      }}
    >
      {children}
    </TokoContext.Provider>
  );
}