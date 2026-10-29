"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Header from "@/app/components/Header";
import { NavBawah } from "@/app/components/Navbar";
import {
  AlertTriangle,
  Banknote,
  Bike,
  Check,
  ChevronDown,
  Loader2,
  LogIn,
  MapPin,
  MessageCircle,
  Receipt,
  Store,
  Utensils,
} from "lucide-react";
import TeksBerjalan from "@/app/components/TeksBerjalan";
import { createClient } from "@/lib/supabase/client";

// ---------- Tipe ----------

type Mode = "delivery" | "pickup" | "dine_in";

/** Status tampilan, diturunkan dari status database. */
type StatusPesanan =
  | "menunggu"
  | "diproses"
  | "dikirim"
  | "siap"
  | "selesai"
  | "dibatalkan";

type Item = { nama: string; qty: number; harga: number; catatan: string | null };

type Pesanan = {
  id: string;
  nomor: string;
  tokoId: string;
  toko: string;
  logo: string | null;
  warna: string;
  wa: string; // format internasional tanpa +
  waktu: string; // ISO
  mode: Mode;
  bayar: string | null; // cod | cash | transfer
  statusBayar: string;
  item: Item[];
  subtotal: number;
  diskon: number;
  ongkir: number;
  total: number;
  statusDb: string;
  status: StatusPesanan;
  kodeAmbil: string | null;
  meja: string | null;
  alamat: string | null;
  catatan: string | null;
};

/** Bentuk hasil query Supabase (relasi satu-satu bisa objek atau array). */
type Relasi<T> = T | T[] | null;

type BarisPesanan = {
  id: string;
  order_number: string;
  shop_id: string;
  order_type: Mode;
  status: string;
  payment_status: string;
  notes: string | null;
  subtotal: number | string;
  discount: number | string;
  shipping_fee: number | string;
  total: number | string;
  created_at: string;
  shops: Relasi<{ name: string; whatsapp: string | null; logo_url: string | null }>;
  order_items: {
    id: string;
    product_name: string;
    unit_price: number | string;
    quantity: number;
    notes: string | null;
    created_at: string;
  }[];
  order_pickup: Relasi<{ pickup_code: string }>;
  order_dine_in: Relasi<{ table_number: string }>;
  order_delivery: Relasi<{
    address_line: string;
    village: string | null;
    district: string | null;
    city: string | null;
  }>;
  payments: { method: string; created_at: string }[];
};

// ---------- Konstanta ----------

const RUTE_MASUK = "/login";
const POLLING_MS = 30000;

const SELECT_PESANAN = `
  id, order_number, shop_id, order_type, status, payment_status, notes,
  subtotal, discount, shipping_fee, total, created_at,
  shops ( name, whatsapp, logo_url ),
  order_items ( id, product_name, unit_price, quantity, notes, created_at ),
  order_pickup ( pickup_code ),
  order_dine_in ( table_number ),
  order_delivery ( address_line, village, district, city ),
  payments ( method, created_at )
`;

const STATUS: Record<StatusPesanan, { label: string; kelas: string }> = {
  menunggu: { label: "Menunggu konfirmasi", kelas: "bg-amber-50 text-amber-700 ring-1 ring-amber-100" },
  diproses: { label: "Sedang diproses", kelas: "bg-blue-50 text-blue-700 ring-1 ring-blue-100" },
  dikirim: { label: "Sedang diantar", kelas: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100" },
  siap: { label: "Siap", kelas: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" },
  selesai: { label: "Selesai", kelas: "bg-gray-100 text-gray-600 ring-1 ring-gray-200" },
  dibatalkan: { label: "Dibatalkan", kelas: "bg-red-50 text-red-700 ring-1 ring-red-100" },
};

const BERLANGSUNG: StatusPesanan[] = ["menunggu", "diproses", "dikirim", "siap"];

type TabId = "semua" | "berlangsung" | "selesai" | "dibatalkan";

const TAB: { id: TabId; label: string }[] = [
  { id: "semua", label: "Semua" },
  { id: "berlangsung", label: "Berlangsung" },
  { id: "selesai", label: "Selesai" },
  { id: "dibatalkan", label: "Dibatalkan" },
];

const LABEL_MODE: Record<Mode, string> = {
  delivery: "Diantar",
  pickup: "Ambil di toko",
  dine_in: "Makan di tempat",
};

const LABEL_BAYAR: Record<string, string> = {
  cod: "Bayar di tempat",
  cash: "Bayar tunai",
  transfer: "Transfer bank",
};

const WARNA = [
  "from-red-400 to-rose-500",
  "from-amber-400 to-orange-500",
  "from-pink-400 to-fuchsia-500",
  "from-violet-400 to-purple-600",
  "from-blue-400 to-indigo-600",
  "from-emerald-400 to-teal-600",
];

const SEMBUNYIKAN_SCROLLBAR =
  "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

const TOMBOL_UTAMA =
  "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/25 transition-all hover:shadow-lg hover:shadow-orange-500/30 active:scale-[0.98]";

// ---------- Fungsi bantu ----------

const rupiah = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

const satu = <T,>(v: Relasi<T> | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

const warnaToko = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return WARNA[h % WARNA.length];
};

function formatWaktu(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Nomor telepon Indonesia ke format internasional tanpa "+". */
function nomorInternasional(nomor: string) {
  const digit = nomor.replace(/\D/g, "");
  if (digit.startsWith("0")) return `62${digit.slice(1)}`;
  if (digit.startsWith("8")) return `62${digit}`;
  return digit;
}

/** Status database ke status tampilan. */
function petakanStatus(db: string, mode: Mode): StatusPesanan {
  switch (db) {
    case "pending":
      return "menunggu";
    case "confirmed":
    case "preparing":
      return "diproses";
    case "on_delivery":
      return "dikirim";
    case "ready":
      // Pesanan antar yang "ready" masih tahap disiapkan (sama seperti Keranjang)
      return mode === "delivery" ? "diproses" : "siap";
    case "completed":
      return "selesai";
    case "cancelled":
      return "dibatalkan";
    default:
      return "menunggu";
  }
}

function labelStatus(p: Pesanan) {
  if (p.status === "siap") {
    return p.mode === "dine_in" ? "Siap disajikan" : "Siap diambil";
  }
  return STATUS[p.status].label;
}

function dariBaris(b: BarisPesanan): Pesanan {
  const toko = satu(b.shops);
  const ambil = satu(b.order_pickup);
  const meja = satu(b.order_dine_in);
  const antar = satu(b.order_delivery);
  const bayarTerbaru = [...(b.payments ?? [])].sort((x, y) =>
    y.created_at.localeCompare(x.created_at)
  )[0];

  return {
    id: b.id,
    nomor: b.order_number,
    tokoId: b.shop_id,
    toko: toko?.name ?? "Toko",
    logo: toko?.logo_url ?? null,
    warna: warnaToko(b.shop_id),
    wa: toko?.whatsapp ? nomorInternasional(toko.whatsapp) : "",
    waktu: b.created_at,
    mode: b.order_type,
    bayar: bayarTerbaru?.method ?? null,
    statusBayar: b.payment_status,
    item: [...(b.order_items ?? [])]
      .sort((x, y) => x.created_at.localeCompare(y.created_at))
      .map((i) => ({
        nama: i.product_name,
        qty: i.quantity,
        harga: Number(i.unit_price) || 0,
        catatan: i.notes,
      })),
    subtotal: Number(b.subtotal) || 0,
    diskon: Number(b.discount) || 0,
    ongkir: Number(b.shipping_fee) || 0,
    total: Number(b.total) || 0,
    statusDb: b.status,
    status: petakanStatus(b.status, b.order_type),
    kodeAmbil: ambil?.pickup_code ?? null,
    meja: meja?.table_number ?? null,
    alamat: antar
      ? [antar.address_line, antar.village, antar.district, antar.city]
          .filter(Boolean)
          .join(", ")
      : null,
    catatan: b.notes,
  };
}

const cocokTab = (p: Pesanan, tab: TabId) =>
  tab === "semua" ||
  (tab === "berlangsung" && BERLANGSUNG.includes(p.status)) ||
  (tab === "selesai" && p.status === "selesai") ||
  (tab === "dibatalkan" && p.status === "dibatalkan");

// ---------- Komponen kecil ----------

function Progres({ p }: { p: Pesanan }) {
  const langkah = [
    "Menunggu",
    "Diproses",
    p.mode === "delivery"
      ? "Diantar"
      : p.mode === "dine_in"
        ? "Disajikan"
        : "Siap diambil",
    "Selesai",
  ];
  const posisi: Record<StatusPesanan, number> = {
    menunggu: 0,
    diproses: 1,
    dikirim: 2,
    siap: 2,
    selesai: 3,
    dibatalkan: -1,
  };
  const sekarang = posisi[p.status];

  return (
    <ol className="flex items-start" aria-label="Tahap pesanan">
      {langkah.map((nama, i) => {
        const lewat = i < sekarang;
        const aktif = i === sekarang;
        return (
          <li key={nama} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full items-center">
              <span
                className={`h-1 flex-1 rounded-full ${
                  i === 0
                    ? "invisible"
                    : lewat || aktif
                      ? "bg-gradient-to-r from-orange-400 to-orange-500"
                      : "bg-gray-200"
                }`}
              />
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white transition-all ${
                  aktif
                    ? "bg-gradient-to-br from-orange-500 to-amber-500 shadow-md shadow-orange-500/30 ring-4 ring-orange-100"
                    : lewat
                      ? "bg-orange-500"
                      : "bg-gray-200"
                }`}
              >
                {lewat && <Check className="h-3.5 w-3.5" />}
                {aktif && <span className="h-2 w-2 rounded-full bg-white" />}
              </span>
              <span
                className={`h-1 flex-1 rounded-full ${
                  i === langkah.length - 1
                    ? "invisible"
                    : lewat
                      ? "bg-gradient-to-r from-orange-500 to-orange-400"
                      : "bg-gray-200"
                }`}
              />
            </div>
            <span
              className={`text-center text-[10px] leading-tight ${
                aktif ? "font-semibold text-orange-600" : "text-gray-500"
              }`}
            >
              {nama}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function KerangkaKartu() {
  return (
    <div className="space-y-3.5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm md:p-5">
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 animate-pulse rounded-xl bg-gray-100" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 w-1/3 animate-pulse rounded bg-gray-100" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-gray-100" />
        </div>
      </div>
      <div className="h-16 animate-pulse rounded-xl bg-gray-50" />
    </div>
  );
}

// ---------- Halaman ----------

export default function PesananPage() {
  const supabase = useMemo(() => createClient(), []);

  const [userId, setUserId] = useState<string | null>(null);
  const [statusAuth, setStatusAuth] = useState<"memuat" | "tamu" | "masuk">(
    "memuat"
  );
  const [daftar, setDaftar] = useState<Pesanan[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState("");

  const [tab, setTab] = useState<TabId>("semua");
  const [terbuka, setTerbuka] = useState<string | null>(null);
  const [batal, setBatal] = useState<Pesanan | null>(null);
  const [membatalkan, setMembatalkan] = useState(false);
  const [galatBatal, setGalatBatal] = useState("");

  // Cek login
  useEffect(() => {
    let dibatalkan = false;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (dibatalkan) return;
      if (!user) {
        setUserId(null);
        setStatusAuth("tamu");
        setMemuat(false);
        return;
      }
      setUserId(user.id);
      setStatusAuth("masuk");
    });
    return () => {
      dibatalkan = true;
    };
  }, [supabase]);

  // Muat pesanan. `senyap` = tanpa menampilkan kerangka loading.
  const muat = useCallback(
    async (senyap = false) => {
      if (!userId) return;
      if (!senyap) setMemuat(true);

      const { data, error } = await supabase
        .from("orders")
        .select(SELECT_PESANAN)
        .eq("customer_id", userId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) {
        // Saat refresh senyap, pertahankan data lama
        if (!senyap) setGalat(error.message);
      } else {
        setGalat("");
        setDaftar(((data ?? []) as unknown as BarisPesanan[]).map(dariBaris));
      }
      setMemuat(false);
    },
    [supabase, userId]
  );

  useEffect(() => {
    if (statusAuth === "masuk") void muat();
  }, [statusAuth, muat]);

  // Realtime: muat ulang saat ada perubahan pada pesanan milik user
  useEffect(() => {
    if (!userId) return;
    const kanal = supabase
      .channel(`pesanan:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `customer_id=eq.${userId}`,
        },
        () => void muat(true)
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(kanal);
    };
  }, [supabase, userId, muat]);

  // Cadangan polling selama ada pesanan berlangsung (jika realtime tidak aktif)
  const adaBerjalan = daftar.some((p) => BERLANGSUNG.includes(p.status));
  useEffect(() => {
    if (!userId || !adaBerjalan) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void muat(true);
    }, POLLING_MS);
    return () => clearInterval(timer);
  }, [userId, adaBerjalan, muat]);

  // Tutup dialog dengan Escape
  useEffect(() => {
    if (!batal) return;
    const tutup = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !membatalkan) setBatal(null);
    };
    window.addEventListener("keydown", tutup);
    return () => window.removeEventListener("keydown", tutup);
  }, [batal, membatalkan]);

  const hasil = useMemo(
    () => daftar.filter((p) => cocokTab(p, tab)),
    [daftar, tab]
  );
  const hitung = (id: TabId) => daftar.filter((p) => cocokTab(p, id)).length;

  const bukaDialogBatal = (p: Pesanan) => {
    setGalatBatal("");
    setBatal(p);
  };

  const konfirmasiBatal = async () => {
    if (!batal || membatalkan) return;
    setMembatalkan(true);
    setGalatBatal("");

    const { error } = await supabase.rpc("batalkan_pesanan", {
      p_order_id: batal.id,
    });
    setMembatalkan(false);

    if (error) {
      setGalatBatal(error.message);
      // Status mungkin sudah berubah di sisi toko, segarkan daftar
      void muat(true);
      return;
    }

    setBatal(null);
    await muat(true);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-28 text-gray-800 md:pb-0">
      {/* HEADER */}
      <Header
        aktif="Pesanan"
        bawah={
          <div className="border-b border-gray-100 bg-white">
            <div
              role="tablist"
              className={`mx-auto flex max-w-4xl overflow-x-auto px-1 md:px-4 ${SEMBUNYIKAN_SCROLLBAR}`}
            >
              {TAB.map((t) => {
                const aktif = tab === t.id;
                return (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={aktif}
                    onClick={() => setTab(t.id)}
                    className={`relative flex shrink-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap px-4 py-3 text-sm transition-colors md:flex-none md:px-6 ${
                      aktif
                        ? "font-semibold text-orange-600"
                        : "text-gray-500 hover:text-gray-800"
                    }`}
                  >
                    {t.label}
                    <span
                      className={`min-w-5 rounded-full px-1.5 text-center text-[11px] font-bold leading-5 ${
                        aktif
                          ? "bg-orange-100 text-orange-600"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {hitung(t.id)}
                    </span>
                    {aktif && (
                      <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-gradient-to-r from-orange-500 to-amber-500" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        }
      >
        <h1 className="sr-only">Pesanan saya</h1>
        <TeksBerjalan className="min-w-0 flex-1" />
      </Header>

      <main className="mx-auto max-w-4xl space-y-3 px-3 py-4 md:space-y-4 md:px-4 md:py-6">
        {statusAuth === "tamu" ? (
          <div className="flex flex-col items-center gap-4 rounded-3xl border border-gray-100 bg-white px-6 py-16 text-center shadow-sm">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/30">
              <LogIn className="h-7 w-7" />
            </span>
            <div>
              <p className="text-base font-bold text-gray-900">
                Masuk untuk melihat pesananmu
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Riwayat dan status pesanan tersimpan di akunmu.
              </p>
            </div>
            <Link
              href={RUTE_MASUK}
              className={`rounded-xl px-5 py-2.5 text-sm font-semibold ${TOMBOL_UTAMA}`}
            >
              Masuk
            </Link>
          </div>
        ) : memuat || statusAuth === "memuat" ? (
          <>
            <KerangkaKartu />
            <KerangkaKartu />
            <KerangkaKartu />
          </>
        ) : galat ? (
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-gray-100 bg-white px-6 py-14 text-center shadow-sm">
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
        ) : hasil.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-3xl border border-gray-100 bg-white px-6 py-16 text-center shadow-sm">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-orange-50 ring-8 ring-orange-50/60">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/30">
                <Receipt className="h-7 w-7" />
              </span>
            </span>
            <div>
              <p className="text-base font-bold text-gray-900">
                {tab === "semua" ? "Belum ada pesanan" : "Tidak ada pesanan di sini"}
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Pesanan dari toko sekitarmu akan muncul di halaman ini.
              </p>
            </div>
            <Link
              href="/"
              className={`rounded-xl px-5 py-2.5 text-sm font-semibold ${TOMBOL_UTAMA}`}
            >
              Cari toko terdekat
            </Link>
          </div>
        ) : (
          hasil.map((p) => {
            const info = STATUS[p.status];
            const berjalan = BERLANGSUNG.includes(p.status);
            const buka = terbuka === p.id;
            const pertama = p.item[0];
            const sisa = p.item.length - 1;
            const lacakHref = `/toko/${p.tokoId}?pesanan=${p.id}`;
            const perluTransfer =
              p.bayar === "transfer" && p.statusBayar !== "paid" && berjalan;

            return (
              <article
                key={p.id}
                className={`space-y-3.5 rounded-2xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md md:p-5 ${
                  berjalan ? "border-orange-100" : "border-gray-100"
                }`}
              >
                {/* Kepala */}
                <div className="flex items-center gap-3">
                  <a
                    href={`/toko/${p.tokoId}`}
                    className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br shadow-sm ${p.warna}`}
                    aria-label={`Buka ${p.toko}`}
                  >
                    {p.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.logo}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Store className="h-5 w-5 text-white" />
                    )}
                  </a>
                  <div className="min-w-0 flex-1">
                    <a
                      href={`/toko/${p.tokoId}`}
                      className="block truncate text-sm font-bold text-gray-900 transition-colors hover:text-orange-600"
                    >
                      {p.toko}
                    </a>
                    <p className="truncate text-xs text-gray-500">
                      {p.nomor} · {formatWaktu(p.waktu)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${info.kelas}`}
                  >
                    {labelStatus(p)}
                  </span>
                </div>

                {/* Progres untuk pesanan berlangsung */}
                {berjalan && (
                  <div className="rounded-xl bg-gray-50 px-2 py-3.5 ring-1 ring-gray-100">
                    <Progres p={p} />
                  </div>
                )}

                {/* Kode ambil / meja */}
                {berjalan && p.mode === "pickup" && p.kodeAmbil && (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-orange-100 bg-orange-50 px-4 py-2.5">
                    <span className="text-xs text-gray-600">Kode ambil</span>
                    <span className="text-xl font-extrabold tracking-widest text-orange-600">
                      {p.kodeAmbil}
                    </span>
                  </div>
                )}
                {berjalan && p.mode === "dine_in" && p.meja && (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-orange-100 bg-orange-50 px-4 py-2.5">
                    <span className="text-xs text-gray-600">Pesanan untuk</span>
                    <span className="text-lg font-extrabold text-orange-600">
                      Meja {p.meja}
                    </span>
                  </div>
                )}
                {perluTransfer && (
                  <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-100">
                    Belum dibayar. Buka <b>Lihat status</b> untuk nomor rekening
                    tujuan transfer.
                  </p>
                )}

                {/* Ringkasan */}
                <div className="flex items-end justify-between gap-3 border-t border-gray-100 pt-3.5">
                  <div className="min-w-0 text-sm">
                    {pertama && (
                      <p className="truncate text-gray-900">
                        {pertama.nama}
                        <span className="font-medium text-gray-400">
                          {" "}
                          ×{pertama.qty}
                        </span>
                      </p>
                    )}
                    {sisa > 0 && (
                      <p className="text-xs text-gray-500">
                        + {sisa} produk lainnya
                      </p>
                    )}
                    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        {p.mode === "delivery" ? (
                          <Bike className="h-3.5 w-3.5 text-orange-500" />
                        ) : p.mode === "dine_in" ? (
                          <Utensils className="h-3.5 w-3.5 text-orange-500" />
                        ) : (
                          <Store className="h-3.5 w-3.5 text-orange-500" />
                        )}
                        {LABEL_MODE[p.mode]}
                      </span>
                      {p.bayar && (
                        <span className="flex items-center gap-1">
                          <Banknote className="h-3.5 w-3.5 text-orange-500" />
                          {LABEL_BAYAR[p.bayar] ?? p.bayar}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[11px] text-gray-400">Total</p>
                    <p className="text-lg font-extrabold leading-tight text-gray-900">
                      {rupiah(p.total)}
                    </p>
                  </div>
                </div>

                {/* Rincian */}
                <button
                  onClick={() => setTerbuka(buka ? null : p.id)}
                  aria-expanded={buka}
                  className="flex w-full items-center justify-center gap-1 rounded-xl py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-orange-50/60 hover:text-orange-600"
                >
                  {buka ? "Sembunyikan rincian" : "Lihat rincian"}
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-200 ${
                      buka ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {buka && (
                  <div className="space-y-2 rounded-xl bg-gray-50 p-3.5 text-sm ring-1 ring-gray-100">
                    {p.item.map((i, n) => (
                      <div key={`${i.nama}-${n}`} className="flex justify-between gap-3">
                        <span className="min-w-0 text-gray-800">
                          {i.nama}{" "}
                          <span className="font-medium text-gray-400">
                            ×{i.qty}
                          </span>
                          {i.catatan && (
                            <span className="block text-xs text-gray-500">
                              {i.catatan}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-gray-600">
                          {rupiah(i.harga * i.qty)}
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-between border-t border-dashed border-gray-200 pt-2 text-gray-600">
                      <span>Subtotal</span>
                      <span>{rupiah(p.subtotal)}</span>
                    </div>
                    {p.diskon > 0 && (
                      <div className="flex justify-between text-red-500">
                        <span>Diskon</span>
                        <span>-{rupiah(p.diskon)}</span>
                      </div>
                    )}
                    {p.mode === "delivery" && (
                      <div className="flex justify-between text-gray-600">
                        <span>Ongkos antar</span>
                        <span>{p.ongkir === 0 ? "Gratis" : rupiah(p.ongkir)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-gray-900">
                      <span>Total</span>
                      <span>{rupiah(p.total)}</span>
                    </div>

                    {p.alamat && (
                      <p className="flex items-start gap-2 border-t border-dashed border-gray-200 pt-2 text-xs text-gray-600">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-500" />
                        <span>{p.alamat}</span>
                      </p>
                    )}
                    {p.catatan && (
                      <p className="text-xs text-gray-500">Catatan: {p.catatan}</p>
                    )}
                  </div>
                )}

                {/* Aksi */}
                <div className="flex flex-wrap justify-end gap-2">
                  {berjalan && p.wa && (
                    <a
                      href={`https://wa.me/${p.wa}?text=${encodeURIComponent(
                        `Halo ${p.toko}, saya mau tanya pesanan ${p.nomor}`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mr-auto flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3.5 py-2 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100 transition-colors hover:bg-emerald-100"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      Hubungi toko
                    </a>
                  )}
                  {p.status === "menunggu" && (
                    <button
                      onClick={() => bukaDialogBatal(p)}
                      className="rounded-xl border border-red-200 bg-white px-4 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                    >
                      Batalkan pesanan
                    </button>
                  )}
                  <a
                    href={lacakHref}
                    className={`rounded-xl px-4 py-2 text-xs font-semibold ${
                      berjalan
                        ? TOMBOL_UTAMA
                        : "border border-gray-200 bg-white text-gray-700 transition-colors hover:bg-gray-50"
                    }`}
                  >
                    Lihat status
                  </a>
                  {p.status === "selesai" && (
                    <a
                      href={`/pesanan/${p.id}/ulasan`}
                      className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-2 text-xs font-semibold text-orange-600 transition-colors hover:bg-orange-100"
                    >
                      Beri ulasan
                    </a>
                  )}
                  {(p.status === "selesai" || p.status === "dibatalkan") && (
                    <a
                      href={`/toko/${p.tokoId}`}
                      className={`rounded-xl px-4 py-2 text-xs font-semibold ${TOMBOL_UTAMA}`}
                    >
                      Pesan lagi
                    </a>
                  )}
                </div>
              </article>
            );
          })
        )}
      </main>

      {/* BOTTOM NAV */}
      <NavBawah aktif="Pesanan" />

      {/* KONFIRMASI BATAL */}
      {batal && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/40 backdrop-blur-sm md:items-center md:justify-center"
          onClick={() => !membatalkan && setBatal(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="judul-batal"
            onClick={(e) => e.stopPropagation()}
            className="w-full space-y-4 rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl md:max-w-sm md:rounded-3xl"
          >
            <div className="mx-auto h-1.5 w-10 rounded-full bg-gray-200 md:hidden" />
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-500 ring-1 ring-red-100">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div className="space-y-1">
                <h2 id="judul-batal" className="text-lg font-bold text-gray-900">
                  Batalkan pesanan ini?
                </h2>
                <p className="text-sm text-gray-500">
                  Pesanan {batal.nomor} dari {batal.toko} akan dibatalkan. Kamu
                  perlu memesan ulang kalau berubah pikiran.
                </p>
              </div>
            </div>

            {galatBatal && (
              <p
                role="alert"
                className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600"
              >
                {galatBatal}
              </p>
            )}

            <div className="flex gap-2.5">
              <button
                onClick={() => setBatal(null)}
                disabled={membatalkan}
                className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                Tidak jadi
              </button>
              <button
                onClick={() => void konfirmasiBatal()}
                disabled={membatalkan}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-red-500 to-rose-500 py-2.5 text-sm font-semibold text-white shadow-md shadow-red-500/25 transition-all hover:shadow-lg hover:shadow-red-500/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {membatalkan ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Membatalkan...
                  </>
                ) : (
                  "Ya, batalkan"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}