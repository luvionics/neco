"use client";

/**
 * TAB PRODUK TOKO — komponen mandiri.
 *
 * Tidak menerima props. Hanya menampilkan produk: pencarian, tab kategori,
 * daftar produk, dan lembar detail (deskripsi, pilihan/opsi, jumlah).
 * Tidak ada info toko di sini. Data produk, kategori, dan opsi diambil
 * sendiri dari database. Satu-satunya data toko yang dibaca adalah tiga
 * penanda "toko menerima pesan antar/ambil/di meja", hanya untuk memutuskan
 * apakah tombol tambah ke keranjang ditampilkan.
 *
 * ---------------------------------------------------------------------------
 * KONTRAK KERANJANG (satu-satunya hal yang sama dengan Keranjang.tsx)
 * Kedua file tidak saling mengimpor. Mereka hanya bertukar isi keranjang
 * lewat penyimpanan browser:
 *   - kunci   : `keranjang:<id toko>` di localStorage
 *   - isi     : JSON array [{ produkId: string, opsiIds: string[], qty: number }]
 *   - kabar   : setelah menulis, kirim `window.dispatchEvent(new Event("keranjang:berubah"))`
 * Harga, diskon, stok, dan nama TIDAK disimpan di keranjang; Keranjang.tsx
 * mengambilnya sendiri dari database. Jika kontrak ini diubah, ubah di
 * kedua file.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Package, Search, Check, ImageOff, Plus, Minus, X } from "lucide-react";

// ---------- Tipe ----------

type BarisKeranjang = { produkId: string; opsiIds: string[]; qty: number };

type BarisAkses = {
  delivery_enabled: boolean;
  pickup_enabled: boolean;
  dine_in_enabled: boolean;
};

type BarisProduk = {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number | string;
  image_url: string | null;
  track_stock: boolean;
  stock: number;
  is_available: boolean;
  discount_type: string | null;
  discount_value: number | string | null;
  discount_starts_at: string | null;
  discount_ends_at: string | null;
};

type BarisKategori = { id: string; name: string };

type BarisGrup = {
  id: string;
  product_id: string;
  name: string;
  is_required: boolean;
  min_select: number;
  max_select: number;
};

type BarisOpsi = {
  id: string;
  group_id: string;
  name: string;
  price_delta: number;
  is_available: boolean;
};

type Opsi = { id: string; nama: string; selisih: number; tersedia: boolean };
type Grup = {
  id: string;
  nama: string;
  wajib: boolean;
  min: number;
  maks: number;
  opsi: Opsi[];
};

type Produk = {
  id: string;
  kategoriId: string | null;
  nama: string;
  deskripsi: string | null;
  harga: number;
  gambar: string | null;
  habis: boolean;
  /** null = stok tidak dilacak */
  stok: number | null;
  diskonTipe: string | null;
  diskonNilai: number;
  diskonMulai: string | null;
  diskonSelesai: string | null;
  grup: Grup[];
};

type ProdukTampil = Produk & {
  hargaAkhir: number;
  labelDiskon: string | null;
};

// ---------- Konstanta ----------

const SEMBUNYIKAN_SCROLLBAR =
  "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

const PIL_AKTIF = "bg-gray-900 text-white shadow-md shadow-gray-900/20";
const PIL_NONAKTIF =
  "border border-gray-100 bg-white text-gray-600 shadow-sm hover:border-orange-200 hover:text-orange-600";

const TOMBOL_UTAMA =
  "flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-sm";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EVENT_KERANJANG = "keranjang:berubah";

// ---------- Fungsi bantu ----------

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
}

/**
 * Harga setelah diskon. Aturannya sama dengan fungsi buat_pesanan di database:
 * diskon 'percent' dibulatkan per satuan, selain itu potongan rupiah.
 */
function hitungHarga(p: Produk, sekarang: number) {
  const nilai = p.diskonNilai;
  const mulaiOk =
    !p.diskonMulai || new Date(p.diskonMulai).getTime() <= sekarang;
  const selesaiOk =
    !p.diskonSelesai || new Date(p.diskonSelesai).getTime() >= sekarang;

  if (!p.diskonTipe || !(nilai > 0) || !mulaiOk || !selesaiOk) {
    return { hargaAkhir: p.harga, labelDiskon: null };
  }
  const persen = p.diskonTipe === "percent";
  const potongan = Math.min(
    Math.max(persen ? Math.round((p.harga * nilai) / 100) : nilai, 0),
    p.harga
  );
  return {
    hargaAkhir: p.harga - potongan,
    labelDiskon: persen ? `-${nilai}%` : `-${formatRupiah(nilai)}`,
  };
}

const minGrup = (g: Grup) => Math.max(g.min, g.wajib ? 1 : 0);
const maksGrup = (g: Grup) => Math.max(g.maks, 1);

function aturanPilih(g: Grup) {
  const mn = minGrup(g);
  const mx = maksGrup(g);
  if (mx === 1) return mn > 0 ? "Wajib pilih 1" : "Pilih 1 (opsional)";
  if (mn > 0) return mn === mx ? `Wajib pilih ${mx}` : `Wajib pilih ${mn}–${mx}`;
  return `Pilih sampai ${mx} (opsional)`;
}

/** Produk tidak bisa dipesan jika grup wajibnya kehabisan opsi. */
function bisaDipesan(p: Produk) {
  return p.grup.every(
    (g) => g.opsi.filter((o) => o.tersedia).length >= minGrup(g)
  );
}

function buatKunci(produkId: string, opsiIds: string[]) {
  return `${produkId}|${[...opsiIds].sort().join(",")}`;
}

// ---- Keranjang (sesuai KONTRAK di atas) ----

function adalahBaris(b: unknown): b is BarisKeranjang {
  const x = b as Partial<BarisKeranjang> | null;
  return (
    !!x &&
    typeof x.produkId === "string" &&
    Array.isArray(x.opsiIds) &&
    x.opsiIds.every((o) => typeof o === "string") &&
    typeof x.qty === "number" &&
    x.qty > 0
  );
}

function bacaKeranjang(idToko: string): BarisKeranjang[] {
  try {
    const mentah = localStorage.getItem(`keranjang:${idToko}`);
    if (!mentah) return [];
    const arr = JSON.parse(mentah) as unknown;
    return Array.isArray(arr) ? arr.filter(adalahBaris) : [];
  } catch {
    return [];
  }
}

function tulisKeranjang(idToko: string, baris: BarisKeranjang[]) {
  try {
    localStorage.setItem(`keranjang:${idToko}`, JSON.stringify(baris));
  } catch {
    /* penyimpanan browser tidak tersedia */
  }
  window.dispatchEvent(new Event(EVENT_KERANJANG));
}

// ---------- Komponen ----------

export default function ProdukToko() {
  const supabase = useMemo(() => createClient(), []);
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const idValid = UUID.test(id ?? "");

  const [akses, setAkses] = useState<BarisAkses | null>(null);
  const [produk, setProduk] = useState<Produk[]>([]);
  const [kategori, setKategori] = useState<BarisKategori[]>([]);
  const [memuat, setMemuat] = useState(idValid);
  const [galat, setGalat] = useState(false);
  const [cobaLagi, setCobaLagi] = useState(0);

  const [cari, setCari] = useState("");
  const [kategoriAktif, setKategoriAktif] = useState("semua");

  const [produkDipilihId, setProdukDipilihId] = useState<string | null>(null);
  const [pilihan, setPilihan] = useState<Record<string, string[]>>({});
  const [jumlah, setJumlah] = useState(1);

  const [keranjang, setKeranjang] = useState<BarisKeranjang[]>([]);

  // Penanda menit berjalan, agar masa berlaku diskon ikut diperbarui
  const [menit, setMenit] = useState(() => Math.floor(Date.now() / 60000));
  useEffect(() => {
    const timer = setInterval(
      () => setMenit(Math.floor(Date.now() / 60000)),
      60000
    );
    return () => clearInterval(timer);
  }, []);

  // Ikuti isi keranjang (ditulis oleh file ini maupun Keranjang.tsx)
  useEffect(() => {
    if (!idValid) return;
    const segarkan = () => setKeranjang(bacaKeranjang(id));
    segarkan();
    window.addEventListener(EVENT_KERANJANG, segarkan);
    window.addEventListener("storage", segarkan);
    return () => {
      window.removeEventListener(EVENT_KERANJANG, segarkan);
      window.removeEventListener("storage", segarkan);
    };
  }, [id, idValid]);

  // Muat produk, kategori, opsi, dan penanda pemesanan
  useEffect(() => {
    if (!idValid) return;
    let batal = false;

    async function muat() {
      setMemuat(true);
      setGalat(false);

      const [rAkses, rProduk, rKategori, rGrup, rOpsi] = await Promise.all([
        supabase.rpc("detail_toko_publik", { p_id: id }),
        supabase
          .from("products")
          .select(
            "id, category_id, name, description, price, image_url, track_stock, stock, is_available, discount_type, discount_value, discount_starts_at, discount_ends_at"
          )
          .eq("shop_id", id)
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
        supabase
          .from("product_categories")
          .select("id, name")
          .eq("shop_id", id)
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        supabase
          .from("product_option_groups")
          .select("id, product_id, name, is_required, min_select, max_select")
          .eq("shop_id", id)
          .order("sort_order", { ascending: true }),
        supabase
          .from("product_options")
          .select("id, group_id, name, price_delta, is_available")
          .eq("shop_id", id)
          .order("sort_order", { ascending: true }),
      ]);
      if (batal) return;

      if (rProduk.error) {
        setGalat(true);
        setProduk([]);
        setMemuat(false);
        return;
      }

      // Kategori, opsi, dan penanda bersifat pelengkap: bila gagal, produk tetap tampil
      setAkses(((rAkses.data ?? []) as BarisAkses[])[0] ?? null);

      const opsiPerGrup = new Map<string, Opsi[]>();
      for (const o of (rOpsi.data ?? []) as BarisOpsi[]) {
        const daftar = opsiPerGrup.get(o.group_id) ?? [];
        daftar.push({
          id: o.id,
          nama: o.name,
          selisih: o.price_delta,
          tersedia: o.is_available,
        });
        opsiPerGrup.set(o.group_id, daftar);
      }
      const grupPerProduk = new Map<string, Grup[]>();
      for (const g of (rGrup.data ?? []) as BarisGrup[]) {
        const daftar = grupPerProduk.get(g.product_id) ?? [];
        daftar.push({
          id: g.id,
          nama: g.name,
          wajib: g.is_required,
          min: g.min_select,
          maks: g.max_select,
          opsi: opsiPerGrup.get(g.id) ?? [],
        });
        grupPerProduk.set(g.product_id, daftar);
      }

      setKategori((rKategori.data ?? []) as BarisKategori[]);
      setProduk(
        ((rProduk.data ?? []) as BarisProduk[]).map((p) => ({
          id: p.id,
          kategoriId: p.category_id,
          nama: p.name,
          deskripsi: p.description,
          harga: Number(p.price) || 0,
          gambar: p.image_url,
          habis: !p.is_available || (p.track_stock && p.stock <= 0),
          stok: p.track_stock ? Math.max(p.stock, 0) : null,
          diskonTipe: p.discount_type,
          diskonNilai: Number(p.discount_value) || 0,
          diskonMulai: p.discount_starts_at,
          diskonSelesai: p.discount_ends_at,
          grup: grupPerProduk.get(p.id) ?? [],
        }))
      );
      setMemuat(false);
    }

    void muat();
    return () => {
      batal = true;
    };
  }, [supabase, id, idValid, cobaLagi]);

  // Tutup lembar detail dengan tombol Escape
  useEffect(() => {
    if (!produkDipilihId) return;
    const tutup = (e: KeyboardEvent) => {
      if (e.key === "Escape") setProdukDipilihId(null);
    };
    window.addEventListener("keydown", tutup);
    return () => window.removeEventListener("keydown", tutup);
  }, [produkDipilihId]);

  // ---- Turunan data ----

  const bisaPesan = Boolean(
    akses && (akses.delivery_enabled || akses.pickup_enabled || akses.dine_in_enabled)
  );

  const produkHarga = useMemo<ProdukTampil[]>(() => {
    // `menit` hanya pemicu hitung ulang masa berlaku diskon
    void menit;
    const sekarang = Date.now();
    return produk.map((p) => ({ ...p, ...hitungHarga(p, sekarang) }));
  }, [produk, menit]);

  // Tab kategori: hanya kategori yang punya produk
  const tabKategori = useMemo(() => {
    const dipakai = new Set(produk.map((p) => p.kategoriId));
    const tab = kategori
      .filter((k) => dipakai.has(k.id))
      .map((k) => ({ id: k.id, nama: k.name }));
    const adaTanpaKategori = produk.some(
      (p) => !p.kategoriId || !kategori.some((k) => k.id === p.kategoriId)
    );
    if (tab.length > 0 && adaTanpaKategori) {
      tab.push({ id: "lainnya", nama: "Lainnya" });
    }
    return tab;
  }, [produk, kategori]);

  const produkTampil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    const idKategori = new Set(kategori.map((k) => k.id));
    return produkHarga.filter((p) => {
      const cocokKategori =
        kategoriAktif === "semua"
          ? true
          : kategoriAktif === "lainnya"
            ? !p.kategoriId || !idKategori.has(p.kategoriId)
            : p.kategoriId === kategoriAktif;
      return cocokKategori && (!q || p.nama.toLowerCase().includes(q));
    });
  }, [produkHarga, kategori, kategoriAktif, cari]);

  const detail = useMemo(
    () => produkHarga.find((p) => p.id === produkDipilihId) ?? null,
    [produkHarga, produkDipilihId]
  );

  const qtyProduk = (produkId: string) =>
    keranjang.filter((b) => b.produkId === produkId).reduce((n, b) => n + b.qty, 0);

  const qtyBaris = (produkId: string, opsiIds: string[]) =>
    keranjang.find((b) => buatKunci(b.produkId, b.opsiIds) === buatKunci(produkId, opsiIds))
      ?.qty ?? 0;

  /** Tambah/kurangi satu baris keranjang. Membaca penyimpanan terbaru, bukan state. */
  const ubahKeranjang = (p: Produk, opsiIds: string[], delta: number) => {
    const sekarang = bacaKeranjang(id);
    const kunci = buatKunci(p.id, opsiIds);
    const totalProduk = sekarang
      .filter((b) => b.produkId === p.id)
      .reduce((n, b) => n + b.qty, 0);
    const baris = sekarang.find((b) => buatKunci(b.produkId, b.opsiIds) === kunci);
    const batasTambah = (p.stok ?? 99) - totalProduk;
    const perubahan = delta > 0 ? Math.max(0, Math.min(delta, batasTambah)) : delta;
    if (perubahan === 0) return;
    const qtyBaru = Math.min(99, (baris?.qty ?? 0) + perubahan);

    let hasil: BarisKeranjang[];
    if (!baris) {
      if (qtyBaru <= 0) return;
      hasil = [...sekarang, { produkId: p.id, opsiIds: [...opsiIds].sort(), qty: qtyBaru }];
    } else if (qtyBaru <= 0) {
      hasil = sekarang.filter((b) => b !== baris);
    } else {
      hasil = sekarang.map((b) => (b === baris ? { ...b, qty: qtyBaru } : b));
    }
    tulisKeranjang(id, hasil);
  };

  // ---- Lembar detail ----

  const bukaProduk = (pid: string) => {
    setProdukDipilihId(pid);
    setPilihan({});
    setJumlah(1);
  };

  const togglePilihan = (g: Grup, oid: string) => {
    setPilihan((prev) => {
      const cur = prev[g.id] ?? [];
      const mx = maksGrup(g);
      if (mx === 1) {
        if (g.wajib) return { ...prev, [g.id]: [oid] };
        return { ...prev, [g.id]: cur[0] === oid ? [] : [oid] };
      }
      if (cur.includes(oid)) {
        return { ...prev, [g.id]: cur.filter((x) => x !== oid) };
      }
      if (cur.length >= mx) return prev;
      return { ...prev, [g.id]: [...cur, oid] };
    });
  };

  const pilihanValid = detail
    ? detail.grup.every((g) => {
        const n = (pilihan[g.id] ?? []).length;
        return n >= minGrup(g) && n <= maksGrup(g);
      })
    : false;
  const deltaPilihan = detail
    ? detail.grup
        .flatMap((g) => g.opsi.filter((o) => (pilihan[g.id] ?? []).includes(o.id)))
        .reduce((n, o) => n + o.selisih, 0)
    : 0;
  const sisaStok = detail
    ? Math.max(Math.min(99, (detail.stok ?? 99) - qtyProduk(detail.id)), 0)
    : 0;
  const jumlahDipakai = Math.min(jumlah, Math.max(sisaStok, 1));

  // ---- Tampilan ----

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="px-1 text-base font-bold text-gray-900">
          Produk{" "}
          {!memuat && !galat && (
            <span className="text-sm font-normal text-gray-500">
              ({produk.length})
            </span>
          )}
        </h2>
        {produk.length > 0 && (
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={cari}
              onChange={(e) => setCari(e.target.value)}
              placeholder="Cari produk"
              aria-label="Cari produk"
              className="w-full rounded-xl border border-gray-100 bg-white py-2 pl-10 pr-3 text-sm shadow-sm outline-none transition placeholder:text-gray-400 focus:border-orange-200 focus:ring-4 focus:ring-orange-100"
            />
          </div>
        )}
      </div>

      {tabKategori.length > 0 && (
        <div className={`flex gap-2 overflow-x-auto py-0.5 ${SEMBUNYIKAN_SCROLLBAR}`}>
          {[{ id: "semua", nama: "Semua" }, ...tabKategori].map((k) => (
            <button
              key={k.id}
              onClick={() => setKategoriAktif(k.id)}
              aria-pressed={kategoriAktif === k.id}
              className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-all duration-200 md:text-sm ${
                kategoriAktif === k.id ? PIL_AKTIF : PIL_NONAKTIF
              }`}
            >
              {k.nama}
            </button>
          ))}
        </div>
      )}

      {!idValid ? (
        <div className="rounded-3xl border border-gray-100 bg-white px-6 py-12 text-center text-sm text-gray-500 shadow-sm">
          Toko tidak ditemukan.
        </div>
      ) : memuat ? (
        <div className="grid animate-pulse grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div
              key={i}
              className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"
            >
              <div className="aspect-square bg-gray-100" />
              <div className="space-y-2 p-3">
                <div className="h-3.5 w-3/4 rounded bg-gray-100" />
                <div className="h-3 w-1/2 rounded bg-gray-100" />
              </div>
            </div>
          ))}
        </div>
      ) : galat ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-gray-100 bg-white px-6 py-12 text-center shadow-sm">
          <p className="font-semibold text-gray-900">Gagal memuat produk</p>
          <p className="text-sm text-gray-500">
            Periksa koneksimu, lalu coba lagi.
          </p>
          <button
            onClick={() => setCobaLagi((n) => n + 1)}
            className="rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-600"
          >
            Coba lagi
          </button>
        </div>
      ) : produkTampil.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-gray-100 bg-white px-6 py-12 text-center shadow-sm">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-500">
            <Package className="h-7 w-7" />
          </span>
          <p className="text-sm text-gray-500">
            {produk.length === 0
              ? "Toko ini belum menambahkan produk"
              : "Tidak ada produk yang cocok"}
          </p>
          {produk.length > 0 && (cari || kategoriAktif !== "semua") && (
            <button
              onClick={() => {
                setCari("");
                setKategoriAktif("semua");
              }}
              className="rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 text-xs font-medium text-orange-600 transition-colors hover:bg-orange-100"
            >
              Reset filter
            </button>
          )}
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {produkTampil.map((p) => {
            const qtyPolos = qtyBaris(p.id, []);
            const total = qtyProduk(p.id);
            const penuh = p.stok !== null && total >= p.stok;
            return (
              <li
                key={p.id}
                className="flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"
              >
                <button
                  onClick={() => bukaProduk(p.id)}
                  className="block w-full flex-1 text-left transition-colors hover:bg-gray-50/60"
                >
                  <div className="relative aspect-square bg-gray-100">
                    {p.gambar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.gambar}
                        alt={p.nama}
                        loading="lazy"
                        className={`h-full w-full object-cover ${
                          p.habis ? "opacity-50 grayscale" : ""
                        }`}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-gray-300">
                        <ImageOff className="h-8 w-8" />
                      </div>
                    )}
                    {p.habis && (
                      <span className="absolute left-2 top-2 rounded-full bg-gray-900/80 px-2.5 py-0.5 text-[11px] font-medium text-white">
                        Habis
                      </span>
                    )}
                    {!p.habis && p.labelDiskon && (
                      <span className="absolute left-2 top-2 rounded-full bg-red-500 px-2.5 py-0.5 text-[11px] font-bold text-white shadow-sm">
                        {p.labelDiskon}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1 p-3 pb-2">
                    <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-gray-900">
                      {p.nama}
                    </h3>
                    <p className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
                      <b className="text-orange-600">{formatRupiah(p.hargaAkhir)}</b>
                      {p.labelDiskon && (
                        <s className="text-xs text-gray-400">
                          {formatRupiah(p.harga)}
                        </s>
                      )}
                    </p>
                  </div>
                </button>

                {bisaPesan && (
                  <div className="px-3 pb-3">
                    {p.habis ? (
                      <p className="rounded-xl bg-gray-100 py-2 text-center text-xs font-medium text-gray-400">
                        Habis
                      </p>
                    ) : !bisaDipesan(p) ? (
                      <p className="rounded-xl bg-gray-100 py-2 text-center text-xs font-medium text-gray-400">
                        Belum bisa dipesan
                      </p>
                    ) : p.grup.length > 0 ? (
                      <button
                        onClick={() => bukaProduk(p.id)}
                        className="w-full rounded-xl border border-orange-200 bg-orange-50 py-2 text-xs font-semibold text-orange-600 transition-colors hover:bg-orange-100"
                      >
                        {total > 0 ? `Pilih lagi · ${total} di keranjang` : "Pilih"}
                      </button>
                    ) : qtyPolos === 0 ? (
                      <button
                        onClick={() => ubahKeranjang(p, [], 1)}
                        disabled={penuh}
                        className="flex w-full items-center justify-center gap-1 rounded-xl border border-orange-200 bg-orange-50 py-2 text-xs font-semibold text-orange-600 transition-colors hover:bg-orange-100 disabled:opacity-50"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Tambah
                      </button>
                    ) : (
                      <Stepper
                        qty={qtyPolos}
                        penuh={penuh}
                        onKurang={() => ubahKeranjang(p, [], -1)}
                        onTambah={() => ubahKeranjang(p, [], 1)}
                      />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* LEMBAR DETAIL PRODUK */}
      {detail && (
        <div
          className="fixed inset-0 z-[60] flex items-end bg-black/40 md:items-center md:justify-center"
          onClick={() => setProdukDipilihId(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={detail.nama}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl md:max-w-md md:rounded-3xl"
          >
            <div className="relative aspect-[4/3] bg-gray-100">
              {detail.gambar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={detail.gambar}
                  alt={detail.nama}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-gray-300">
                  <ImageOff className="h-10 w-10" />
                </div>
              )}
              <button
                onClick={() => setProdukDipilihId(null)}
                aria-label="Tutup"
                className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-gray-600 shadow-sm transition-colors hover:bg-white hover:text-gray-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="space-y-1">
                <h2 className="text-lg font-bold text-gray-900">{detail.nama}</h2>
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <b className="text-xl text-orange-600">
                    {formatRupiah(detail.hargaAkhir)}
                  </b>
                  {detail.labelDiskon && (
                    <>
                      <s className="text-sm text-gray-400">
                        {formatRupiah(detail.harga)}
                      </s>
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-500">
                        {detail.labelDiskon}
                      </span>
                    </>
                  )}
                </p>
                {detail.habis && (
                  <p className="text-sm font-medium text-gray-500">
                    Produk ini sedang habis.
                  </p>
                )}
                {!detail.habis && !bisaDipesan(detail) && (
                  <p className="text-sm font-medium text-gray-500">
                    Produk ini belum bisa dipesan karena pilihan wajibnya habis.
                  </p>
                )}
              </div>

              {detail.deskripsi && (
                <p className="whitespace-pre-line text-sm leading-relaxed text-gray-600">
                  {detail.deskripsi}
                </p>
              )}

              {detail.grup.map((g) => {
                const terpilih = pilihan[g.id] ?? [];
                const radio = maksGrup(g) === 1;
                return (
                  <fieldset key={g.id} className="space-y-2">
                    <legend className="flex w-full items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-gray-900">
                        {g.nama}
                      </span>
                      <span
                        className={`text-xs ${
                          minGrup(g) > terpilih.length
                            ? "text-orange-600"
                            : "text-gray-500"
                        }`}
                      >
                        {aturanPilih(g)}
                      </span>
                    </legend>
                    <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-100">
                      {g.opsi.map((o) => {
                        const aktif = terpilih.includes(o.id);
                        const kunciMax =
                          !radio && !aktif && terpilih.length >= maksGrup(g);
                        return (
                          <li key={o.id}>
                            <button
                              type="button"
                              role={radio ? "radio" : "checkbox"}
                              aria-checked={aktif}
                              disabled={!o.tersedia || kunciMax}
                              onClick={() => togglePilihan(g, o.id)}
                              className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                            >
                              <span
                                className={`flex h-5 w-5 shrink-0 items-center justify-center border-2 transition-colors ${
                                  radio ? "rounded-full" : "rounded-md"
                                } ${
                                  aktif
                                    ? "border-orange-500 bg-orange-500 text-white"
                                    : "border-gray-300 bg-white"
                                }`}
                              >
                                {aktif && <Check className="h-3 w-3" />}
                              </span>
                              <span
                                className={`flex-1 ${
                                  o.tersedia
                                    ? "text-gray-800"
                                    : "text-gray-400 line-through"
                                }`}
                              >
                                {o.nama}
                              </span>
                              <span className="text-xs text-gray-500">
                                {!o.tersedia
                                  ? "Habis"
                                  : o.selisih > 0
                                    ? `+${formatRupiah(o.selisih)}`
                                    : o.selisih < 0
                                      ? `-${formatRupiah(-o.selisih)}`
                                      : "Gratis"}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </fieldset>
                );
              })}
            </div>

            <div className="sticky bottom-0 space-y-3 border-t border-gray-100 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              {!bisaPesan ? (
                <p className="text-center text-sm text-gray-500">
                  Toko ini belum menerima pesanan online.
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">Jumlah</span>
                    <div className="w-32">
                      <Stepper
                        qty={jumlahDipakai}
                        penuh={jumlahDipakai >= sisaStok}
                        onKurang={() => setJumlah((j) => Math.max(1, j - 1))}
                        onTambah={() =>
                          setJumlah((j) => Math.min(j + 1, Math.max(sisaStok, 1)))
                        }
                      />
                    </div>
                  </div>
                  {sisaStok <= 0 && !detail.habis && (
                    <p className="text-xs text-amber-600">
                      Jumlah di keranjang sudah mencapai stok yang tersedia.
                    </p>
                  )}
                  <button
                    disabled={
                      !pilihanValid ||
                      sisaStok <= 0 ||
                      detail.habis ||
                      !bisaDipesan(detail)
                    }
                    onClick={() => {
                      ubahKeranjang(
                        detail,
                        Object.values(pilihan).flat(),
                        jumlahDipakai
                      );
                      setProdukDipilihId(null);
                    }}
                    className={TOMBOL_UTAMA}
                  >
                    {pilihanValid
                      ? `Tambah ke keranjang · ${formatRupiah(
                          Math.max(detail.hargaAkhir + deltaPilihan, 0) * jumlahDipakai
                        )}`
                      : "Lengkapi pilihan dulu"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Komponen kecil (hanya dipakai di file ini) ----------

function Stepper({
  qty,
  penuh,
  onKurang,
  onTambah,
}: {
  qty: number;
  penuh: boolean;
  onKurang: () => void;
  onTambah: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-orange-200 bg-orange-50 p-1">
      <button
        type="button"
        onClick={onKurang}
        aria-label="Kurangi"
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-orange-600 shadow-sm transition-transform active:scale-95"
      >
        <Minus className="h-4 w-4" />
      </button>
      <span
        className="min-w-8 text-center text-sm font-semibold text-gray-900"
        aria-live="polite"
      >
        {qty}
      </span>
      <button
        type="button"
        onClick={onTambah}
        disabled={penuh}
        aria-label="Tambah"
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-orange-600 shadow-sm transition-transform active:scale-95 disabled:opacity-40"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
