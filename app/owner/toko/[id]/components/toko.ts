"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type JenisDiskon = "persen" | "nominal";
export type StatusDiskon = "tidak-ada" | "terjadwal" | "aktif" | "berakhir";
export type JenisPesanan = "antar" | "ambil" | "meja";

export type Produk = {
  id: string;
  nama: string;
  deskripsi: string;
  sku: string;
  kategoriId: string | null;
  harga: number;
  stok: number;
  tersedia: boolean;
  nonStok: boolean;
  gambarUrl: string | null;
  diskonJenis: JenisDiskon | null;
  diskonNilai: number;
  diskonMulai: string | null;
  diskonSelesai: string | null;
};

export type InputProduk = Omit<Produk, "id" | "gambarUrl"> & {
  gambar: File | null;
};

export type Kategori = { id: string; nama: string };

export const rupiah = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;
export const urlHalamanToko = (id: string) => `/toko/${id}`;

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

export function hargaAkhir(p: Produk, sekarang: Date = new Date()): number {
  return statusDiskon(p, sekarang) === "aktif"
    ? hargaSetelahDiskon(p.harga, p.diskonJenis, p.diskonNilai)
    : p.harga;
}

export function labelDiskon(jenis: JenisDiskon, nilai: number): string {
  return jenis === "persen" ? `${nilai}%` : rupiah(nilai);
}

const KOLOM_PRODUK =
  "id, name, description, sku, category_id, price, stock, is_available, track_stock, image_url, discount_type, discount_value, discount_starts_at, discount_ends_at";

function produkDariDb(row: Record<string, unknown>): Produk {
  const teks = (value: unknown) => (typeof value === "string" ? value : "");
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
    harga: Number(row.price) || 0,
    stok: Number(row.stock) || 0,
    tersedia: row.is_available === true,
    nonStok: row.track_stock !== true,
    gambarUrl: typeof row.image_url === "string" ? row.image_url : null,
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

function kategoriDariDb(row: Record<string, unknown>): Kategori {
  return {
    id: String(row.id),
    nama: typeof row.name === "string" ? row.name : "",
  };
}

export function useProdukToko(idToko: string) {
  const supabase = useMemo(() => createClient(), []);
  const [produk, setProduk] = useState<Produk[]>([]);
  const [kategori, setKategori] = useState<Kategori[]>([]);

  const ambilProduk = useCallback(async (): Promise<Produk[]> => {
    const { data, error } = await supabase
      .from("products")
      .select(KOLOM_PRODUK)
      .eq("shop_id", idToko)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(produkDariDb);
  }, [supabase, idToko]);

  const ambilKategori = useCallback(async (): Promise<Kategori[]> => {
    const { data, error } = await supabase
      .from("product_categories")
      .select("id, name")
      .eq("shop_id", idToko)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(kategoriDariDb);
  }, [supabase, idToko]);

  const muatUlangProduk = useCallback(async () => {
    setProduk(await ambilProduk());
  }, [ambilProduk]);

  const muatUlangKategori = useCallback(async () => {
    setKategori(await ambilKategori());
  }, [ambilKategori]);

  useEffect(() => {
    let batal = false;
    void (async () => {
      try {
        const daftarProduk = await ambilProduk();
        if (!batal) setProduk(daftarProduk);
      } catch (e) {
        if (!batal) console.error("Gagal memuat produk:", e);
      }
      try {
        const daftarKategori = await ambilKategori();
        if (!batal) setKategori(daftarKategori);
      } catch (e) {
        if (!batal) console.error("Gagal memuat kategori produk:", e);
      }
    })();
    return () => {
      batal = true;
    };
  }, [ambilProduk, ambilKategori]);

  return {
    produk,
    setProduk,
    kategori,
    muatUlangProduk,
    muatUlangKategori,
  };
}
