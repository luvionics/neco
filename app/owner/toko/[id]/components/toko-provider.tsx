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

export type StatusToko = "aktif" | "menunggu" | "ditolak" | "nonaktif";

export type DetailToko = {
  nama: string;
  kategori: string;
  logo: string;
  area: string;
  alamat: string;
  buka: string;
  tutup: string;
  status: StatusToko;
  bukaSekarang: boolean;
  terverifikasi: boolean;
  warna: string;
  antar: boolean;
  ambil: boolean;
  meja: boolean;
  cod: boolean;
  kasir: boolean;
  alasanTolak?: string;
};

export const STATUS_TOKO: Record<StatusToko, { label: string; kelas: string }> = {
  aktif: { label: "Aktif", kelas: "bg-white/25 text-white" },
  menunggu: { label: "Aktif", kelas: "bg-white/25 text-white" },
  ditolak: { label: "Perlu diperbaiki", kelas: "bg-red-100 text-red-700" },
  nonaktif: { label: "Nonaktif", kelas: "bg-gray-200 text-gray-600" },
};

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

function namaKategoriDariJoin(v: unknown): string {
  const baris = Array.isArray(v) ? v[0] : v;
  if (baris && typeof baris === "object") {
    const nama = (baris as Record<string, unknown>).name;
    if (typeof nama === "string") return nama;
  }
  return "";
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
    kategori: namaKategoriDariJoin(row.shop_categories),
    logo: teks(row.logo_url),
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

type NilaiToko = {
  id: string;
  base: string;
  toko: DetailToko;
  perbaruiToko: (patch: Partial<DetailToko>) => void;
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
            "id, name, logo_url, village, address_line, status, is_open, is_verified, opening_hours, delivery_enabled, pickup_enabled, dine_in_enabled, pos_enabled, shop_categories(name)"
          )
          .eq("id", id)
          .maybeSingle();

        if (batal) return;
        if (error) throw error;
        if (!data) {
          setStatusMuat("not-found");
          return;
        }

        setToko(detailTokoDariDb(data as Record<string, unknown>));
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
    setToko((t) => (t ? { ...t, ...patch } : t));
  }, []);

  if (statusMuat === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 text-sm text-gray-500" role="status">
        Memuat data toko...
      </div>
    );
  }
  if (statusMuat === "unauthenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 text-sm text-gray-500" role="status">
        Sesi tidak ditemukan. Mengalihkan ke halaman login...
      </div>
    );
  }
  if (statusMuat === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gray-50 px-6 text-center">
        <p className="font-semibold text-gray-900">Gagal memuat data toko</p>
        <p className="text-sm text-gray-600" role="alert">{galatMuat}</p>
        <button type="button" onClick={() => setCobaLagi((jumlah) => jumlah + 1)} className="rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-600">
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
    <TokoContext.Provider value={{ id, base, toko, perbaruiToko }}>
      {children}
    </TokoContext.Provider>
  );
}
