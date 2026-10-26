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

// ---------- Konstanta & fungsi bantu ----------

/** Alamat halaman toko yang dilihat pembeli. Sesuaikan dengan rute aslinya. */
export const urlHalamanToko = (id: string) => `/toko/${id}`;

type JamBuka = { open: string; close: string } | null;

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
  const teks = (value: unknown) =>
    typeof value === "string" ? value : "";

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

  useEffect(() => {
    let batal = false;

    async function muatToko() {
      setStatusMuat("loading");
      setGalatMuat("");
      setToko(null);

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

        setToko(detailTokoDariDb(data));
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
  }, [id, cobaLagi, supabase]);

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