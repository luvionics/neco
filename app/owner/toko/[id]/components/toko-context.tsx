"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { Store } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/toast";

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
  id: string; // uuid dari tabel products
  nama: string;
  deskripsi: string; // description
  sku: string; // kosong = tidak punya SKU
  kategoriId: string | null; // category_id
  harga: number;
  stok: number;
  tersedia: boolean; // is_available
  nonStok: boolean; // is_non_stock
  gambarUrl: string | null; // image_url
};

/** Data yang dikirim form saat menambah produk. */
export type InputProduk = Omit<Produk, "id" | "gambarUrl"> & {
  gambar: File | null;
};

export type Kategori = { id: string; nama: string };

// ---------- Konstanta & fungsi bantu ----------

/** Alamat halaman toko yang dilihat pembeli. Sesuaikan dengan rute aslinya. */
export const urlHalamanToko = (id: string) => `/toko/${id}`;

/** Nama bucket Supabase Storage untuk foto produk (harus public). */
const BUCKET_PRODUK = "product-images";

type JamBuka = { open: string; close: string } | null;

const KOLOM_PRODUK =
  "id, name, description, sku, category_id, price, stock, is_available, is_non_stock, image_url";

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
    nonStok: row.is_non_stock === true,
    gambarUrl: typeof row.image_url === "string" ? row.image_url : null,
  };
}

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
  id: string;
  /** Awalan URL dashboard toko ini, mis. /owner/toko/<uuid> */
  base: string;
  toko: DetailToko;
  pesanan: PesananMasuk[];
  produk: Produk[];
  kategori: Kategori[];
  jumlahBaru: Record<JenisPesanan, number>;
  totalBaru: number;
  /** Memperbarui data ringkas toko di context (tampilan saja, tidak menyimpan ke database). */
  perbaruiToko: (patch: Partial<DetailToko>) => void;
  ubahBukaSekarang: () => void;
  ubahStatus: (pesananId: string, status: StatusPesanan) => void;
  /** Mengubah ketersediaan produk. Gagal ditampilkan lewat toast. */
  ubahTersedia: (produkId: string) => Promise<void>;
  /** Menyimpan produk (dan foto) ke database. Melempar error jika gagal. */
  tambahProduk: (p: InputProduk) => Promise<void>;
  /** Memuat ulang daftar produk dari database. Melempar error jika gagal. */
  muatUlangProduk: () => Promise<void>;
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
  const toast = useToast();
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
          .eq("owner_id", user.id)
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
        const { data: dataKategori } = await supabase
          .from("categories")
          .select("id, name")
          .eq("shop_id", id)
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true });

        if (batal) return;

        setToko(detailTokoDariDb(data));
        setProduk(daftarProduk);
        setKategori(
          (dataKategori ?? []).map((k) => ({
            id: String(k.id),
            nama: typeof k.name === "string" ? k.name : "",
          }))
        );
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
  }, [id, cobaLagi, supabase, ambilProduk]);

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

  const ubahTersedia = useCallback(
    async (produkId: string) => {
      const lama = produk.find((p) => p.id === produkId);
      if (!lama) return;
      const baru = !lama.tersedia;

      const kembalikan = () =>
        setProduk((d) =>
          d.map((p) =>
            p.id === produkId ? { ...p, tersedia: lama.tersedia } : p
          )
        );

      // Optimistis: perbarui tampilan dulu
      setProduk((d) =>
        d.map((p) => (p.id === produkId ? { ...p, tersedia: baru } : p))
      );

      try {
        const { data, error } = await supabase
          .from("products")
          .update({ is_available: baru })
          .eq("id", produkId)
          .eq("shop_id", id)
          .select("id");

        if (error) {
          console.error("Gagal mengubah ketersediaan produk:", error);
          kembalikan();
          toast.galat("Gagal mengubah ketersediaan produk", error.message);
          return;
        }

        // RLS yang menolak update tidak mengembalikan error, hanya 0 baris
        if (!data || data.length === 0) {
          kembalikan();
          toast.galat(
            "Perubahan tidak tersimpan",
            "Kamu tidak punya izin mengubah produk ini, atau produk tidak ditemukan."
          );
        }
      } catch (e) {
        console.error("Gagal mengubah ketersediaan produk:", e);
        kembalikan();
        toast.galat(
          "Gagal mengubah ketersediaan produk",
          "Periksa koneksi internet lalu coba lagi."
        );
      }
    },
    [produk, supabase, id, toast]
  );

  const tambahProduk = useCallback(
    async (p: InputProduk) => {
      // 1. Unggah foto (jika ada)
      let gambarUrl: string | null = null;
      let pathGambar: string | null = null;

      if (p.gambar) {
        const ekstensi =
          p.gambar.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ||
          "jpg";
        pathGambar = `${id}/${crypto.randomUUID()}.${ekstensi}`;

        const { error: errorUnggah } = await supabase.storage
          .from(BUCKET_PRODUK)
          .upload(pathGambar, p.gambar, {
            contentType: p.gambar.type,
            cacheControl: "31536000",
          });
        if (errorUnggah) {
          const pesan = /row-level security/i.test(errorUnggah.message)
            ? "Tidak punya izin mengunggah ke bucket foto produk. Periksa policy Storage di Supabase."
            : errorUnggah.message;
          throw new Error(`Gagal mengunggah foto: ${pesan}`);
        }

        gambarUrl = supabase.storage.from(BUCKET_PRODUK).getPublicUrl(pathGambar)
          .data.publicUrl;
      }

      // 2. Simpan produk
      const { data, error } = await supabase
        .from("products")
        .insert({
          shop_id: id,
          category_id: p.kategoriId,
          name: p.nama,
          description: p.deskripsi || null,
          // string kosong harus jadi NULL agar tidak bentrok dengan UNIQUE (shop_id, sku)
          sku: p.sku || null,
          price: p.harga,
          image_url: gambarUrl,
          // produk non-stock: stok tidak dilacak dan stok = 0
          // (sesuai CHECK NOT (is_non_stock AND track_stock))
          is_non_stock: p.nonStok,
          track_stock: !p.nonStok,
          stock: p.nonStok ? 0 : p.stok,
          is_available: p.tersedia,
        })
        .select(KOLOM_PRODUK)
        .single();

      if (error) {
        // Bersihkan foto yang sudah terunggah agar tidak jadi sampah
        if (pathGambar) {
          await supabase.storage.from(BUCKET_PRODUK).remove([pathGambar]);
        }
        if (error.code === "23505") {
          throw new Error("SKU sudah dipakai produk lain di tokomu.");
        }
        throw error;
      }

      setProduk((d) => [produkDariDb(data), ...d]);
    },
    [supabase, id]
  );

  const muatUlangProduk = useCallback(async () => {
    setProduk(await ambilProduk());
  }, [ambilProduk]);

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
        kategori,
        jumlahBaru,
        totalBaru: jumlahBaru.antar + jumlahBaru.ambil + jumlahBaru.meja,
        perbaruiToko,
        ubahBukaSekarang,
        ubahStatus,
        ubahTersedia,
        tambahProduk,
        muatUlangProduk,
      }}
    >
      {children}
    </TokoContext.Provider>
  );
}