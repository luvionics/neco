"use client";

/**
 * KERANJANG & PEMESANAN — komponen mandiri.
 *
 * Tidak menerima props. Berisi: bar keranjang mengambang, lembar keranjang
 * dengan form pemesanan (antar / ambil / di meja), pengiriman pesanan, dan
 * lembar status pesanan. Data toko dan produk yang dibutuhkan diambil sendiri
 * dari database, hanya saat keranjang berisi atau lembarnya dibuka.
 *
 * Data pemesan (nama, WhatsApp, alamat) diambil dari tabel profiles. Jika data
 * wajib belum lengkap, pembeli diminta melengkapinya lewat FormProfil dulu.
 *
 * Membaca dari URL: id toko, ?meja=<nomor> (dari kode QR meja), dan
 * ?pesanan=<id> (untuk membuka status pesanan). Parameter lain di URL
 * dibiarkan apa adanya.
 *
 * ---------------------------------------------------------------------------
 * KONTRAK KERANJANG (satu-satunya hal yang sama dengan ProdukToko.tsx)
 * Kedua file tidak saling mengimpor. Mereka hanya bertukar isi keranjang
 * lewat penyimpanan browser:
 *   - kunci   : `keranjang:<id toko>` di localStorage
 *   - isi     : JSON array [{ produkId: string, opsiIds: string[], qty: number }]
 *   - kabar   : setelah menulis, kirim `window.dispatchEvent(new Event("keranjang:berubah"))`
 * Harga, diskon, stok, dan nama TIDAK disimpan di keranjang; file ini
 * mengambilnya sendiri dari database. Jika kontrak ini diubah, ubah di
 * kedua file.
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Store,
  Utensils,
  Bike,
  MapPin,
  Loader2,
  LocateFixed,
  Check,
  ImageOff,
  MessageCircle,
  X,
  ShoppingBag,
  ShoppingCart,
  Plus,
  Minus,
  Copy,
  Trash2,
} from "lucide-react";
import FormProfil from "@/app/akun/components/FormProfil";
import {
  KOLOM_DB,
  PROFIL_KOSONG,
  dariDb,
  formatWa,
  keDb,
  type Profil,
} from "@/app/akun/components/profil";

// ---------- Tipe ----------

type BarisKeranjang = { produkId: string; opsiIds: string[]; qty: number };

type BarisToko = {
  id: string;
  city: string | null;
  is_open: boolean;
  opening_hours: unknown;
  min_order: number | string | null;
  delivery_fee: number | string | null;
  delivery_enabled: boolean;
  pickup_enabled: boolean;
  dine_in_enabled: boolean;
  punya_rekening: boolean;
};

type BarisProduk = {
  id: string;
  name: string;
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

type BarisOpsi = {
  id: string;
  name: string;
  price_delta: number;
  is_available: boolean;
};

type DataProduk = {
  id: string;
  nama: string;
  harga: number;
  gambar: string | null;
  habis: boolean;
  /** null = stok tidak dilacak */
  stok: number | null;
  diskonTipe: string | null;
  diskonNilai: number;
  diskonMulai: string | null;
  diskonSelesai: string | null;
};

type DataOpsi = { id: string; nama: string; selisih: number; tersedia: boolean };

type ItemKeranjang = {
  kunci: string;
  p: DataProduk;
  opsi: DataOpsi[];
  qty: number;
  /** harga satuan setelah diskon, termasuk opsi */
  satuan: number;
  /** harga satuan sebelum diskon, termasuk opsi */
  kotor: number;
  ket: string;
};

type Mode = "delivery" | "pickup" | "dine_in";
type Lokasi = { lat: number; lng: number };
type JamBuka = { open?: string; close?: string } | null;

/** Hasil fungsi database lacak_pesanan. */
type Lacak = {
  order_id: string;
  order_number: string;
  shop_id: string;
  shop_name: string | null;
  shop_whatsapp: string | null;
  order_type: Mode;
  status: string;
  payment_status: string;
  payment_method: string | null;
  customer_name: string | null;
  notes: string | null;
  subtotal: number;
  discount: number;
  shipping_fee: number;
  total: number;
  created_at: string;
  items: { nama: string; qty: number; harga: number; catatan: string | null }[];
  pickup_code: string | null;
  table_number: string | null;
  delivery: {
    alamat: string | null;
    catatan: string | null;
    kurir: string | null;
    resi: string | null;
  } | null;
  rekening: { bank: string; nomor: string; nama: string }[];
  riwayat: { status: string; waktu: string }[];
};

// ---------- Konstanta ----------

// Rute halaman masuk (belum login)
const RUTE_MASUK = "/login";

const INPUT =
  "w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-gray-400 focus:border-orange-300 focus:ring-4 focus:ring-orange-100";

const TOMBOL_UTAMA =
  "flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-sm";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EVENT_KERANJANG = "keranjang:berubah";

const LANGKAH: Record<Mode, string[]> = {
  delivery: ["pending", "confirmed", "preparing", "on_delivery", "completed"],
  pickup: ["pending", "confirmed", "preparing", "ready", "completed"],
  dine_in: ["pending", "confirmed", "preparing", "ready", "completed"],
};

const LABEL_MODE: Record<Mode, string> = {
  delivery: "Diantar ke rumah",
  pickup: "Ambil di toko",
  dine_in: "Makan di tempat",
};

const LABEL_METODE: Record<string, string> = {
  cod: "Bayar di tempat (COD)",
  cash: "Bayar tunai di toko",
  transfer: "Transfer bank",
};

const LABEL_BAYAR: Record<string, string> = {
  unpaid: "Belum dibayar",
  partial: "Dibayar sebagian",
  paid: "Lunas",
  refunded: "Dikembalikan",
};

// ---------- Fungsi bantu ----------

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatWaktu(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Hari (mon, tue, ...) dan menit sejak tengah malam menurut WIB. */
function sekarangWib() {
  const bagian = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const ambil = (tipe: string) =>
    bagian.find((p) => p.type === tipe)?.value ?? "";
  return {
    hari: ambil("weekday").toLowerCase().slice(0, 3),
    menit: Number(ambil("hour")) * 60 + Number(ambil("minute")),
  };
}

function keMenit(s?: string) {
  if (!s) return null;
  const [h, m] = s.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

/** Buka atau tutup sekarang, dari is_open dan opening_hours hari ini. */
function sedangBuka(
  isOpen: boolean,
  jam: unknown,
  now: { hari: string; menit: number }
) {
  const peta =
    jam && typeof jam === "object" ? (jam as Record<string, JamBuka>) : null;
  const hariIni = peta ? peta[now.hari] : undefined;
  const mulai = keMenit(hariIni?.open);
  const selesai = keMenit(hariIni?.close);

  if (!isOpen) return false;
  if (peta && hariIni === null) return false; // hari libur
  if (mulai === null || selesai === null) return true;
  return mulai <= selesai
    ? now.menit >= mulai && now.menit < selesai
    : now.menit >= mulai || now.menit < selesai; // buka melewati tengah malam
}

/** Nomor WhatsApp/telepon Indonesia ke format internasional tanpa tanda "+". */
function nomorInternasional(nomor: string) {
  const digit = nomor.replace(/\D/g, "");
  if (digit.startsWith("0")) return `62${digit.slice(1)}`;
  if (digit.startsWith("8")) return `62${digit}`;
  return digit;
}

/**
 * Harga setelah diskon. Aturannya sama dengan fungsi buat_pesanan di database:
 * diskon 'percent' dibulatkan per satuan, selain itu potongan rupiah.
 */
function hargaSetelahDiskon(p: DataProduk, sekarang: number) {
  const nilai = p.diskonNilai;
  const mulaiOk =
    !p.diskonMulai || new Date(p.diskonMulai).getTime() <= sekarang;
  const selesaiOk =
    !p.diskonSelesai || new Date(p.diskonSelesai).getTime() >= sekarang;
  if (!p.diskonTipe || !(nilai > 0) || !mulaiOk || !selesaiOk) return p.harga;
  const persen = p.diskonTipe === "percent";
  const potongan = Math.min(
    Math.max(persen ? Math.round((p.harga * nilai) / 100) : nilai, 0),
    p.harga
  );
  return p.harga - potongan;
}

function labelStatus(status: string, tipe: Mode) {
  switch (status) {
    case "pending":
      return "Menunggu konfirmasi toko";
    case "confirmed":
      return "Pesanan diterima toko";
    case "preparing":
      return "Sedang disiapkan";
    case "ready":
      return tipe === "pickup"
        ? "Siap diambil"
        : tipe === "dine_in"
          ? "Siap disajikan"
          : "Siap diantar";
    case "on_delivery":
      return "Sedang diantar";
    case "completed":
      return "Selesai";
    case "cancelled":
      return "Dibatalkan";
    default:
      return status;
  }
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

export default function Keranjang() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const idValid = UUID.test(id ?? "");

  // ?meja=5 berasal dari kode QR di meja. ?pesanan=<id> membuka status pesanan.
  const mejaParam = (searchParams.get("meja") ?? "").trim().slice(0, 20);
  const pesananParam = searchParams.get("pesanan") ?? "";
  const pesananAktif = UUID.test(pesananParam) ? pesananParam : "";

  const [baris, setBaris] = useState<BarisKeranjang[]>([]);
  const [sheetTerbuka, setSheetTerbuka] = useState(false);

  const [toko, setToko] = useState<BarisToko | null>(null);
  const [produk, setProduk] = useState<DataProduk[]>([]);
  const [opsi, setOpsi] = useState<DataOpsi[]>([]);
  const [memuat, setMemuat] = useState(false);
  const [galatData, setGalatData] = useState("");
  const [cobaLagi, setCobaLagi] = useState(0);

  // Formulir pesanan
  const [mode, setMode] = useState<Mode | "">("");
  const [patokan, setPatokan] = useState("");
  const [sertakanLokasi, setSertakanLokasi] = useState(false);
  const [lokasi, setLokasi] = useState<Lokasi | null>(null);
  const [statusLokasi, setStatusLokasi] = useState<
    "diam" | "meminta" | "ditolak" | "tidak-ada"
  >("diam");
  const [meja, setMeja] = useState(mejaParam);
  const [tamu, setTamu] = useState(1);
  const [catatan, setCatatan] = useState("");
  const [bayar, setBayar] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galatKirim, setGalatKirim] = useState("");

  const [pesananTerakhir, setPesananTerakhir] = useState("");

  // Data pemesan dari tabel profiles
  const [statusProfil, setStatusProfil] = useState<"memuat" | "tamu" | "siap">(
    "memuat"
  );
  const [userId, setUserId] = useState<string | null>(null);
  const [profil, setProfil] = useState<Profil>(PROFIL_KOSONG);
  const [daftarArea, setDaftarArea] = useState<string[]>([]);
  // null = form tertutup; mode dikunci saat form dibuka
  const [formProfil, setFormProfil] = useState<null | "ubah" | "lengkapi">(null);

  // Nilai yang dikirim ke pesanan, semuanya berasal dari profil
  const nama = (profil.penerima || profil.nama).trim();
  const telepon = profil.whatsapp.trim();
  const alamat = profil.alamat.trim();
  const kelurahan = profil.area.trim();
  const kecamatan = profil.kecamatan.trim();
  const kota = (profil.kota || toko?.city || "").trim();

  // Penanda menit berjalan, agar status buka/tutup dan diskon ikut diperbarui
  const [menit, setMenit] = useState(() => Math.floor(Date.now() / 60000));
  useEffect(() => {
    const timer = setInterval(
      () => setMenit(Math.floor(Date.now() / 60000)),
      60000
    );
    return () => clearInterval(timer);
  }, []);

  // Ikuti isi keranjang (ditulis oleh file ini maupun ProdukToko.tsx)
  useEffect(() => {
    if (!idValid) return;
    const segarkan = () => setBaris(bacaKeranjang(id));
    segarkan();
    window.addEventListener(EVENT_KERANJANG, segarkan);
    window.addEventListener("storage", segarkan);
    return () => {
      window.removeEventListener(EVENT_KERANJANG, segarkan);
      window.removeEventListener("storage", segarkan);
    };
  }, [id, idValid]);

  // Data pemesan diambil dari tabel profiles (diperbarui setiap lembar dibuka)
  useEffect(() => {
    if (!sheetTerbuka) return;
    let batal = false;

    async function muatProfil() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (batal) return;
      if (!user) {
        setUserId(null);
        setStatusProfil("tamu");
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select(KOLOM_DB)
        .eq("id", user.id)
        .maybeSingle();
      if (batal) return;

      const meta = user.user_metadata ?? {};
      const namaMeta =
        (meta.nama as string) ||
        (meta.full_name as string) ||
        user.email?.split("@")[0] ||
        "";

      setUserId(user.id);
      setProfil(dariDb(data, namaMeta));
      setStatusProfil("siap");
    }

    void muatProfil();
    return () => {
      batal = true;
    };
  }, [supabase, sheetTerbuka]);

  // Pulihkan pesanan terakhir dari browser
  useEffect(() => {
    try {
      const terakhir = localStorage.getItem(`pesanan-terakhir:${id}`);
      if (terakhir && UUID.test(terakhir)) setPesananTerakhir(terakhir);
    } catch {
      /* penyimpanan browser tidak tersedia */
    }
  }, [id]);

  // Daftar produk dan opsi yang ada di keranjang, sebagai satu kunci
  const kunciData = useMemo(() => {
    const idsProduk = Array.from(new Set(baris.map((b) => b.produkId))).sort();
    const idsOpsi = Array.from(new Set(baris.flatMap((b) => b.opsiIds))).sort();
    return `${idsProduk.join(",")}#${idsOpsi.join(",")}`;
  }, [baris]);

  // Muat data toko dan produk, hanya jika keranjang berisi atau lembarnya dibuka
  useEffect(() => {
    if (!idValid) return;
    const [bagianProduk, bagianOpsi] = kunciData.split("#");
    const ids = bagianProduk ? bagianProduk.split(",") : [];
    const idsOpsi = bagianOpsi ? bagianOpsi.split(",") : [];
    if (ids.length === 0 && !sheetTerbuka) return;

    let batal = false;

    async function muat() {
      setMemuat(true);
      setGalatData("");

      const [rToko, rProduk, rOpsi] = await Promise.all([
        supabase.rpc("detail_toko_publik", { p_id: id }),
        ids.length > 0
          ? supabase
              .from("products")
              .select(
                "id, name, price, image_url, track_stock, stock, is_available, discount_type, discount_value, discount_starts_at, discount_ends_at"
              )
              .eq("shop_id", id)
              .eq("is_active", true)
              .in("id", ids)
          : Promise.resolve(null),
        idsOpsi.length > 0
          ? supabase
              .from("product_options")
              .select("id, name, price_delta, is_available")
              .eq("shop_id", id)
              .in("id", idsOpsi)
          : Promise.resolve(null),
      ]);
      if (batal) return;

      if (rToko.error) {
        setGalatData(rToko.error.message);
        setMemuat(false);
        return;
      }
      if (rProduk?.error || rOpsi?.error) {
        setGalatData("Gagal memuat isi keranjang.");
        setMemuat(false);
        return;
      }

      const barisProduk = (rProduk?.data ?? []) as BarisProduk[];
      const barisOpsi = (rOpsi?.data ?? []) as BarisOpsi[];

      setToko(((rToko.data ?? []) as BarisToko[])[0] ?? null);
      setProduk(
        barisProduk.map((p) => ({
          id: p.id,
          nama: p.name,
          harga: Number(p.price) || 0,
          gambar: p.image_url,
          habis: !p.is_available || (p.track_stock && p.stock <= 0),
          stok: p.track_stock ? Math.max(p.stock, 0) : null,
          diskonTipe: p.discount_type,
          diskonNilai: Number(p.discount_value) || 0,
          diskonMulai: p.discount_starts_at,
          diskonSelesai: p.discount_ends_at,
        }))
      );
      setOpsi(
        barisOpsi.map((o) => ({
          id: o.id,
          nama: o.name,
          selisih: o.price_delta,
          tersedia: o.is_available,
        }))
      );
      setMemuat(false);

      // Buang isi keranjang yang produk atau opsinya sudah tidak ada. Hanya
      // yang ikut diminta di atas yang dinilai, agar item yang baru ditambahkan
      // saat permintaan berjalan tidak ikut terbuang.
      const produkAda = new Set(barisProduk.map((p) => p.id));
      const opsiAda = new Set(barisOpsi.map((o) => o.id));
      const diminta = new Set(ids);
      const opsiDiminta = new Set(idsOpsi);
      const terbaru = bacaKeranjang(id);
      const bersih = terbaru.filter(
        (b) =>
          !(diminta.has(b.produkId) && !produkAda.has(b.produkId)) &&
          b.opsiIds.every((o) => !opsiDiminta.has(o) || opsiAda.has(o))
      );
      if (bersih.length !== terbaru.length) tulisKeranjang(id, bersih);
    }

    void muat();
    return () => {
      batal = true;
    };
  }, [supabase, id, idValid, kunciData, sheetTerbuka, cobaLagi]);

  const ubahUrl = useCallback(
    (pesananId?: string) => {
      const q = new URLSearchParams(searchParams.toString());
      if (pesananId) q.set("pesanan", pesananId);
      else q.delete("pesanan");
      const qs = q.toString();
      return `/toko/${id}${qs ? `?${qs}` : ""}`;
    },
    [id, searchParams]
  );

  const tutupPesanan = useCallback(() => {
    router.replace(ubahUrl(), { scroll: false });
  }, [router, ubahUrl]);

  // Tutup lembar paling atas dengan tombol Escape
  useEffect(() => {
    if (!sheetTerbuka && !pesananAktif) return;
    const tutup = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (formProfil) return; // Esc ditangani FormProfil
      if (sheetTerbuka) setSheetTerbuka(false);
      else tutupPesanan();
    };
    window.addEventListener("keydown", tutup);
    return () => window.removeEventListener("keydown", tutup);
  }, [sheetTerbuka, pesananAktif, tutupPesanan, formProfil]);

  const mintaLokasi = () => {
    if (!("geolocation" in navigator)) {
      setStatusLokasi("tidak-ada");
      return;
    }
    setStatusLokasi("meminta");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLokasi({ lat: p.coords.latitude, lng: p.coords.longitude });
        setStatusLokasi("diam");
      },
      () => setStatusLokasi("ditolak"),
      { timeout: 10000, maximumAge: 300000 }
    );
  };

  // ---- Turunan data ----

  const isiKeranjang = useMemo<ItemKeranjang[]>(() => {
    // `menit` hanya pemicu hitung ulang masa berlaku diskon
    void menit;
    const sekarang = Date.now();
    const petaProduk = new Map(produk.map((p) => [p.id, p]));
    const petaOpsi = new Map(opsi.map((o) => [o.id, o]));
    const hasil: ItemKeranjang[] = [];
    for (const b of baris) {
      const p = petaProduk.get(b.produkId);
      if (!p) continue;
      const opsiBaris = b.opsiIds
        .map((oid) => petaOpsi.get(oid))
        .filter((o): o is DataOpsi => Boolean(o));
      const delta = opsiBaris.reduce((n, o) => n + o.selisih, 0);
      hasil.push({
        kunci: buatKunci(b.produkId, b.opsiIds),
        p,
        opsi: opsiBaris,
        qty: b.qty,
        satuan: Math.max(hargaSetelahDiskon(p, sekarang) + delta, 0),
        kotor: Math.max(p.harga + delta, 0),
        ket: opsiBaris.map((o) => o.nama).join(", "),
      });
    }
    return hasil;
  }, [baris, produk, opsi, menit]);

  /** Semua baris keranjang sudah punya data produknya. */
  const lengkap = baris.length === isiKeranjang.length;

  const jumlahBarang = baris.reduce((n, b) => n + b.qty, 0);
  const subtotalKotor = isiKeranjang.reduce((n, i) => n + i.kotor * i.qty, 0);
  const totalBelanja = isiKeranjang.reduce((n, i) => n + i.satuan * i.qty, 0);
  const hemat = subtotalKotor - totalBelanja;
  const minOrder = Number(toko?.min_order) || 0;
  const ongkir = Number(toko?.delivery_fee) || 0;

  const tokoBuka = useMemo(() => {
    // `menit` hanya pemicu hitung ulang status buka/tutup
    void menit;
    return toko ? sedangBuka(toko.is_open, toko.opening_hours, sekarangWib()) : false;
  }, [toko, menit]);

  const modeTersedia = useMemo(() => {
    if (!toko) return [];
    return [
      { id: "delivery" as Mode, label: "Diantar", ikon: Bike, aktif: toko.delivery_enabled },
      { id: "pickup" as Mode, label: "Ambil sendiri", ikon: Store, aktif: toko.pickup_enabled },
      { id: "dine_in" as Mode, label: "Di meja", ikon: Utensils, aktif: toko.dine_in_enabled },
    ].filter((m) => m.aktif);
  }, [toko]);

  const modeAktif: Mode | "" =
    modeTersedia.find((m) => m.id === mode)?.id ??
    (mejaParam && modeTersedia.some((m) => m.id === "dine_in")
      ? "dine_in"
      : (modeTersedia[0]?.id ?? ""));

  const ongkirTerpakai = modeAktif === "delivery" ? ongkir : 0;
  const totalAkhir = totalBelanja + ongkirTerpakai;

  // Data wajib untuk memesan; pesanan antar juga butuh alamat
  const kurangPesan: string[] = [];
  if (!profil.nama.trim()) kurangPesan.push("Nama");
  if (telepon.replace(/\D/g, "").length < 9) kurangPesan.push("Nomor WhatsApp");
  if (!kelurahan) kurangPesan.push("Area (desa/kelurahan)");
  if (modeAktif === "delivery" && !alamat) kurangPesan.push("Alamat lengkap");

  const pilihanBayar = useMemo(() => {
    const dasar =
      modeAktif === "delivery"
        ? { id: "cod", label: "Bayar di tempat (COD)", ket: "Bayar ke kurir saat pesanan sampai" }
        : modeAktif === "pickup"
          ? { id: "cash", label: "Bayar di toko", ket: "Bayar saat mengambil pesanan" }
          : { id: "cash", label: "Bayar di kasir", ket: "Bayar tunai ke kasir toko" };
    const hasil = [dasar];
    if (toko?.punya_rekening) {
      hasil.push({
        id: "transfer",
        label: "Transfer bank",
        ket: "Nomor rekening muncul setelah pesanan dikirim",
      });
    }
    return hasil;
  }, [modeAktif, toko]);
  const metodeBayar = pilihanBayar.some((x) => x.id === bayar)
    ? bayar
    : pilihanBayar[0].id;

  // ---- Mengubah keranjang. Membaca penyimpanan terbaru, bukan state. ----

  const ubahQty = (kunci: string, delta: number) => {
    const sekarang = bacaKeranjang(id);
    const target = sekarang.find((b) => buatKunci(b.produkId, b.opsiIds) === kunci);
    if (!target) return;
    const prod = produk.find((x) => x.id === target.produkId);
    const lain = sekarang
      .filter((b) => b.produkId === target.produkId && b !== target)
      .reduce((n, b) => n + b.qty, 0);
    const batas = Math.min(99, (prod?.stok ?? 99) - lain);
    const qty = Math.min(target.qty + delta, batas);
    tulisKeranjang(
      id,
      qty <= 0
        ? sekarang.filter((b) => b !== target)
        : sekarang.map((b) => (b === target ? { ...b, qty } : b))
    );
  };

  const hapusBaris = (kunci: string) =>
    tulisKeranjang(
      id,
      bacaKeranjang(id).filter((b) => buatKunci(b.produkId, b.opsiIds) !== kunci)
    );

  // ---- Profil pemesan ----

  // Dipanggil FormProfil. Kembalikan pesan galat, atau null bila berhasil.
  const simpanProfil = async (data: Profil): Promise<string | null> => {
    if (!userId) return "Sesi tidak ditemukan, muat ulang halaman";

    const barisProfil = { ...keDb(data), updated_at: new Date().toISOString() };

    const { data: hasil, error } = await supabase
      .from("profiles")
      .update(barisProfil)
      .eq("id", userId)
      .select("id");

    let galatDb = error;
    if (!error && (hasil?.length ?? 0) === 0) {
      const { error: errInsert } = await supabase
        .from("profiles")
        .insert({ id: userId, ...barisProfil });
      galatDb = errInsert;
    }

    if (galatDb) {
      if (galatDb.code === "23505") return "Username sudah dipakai, pilih yang lain";
      if (galatDb.code === "23514")
        return "Ada isian yang tidak sesuai format, periksa kembali";
      if (galatDb.code === "42501")
        return "Tidak punya izin menyimpan, periksa aturan RLS tabel profiles";
      return "Gagal menyimpan perubahan, coba lagi";
    }

    setProfil(data);
    setFormProfil(null);
    return null;
  };

  const bukaFormProfil = async () => {
    setFormProfil(kurangPesan.length > 0 ? "lengkapi" : "ubah");
    if (daftarArea.length === 0) {
      const { data } = await supabase
        .from("shops")
        .select("village")
        .not("village", "is", null)
        .limit(500);
      setDaftarArea(
        Array.from(
          new Set(
            (data ?? [])
              .map((s: { village: string | null }) => (s.village ?? "").trim())
              .filter(Boolean)
          )
        ).sort((a, b) => a.localeCompare(b, "id"))
      );
    }
  };

  // ---- Kirim pesanan ----

  const validasi = () => {
    if (isiKeranjang.length === 0) return "Keranjang masih kosong.";
    if (!lengkap) return "Isi keranjang masih dimuat. Coba lagi sebentar.";
    if (!modeAktif) return "Toko ini belum menerima pesanan online.";
    if (!tokoBuka) return "Toko sedang tutup. Coba lagi saat toko buka.";
    if (isiKeranjang.some((i) => i.p.habis))
      return "Ada produk yang sudah habis. Hapus dulu dari keranjang.";
    if (isiKeranjang.some((i) => i.opsi.some((o) => !o.tersedia)))
      return "Ada pilihan produk yang sudah habis. Hapus item itu dari keranjang.";
    if (statusProfil === "tamu") return "Masuk dulu untuk memesan.";
    if (statusProfil !== "siap") return "Data profil masih dimuat. Coba lagi sebentar.";
    if (kurangPesan.length > 0)
      return `Lengkapi data dulu: ${kurangPesan.join(", ")}.`;
    if (modeAktif === "dine_in" && meja.trim() === "")
      return "Nomor meja wajib diisi.";
    if (minOrder > 0 && totalBelanja < minOrder)
      return `Minimal pesanan ${formatRupiah(minOrder)}.`;
    return "";
  };

  const kirimPesanan = async () => {
    if (!toko || mengirim) return;
    const err = validasi();
    if (err) {
      setGalatKirim(err);
      return;
    }
    setMengirim(true);
    setGalatKirim("");

    const { data, error } = await supabase.rpc("buat_pesanan", {
      p_shop_id: toko.id,
      p_order_type: modeAktif,
      p_items: isiKeranjang.map((i) => ({
        product_id: i.p.id,
        qty: i.qty,
        option_ids: i.opsi.map((o) => o.id),
      })),
      p_customer_name: nama,
      p_customer_phone: telepon,
      p_payment_method: metodeBayar,
      p_notes: catatan.trim() || null,
      p_delivery:
        modeAktif === "delivery"
          ? {
              address_line: alamat,
              village: kelurahan,
              district: kecamatan,
              city: kota,
              notes: patokan.trim(),
              latitude: sertakanLokasi && lokasi ? lokasi.lat : null,
              longitude: sertakanLokasi && lokasi ? lokasi.lng : null,
            }
          : null,
      p_table_number: modeAktif === "dine_in" ? meja.trim() : null,
      p_guest_count: modeAktif === "dine_in" ? tamu : 1,
    });
    setMengirim(false);

    if (error) {
      setGalatKirim(error.message);
      return;
    }

    const hasil = data as { order_id: string };
    try {
      localStorage.setItem(`pesanan-terakhir:${id}`, hasil.order_id);
    } catch {
      /* penyimpanan browser tidak tersedia */
    }
    setPesananTerakhir(hasil.order_id);
    tulisKeranjang(id, []);
    setCatatan("");
    setSheetTerbuka(false);
    router.replace(ubahUrl(hasil.order_id), { scroll: false });
  };

  const hapusPesananTerakhir = () => {
    try {
      localStorage.removeItem(`pesanan-terakhir:${id}`);
    } catch {
      /* penyimpanan browser tidak tersedia */
    }
    setPesananTerakhir("");
  };

  if (!idValid) return null;

  const adaLembar = sheetTerbuka || Boolean(pesananAktif);

  return (
    <>
      {/* BAR MENGAMBANG: nomor meja, pesanan terakhir, keranjang */}
      {!adaLembar && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex flex-col items-center gap-2 px-3 md:bottom-6">
          {mejaParam && (
            <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-orange-100 bg-white px-3.5 py-1.5 text-xs text-gray-700 shadow-md">
              <Utensils className="h-3.5 w-3.5 text-orange-500" />
              Memesan dari <b>meja {mejaParam}</b>
            </div>
          )}

          {pesananTerakhir && (
            <div className="pointer-events-auto flex w-full max-w-lg items-center gap-3 rounded-2xl border border-orange-100 bg-white p-2.5 pl-3.5 text-sm shadow-md">
              <ShoppingBag className="h-5 w-5 shrink-0 text-orange-500" />
              <p className="min-w-0 flex-1 truncate text-gray-700">
                Kamu punya pesanan di toko ini
              </p>
              <button
                onClick={() =>
                  router.replace(ubahUrl(pesananTerakhir), { scroll: false })
                }
                className="shrink-0 rounded-full bg-orange-500 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-orange-600"
              >
                Lihat status
              </button>
              <button
                onClick={hapusPesananTerakhir}
                aria-label="Sembunyikan"
                className="shrink-0 pr-1 text-gray-400 transition-colors hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {jumlahBarang > 0 && (
            <button
              onClick={() => setSheetTerbuka(true)}
              className="pointer-events-auto flex w-full max-w-lg items-center gap-3 rounded-2xl bg-gradient-to-r from-orange-500 to-red-500 px-4 py-3 text-left text-white shadow-lg shadow-orange-500/30 transition-all active:scale-[0.99]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/20">
                <ShoppingCart className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-white/90">
                  {jumlahBarang} item
                </span>
                <span className="block text-sm font-bold">
                  {lengkap ? formatRupiah(totalBelanja) : "Menghitung..."}
                </span>
              </span>
              <span className="text-sm font-semibold">Lihat keranjang</span>
            </button>
          )}
        </div>
      )}

      {/* LEMBAR KERANJANG DAN PEMESANAN */}
      {sheetTerbuka && (
        <div
          className="fixed inset-0 z-[60] flex items-end bg-black/40 md:items-center md:justify-center"
          onClick={() => setSheetTerbuka(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Keranjang"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl md:max-w-lg md:rounded-3xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-5 py-4">
              <h2 className="text-lg font-bold text-gray-900">Keranjang</h2>
              <button
                onClick={() => setSheetTerbuka(false)}
                aria-label="Tutup"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {baris.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-500">
                  <ShoppingCart className="h-7 w-7" />
                </span>
                <p className="text-sm text-gray-500">Keranjangmu masih kosong</p>
                <button
                  onClick={() => setSheetTerbuka(false)}
                  className="rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-600"
                >
                  Pilih produk
                </button>
              </div>
            ) : galatData ? (
              <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
                <p className="font-semibold text-gray-900">Gagal memuat keranjang</p>
                <p role="alert" className="text-sm text-gray-500">
                  {galatData}
                </p>
                <button
                  onClick={() => setCobaLagi((n) => n + 1)}
                  className="rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-600"
                >
                  Coba lagi
                </button>
              </div>
            ) : !toko || !lengkap ? (
              <div className="flex items-center justify-center gap-2 px-6 py-16 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                {memuat ? "Memuat keranjang..." : "Menyiapkan keranjang..."}
              </div>
            ) : (
              <div className="space-y-5 p-5">
                {/* Isi keranjang */}
                <ul className="divide-y divide-gray-100">
                  {isiKeranjang.map((i) => (
                    <li key={i.kunci} className="flex gap-3 py-3 first:pt-0">
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-gray-100">
                        {i.p.gambar ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={i.p.gambar}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-gray-300">
                            <ImageOff className="h-5 w-5" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="line-clamp-2 text-sm font-semibold text-gray-900">
                          {i.p.nama}
                        </p>
                        {i.ket && <p className="text-xs text-gray-500">{i.ket}</p>}
                        {i.p.habis && (
                          <p className="text-xs font-medium text-red-500">
                            Produk ini sudah habis
                          </p>
                        )}
                        {i.opsi.some((o) => !o.tersedia) && (
                          <p className="text-xs font-medium text-red-500">
                            Ada pilihan yang sudah habis
                          </p>
                        )}
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold text-orange-600">
                            {formatRupiah(i.satuan * i.qty)}
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => hapusBaris(i.kunci)}
                              aria-label={`Hapus ${i.p.nama}`}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                            <div className="w-28">
                              <Stepper
                                qty={i.qty}
                                penuh={
                                  i.p.stok !== null &&
                                  baris
                                    .filter((b) => b.produkId === i.p.id)
                                    .reduce((n, b) => n + b.qty, 0) >= i.p.stok
                                }
                                onKurang={() => ubahQty(i.kunci, -1)}
                                onTambah={() => ubahQty(i.kunci, 1)}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>

                {/* Cara pesan */}
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-gray-900">Cara pesan</h3>
                  {modeTersedia.length === 0 ? (
                    <p className="rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-500">
                      Toko ini belum menerima pesanan online.
                    </p>
                  ) : (
                    <div
                      className={`grid gap-2 ${
                        modeTersedia.length === 1
                          ? "grid-cols-1"
                          : modeTersedia.length === 2
                            ? "grid-cols-2"
                            : "grid-cols-3"
                      }`}
                      role="radiogroup"
                      aria-label="Cara pesan"
                    >
                      {modeTersedia.map(({ id: mid, label, ikon: Ikon }) => {
                        const aktif = modeAktif === mid;
                        return (
                          <button
                            key={mid}
                            type="button"
                            role="radio"
                            aria-checked={aktif}
                            onClick={() => setMode(mid)}
                            className={`flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-xs font-medium transition-all ${
                              aktif
                                ? "border-orange-300 bg-orange-50 text-orange-600"
                                : "border-gray-100 bg-white text-gray-600 hover:border-orange-200"
                            }`}
                          >
                            <span
                              className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                                aktif
                                  ? "bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/30"
                                  : "bg-gray-100 text-gray-500"
                              }`}
                            >
                              <Ikon className="h-4 w-4" />
                            </span>
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {modeAktif && (
                  <>
                    {/* Data pemesan (dari profil) */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-gray-900">Data kamu</h3>
                        {statusProfil === "siap" && kurangPesan.length === 0 && (
                          <button
                            type="button"
                            onClick={bukaFormProfil}
                            className="text-xs font-semibold text-orange-600 hover:underline"
                          >
                            Ubah
                          </button>
                        )}
                      </div>

                      {statusProfil === "memuat" ? (
                        <div className="h-20 animate-pulse rounded-2xl bg-gray-100" />
                      ) : statusProfil === "tamu" ? (
                        <div className="space-y-2 rounded-2xl border border-orange-100 bg-orange-50 p-4 text-sm text-gray-700">
                          <p>
                            Masuk dulu untuk memesan. Nama, nomor WhatsApp, dan
                            alamatmu diambil dari profil.
                          </p>
                          <a
                            href={RUTE_MASUK}
                            className="inline-block rounded-full bg-orange-500 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-orange-600"
                          >
                            Masuk
                          </a>
                        </div>
                      ) : (
                        <>
                          <dl className="space-y-2 rounded-2xl bg-gray-50 p-4 text-sm">
                            {[
                              { label: "Nama", nilai: nama },
                              { label: "WhatsApp", nilai: telepon ? formatWa(telepon) : "" },
                              { label: "Area", nilai: kelurahan },
                            ].map((b) => (
                              <div key={b.label} className="flex justify-between gap-3">
                                <dt className="text-gray-500">{b.label}</dt>
                                <dd
                                  className={`text-right font-medium ${
                                    b.nilai ? "text-gray-900" : "text-amber-600"
                                  }`}
                                >
                                  {b.nilai || "Belum diisi"}
                                </dd>
                              </div>
                            ))}
                          </dl>

                          {kurangPesan.length > 0 && (
                            <div className="space-y-2.5 rounded-2xl bg-amber-50 p-3.5 text-xs text-amber-800 ring-1 ring-amber-100">
                              <p>
                                <b>Data wajib belum lengkap.</b> Belum diisi:{" "}
                                {kurangPesan.join(", ")}.
                              </p>
                              <button
                                type="button"
                                onClick={bukaFormProfil}
                                className="rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-orange-500/25 transition-all hover:shadow-lg active:scale-[0.98]"
                              >
                                Lengkapi data
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Khusus antar */}
                    {modeAktif === "delivery" && (
                      <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-gray-900">
                          Alamat pengantaran
                        </h3>
                        {statusProfil === "siap" && (
                          <div className="space-y-1 rounded-2xl bg-gray-50 p-4 text-sm">
                            {alamat !== "" ? (
                              <>
                                <p className="flex items-start gap-2 text-gray-800">
                                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                                  <span>{alamat}</span>
                                </p>
                                <p className="pl-6 text-xs text-gray-500">
                                  {[kelurahan, kecamatan, kota].filter(Boolean).join(", ")}
                                </p>
                              </>
                            ) : (
                              <p className="text-amber-600">Alamat lengkap belum diisi.</p>
                            )}
                          </div>
                        )}
                        <label className="block space-y-1">
                          <span className="text-xs font-medium text-gray-600">
                            Patokan (opsional)
                          </span>
                          <input
                            value={patokan}
                            onChange={(e) => setPatokan(e.target.value)}
                            maxLength={300}
                            placeholder="Pagar hijau, dekat masjid"
                            className={INPUT}
                          />
                        </label>
                        <button
                          type="button"
                          aria-pressed={sertakanLokasi}
                          onClick={() => {
                            if (!sertakanLokasi && !lokasi) mintaLokasi();
                            setSertakanLokasi((v) => !v);
                          }}
                          className={`flex w-full items-center justify-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors ${
                            sertakanLokasi
                              ? "border-orange-300 bg-orange-50 text-orange-600"
                              : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          {sertakanLokasi && statusLokasi === "meminta" ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : sertakanLokasi && lokasi ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <LocateFixed className="h-4 w-4" />
                          )}
                          {sertakanLokasi
                            ? lokasi
                              ? "Titik lokasimu ikut dikirim"
                              : "Mencari lokasi..."
                            : "Sertakan titik lokasiku untuk kurir"}
                        </button>
                        {sertakanLokasi &&
                          (statusLokasi === "ditolak" || statusLokasi === "tidak-ada") && (
                            <p role="alert" className="text-xs text-amber-600">
                              Lokasi tidak bisa diambil. Pesanan tetap bisa dikirim
                              dengan alamat tertulis.
                            </p>
                          )}
                      </div>
                    )}

                    {/* Khusus ambil sendiri */}
                    {modeAktif === "pickup" && (
                      <p className="rounded-xl bg-gray-50 px-3 py-2.5 text-sm text-gray-600">
                        Kode ambil akan muncul setelah pesanan dikirim. Tunjukkan
                        kode itu ke toko saat mengambil.
                      </p>
                    )}

                    {/* Khusus di meja */}
                    {modeAktif === "dine_in" && (
                      <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-gray-900">Meja</h3>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="block space-y-1">
                            <span className="text-xs font-medium text-gray-600">
                              Nomor meja
                            </span>
                            <input
                              value={meja}
                              onChange={(e) => setMeja(e.target.value)}
                              maxLength={20}
                              className={INPUT}
                            />
                          </label>
                          <div className="space-y-1">
                            <span className="text-xs font-medium text-gray-600">
                              Jumlah tamu
                            </span>
                            <Stepper
                              qty={tamu}
                              penuh={tamu >= 50}
                              onKurang={() => setTamu((t) => Math.max(1, t - 1))}
                              onTambah={() => setTamu((t) => Math.min(50, t + 1))}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Catatan */}
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-gray-600">
                        Catatan untuk toko (opsional)
                      </span>
                      <textarea
                        value={catatan}
                        onChange={(e) => setCatatan(e.target.value)}
                        rows={2}
                        maxLength={500}
                        className={INPUT}
                      />
                    </label>

                    {/* Pembayaran */}
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-gray-900">Pembayaran</h3>
                      <div role="radiogroup" aria-label="Pembayaran" className="space-y-2">
                        {pilihanBayar.map((b) => {
                          const aktif = metodeBayar === b.id;
                          return (
                            <button
                              key={b.id}
                              type="button"
                              role="radio"
                              aria-checked={aktif}
                              onClick={() => setBayar(b.id)}
                              className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors ${
                                aktif
                                  ? "border-orange-300 bg-orange-50"
                                  : "border-gray-100 bg-white hover:border-orange-200"
                              }`}
                            >
                              <span
                                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                                  aktif
                                    ? "border-orange-500 bg-orange-500 text-white"
                                    : "border-gray-300 bg-white"
                                }`}
                              >
                                {aktif && <Check className="h-3 w-3" />}
                              </span>
                              <span className="flex-1">
                                <span className="block text-sm font-medium text-gray-800">
                                  {b.label}
                                </span>
                                <span className="block text-xs text-gray-500">{b.ket}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Ringkasan */}
                    <dl className="space-y-1.5 rounded-2xl bg-gray-50 p-4 text-sm">
                      <div className="flex justify-between text-gray-600">
                        <dt>Subtotal</dt>
                        <dd>{formatRupiah(subtotalKotor)}</dd>
                      </div>
                      {hemat > 0 && (
                        <div className="flex justify-between text-red-500">
                          <dt>Diskon</dt>
                          <dd>-{formatRupiah(hemat)}</dd>
                        </div>
                      )}
                      {modeAktif === "delivery" && (
                        <div className="flex justify-between text-gray-600">
                          <dt>Ongkir</dt>
                          <dd>{ongkir > 0 ? formatRupiah(ongkir) : "Gratis"}</dd>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-bold text-gray-900">
                        <dt>Total</dt>
                        <dd>{formatRupiah(totalAkhir)}</dd>
                      </div>
                    </dl>

                    {minOrder > 0 && totalBelanja < minOrder && (
                      <p className="text-xs text-amber-600">
                        Minimal pesanan {formatRupiah(minOrder)}. Tambah{" "}
                        {formatRupiah(minOrder - totalBelanja)} lagi.
                      </p>
                    )}
                    {!tokoBuka && (
                      <p className="text-xs text-amber-600">
                        Toko sedang tutup, pesanan belum bisa dikirim.
                      </p>
                    )}
                    {galatKirim && (
                      <p
                        role="alert"
                        className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600"
                      >
                        {galatKirim}
                      </p>
                    )}

                    <button
                      onClick={kurangPesan.length > 0 ? bukaFormProfil : kirimPesanan}
                      disabled={mengirim || !tokoBuka || statusProfil !== "siap"}
                      className={TOMBOL_UTAMA}
                    >
                      {mengirim ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Mengirim pesanan...
                        </>
                      ) : kurangPesan.length > 0 ? (
                        "Lengkapi data dulu"
                      ) : (
                        `Kirim pesanan · ${formatRupiah(totalAkhir)}`
                      )}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* LEMBAR STATUS PESANAN */}
      {pesananAktif && (
        <SheetPesanan supabase={supabase} orderId={pesananAktif} onTutup={tutupPesanan} />
      )}

      {/* FORM PROFIL: pembungkus z-[70] agar tampil di atas lembar keranjang (z-[60]) */}
      {formProfil && userId && (
        <div className="relative z-[70]">
          <FormProfil
            key={formProfil}
            userId={userId}
            awal={profil}
            mode={formProfil}
            daftarArea={daftarArea}
            onSimpan={simpanProfil}
            onGambarTersimpan={(kunci, url) =>
              setProfil((p) => ({ ...p, [kunci]: url }))
            }
            onTutup={() => setFormProfil(null)}
          />
        </div>
      )}
    </>
  );
}

// ---------- Status pesanan (hanya dipakai di file ini) ----------

function SheetPesanan({
  supabase,
  orderId,
  onTutup,
}: {
  supabase: ReturnType<typeof createClient>;
  orderId: string;
  onTutup: () => void;
}) {
  const [data, setData] = useState<Lacak | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState("");
  const [disalin, setDisalin] = useState("");

  const muat = useCallback(async () => {
    const { data: hasil, error } = await supabase.rpc("lacak_pesanan", {
      p_order_id: orderId,
    });
    if (error) {
      setGalat(error.message);
    } else {
      setGalat("");
      setData((hasil ?? null) as Lacak | null);
    }
    setMemuat(false);
  }, [supabase, orderId]);

  useEffect(() => {
    void muat();
  }, [muat]);

  const selesai = data?.status === "completed" || data?.status === "cancelled";

  // Perbarui status tiap 15 detik sampai pesanan selesai atau dibatalkan
  useEffect(() => {
    if (selesai) return;
    const timer = setInterval(() => void muat(), 15000);
    return () => clearInterval(timer);
  }, [selesai, muat]);

  const salin = async (teks: string) => {
    try {
      await navigator.clipboard.writeText(teks);
      setDisalin(teks);
      setTimeout(() => setDisalin(""), 2000);
    } catch {
      /* tidak didukung */
    }
  };

  const langkah = data ? LANGKAH[data.order_type] : [];
  const idx = data
    ? data.status === "ready" && !langkah.includes("ready")
      ? langkah.indexOf("preparing")
      : langkah.indexOf(data.status)
    : -1;
  const nomorWa = data?.shop_whatsapp ? nomorInternasional(data.shop_whatsapp) : "";
  const pesanWa = data
    ? data.rekening.length > 0
      ? `Halo ${data.shop_name ?? "toko"}, saya sudah transfer ${formatRupiah(data.total)} untuk pesanan ${data.order_number}.`
      : `Halo ${data.shop_name ?? "toko"}, saya mau tanya soal pesanan ${data.order_number}.`
    : "";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end bg-black/40 md:items-center md:justify-center"
      onClick={onTutup}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Status pesanan"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl md:max-w-lg md:rounded-3xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900">Status pesanan</h2>
            {data && (
              <p className="truncate text-xs text-gray-500">{data.order_number}</p>
            )}
          </div>
          <button
            onClick={onTutup}
            aria-label="Tutup"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {memuat ? (
          <div className="flex items-center justify-center gap-2 px-6 py-16 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Memuat pesanan...
          </div>
        ) : galat ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <p className="font-semibold text-gray-900">Gagal memuat pesanan</p>
            <p role="alert" className="text-sm text-gray-500">
              {galat}
            </p>
            <button
              onClick={() => void muat()}
              className="rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-600"
            >
              Coba lagi
            </button>
          </div>
        ) : !data ? (
          <div className="px-6 py-14 text-center text-sm text-gray-500">
            Pesanan tidak ditemukan.
          </div>
        ) : (
          <div className="space-y-5 p-5">
            {/* Status */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-base font-bold text-gray-900" aria-live="polite">
                  {labelStatus(data.status, data.order_type)}
                </p>
                <span className="shrink-0 rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-600 ring-1 ring-orange-100">
                  {LABEL_MODE[data.order_type]}
                </span>
              </div>

              {data.status === "cancelled" ? (
                <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
                  Pesanan ini dibatalkan. Hubungi toko jika ada yang perlu
                  ditanyakan.
                </p>
              ) : (
                <ol>
                  {langkah.map((s, i) => {
                    const lewat = i < idx || data.status === "completed";
                    const aktif = i === idx && data.status !== "completed";
                    return (
                      <li key={s} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <span
                            className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                              lewat
                                ? "bg-emerald-500 text-white"
                                : aktif
                                  ? "bg-orange-500 text-white ring-4 ring-orange-100"
                                  : "bg-gray-100 text-gray-400"
                            }`}
                          >
                            {lewat ? <Check className="h-3.5 w-3.5" /> : i + 1}
                          </span>
                          {i < langkah.length - 1 && (
                            <span
                              className={`h-5 w-0.5 ${
                                lewat ? "bg-emerald-300" : "bg-gray-200"
                              }`}
                            />
                          )}
                        </div>
                        <p
                          className={`pb-4 text-sm ${
                            aktif
                              ? "font-semibold text-gray-900"
                              : lewat
                                ? "text-gray-600"
                                : "text-gray-400"
                          }`}
                        >
                          {labelStatus(s, data.order_type)}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              )}
              {!selesai && (
                <p className="text-xs text-gray-400">
                  Status diperbarui otomatis. Tidak perlu muat ulang halaman.
                </p>
              )}
            </div>

            {/* Kode ambil, meja, alamat */}
            {data.order_type === "pickup" && data.pickup_code && (
              <div className="rounded-2xl border border-orange-100 bg-orange-50 p-4 text-center">
                <p className="text-xs text-gray-600">Kode ambil</p>
                <p className="mt-1 text-3xl font-extrabold tracking-widest text-orange-600">
                  {data.pickup_code}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Tunjukkan kode ini ke toko saat mengambil pesanan.
                </p>
              </div>
            )}
            {data.order_type === "dine_in" && data.table_number && (
              <div className="rounded-2xl border border-orange-100 bg-orange-50 p-4 text-center">
                <p className="text-xs text-gray-600">Pesanan untuk</p>
                <p className="mt-1 text-2xl font-extrabold text-orange-600">
                  Meja {data.table_number}
                </p>
              </div>
            )}
            {data.order_type === "delivery" && data.delivery && (
              <div className="space-y-1 rounded-2xl bg-gray-50 p-4 text-sm text-gray-600">
                <p className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                  <span>{data.delivery.alamat}</span>
                </p>
                {data.delivery.catatan && (
                  <p className="pl-6 text-xs text-gray-500">{data.delivery.catatan}</p>
                )}
                {(data.delivery.kurir || data.delivery.resi) && (
                  <p className="pl-6 text-xs text-gray-500">
                    Kurir: {data.delivery.kurir ?? "-"}
                    {data.delivery.resi ? ` · Resi ${data.delivery.resi}` : ""}
                  </p>
                )}
              </div>
            )}

            {/* Transfer */}
            {data.rekening.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-900">
                  Transfer ke rekening
                </h3>
                <p className="text-xs text-gray-500">
                  Transfer sebesar <b>{formatRupiah(data.total)}</b>, lalu kirim
                  bukti transfer ke toko lewat WhatsApp.
                </p>
                <ul className="space-y-2">
                  {data.rekening.map((r) => (
                    <li
                      key={`${r.bank}-${r.nomor}`}
                      className="flex items-center gap-3 rounded-2xl border border-gray-100 p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-gray-500">{r.bank}</p>
                        <p className="text-sm font-bold tracking-wide text-gray-900">
                          {r.nomor}
                        </p>
                        <p className="truncate text-xs text-gray-500">a.n. {r.nama}</p>
                      </div>
                      <button
                        onClick={() => void salin(r.nomor)}
                        className="flex shrink-0 items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-600 transition-colors hover:bg-orange-100"
                      >
                        {disalin === r.nomor ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        {disalin === r.nomor ? "Disalin" : "Salin"}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Rincian */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">Rincian</h3>
              <ul className="divide-y divide-gray-100 text-sm">
                {data.items.map((i, n) => (
                  <li key={`${i.nama}-${n}`} className="flex justify-between gap-3 py-2">
                    <span className="min-w-0 text-gray-700">
                      {i.qty}× {i.nama}
                      {i.catatan && (
                        <span className="block text-xs text-gray-500">{i.catatan}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-gray-700">
                      {formatRupiah(i.harga * i.qty)}
                    </span>
                  </li>
                ))}
              </ul>
              <dl className="space-y-1.5 rounded-2xl bg-gray-50 p-4 text-sm">
                <div className="flex justify-between text-gray-600">
                  <dt>Subtotal</dt>
                  <dd>{formatRupiah(data.subtotal)}</dd>
                </div>
                {data.discount > 0 && (
                  <div className="flex justify-between text-red-500">
                    <dt>Diskon</dt>
                    <dd>-{formatRupiah(data.discount)}</dd>
                  </div>
                )}
                {data.shipping_fee > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <dt>Ongkir</dt>
                    <dd>{formatRupiah(data.shipping_fee)}</dd>
                  </div>
                )}
                <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-bold text-gray-900">
                  <dt>Total</dt>
                  <dd>{formatRupiah(data.total)}</dd>
                </div>
                <div className="flex justify-between pt-1 text-xs text-gray-500">
                  <dt>
                    {data.payment_method
                      ? (LABEL_METODE[data.payment_method] ?? data.payment_method)
                      : "Pembayaran"}
                  </dt>
                  <dd>{LABEL_BAYAR[data.payment_status] ?? data.payment_status}</dd>
                </div>
              </dl>
              {data.notes && (
                <p className="text-xs text-gray-500">Catatan: {data.notes}</p>
              )}
              <p className="text-xs text-gray-400">
                Dipesan {formatWaktu(data.created_at)} WIB
              </p>
            </div>

            {nomorWa && (
              <a
                href={`https://wa.me/${nomorWa}?text=${encodeURIComponent(pesanWa)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-600"
              >
                <MessageCircle className="h-4 w-4" />
                {data.rekening.length > 0
                  ? "Kirim bukti transfer"
                  : "Hubungi toko soal pesanan ini"}
              </a>
            )}
          </div>
        )}
      </div>
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