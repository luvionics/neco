"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { Store } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

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

/** BARU (diskon): jenis potongan harga. */
export type JenisDiskon = "persen" | "nominal";

/** BARU (diskon): keadaan diskon sebuah produk pada waktu tertentu. */
export type StatusDiskon = "tidak-ada" | "terjadwal" | "aktif" | "berakhir";

export type Produk = {
  id: string; // uuid dari tabel products
  nama: string;
  deskripsi: string; // description
  sku: string; // kosong = tidak punya SKU
  kategoriId: string | null; // category_id
  harga: number;
  stok: number;
  tersedia: boolean; // is_available
  nonStok: boolean; // turunan dari track_stock: true jika track_stock = false
  gambarUrl: string | null; // image_url
  // BARU (diskon)
  diskonJenis: JenisDiskon | null; // discount_type: percent -> persen, amount -> nominal
  diskonNilai: number; // discount_value, 0 jika tidak ada diskon
  diskonMulai: string | null; // discount_starts_at (ISO)
  diskonSelesai: string | null; // discount_ends_at (ISO)
};

/** Data yang dikirim form saat menambah produk. */
export type InputProduk = Omit<Produk, "id" | "gambarUrl"> & {
  gambar: File | null;
};

export type Kategori = { id: string; nama: string };

// ---------- Konstanta & fungsi bantu ----------

/** Alamat halaman toko yang dilihat pembeli. Sesuaikan dengan rute aslinya. */
export const urlHalamanToko = (id: string) => `/toko/${id}`;

type JamBuka = { open: string; close: string } | null;

// DIUBAH (diskon): ditambah 4 kolom diskon
const KOLOM_PRODUK =
  "id, name, description, sku, category_id, price, stock, is_available, track_stock, image_url, discount_type, discount_value, discount_starts_at, discount_ends_at";

function statusDariDb(status: unknown): StatusToko {
  switch (status) {
    case "active":
      return "aktif";
    case "pending":
      return "menunggu";
    case "rejected":
      return "ditolak";
    case "suspended":
    case "closed":
      return "nonaktif";
    default:
      throw new Error(`Status toko tidak dikenali: ${String(status)}`);
  }
}

function detailTokoDariDb(row: Record<string, unknown>): DetailToko {
  const jam =
    row.opening_hours && typeof row.opening_hours === "object"
      ? (row.opening_hours as Record<string, JamBuka>)
      : {};
  const hariIni = new Date()
    .toLocaleDateString("en-US", {
      weekday: "short",
      timeZone: "Asia/Jakarta",
    })
    .toLowerCase()
    .slice(0, 3);
  const jamHariIni = jam[hariIni];
  const teks = (value: unknown) => (typeof value === "string" ? value : "");

  return {
    nama: teks(row.name),
    kategori: "Toko",
    area: teks(row.village),
    alamat: teks(row.address_line),
    buka: jamHariIni?.open ?? "",
    tutup: jamHariIni?.close ?? "",
    status: statusDariDb(row.status),
    bukaSekarang: row.is_open === true,
    terverifikasi: row.is_verified === true,
    warna: "from-amber-400 to-orange-500",
    antar: row.delivery_enabled === true,
    ambil: row.pickup_enabled === true,
    meja: row.dine_in_enabled === true,
    cod: false,
    kasir: row.pos_enabled === true,
  };
}

function produkDariDb(row: Record<string, unknown>): Produk {
  const teks = (value: unknown) => (typeof value === "string" ? value : "");

  // BARU (diskon)
  const diskonJenis: JenisDiskon | null =
    row.discount_type === "percent"
      ? "persen"
      : row.discount_type === "amount"
      ? "nominal"
      : null;

  return {
    id: String(row.id),
    nama: teks(row.name),
    deskripsi: teks(row.description),
    sku: teks(row.sku),
    kategoriId: typeof row.category_id === "string" ? row.category_id : null,
    // kolom numeric bisa datang sebagai number atau string
    harga: Number(row.price) || 0,
    stok: Number(row.stock) || 0,
    tersedia: row.is_available === true,
    // produk tanpa stok = stok tidak dilacak
    nonStok: row.track_stock !== true,
    gambarUrl: typeof row.image_url === "string" ? row.image_url : null,
    // BARU (diskon)
    diskonJenis,
    diskonNilai: diskonJenis ? Number(row.discount_value) || 0 : 0,
    diskonMulai:
      diskonJenis && typeof row.discount_starts_at === "string"
        ? row.discount_starts_at
        : null,
    diskonSelesai:
      diskonJenis && typeof row.discount_ends_at === "string"
        ? row.discount_ends_at
        : null,
  };
}

/** BARU: baris tabel product_categories menjadi Kategori. */
function kategoriDariDb(row: Record<string, unknown>): Kategori {
  return {
    id: String(row.id),
    nama: typeof row.name === "string" ? row.name : "",
  };
}

export const STATUS_TOKO: Record<StatusToko, { label: string; kelas: string }> = {
  aktif: { label: "Aktif", kelas: "bg-white/25 text-white" },
  // Verifikasi hanya label internal, bukan penghalang: tampil sama seperti aktif.
  menunggu: { label: "Aktif", kelas: "bg-white/25 text-white" },
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

// ---------- BARU (diskon): hitungan harga ----------

/**
 * Harga setelah dipotong diskon, tanpa memperhatikan masa berlaku.
 * Hitungannya sama dengan fungsi SQL public.product_final_price.
 */
export function hargaSetelahDiskon(
  harga: number,
  jenis: JenisDiskon | null,
  nilai: number
): number {
  if (!jenis || nilai <= 0) return harga;
  if (jenis === "persen") {
    return Math.max(0, Math.round((harga * (100 - nilai)) / 100));
  }
  return Math.max(0, harga - nilai);
}

/** Keadaan diskon produk pada waktu `sekarang`. */
export function statusDiskon(
  p: Pick<Produk, "diskonJenis" | "diskonMulai" | "diskonSelesai">,
  sekarang: Date = new Date()
): StatusDiskon {
  if (!p.diskonJenis || !p.diskonMulai || !p.diskonSelesai) return "tidak-ada";
  const t = sekarang.getTime();
  if (t < new Date(p.diskonMulai).getTime()) return "terjadwal";
  if (t >= new Date(p.diskonSelesai).getTime()) return "berakhir";
  return "aktif";
}

/** Harga yang berlaku sekarang: harga diskon jika diskon sedang aktif, selain itu harga normal. */
export function hargaAkhir(p: Produk, sekarang: Date = new Date()): number {
  return statusDiskon(p, sekarang) === "aktif"
    ? hargaSetelahDiskon(p.harga, p.diskonJenis, p.diskonNilai)
    : p.harga;
}

/** Teks singkat besar diskon, mis. "10%" atau "Rp 5.000". */
export function labelDiskon(jenis: JenisDiskon, nilai: number): string {
  return jenis === "persen" ? `${nilai}%` : rupiah(nilai);
}

// ---------- Context ----------

type NilaiToko = {
  id: string;
  /** Awalan URL dashboard toko ini, mis. /owner/toko/<uuid> */
  base: string;
  toko: DetailToko;
  pesanan: PesananMasuk[];
  produk: Produk[];
  /** Untuk pembaruan tampilan produk secara lokal (penyimpanan dilakukan halaman Produk). */
  setProduk: Dispatch<SetStateAction<Produk[]>>;
  kategori: Kategori[];
  jumlahBaru: Record<JenisPesanan, number>;
  totalBaru: number;
  /** Memperbarui data ringkas toko di context (tampilan saja, tidak menyimpan ke database). */
  perbaruiToko: (patch: Partial<DetailToko>) => void;
  ubahBukaSekarang: () => void;
  ubahStatus: (pesananId: string, status: StatusPesanan) => void;
  /** Memuat ulang daftar produk dari database. Melempar error jika gagal. */
  muatUlangProduk: () => Promise<void>;
  /** Memuat ulang daftar kategori dari database. Melempar error jika gagal. */
  muatUlangKategori: () => Promise<void>;
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
  const id = params.id;
  const supabase = useMemo(() => createClient(), []);
  const [statusMuat, setStatusMuat] = useState<
    "loading" | "unauthenticated" | "error" | "not-found" | "ready"
  >("loading");
  const [galatMuat, setGalatMuat] = useState("");
  const [cobaLagi, setCobaLagi] = useState(0);
  const [toko, setToko] = useState<DetailToko | null>(null);
  const [pesanan, setPesanan] = useState<PesananMasuk[]>([]);
  const [produk, setProduk] = useState<Produk[]>([]);
  const [kategori, setKategori] = useState<Kategori[]>([]);

  /** Mengambil produk aktif milik toko dari database. */
  const ambilProduk = useCallback(async (): Promise<Produk[]> => {
    const { data, error } = await supabase
      .from("products")
      .select(KOLOM_PRODUK)
      .eq("shop_id", id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(produkDariDb);
  }, [supabase, id]);

  /** Mengambil kategori aktif milik toko dari tabel product_categories. */
  const ambilKategori = useCallback(async (): Promise<Kategori[]> => {
    const { data, error } = await supabase
      .from("product_categories")
      .select("id, name")
      .eq("shop_id", id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(kategoriDariDb);
  }, [supabase, id]);

  useEffect(() => {
    let batal = false;

    async function muatToko() {
      setStatusMuat("loading");
      setGalatMuat("");
      setToko(null);
      setProduk([]);
      setKategori([]);

      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          id
        )
      ) {
        setGalatMuat("Format ID toko tidak valid.");
        setStatusMuat("error");
        return;
      }

      try {
        const {
          data: { user },
          error: errorAuth,
        } = await supabase.auth.getUser();

        if (batal) return;
        if (errorAuth) throw errorAuth;
        if (!user) {
          setStatusMuat("unauthenticated");
          window.location.replace("/login");
          return;
        }

        const { data, error } = await supabase
          .from("shops")
          .select(
            "id, name, village, address_line, status, is_open, is_verified, opening_hours, delivery_enabled, pickup_enabled, dine_in_enabled, pos_enabled"
          )
          .eq("id", id)
          .maybeSingle();

        if (batal) return;
        if (error) throw error;
        if (!data) {
          setStatusMuat("not-found");
          return;
        }

        // Muat produk toko (hanya yang aktif)
        const daftarProduk = await ambilProduk();
        if (batal) return;

        // Muat kategori milik toko ini. Gagal memuat kategori tidak boleh
        // menggagalkan halaman, dropdown kategori akan disembunyikan saja.
        let daftarKategori: Kategori[] = [];
        try {
          daftarKategori = await ambilKategori();
        } catch (e) {
          console.error("Gagal memuat kategori produk:", e);
        }

        if (batal) return;

        setToko(detailTokoDariDb(data));
        setProduk(daftarProduk);
        setKategori(daftarKategori);
        setStatusMuat("ready");
      } catch (error) {
        if (batal) return;
        setGalatMuat(
          error instanceof Error
            ? error.message
            : "Terjadi kesalahan yang tidak diketahui."
        );
        setStatusMuat("error");
      }
    }

    void muatToko();
    return () => {
      batal = true;
    };
  }, [id, cobaLagi, supabase, ambilProduk, ambilKategori]);

  const perbaruiToko = useCallback((patch: Partial<DetailToko>) => {
    // Hanya memperbarui tampilan. Penyimpanan ke database dilakukan oleh halaman pengaturan.
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

  const muatUlangProduk = useCallback(async () => {
    setProduk(await ambilProduk());
  }, [ambilProduk]);

  const muatUlangKategori = useCallback(async () => {
    setKategori(await ambilKategori());
  }, [ambilKategori]);

  const jumlahBaru = useMemo(() => {
    const hitung = (j: JenisPesanan) =>
      pesanan.filter((p) => p.jenis === j && p.status === "menunggu").length;
    return { antar: hitung("antar"), ambil: hitung("ambil"), meja: hitung("meja") };
  }, [pesanan]);

  if (statusMuat === "loading") {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-gray-50 text-sm text-gray-500"
        role="status"
      >
        Memuat data toko...
      </div>
    );
  }

  if (statusMuat === "unauthenticated") {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-gray-50 text-sm text-gray-500"
        role="status"
      >
        Sesi tidak ditemukan. Mengalihkan ke halaman login...
      </div>
    );
  }

  if (statusMuat === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gray-50 px-6 text-center">
        <p className="font-semibold text-gray-900">Gagal memuat data toko</p>
        <p className="text-sm text-gray-600" role="alert">
          {galatMuat}
        </p>
        <button
          type="button"
          onClick={() => setCobaLagi((jumlah) => jumlah + 1)}
          className="rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
        >
          Coba lagi
        </button>
      </div>
    );
  }

  if (statusMuat === "not-found") return <TokoTidakDitemukan />;
  if (!toko) throw new Error("Data toko tidak tersedia setelah pemuatan berhasil");

  const base =
    pathname.match(/^(.*?\/toko\/[^/]+)/)?.[1] ?? `/owner/toko/${id}`;

  return (
    <TokoContext.Provider
      value={{
        id,
        base,
        toko,
        pesanan,
        produk,
        setProduk,
        kategori,
        jumlahBaru,
        totalBaru: jumlahBaru.antar + jumlahBaru.ambil + jumlahBaru.meja,
        perbaruiToko,
        ubahBukaSekarang,
        ubahStatus,
        muatUlangProduk,
        muatUlangKategori,
      }}
    >
      {children}
    </TokoContext.Provider>
  );
}