"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  ExternalLink,
  KeyRound,
  Loader2,
  MapPin,
  MessageCircle,
  Receipt,
  RefreshCw,
  Settings2,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { rupiah, useToko, type JenisPesanan } from "../components/toko-context";
import { Dialog, JENIS_PESANAN, SEMBUNYIKAN_SCROLLBAR } from "../ui";

// ---------- Tipe ----------

// Sesuai constraint orders.status
type StatusDb =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready"
  | "on_delivery"
  | "completed"
  | "cancelled";

type StatusBayar = "unpaid" | "partial" | "paid" | "refunded";

type ItemPesanan = {
  id: string;
  nama: string;
  harga: number;
  qty: number;
  total: number;
  catatan: string;
};

type Pesanan = {
  id: string;
  nomor: string;
  tipe: JenisPesanan;
  status: StatusDb;
  statusBayar: StatusBayar;
  metodeBayar: string;
  pembeli: string;
  wa: string;
  catatan: string;
  subtotal: number;
  diskon: number;
  pajak: number;
  ongkir: number;
  total: number;
  waktu: string;
  item: ItemPesanan[];
  alamat: string;
  petaUrl: string;
  meja: string;
  tamu: number;
  kodeAmbil: string;
  jamAmbil: string;
};

type FilterPesanan = "baru" | "proses" | "selesai";

// ---------- Konstanta ----------

const FILTER_PESANAN: { id: FilterPesanan; label: string }[] = [
  { id: "baru", label: "Baru" },
  { id: "proses", label: "Proses" },
  { id: "selesai", label: "Selesai" },
];

// orders.order_type <-> jenis layanan di aplikasi
const DARI_TIPE: Record<string, JenisPesanan> = {
  delivery: "antar",
  pickup: "ambil",
  dine_in: "meja",
};

const KELAS_STATUS: Record<StatusDb, string> = {
  pending: "bg-orange-50 text-orange-700 ring-1 ring-orange-100",
  confirmed: "bg-blue-50 text-blue-700 ring-1 ring-blue-100",
  preparing: "bg-blue-50 text-blue-700 ring-1 ring-blue-100",
  ready: "bg-violet-50 text-violet-700 ring-1 ring-violet-100",
  on_delivery: "bg-sky-50 text-sky-700 ring-1 ring-sky-100",
  completed: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  cancelled: "bg-red-50 text-red-700 ring-1 ring-red-100",
};

const LABEL_METODE: Record<string, string> = {
  cash: "Tunai",
  qris: "QRIS",
  transfer: "Transfer",
  card: "Kartu",
  ewallet: "E-wallet",
  cod: "Bayar di tempat",
};

const LABEL_STATUS_BAYAR: Record<StatusBayar, string> = {
  unpaid: "Belum dibayar",
  partial: "Dibayar sebagian",
  paid: "Lunas",
  refunded: "Dikembalikan",
};

const SELECT_PESANAN =
  "id, order_number, order_type, status, payment_status, customer_name, customer_phone, notes, subtotal, discount, tax, shipping_fee, total, created_at, " +
  "order_items(id, product_name, unit_price, quantity, line_total, notes), " +
  "order_delivery(recipient_name, phone, address_line, village, district, city, maps_url), " +
  "order_dine_in(table_number, guest_count), " +
  "order_pickup(pickup_time, pickup_code), " +
  "payments(method, status)";

// ---------- Fungsi bantu ----------

const teks = (v: unknown) => (typeof v === "string" ? v : "");
const angka = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

// Relasi satu-ke-satu bisa datang sebagai objek atau array berisi satu objek
function satu(v: unknown): Record<string, unknown> | null {
  if (Array.isArray(v)) return (v[0] as Record<string, unknown>) ?? null;
  if (v && typeof v === "object") return v as Record<string, unknown>;
  return null;
}

function nomorWa(s: string) {
  let n = s.replace(/[^\d+]/g, "");
  if (n.startsWith("+")) n = n.slice(1);
  else if (n.startsWith("0")) n = `62${n.slice(1)}`;
  return n.length >= 9 ? n : "";
}

function formatWaktu(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

function dariDb(r: Record<string, unknown>): Pesanan | null {
  const tipe = DARI_TIPE[teks(r.order_type)];
  if (!tipe) return null; // pesanan kasir (pos) tidak ditampilkan di sini

  const antar = satu(r.order_delivery);
  const makan = satu(r.order_dine_in);
  const ambil = satu(r.order_pickup);
  const bayar = satu(r.payments);

  const item = (Array.isArray(r.order_items) ? r.order_items : []).map(
    (x: Record<string, unknown>) => {
      const harga = angka(x.unit_price);
      const qty = angka(x.quantity);
      return {
        id: teks(x.id),
        nama: teks(x.product_name),
        harga,
        qty,
        total: x.line_total !== null && x.line_total !== undefined ? angka(x.line_total) : harga * qty,
        catatan: teks(x.notes),
      };
    }
  );

  const alamat = antar
    ? [antar.address_line, antar.village, antar.district, antar.city]
        .map(teks)
        .filter(Boolean)
        .join(", ")
    : "";

  const telepon = teks(antar?.phone) || teks(r.customer_phone);

  return {
    id: teks(r.id),
    nomor: teks(r.order_number),
    tipe,
    status: teks(r.status) as StatusDb,
    statusBayar: (teks(r.payment_status) || "unpaid") as StatusBayar,
    metodeBayar: teks(bayar?.method),
    pembeli: teks(antar?.recipient_name) || teks(r.customer_name) || "Pelanggan",
    wa: nomorWa(telepon),
    catatan: teks(r.notes),
    subtotal: angka(r.subtotal),
    diskon: angka(r.discount),
    pajak: angka(r.tax),
    ongkir: angka(r.shipping_fee),
    total: angka(r.total),
    waktu: teks(r.created_at),
    item,
    alamat,
    petaUrl: teks(antar?.maps_url),
    meja: teks(makan?.table_number),
    tamu: angka(makan?.guest_count),
    kodeAmbil: teks(ambil?.pickup_code),
    jamAmbil: teks(ambil?.pickup_time),
  };
}

const cocokFilter = (p: Pesanan, f: FilterPesanan) =>
  (f === "baru" && p.status === "pending") ||
  (f === "proses" &&
    (p.status === "confirmed" ||
      p.status === "preparing" ||
      p.status === "ready" ||
      p.status === "on_delivery")) ||
  (f === "selesai" && (p.status === "completed" || p.status === "cancelled"));

function labelStatus(p: Pesanan) {
  switch (p.status) {
    case "pending":
      return "Menunggu";
    case "confirmed":
      return "Diterima";
    case "preparing":
      return "Diproses";
    case "ready":
      return p.tipe === "meja" ? "Siap disajikan" : "Siap diambil";
    case "on_delivery":
      return "Dikirim";
    case "completed":
      return "Selesai";
    default:
      return "Dibatalkan";
  }
}

/** Langkah berikutnya untuk pesanan yang sudah diterima, tergantung jenisnya. */
function aksiLanjut(p: Pesanan): { label: string; ke: StatusDb; hijau?: boolean } | null {
  switch (p.status) {
    case "confirmed":
    case "preparing":
      if (p.tipe === "antar") return { label: "Antar pesanan", ke: "on_delivery" };
      return {
        label: p.tipe === "meja" ? "Siap disajikan" : "Siap diambil",
        ke: "ready",
      };
    case "on_delivery":
      return { label: "Tandai selesai", ke: "completed", hijau: true };
    case "ready":
      return {
        label: p.tipe === "meja" ? "Sudah disajikan" : "Sudah diambil",
        ke: "completed",
        hijau: true,
      };
    default:
      return null;
  }
}

/** Pakai jenis dari URL jika aktif, kalau tidak pakai jenis aktif pertama. */
function pilihJenis(nilai: string | null, aktif: JenisPesanan[]): JenisPesanan | null {
  if (nilai && (aktif as string[]).includes(nilai)) return nilai as JenisPesanan;
  return aktif[0] ?? null;
}

function Kerangka() {
  return (
    <div className="space-y-6" aria-busy="true">
      <span className="sr-only">Memuat pesanan</span>
      <div className="h-10 w-40 animate-pulse rounded-xl bg-gray-200/70" />
      <div className="h-14 animate-pulse rounded-2xl bg-gray-200/70" />
      <div className="grid gap-3 xl:grid-cols-2">
        <div className="h-64 animate-pulse rounded-2xl bg-gray-200/70" />
        <div className="h-64 animate-pulse rounded-2xl bg-gray-200/70" />
      </div>
    </div>
  );
}

// ---------- Halaman ----------

function IsiPesanan() {
  const { id, base, toko } = useToko();
  const supabase = useMemo(() => createClient(), []);
  const param = useSearchParams().get("jenis");

  const [orders, setOrders] = useState<Pesanan[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [menyegarkan, setMenyegarkan] = useState(false);
  const [galatMuat, setGalatMuat] = useState(false);
  const [galat, setGalat] = useState("");
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterPesanan>("baru");
  const [tolak, setTolak] = useState<Pesanan | null>(null);

  // Hanya jenis pesanan yang diaktifkan toko: satu tab per layanan aktif
  const daftarAktif = JENIS_PESANAN.filter((j) => toko[j.id]);
  const jenis = pilihJenis(param, daftarAktif.map((j) => j.id));

  const muat = useCallback(
    async (senyap = false) => {
      if (senyap) setMenyegarkan(true);
      else setMemuat(true);

      const { data, error } = await supabase
        .from("orders")
        .select(SELECT_PESANAN)
        .eq("shop_id", id)
        .neq("order_type", "pos")
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) {
        setGalatMuat(true);
      } else {
        setOrders(
          ((data ?? []) as unknown as Record<string, unknown>[])
            .map(dariDb)
            .filter((x): x is Pesanan => x !== null)
        );
        setGalatMuat(false);
      }
      setMemuat(false);
      setMenyegarkan(false);
    },
    [supabase, id]
  );

  useEffect(() => {
    muat();
  }, [muat]);

  // Pesanan baru atau perubahan status langsung muncul (butuh Realtime aktif untuk tabel orders)
  useEffect(() => {
    const kanal = supabase
      .channel(`pesanan-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `shop_id=eq.${id}` },
        () => muat(true)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(kanal);
    };
  }, [supabase, id, muat]);

  const jumlahBaru = useMemo(() => {
    const hasil: Record<string, number> = { antar: 0, ambil: 0, meja: 0 };
    orders.forEach((p) => {
      if (p.status === "pending") hasil[p.tipe] += 1;
    });
    return hasil;
  }, [orders]);

  const daftarJenis = useMemo(
    () => (jenis ? orders.filter((p) => p.tipe === jenis) : []),
    [orders, jenis]
  );
  const tampil = useMemo(
    () => daftarJenis.filter((p) => cocokFilter(p, filter)),
    [daftarJenis, filter]
  );

  const ubahStatus = async (p: Pesanan, ke: StatusDb, catatan?: string) => {
    if (sibuk) return;
    setSibuk(p.id);
    setGalat("");

    const sekarang = new Date().toISOString();
    const ubah: Record<string, unknown> = { status: ke, updated_at: sekarang };
    if (ke === "completed") ubah.completed_at = sekarang;

    const { error } = await supabase.from("orders").update(ubah).eq("id", p.id);

    if (error) {
      setGalat("Gagal mengubah status pesanan, coba lagi");
      setSibuk(null);
      return;
    }

    // Pelengkap: riwayat status dan waktu selesai (kegagalan di sini tidak menggagalkan perubahan)
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("order_status_history").insert({
      order_id: p.id,
      from_status: p.status,
      to_status: ke,
      changed_by: user?.id ?? null,
      note: catatan ?? null,
    });
    if (ke === "completed") {
      if (p.tipe === "ambil")
        await supabase.from("order_pickup").update({ picked_up_at: sekarang }).eq("order_id", p.id);
      if (p.tipe === "antar")
        await supabase.from("order_delivery").update({ delivered_at: sekarang }).eq("order_id", p.id);
    }

    setOrders((daftar) => daftar.map((x) => (x.id === p.id ? { ...x, status: ke } : x)));
    setSibuk(null);
  };

  if (memuat) return <Kerangka />;

  if (galatMuat && orders.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-100 bg-white px-6 py-14 text-center shadow-sm">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <AlertTriangle className="h-6 w-6" />
        </span>
        <p className="text-sm text-gray-500">
          Pesanan gagal dimuat. Muat ulang halaman, atau periksa aturan RLS tabel
          orders dan tabel turunannya di Supabase.
        </p>
        <button
          onClick={() => muat()}
          className="rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 text-xs font-medium text-orange-600 transition-colors hover:bg-orange-100"
        >
          Coba lagi
        </button>
      </div>
    );
  }

  if (!jenis) {
    return (
      <div className="space-y-6 md:space-y-8">
        <header>
          <p className="text-sm text-gray-500">Kelola pesanan masuk</p>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">
            Pesanan
          </h2>
        </header>

        <section className="flex flex-col gap-4 rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-orange-50 p-5 sm:flex-row sm:items-center md:p-6">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-amber-500 shadow-sm ring-1 ring-amber-100">
            <Settings2 className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-gray-900">
              Belum ada layanan pesanan yang aktif
            </h3>
            <p className="mt-0.5 text-sm text-gray-600">
              Aktifkan layanan antar, ambil sendiri, atau pesan di meja di
              pengaturan Info toko.
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
      </div>
    );
  }

  const infoJenis = JENIS_PESANAN.find((j) => j.id === jenis)!;

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Header */}
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500">
            Pesanan {infoJenis.label.toLowerCase()}
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">
            Pesanan
          </h2>
        </div>
        <button
          onClick={() => muat(true)}
          disabled={menyegarkan}
          className="mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:border-orange-200 hover:bg-orange-50/50 hover:text-orange-600 disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${menyegarkan ? "animate-spin" : ""}`} />
          Segarkan
        </button>
      </header>

      <div className="space-y-3">
        {/* Tab layanan pembeli: hanya layanan yang diaktifkan */}
        <nav
          aria-label="Jenis pesanan"
          className={`flex gap-1 overflow-x-auto rounded-2xl border border-gray-100 bg-white p-1.5 shadow-sm ${SEMBUNYIKAN_SCROLLBAR}`}
        >
          {daftarAktif.map(({ id: k, label, ikon: Ikon }) => {
            const sel = k === jenis;
            return (
              <Link
                key={k}
                href={`${base}/pesanan?jenis=${k}`}
                scroll={false}
                aria-current={sel ? "page" : undefined}
                className={`flex flex-1 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm transition-all duration-200 ${
                  sel
                    ? "bg-gradient-to-r from-orange-500 to-amber-500 font-semibold text-white shadow-md shadow-orange-500/25"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <Ikon className="h-4 w-4 shrink-0" />
                {label}
                {jumlahBaru[k] > 0 && (
                  <span
                    className={`rounded-full px-1.5 text-[10px] font-bold leading-4 ${
                      sel ? "bg-white text-orange-600" : "bg-orange-500 text-white"
                    }`}
                  >
                    {jumlahBaru[k]}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Filter status */}
        <div className={`flex gap-2 overflow-x-auto py-0.5 ${SEMBUNYIKAN_SCROLLBAR}`}>
          {FILTER_PESANAN.map((f) => {
            const jumlah = daftarJenis.filter((p) => cocokFilter(p, f.id)).length;
            const sel = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                aria-pressed={sel}
                className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-xs font-medium transition-all duration-200 md:text-sm ${
                  sel
                    ? "bg-gray-900 text-white shadow-md shadow-gray-900/20"
                    : "border border-gray-100 bg-white text-gray-600 shadow-sm hover:border-orange-200 hover:text-orange-600"
                }`}
              >
                {f.label}
                <span
                  className={`min-w-5 rounded-full px-1.5 text-center text-[11px] font-bold leading-5 ${
                    sel ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {jumlah}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {galat && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{galat}</p>
        </div>
      )}

      {tampil.length === 0 ? (
        <section className="flex flex-col items-center gap-4 rounded-3xl border border-gray-100 bg-white px-6 py-16 text-center shadow-sm">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-orange-50 ring-8 ring-orange-50/60">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/30">
              <Receipt className="h-7 w-7" />
            </span>
          </span>
          <div>
            <p className="text-base font-bold text-gray-900">Belum ada pesanan</p>
            <p className="mt-1 text-sm text-gray-500">
              Pesanan {infoJenis.label.toLowerCase()} akan muncul di sini.
            </p>
          </div>
        </section>
      ) : (
        <div className="grid gap-3 md:gap-4 xl:grid-cols-2">
          {tampil.map((p) => {
            const final = p.status === "completed" || p.status === "cancelled";
            const lanjut = aksiLanjut(p);
            const IkonJenis = JENIS_PESANAN.find((j) => j.id === p.tipe)!.ikon;
            const baru = p.status === "pending";
            const lagi = sibuk === p.id;
            const metode = LABEL_METODE[p.metodeBayar] ?? "";
            const jamAmbil = formatWaktu(p.jamAmbil);

            return (
              <article
                key={p.id}
                className={`space-y-3.5 rounded-2xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md md:p-5 ${
                  baru ? "border-orange-200 ring-1 ring-orange-100" : "border-gray-100"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                      baru
                        ? "bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/25"
                        : "bg-orange-50 text-orange-500"
                    }`}
                  >
                    <IkonJenis className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-gray-900">
                      <span className="truncate">{p.pembeli}</span>
                      {p.tipe === "meja" && p.meja && (
                        <span className="rounded-md bg-orange-50 px-1.5 py-0.5 text-xs font-bold text-orange-600">
                          Meja {p.meja}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {p.nomor} · {formatWaktu(p.waktu)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${KELAS_STATUS[p.status] ?? KELAS_STATUS.pending}`}
                  >
                    {labelStatus(p)}
                  </span>
                </div>

                <ul className="space-y-1.5 rounded-xl bg-gray-50 p-3.5 text-sm">
                  {p.item.map((i) => (
                    <li key={i.id} className="flex justify-between gap-3">
                      <span className="min-w-0 text-gray-800">
                        {i.nama}{" "}
                        <span className="font-medium text-gray-400">×{i.qty}</span>
                        {i.catatan && (
                          <span className="block text-xs text-gray-400">{i.catatan}</span>
                        )}
                      </span>
                      <span className="shrink-0 text-gray-600">{rupiah(i.total)}</span>
                    </li>
                  ))}
                  {(p.diskon > 0 || p.pajak > 0 || p.ongkir > 0) && (
                    <li className="space-y-1 border-t border-dashed border-gray-200 pt-1.5 text-gray-500">
                      {p.diskon > 0 && (
                        <div className="flex justify-between gap-3">
                          <span>Diskon</span>
                          <span>-{rupiah(p.diskon)}</span>
                        </div>
                      )}
                      {p.pajak > 0 && (
                        <div className="flex justify-between gap-3">
                          <span>Pajak</span>
                          <span>{rupiah(p.pajak)}</span>
                        </div>
                      )}
                      {p.ongkir > 0 && (
                        <div className="flex justify-between gap-3">
                          <span>Ongkos antar</span>
                          <span>{rupiah(p.ongkir)}</span>
                        </div>
                      )}
                    </li>
                  )}
                </ul>

                {/* Detail sesuai jenis layanan */}
                {p.tipe === "antar" && p.alamat && (
                  <div className="flex items-start gap-2 text-xs text-gray-600">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-500" />
                    <p className="min-w-0 flex-1">{p.alamat}</p>
                    {p.petaUrl && (
                      <a
                        href={p.petaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex shrink-0 items-center gap-1 font-medium text-orange-600 hover:text-orange-700"
                      >
                        Peta
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                )}
                {p.tipe === "ambil" && (p.kodeAmbil || jamAmbil) && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
                    {p.kodeAmbil && (
                      <span className="flex items-center gap-1.5">
                        <KeyRound className="h-3.5 w-3.5 text-orange-500" />
                        Kode ambil{" "}
                        <b className="font-bold tracking-wider text-gray-900">
                          {p.kodeAmbil}
                        </b>
                      </span>
                    )}
                    {jamAmbil && <span>Diambil sekitar {jamAmbil}</span>}
                  </div>
                )}
                {p.tipe === "meja" && p.tamu > 0 && (
                  <p className="flex items-center gap-1.5 text-xs text-gray-600">
                    <Users className="h-3.5 w-3.5 text-orange-500" />
                    {p.tamu} tamu
                  </p>
                )}
                {p.catatan && (
                  <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-100">
                    Catatan: {p.catatan}
                  </p>
                )}

                <div className="flex items-end justify-between gap-3">
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <IkonJenis className="h-3.5 w-3.5 text-orange-500" />
                      {p.tipe === "antar"
                        ? "Antar ke rumah"
                        : p.tipe === "ambil"
                          ? "Ambil sendiri"
                          : `Makan di tempat${p.meja ? `, meja ${p.meja}` : ""}`}
                    </span>
                    <span className="flex items-center gap-1">
                      <Banknote className="h-3.5 w-3.5 text-orange-500" />
                      {metode && `${metode} · `}
                      <span
                        className={
                          p.statusBayar === "paid" ? "font-medium text-emerald-600" : ""
                        }
                      >
                        {LABEL_STATUS_BAYAR[p.statusBayar] ?? p.statusBayar}
                      </span>
                    </span>
                  </p>
                  <div className="shrink-0 text-right">
                    <p className="text-[11px] text-gray-400">Total</p>
                    <p className="text-lg font-extrabold leading-tight text-gray-900">
                      {rupiah(p.total)}
                    </p>
                  </div>
                </div>

                {!final && (
                  <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-3.5">
                    {p.wa && (
                      <a
                        href={`https://wa.me/${p.wa}?text=${encodeURIComponent(
                          `Halo ${p.pembeli}, soal pesanan ${p.nomor} di ${toko.nama}`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mr-auto flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3.5 py-2 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100 transition-colors hover:bg-emerald-100"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        Hubungi pembeli
                      </a>
                    )}

                    {p.status === "pending" && (
                      <>
                        <button
                          onClick={() => setTolak(p)}
                          disabled={lagi}
                          className="rounded-xl border border-red-200 bg-white px-4 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
                        >
                          Tolak
                        </button>
                        <button
                          onClick={() => ubahStatus(p, "preparing")}
                          disabled={lagi}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-orange-500/25 transition-all hover:shadow-lg hover:shadow-orange-500/30 active:scale-[0.98] disabled:opacity-60"
                        >
                          {lagi && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          Terima pesanan
                        </button>
                      </>
                    )}

                    {lanjut && (
                      <button
                        onClick={() => ubahStatus(p, lanjut.ke)}
                        disabled={lagi}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-md transition-all hover:shadow-lg active:scale-[0.98] disabled:opacity-60 ${
                          lanjut.hijau
                            ? "bg-gradient-to-r from-emerald-500 to-teal-500 shadow-emerald-500/25 hover:shadow-emerald-500/30"
                            : "bg-gradient-to-r from-orange-500 to-amber-500 shadow-orange-500/25 hover:shadow-orange-500/30"
                        }`}
                      >
                        {lagi && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {lanjut.label}
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {tolak && (
        <Dialog judul="Tolak pesanan" onTutup={() => setTolak(null)}>
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-500 ring-1 ring-red-100">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-gray-900">Tolak pesanan ini?</h2>
              <p className="text-sm text-gray-500">
                Pesanan {tolak.nomor} dari {tolak.pembeli} akan dibatalkan dan pembeli
                diberi tahu. Tindakan ini tidak bisa dibatalkan.
              </p>
            </div>
          </div>
          <div className="flex gap-2.5">
            <button
              onClick={() => setTolak(null)}
              className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Batal
            </button>
            <button
              onClick={() => {
                ubahStatus(tolak, "cancelled", "Ditolak oleh toko");
                setTolak(null);
              }}
              className="flex-1 rounded-xl bg-gradient-to-r from-red-500 to-rose-500 py-2.5 text-sm font-semibold text-white shadow-md shadow-red-500/25 transition-all hover:shadow-lg hover:shadow-red-500/30 active:scale-[0.98]"
            >
              Ya, tolak
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

// useSearchParams wajib dibungkus Suspense agar build tidak error
export default function PesananPage() {
  return (
    <Suspense fallback={null}>
      <IsiPesanan />
    </Suspense>
  );
}