"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  ArrowLeft,
  Bike,
  CheckCircle2,
  ClipboardList,
  History,
  Loader2,
  MapPin,
  MessageCircle,
  RefreshCw,
  Search,
  ShoppingBag,
  Store,
  Trash2,
  UtensilsCrossed,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/toast";
import { useModal, type OpsiKonfirmasi } from "@/components/modal";
import { useToko } from "../../components/toko-provider";

// ---------- Konstanta & tipe ----------

const PER_HALAMAN = 20;

// Nilai di bawah mengikuti CHECK constraint tabel orders dan payments.
export const STATUS: Record<string, { label: string; warna: string }> = {
  pending: { label: "Menunggu", warna: "bg-amber-50 text-amber-700 ring-amber-200" },
  confirmed: { label: "Dikonfirmasi", warna: "bg-blue-50 text-blue-700 ring-blue-200" },
  preparing: { label: "Diproses", warna: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
  ready: { label: "Siap", warna: "bg-teal-50 text-teal-700 ring-teal-200" },
  on_delivery: { label: "Dalam pengantaran", warna: "bg-purple-50 text-purple-700 ring-purple-200" },
  completed: { label: "Selesai", warna: "bg-green-50 text-green-700 ring-green-200" },
  cancelled: { label: "Dibatalkan", warna: "bg-red-50 text-red-700 ring-red-200" },
};

// ---------- Status tampilan (disamakan dengan halaman pelanggan) ----------

/** Status tampilan, diturunkan dari status database. */
export type StatusPesanan =
  | "menunggu"
  | "diproses"
  | "dikirim"
  | "siap"
  | "selesai"
  | "dibatalkan";

const STATUS_TAMPIL: Record<StatusPesanan, { label: string; kelas: string }> = {
  menunggu: { label: "Menunggu konfirmasi", kelas: "bg-amber-50 text-amber-700 ring-1 ring-amber-100" },
  diproses: { label: "Sedang diproses", kelas: "bg-blue-50 text-blue-700 ring-1 ring-blue-100" },
  dikirim: { label: "Sedang diantar", kelas: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100" },
  siap: { label: "Siap", kelas: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" },
  selesai: { label: "Selesai", kelas: "bg-gray-100 text-gray-600 ring-1 ring-gray-200" },
  dibatalkan: { label: "Dibatalkan", kelas: "bg-red-50 text-red-700 ring-1 ring-red-100" },
};

/** Status database ke status tampilan. */
export function petakanStatus(db: string, mode: string): StatusPesanan {
  switch (db) {
    case "pending":
      return "menunggu";
    case "confirmed":
    case "preparing":
      return "diproses";
    case "on_delivery":
      return "dikirim";
    case "ready":
      // Pesanan antar yang "ready" masih tahap disiapkan
      return mode === "delivery" ? "diproses" : "siap";
    case "completed":
      return "selesai";
    case "cancelled":
      return "dibatalkan";
    default:
      return "menunggu";
  }
}

function labelStatus(status: StatusPesanan, mode: string) {
  if (status === "siap") {
    return mode === "dine_in" ? "Siap disajikan" : "Siap diambil";
  }
  return STATUS_TAMPIL[status].label;
}

/** Label + kelas warna lencana untuk status database suatu pesanan. */
export function tampilanStatus(statusDb: string, mode: string): { label: string; warna: string } {
  // Nilai di luar daftar ditampilkan apa adanya
  if (!(statusDb in STATUS)) {
    return { label: statusDb, warna: "bg-gray-100 text-gray-600 ring-1 ring-gray-200" };
  }
  const status = petakanStatus(statusDb, mode);
  return { label: labelStatus(status, mode), warna: STATUS_TAMPIL[status].kelas };
}

const LABEL_AKSI: Record<string, string> = {
  confirmed: "Terima pesanan",
  preparing: "Mulai proses",
  ready: "Tandai siap",
  on_delivery: "Kirim pesanan",
  completed: "Selesaikan",
};
const STATUS_AKHIR = ["completed", "cancelled"];

// Alur status per jenis pesanan. Tombol aksi mengikuti alur ini.
const ALUR_DASAR = ["pending", "confirmed", "preparing", "ready", "completed"];
const ALUR: Record<string, string[]> = {
  pos: ["pending", "completed"], // kasir: langsung selesai
  delivery: ["pending", "confirmed", "preparing", "ready", "on_delivery", "completed"],
  pickup: ALUR_DASAR,
  dine_in: ALUR_DASAR,
};

function alurTipe(tipe: string): string[] {
  return ALUR[tipe] ?? ALUR_DASAR;
}

function statusBerikutnya(status: string, tipe: string): string | null {
  const alur = alurTipe(tipe);
  const i = alur.indexOf(status);
  if (i >= 0) return i < alur.length - 1 ? alur[i + 1] : null;
  // Status di luar alur jenis ini (mis. data lama): ikuti alur dasar
  const j = ALUR_DASAR.indexOf(status);
  return j >= 0 && j < ALUR_DASAR.length - 1 ? ALUR_DASAR[j + 1] : null;
}

const STATUS_BAYAR: Record<string, { label: string; warna: string }> = {
  unpaid: { label: "Belum bayar", warna: "bg-gray-100 text-gray-600 ring-gray-200" },
  partial: { label: "Sebagian", warna: "bg-amber-50 text-amber-700 ring-amber-200" },
  paid: { label: "Lunas", warna: "bg-green-50 text-green-700 ring-green-200" },
  refunded: { label: "Dikembalikan", warna: "bg-red-50 text-red-700 ring-red-200" },
};
const NILAI_LUNAS = "paid";

const METODE: Record<string, string> = {
  cash: "Tunai",
  qris: "QRIS",
  transfer: "Transfer bank",
  card: "Kartu",
  ewallet: "E-wallet",
  cod: "Bayar di tempat (COD)",
};

export type Item = {
  id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  line_total: number | null;
  notes: string | null;
};

export type Pembayaran = {
  id: string;
  method: string;
  amount: number;
  status: string;
  reference: string | null;
  paid_at: string | null;
};

// Relasi (order_delivery, order_dine_in, order_pickup) bergantung pada jenis pesanan,
// jadi dibiarkan longgar di sini dan diketik ulang di tiap komponen.
export type Pesanan = {
  id: string;
  order_number: string;
  order_type: string;
  status: string;
  payment_status: string;
  customer_name: string | null;
  customer_phone: string | null;
  notes: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  shipping_fee: number;
  total: number;
  completed_at: string | null;
  created_at: string;
  order_items: Item[] | null;
  payments: Pembayaran[] | null;
  [relasi: string]: unknown;
};

type Riwayat = {
  id: string;
  from_status: string | null;
  to_status: string;
  note: string | null;
  created_at: string;
};

type Supabase = ReturnType<typeof createClient>;

const SELECT_DASAR = `
  id, order_number, order_type, status, payment_status, customer_name, customer_phone, notes,
  subtotal, discount, tax, shipping_fee, total, completed_at, created_at,
  order_items(id, product_name, unit_price, quantity, line_total, notes),
  payments(id, method, amount, status, reference, paid_at)
`;

// ---------- Fungsi bantu ----------

// Relasi satu-ke-satu bisa datang sebagai objek atau array tergantung skema
export function satu<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export const rupiah = (n: unknown) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

export const waktu = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("id-ID", {
        timeZone: "Asia/Jakarta",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";

function nomorWa(telepon: string): string {
  const d = telepon.replace(/\D/g, "");
  return d.startsWith("0") ? `62${d.slice(1)}` : d;
}

function pesanGalatDb(error: { code?: string; message?: string }): string {
  if (error.code === "42501") return "Kamu tidak punya izin mengubah pesanan ini.";
  if (error.code === "23514") return "Nilai tidak sesuai aturan database.";
  if (error.code === "23503")
    return "Pesanan masih terhubung ke data lain. Pastikan relasi memakai ON DELETE CASCADE.";
  return error.message || "Coba lagi beberapa saat.";
}

// Memecah daftar agar query .in(...) tidak terlalu panjang
function potong<T>(a: T[], n = 100): T[][] {
  const hasil: T[][] = [];
  for (let i = 0; i < a.length; i += n) hasil.push(a.slice(i, i + n));
  return hasil;
}

const bisaLunas = (p: Pesanan) =>
  p.status !== "cancelled" && p.payment_status !== NILAI_LUNAS && p.payment_status !== "refunded";

// ---------- Header ----------

type PropsHeader = {
  judul: string;
  deskripsi?: string;
  ikon: LucideIcon;
  onKembali: () => void;
  onMuatUlang?: () => void;
  memuat?: boolean;
  /** Esc = kembali. Matikan saat dialog konfirmasi terbuka. */
  escAktif?: boolean;
};

function HeaderPesanan({
  judul,
  deskripsi,
  ikon: Ikon,
  onKembali,
  onMuatUlang,
  memuat = false,
  escAktif = true,
}: PropsHeader) {
  // Tombol Esc = kembali
  useEffect(() => {
    if (!escAktif) return;
    const tekan = (e: KeyboardEvent) => {
      if (e.key === "Escape") onKembali();
    };
    window.addEventListener("keydown", tekan);
    return () => window.removeEventListener("keydown", tekan);
  }, [onKembali, escAktif]);

  return (
    <header className="sticky top-0 z-10 border-b border-gray-100 bg-white/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-4xl items-center gap-3 px-4 py-3 sm:px-6">
        {/* Paling kiri */}
        <button
          type="button"
          onClick={onKembali}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:border-orange-200 hover:text-orange-600"
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali
        </button>

        {/* Judul + sub di sebelah kanan tombol */}
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
          <Ikon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold text-gray-900">{judul}</h1>
          {deskripsi && <p className="truncate text-xs text-gray-500">{deskripsi}</p>}
        </div>

        {onMuatUlang && (
          <button
            type="button"
            onClick={onMuatUlang}
            disabled={memuat}
            aria-label="Muat ulang"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition-colors hover:border-orange-200 hover:text-orange-600 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${memuat ? "animate-spin" : ""}`} />
          </button>
        )}
      </div>
    </header>
  );
}

// ---------- Komponen kecil ----------

function Lencana({ teks, warna }: { teks: string; warna: string }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${warna}`}
    >
      {teks}
    </span>
  );
}

function Judul({ ikon: Ikon, children }: { ikon?: LucideIcon; children: ReactNode }) {
  return (
    <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
      {Ikon && <Ikon className="h-3.5 w-3.5" />}
      {children}
    </h4>
  );
}

export function Baris({ label, nilai }: { label: string; nilai: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="shrink-0 text-gray-500">{label}</span>
      <span className="min-w-0 break-words text-right font-medium text-gray-900">{nilai}</span>
    </div>
  );
}

function RiwayatStatus({
  supabase,
  pesananId,
  status,
}: {
  supabase: Supabase;
  pesananId: string;
  status: string;
}) {
  const [data, setData] = useState<Riwayat[] | null>(null);

  // Dimuat ulang setiap status berubah supaya riwayat selalu terbaru
  useEffect(() => {
    let batal = false;
    supabase
      .from("order_status_history")
      .select("id, from_status, to_status, note, created_at")
      .eq("order_id", pesananId)
      .order("created_at", { ascending: false })
      .then(({ data: rows, error }) => {
        if (batal) return;
        if (error) console.error("Gagal memuat riwayat status:", error);
        setData((rows as Riwayat[] | null) ?? []);
      });
    return () => {
      batal = true;
    };
  }, [supabase, pesananId, status]);

  if (data === null) return <p className="text-sm text-gray-400">Memuat riwayat...</p>;
  if (data.length === 0) return <p className="text-sm text-gray-400">Belum ada riwayat.</p>;

  return (
    <ol className="space-y-2">
      {data.map((r) => (
        <li key={r.id} className="flex items-start gap-2.5 text-sm">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-orange-400" />
          <div className="min-w-0">
            <p className="text-gray-900">
              {r.from_status ? `${STATUS[r.from_status]?.label ?? r.from_status} → ` : ""}
              <span className="font-medium">{STATUS[r.to_status]?.label ?? r.to_status}</span>
            </p>
            <p className="text-xs text-gray-400">{waktu(r.created_at)}</p>
            {r.note && <p className="text-xs text-gray-500">{r.note}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

// ---------- Baris daftar (data minimal) ----------

function BarisPesanan({
  p,
  ikon: IkonTipe,
  dipilih,
  onPilih,
  onBuka,
}: {
  p: Pesanan;
  ikon: LucideIcon;
  dipilih: boolean;
  onPilih: () => void;
  onBuka: () => void;
}) {
  const st = tampilanStatus(p.status, p.order_type);
  const bayar = STATUS_BAYAR[p.payment_status] ?? {
    label: p.payment_status,
    warna: "bg-gray-100 text-gray-600 ring-gray-200",
  };

  return (
    <article
      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 shadow-sm transition-colors ${
        dipilih ? "border-orange-300 bg-orange-50/50" : "border-gray-100 bg-white"
      }`}
    >
      <input
        type="checkbox"
        checked={dipilih}
        onChange={onPilih}
        aria-label={`Pilih ${p.order_number}`}
        className="h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 accent-orange-500"
      />
      <button type="button" onClick={onBuka} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-500 sm:flex">
          <IkonTipe className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-sm font-semibold text-gray-900">{p.order_number}</span>
            <Lencana teks={st.label} warna={st.warna} />
          </div>
          <p className="mt-0.5 truncate text-xs text-gray-500">
            {p.customer_name || "Pelanggan"} · {waktu(p.created_at)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-sm font-bold text-gray-900">{rupiah(p.total)}</span>
          <Lencana teks={bayar.label} warna={bayar.warna} />
        </div>
      </button>
    </article>
  );
}

// ---------- Modal detail ----------

function ModalPesanan({
  p,
  ikon: IkonTipe,
  labelTipe,
  rincian,
  sibuk,
  supabase,
  onTutup,
  onUbahStatus,
  onLunas,
  onHapus,
  escAktif,
}: {
  p: Pesanan;
  ikon: LucideIcon;
  labelTipe: string;
  rincian: ReactNode;
  sibuk: boolean;
  supabase: Supabase;
  onTutup: () => void;
  onUbahStatus: (ke: string) => void;
  onLunas: () => void;
  onHapus: () => void;
  /** Matikan saat dialog konfirmasi terbuka agar Esc hanya menutup dialog itu. */
  escAktif: boolean;
}) {
  // Esc menutup modal saja (capture + stop supaya tidak ikut menutup layar di belakangnya)
  useEffect(() => {
    if (!escAktif) return;
    const tekan = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onTutup();
      }
    };
    window.addEventListener("keydown", tekan, true);
    return () => window.removeEventListener("keydown", tekan, true);
  }, [onTutup, escAktif]);

  const st = tampilanStatus(p.status, p.order_type);
  const bayar = STATUS_BAYAR[p.payment_status] ?? {
    label: p.payment_status,
    warna: "bg-gray-100 text-gray-600 ring-gray-200",
  };
  const items = p.order_items ?? [];
  const berikutnya = statusBerikutnya(p.status, p.order_type);
  const bisaBatal = !STATUS_AKHIR.includes(p.status);
  const lunasBisa = bisaLunas(p);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={onTutup}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Detail pesanan ${p.order_number}`}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
      >
        {/* Kepala */}
        <div className="flex items-start gap-3 border-b border-gray-100 px-5 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
            <IkonTipe className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-sm font-semibold text-gray-900">{p.order_number}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Lencana teks={st.label} warna={st.warna} />
              <Lencana teks={bayar.label} warna={bayar.warna} />
            </div>
            <p className="mt-1 text-xs text-gray-400">{waktu(p.created_at)}</p>
          </div>
          <button
            type="button"
            onClick={onTutup}
            aria-label="Tutup"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Isi */}
        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <div>
            <Judul>Pelanggan</Judul>
            <div className="space-y-1.5">
              <Baris label="Nama" nilai={p.customer_name || "-"} />
              <Baris
                label="Telepon"
                nilai={
                  p.customer_phone ? (
                    <a
                      href={`https://wa.me/${nomorWa(p.customer_phone)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-orange-600 hover:underline"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      {p.customer_phone}
                    </a>
                  ) : (
                    "-"
                  )
                }
              />
              {p.notes && <Baris label="Catatan" nilai={p.notes} />}
            </div>
          </div>

          <div>
            <Judul ikon={IkonTipe}>{labelTipe}</Judul>
            {rincian}
          </div>

          <div>
            <Judul ikon={ClipboardList}>Item pesanan</Judul>
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
              {items.map((i) => (
                <li key={i.id} className="flex items-start justify-between gap-4 px-3.5 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">
                      {i.quantity}× {i.product_name}
                    </p>
                    <p className="text-xs text-gray-400">{rupiah(i.unit_price)} / item</p>
                    {i.notes && <p className="text-xs text-gray-500">Catatan: {i.notes}</p>}
                  </div>
                  <span className="shrink-0 font-medium text-gray-900">
                    {rupiah(i.line_total ?? Number(i.unit_price) * Number(i.quantity))}
                  </span>
                </li>
              ))}
              {items.length === 0 && <li className="px-3.5 py-3 text-sm text-gray-400">Tidak ada item.</li>}
            </ul>

            <div className="mt-3 space-y-1.5">
              <Baris label="Subtotal" nilai={rupiah(p.subtotal)} />
              {Number(p.discount) > 0 && <Baris label="Diskon" nilai={`- ${rupiah(p.discount)}`} />}
              {Number(p.tax) > 0 && <Baris label="Pajak" nilai={rupiah(p.tax)} />}
              {Number(p.shipping_fee) > 0 && <Baris label="Ongkir" nilai={rupiah(p.shipping_fee)} />}
              <div className="flex items-center justify-between border-t border-gray-100 pt-2 text-sm">
                <span className="font-semibold text-gray-900">Total</span>
                <span className="text-base font-bold text-orange-600">{rupiah(p.total)}</span>
              </div>
            </div>
          </div>

          {(p.payments ?? []).length > 0 && (
            <div>
              <Judul ikon={Wallet}>Pembayaran</Judul>
              <ul className="space-y-2">
                {(p.payments ?? []).map((b) => (
                  <li
                    key={b.id}
                    className="flex items-start justify-between gap-4 rounded-xl bg-gray-50 px-3.5 py-2.5 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900">{METODE[b.method] ?? b.method}</p>
                      <p className="text-xs text-gray-400">
                        {b.paid_at ? `Dibayar ${waktu(b.paid_at)}` : `Status: ${b.status}`}
                        {b.reference ? ` · ${b.reference}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 font-medium text-gray-900">{rupiah(b.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <Judul ikon={History}>Riwayat status</Judul>
            <RiwayatStatus supabase={supabase} pesananId={p.id} status={p.status} />
          </div>
        </div>

        {/* Aksi */}
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-5 py-3.5">
          {berikutnya && (
            <button
              type="button"
              disabled={sibuk}
              onClick={() => onUbahStatus(berikutnya)}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-orange-500/20 transition-all hover:shadow-lg active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {sibuk && <Loader2 className="h-4 w-4 animate-spin" />}
              {LABEL_AKSI[berikutnya]}
            </button>
          )}
          {lunasBisa && (
            <button
              type="button"
              disabled={sibuk}
              onClick={onLunas}
              className="rounded-full border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 transition-colors hover:bg-green-100 disabled:opacity-60"
            >
              Tandai lunas
            </button>
          )}
          {bisaBatal && (
            <button
              type="button"
              disabled={sibuk}
              onClick={() => onUbahStatus("cancelled")}
              className="rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
            >
              Batalkan
            </button>
          )}
          <button
            type="button"
            disabled={sibuk}
            onClick={onHapus}
            aria-label="Hapus pesanan"
            className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" />
            Hapus
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Daftar pesanan full screen (dipakai tiap komponen jenis pesanan) ----------

export type DaftarPesananProps = {
  /** Nilai orders.order_type: pos | delivery | pickup | dine_in */
  tipe: string;
  judul: string;
  deskripsi?: string;
  ikon: LucideIcon;
  /** Relasi yang di-select, mis. "order_delivery(*)". Kosongkan bila tidak ada. */
  relasi?: string;
  /** Rincian khusus jenis pesanan, tampil di modal detail */
  rincian: (p: Pesanan) => ReactNode;
  /**
   * Dipanggil setelah status berhasil menjadi "completed".
   * Kembalikan patch lokal untuk disalin ke state (mis. relasi yang baru diisi).
   */
  saatSelesai?: (p: Pesanan, sekarang: string, supabase: Supabase) => Promise<Partial<Pesanan>>;
  onKembali: () => void;
};

export function DaftarPesanan({
  tipe,
  judul,
  deskripsi,
  ikon,
  relasi,
  rincian,
  saatSelesai,
  onKembali,
}: DaftarPesananProps) {
  const { id } = useToko();
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const modal = useModal();

  // Selama dialog konfirmasi terbuka, Esc hanya boleh menutup dialog itu
  const [dialogBuka, setDialogBuka] = useState(false);
  const tanya = async (opsi: OpsiKonfirmasi) => {
    setDialogBuka(true);
    try {
      return await modal.konfirmasi(opsi);
    } finally {
      setDialogBuka(false);
    }
  };

  const [daftar, setDaftar] = useState<Pesanan[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [memuatLagi, setMemuatLagi] = useState(false);
  const [galat, setGalat] = useState(false);
  const [galatLagi, setGalatLagi] = useState(false);
  const [adaLagi, setAdaLagi] = useState(false);

  const [input, setInput] = useState("");
  const [kata, setKata] = useState("");

  const [terbuka, setTerbuka] = useState<string | null>(null);
  const [dipilih, setDipilih] = useState<Set<string>>(new Set());
  const [sibuk, setSibuk] = useState(false);

  // Mencegah hasil permintaan lama menimpa hasil yang lebih baru
  const tokenMuat = useRef(0);
  const areaGulir = useRef<HTMLElement | null>(null);
  const sentinel = useRef<HTMLDivElement | null>(null);

  // Kunci scroll halaman di belakang saat layar penuh
  useEffect(() => {
    const awal = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = awal;
    };
  }, []);

  const muat = useCallback(
    async (mulai: number) => {
      const token = ++tokenMuat.current;
      if (mulai === 0) {
        setMemuat(true);
        setGalat(false);
        setGalatLagi(false);
        setDipilih(new Set());
      } else {
        setMemuatLagi(true);
        setGalatLagi(false);
      }

      const pilih = relasi ? `${SELECT_DASAR},\n  ${relasi}` : SELECT_DASAR;

      let q = supabase
        .from("orders")
        .select(pilih)
        .eq("shop_id", id)
        .eq("order_type", tipe)
        .order("created_at", { ascending: false })
        .order("created_at", { referencedTable: "order_items", ascending: true })
        .range(mulai, mulai + PER_HALAMAN - 1);

      // Halaman ini khusus pesanan yang sudah selesai
      q = q.eq("status", "completed");
      if (kata) {
        const aman = kata.replace(/[,()%*\\]/g, " ").trim();
        if (aman) q = q.or(`order_number.ilike.%${aman}%,customer_name.ilike.%${aman}%`);
      }

      const { data, error } = await q;
      if (token !== tokenMuat.current) return;

      if (error) {
        console.error("Gagal memuat pesanan:", error);
        if (mulai === 0) setGalat(true);
        else {
          setGalatLagi(true);
          toast.galat("Gagal memuat pesanan", pesanGalatDb(error));
        }
        setMemuat(false);
        setMemuatLagi(false);
        return;
      }

      const baris = (data ?? []) as unknown as Pesanan[];
      setDaftar((d) => {
        if (mulai === 0) return baris;
        // Hindari duplikat bila ada pesanan baru yang menggeser urutan
        const ada = new Set(d.map((x) => x.id));
        return [...d, ...baris.filter((x) => !ada.has(x.id))];
      });
      setAdaLagi(baris.length === PER_HALAMAN);
      setMemuat(false);
      setMemuatLagi(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [supabase, id, tipe, relasi, kata]
  );

  useEffect(() => {
    muat(0);
  }, [muat]);

  // Infinite scroll: muat halaman berikutnya saat ujung daftar mendekati layar
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !adaLagi || memuat || memuatLagi || galatLagi) return;
    const obs = new IntersectionObserver(
      (entri) => {
        if (entri[0]?.isIntersecting) muat(daftar.length);
      },
      { root: areaGulir.current, rootMargin: "300px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [adaLagi, memuat, memuatLagi, galatLagi, daftar.length, muat]);

  // ---------- Pilihan ----------

  const terpilih = useMemo(() => daftar.filter((p) => dipilih.has(p.id)), [daftar, dipilih]);
  const semuaDipilih = daftar.length > 0 && terpilih.length === daftar.length;

  const bisaLanjut = terpilih.filter((p) => statusBerikutnya(p.status, p.order_type));
  const bisaBatalMassal = terpilih.filter((p) => !STATUS_AKHIR.includes(p.status));
  const bisaLunasMassal = terpilih.filter(bisaLunas);

  // Bila semua yang dipilih punya langkah berikutnya yang sama, tampilkan namanya
  const labelLanjut = (() => {
    const set = new Set(bisaLanjut.map((p) => statusBerikutnya(p.status, p.order_type)));
    return set.size === 1 ? LABEL_AKSI[[...set][0] as string] : "Lanjutkan status";
  })();

  const alihPilih = (pid: string) =>
    setDipilih((s) => {
      const n = new Set(s);
      if (n.has(pid)) n.delete(pid);
      else n.add(pid);
      return n;
    });

  const alihSemua = () => setDipilih(semuaDipilih ? new Set() : new Set(daftar.map((p) => p.id)));

  // ---------- Aksi (satu atau banyak pesanan) ----------

  const jalankanStatus = async (rencana: { p: Pesanan; ke: string }[]) => {
    if (rencana.length === 0) return;
    setSibuk(true);
    try {
      const sekarang = new Date().toISOString();
      const berhasil: { p: Pesanan; ke: string }[] = [];
      let ditolak = 0;
      let galatDb = false;

      const kelompok = new Map<string, Pesanan[]>();
      for (const { p, ke } of rencana) kelompok.set(ke, [...(kelompok.get(ke) ?? []), p]);

      for (const [ke, ps] of kelompok) {
        const patch: Record<string, unknown> = { status: ke, updated_at: sekarang };
        if (ke === "completed") patch.completed_at = sekarang;

        for (const bagian of potong(ps)) {
          const { data, error } = await supabase
            .from("orders")
            .update(patch)
            .eq("shop_id", id)
            .in("id", bagian.map((x) => x.id))
            .select("id");

          if (error) {
            console.error("Gagal mengubah status:", error);
            toast.galat("Gagal mengubah status", pesanGalatDb(error));
            galatDb = true;
            continue;
          }
          // RLS yang menolak update tidak mengembalikan error, hanya kurang baris
          const oke = new Set((data ?? []).map((r: { id: string }) => r.id));
          for (const p of bagian) {
            if (oke.has(p.id)) berhasil.push({ p, ke });
            else ditolak++;
          }
        }
      }

      if (berhasil.length > 0) {
        // Langkah tambahan khusus jenis pesanan (isi waktu diambil / tiba, dsb.)
        const tambahan = new Map<string, Partial<Pesanan>>();
        if (saatSelesai) {
          await Promise.all(
            berhasil
              .filter((b) => b.ke === "completed")
              .map(async ({ p }) => {
                try {
                  tambahan.set(p.id, await saatSelesai(p, sekarang, supabase));
                } catch (e) {
                  console.error("Gagal menjalankan langkah saat selesai:", e);
                }
              })
          );
        }

        // Catat riwayat. Hapus blok ini bila database sudah punya trigger yang mencatatnya.
        const { data: sesi } = await supabase.auth.getUser();
        for (const bagian of potong(berhasil)) {
          const { error: errRiwayat } = await supabase.from("order_status_history").insert(
            bagian.map(({ p, ke }) => ({
              order_id: p.id,
              from_status: p.status,
              to_status: ke,
              changed_by: sesi.user?.id ?? null,
            }))
          );
          if (errRiwayat) console.error("Gagal mencatat riwayat status:", errRiwayat);
        }

        const peta = new Map(berhasil.map((b) => [b.p.id, b.ke]));
        setDaftar((d) =>
          d.map((p) => {
            const ke = peta.get(p.id);
            if (!ke) return p;
            return {
              ...p,
              status: ke,
              completed_at: ke === "completed" ? sekarang : p.completed_at,
              ...(tambahan.get(p.id) ?? {}),
            };
          })
        );

        toast.sukses(
          "Status diperbarui",
          berhasil.length === 1
            ? `${berhasil[0].p.order_number} kini ${tampilanStatus(berhasil[0].ke, berhasil[0].p.order_type).label}.`
            : `${berhasil.length} pesanan diperbarui.`
        );
      }

      if (ditolak > 0 && !galatDb) {
        toast.galat(
          "Status tidak berubah",
          `${ditolak} pesanan tidak diubah: kamu tidak punya izin, atau pesanan tidak ditemukan.`
        );
      }

      setDipilih(new Set());
    } catch (e) {
      console.error("Gagal mengubah status:", e);
      toast.galat("Gagal mengubah status", "Periksa koneksi internet lalu coba lagi.");
    } finally {
      setSibuk(false);
    }
  };

  const tandaiLunas = async (target: Pesanan[]) => {
    const layak = target.filter(bisaLunas);
    if (layak.length === 0) return;
    setSibuk(true);
    try {
      const sekarang = new Date().toISOString();
      const lunasIds = new Set<string>();
      let galatDb = false;

      for (const bagian of potong(layak)) {
        const ids = bagian.map((x) => x.id);
        const { data, error } = await supabase
          .from("orders")
          .update({ payment_status: NILAI_LUNAS, updated_at: sekarang })
          .eq("shop_id", id)
          .in("id", ids)
          .select("id");

        if (error) {
          console.error("Gagal menandai lunas:", error);
          toast.galat("Gagal menandai lunas", pesanGalatDb(error));
          galatDb = true;
          continue;
        }
        const oke = (data ?? []).map((r: { id: string }) => r.id);
        oke.forEach((x: string) => lunasIds.add(x));

        // Samakan catatan di tabel payments, hanya yang masih pending
        if (oke.length > 0) {
          const { error: errBayar } = await supabase
            .from("payments")
            .update({ status: NILAI_LUNAS, paid_at: sekarang })
            .in("order_id", oke)
            .eq("status", "pending");
          if (errBayar) console.error("Gagal memperbarui payments:", errBayar);
        }
      }

      if (lunasIds.size > 0) {
        setDaftar((d) =>
          d.map((p) =>
            lunasIds.has(p.id)
              ? {
                  ...p,
                  payment_status: NILAI_LUNAS,
                  payments: (p.payments ?? []).map((b) =>
                    b.status === "pending" ? { ...b, status: NILAI_LUNAS, paid_at: sekarang } : b
                  ),
                }
              : p
          )
        );
        toast.sukses(
          "Pembayaran dicatat",
          lunasIds.size === 1
            ? `${layak.find((x) => lunasIds.has(x.id))?.order_number ?? "Pesanan"} ditandai lunas.`
            : `${lunasIds.size} pesanan ditandai lunas.`
        );
      }

      const ditolak = layak.length - lunasIds.size;
      if (ditolak > 0 && !galatDb) {
        toast.galat(
          "Pembayaran tidak berubah",
          `${ditolak} pesanan tidak diubah: kamu tidak punya izin, atau pesanan tidak ditemukan.`
        );
      }
      setDipilih(new Set());
    } catch (e) {
      console.error("Gagal menandai lunas:", e);
      toast.galat("Gagal menandai lunas", "Periksa koneksi internet lalu coba lagi.");
    } finally {
      setSibuk(false);
    }
  };

  const hapus = async (target: Pesanan[]) => {
    if (target.length === 0) return;
    const setuju = await tanya({
      judul: target.length === 1 ? "Hapus pesanan ini?" : `Hapus ${target.length} pesanan?`,
      deskripsi:
        target.length === 1
          ? `Pesanan ${target[0].order_number} akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.`
          : `${target.length} pesanan terpilih akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.`,
      jenis: "peringatan",
      teksSetuju: "Ya, hapus",
      teksBatal: "Batal",
      bahaya: true,
    });
    if (!setuju) return;

    setSibuk(true);
    try {
      const terhapus = new Set<string>();
      let galatDb = false;

      for (const bagian of potong(target)) {
        const { data, error } = await supabase
          .from("orders")
          .delete()
          .eq("shop_id", id)
          .in("id", bagian.map((x) => x.id))
          .select("id");

        if (error) {
          console.error("Gagal menghapus pesanan:", error);
          toast.galat("Gagal menghapus pesanan", pesanGalatDb(error));
          galatDb = true;
          continue;
        }
        (data ?? []).forEach((r: { id: string }) => terhapus.add(r.id));
      }

      if (terhapus.size > 0) {
        setDaftar((d) => d.filter((p) => !terhapus.has(p.id)));
        setDipilih((s) => new Set([...s].filter((x) => !terhapus.has(x))));
        setTerbuka((t) => (t && terhapus.has(t) ? null : t));
        toast.sukses(
          "Pesanan dihapus",
          terhapus.size === 1 ? "1 pesanan dihapus." : `${terhapus.size} pesanan dihapus.`
        );
      }

      const ditolak = target.length - terhapus.size;
      if (ditolak > 0 && !galatDb) {
        toast.galat(
          "Tidak semua terhapus",
          `${ditolak} pesanan tidak dihapus: kamu tidak punya izin, atau pesanan tidak ditemukan.`
        );
      }
    } catch (e) {
      console.error("Gagal menghapus pesanan:", e);
      toast.galat("Gagal menghapus pesanan", "Periksa koneksi internet lalu coba lagi.");
    } finally {
      setSibuk(false);
    }
  };

  // Satu pesanan (dari modal)
  const ubahStatus = async (p: Pesanan, ke: string) => {
    if (ke === "cancelled") {
      const setuju = await tanya({
        judul: "Batalkan pesanan ini?",
        deskripsi: `Pesanan ${p.order_number} akan dibatalkan.`,
        jenis: "peringatan",
        teksSetuju: "Ya, batalkan",
        teksBatal: "Tidak jadi",
        bahaya: true,
      });
      if (!setuju) return;
    }
    return jalankanStatus([{ p, ke }]);
  };

  // Banyak pesanan (dari bilah aksi)
  const lanjutkanMassal = () =>
    jalankanStatus(
      bisaLanjut.map((p) => ({ p, ke: statusBerikutnya(p.status, p.order_type) as string }))
    );

  const batalkanMassal = async () => {
    const setuju = await tanya({
      judul: `Batalkan ${bisaBatalMassal.length} pesanan?`,
      deskripsi: "Semua pesanan terpilih yang belum selesai akan dibatalkan.",
      jenis: "peringatan",
      teksSetuju: "Ya, batalkan",
      teksBatal: "Tidak jadi",
      bahaya: true,
    });
    if (!setuju) return;
    return jalankanStatus(bisaBatalMassal.map((p) => ({ p, ke: "cancelled" })));
  };

  const cari = (e: React.FormEvent) => {
    e.preventDefault();
    setKata(input.trim());
  };

  const pesananModal = terbuka ? daftar.find((p) => p.id === terbuka) ?? null : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50">
      <HeaderPesanan
        judul={judul}
        deskripsi={deskripsi}
        ikon={ikon}
        onKembali={onKembali}
        onMuatUlang={() => muat(0)}
        memuat={memuat}
        escAktif={!dialogBuka}
      />

      <main ref={areaGulir} className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-5 sm:px-6">
          {/* Pencarian */}
          <form onSubmit={cari} className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Cari nomor pesanan atau nama pelanggan"
              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-24 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-500/10"
            />
            <button
              type="submit"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg bg-orange-500 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-orange-600"
            >
              Cari
            </button>
          </form>

          {kata && (
            <p className="text-xs text-gray-500">
              Hasil pencarian untuk <span className="font-semibold text-gray-700">&quot;{kata}&quot;</span>{" "}
              <button
                type="button"
                onClick={() => {
                  setInput("");
                  setKata("");
                }}
                className="font-medium text-orange-600 hover:underline"
              >
                Hapus
              </button>
            </p>
          )}

          {/* Isi */}
          {memuat ? (
            <div className="space-y-2" aria-busy="true">
              <span className="sr-only">Memuat pesanan</span>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-200/70" />
              ))}
            </div>
          ) : galat ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-100 bg-white px-6 py-14 text-center shadow-sm">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                <AlertCircle className="h-6 w-6" />
              </span>
              <p className="text-sm text-gray-500">
                Pesanan gagal dimuat. Periksa koneksi dan aturan RLS tabel orders di Supabase.
              </p>
              <button
                type="button"
                onClick={() => muat(0)}
                className="rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 text-xs font-medium text-orange-600 transition-colors hover:bg-orange-100"
              >
                Coba lagi
              </button>
            </div>
          ) : daftar.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-100 bg-white px-6 py-14 text-center shadow-sm">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 text-orange-500">
                <ClipboardList className="h-6 w-6" />
              </span>
              <p className="text-sm text-gray-500">
                {kata
                  ? "Tidak ada pesanan yang cocok dengan pencarian."
                  : `Belum ada pesanan ${judul.toLowerCase()} yang selesai.`}
              </p>
            </div>
          ) : (
            <div className="space-y-2 pb-6">
              {/* Pilih semua */}
              <label className="flex w-fit cursor-pointer items-center gap-2.5 px-3 py-1 text-xs font-medium text-gray-500">
                <input
                  type="checkbox"
                  checked={semuaDipilih}
                  onChange={alihSemua}
                  className="h-4 w-4 cursor-pointer rounded border-gray-300 accent-orange-500"
                />
                Pilih semua yang dimuat ({daftar.length})
              </label>

              {daftar.map((p) => (
                <BarisPesanan
                  key={p.id}
                  p={p}
                  ikon={ikon}
                  dipilih={dipilih.has(p.id)}
                  onPilih={() => alihPilih(p.id)}
                  onBuka={() => setTerbuka(p.id)}
                />
              ))}

              {/* Pemicu infinite scroll */}
              {adaLagi && (
                <div ref={sentinel} className="flex justify-center py-4">
                  {galatLagi ? (
                    <button
                      type="button"
                      onClick={() => muat(daftar.length)}
                      className="rounded-full border border-orange-200 bg-orange-50 px-5 py-2 text-sm font-medium text-orange-600 transition-colors hover:bg-orange-100"
                    >
                      Gagal memuat, coba lagi
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-2 text-xs text-gray-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Memuat lebih banyak...
                    </span>
                  )}
                </div>
              )}
              {!adaLagi && daftar.length > PER_HALAMAN && (
                <p className="py-3 text-center text-xs text-gray-400">Semua pesanan sudah dimuat.</p>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Bilah aksi massal */}
      {terpilih.length > 0 && (
        <div className="border-t border-gray-200 bg-white shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
          <div className="mx-auto flex w-full max-w-4xl items-center gap-2 overflow-x-auto px-4 py-3 sm:px-6">
            <span className="shrink-0 text-sm font-semibold text-gray-900">{terpilih.length} dipilih</span>
            <button
              type="button"
              onClick={() => setDipilih(new Set())}
              className="shrink-0 rounded-full px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100"
            >
              Batal pilih
            </button>

            <div className="ml-auto flex shrink-0 items-center gap-2">
              {bisaLanjut.length > 0 && (
                <button
                  type="button"
                  disabled={sibuk}
                  onClick={lanjutkanMassal}
                  className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-orange-500/20 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {sibuk ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  {labelLanjut} ({bisaLanjut.length})
                </button>
              )}
              {bisaLunasMassal.length > 0 && (
                <button
                  type="button"
                  disabled={sibuk}
                  onClick={() => tandaiLunas(bisaLunasMassal)}
                  className="rounded-full border border-green-200 bg-green-50 px-4 py-2 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-60"
                >
                  Tandai lunas ({bisaLunasMassal.length})
                </button>
              )}
              {bisaBatalMassal.length > 0 && (
                <button
                  type="button"
                  disabled={sibuk}
                  onClick={batalkanMassal}
                  className="rounded-full border border-red-200 bg-white px-4 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                >
                  Batalkan ({bisaBatalMassal.length})
                </button>
              )}
              <button
                type="button"
                disabled={sibuk}
                onClick={() => hapus(terpilih)}
                className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Hapus ({terpilih.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal detail */}
      {pesananModal && (
        <ModalPesanan
          p={pesananModal}
          ikon={ikon}
          labelTipe={judul}
          rincian={rincian(pesananModal)}
          sibuk={sibuk}
          supabase={supabase}
          onTutup={() => setTerbuka(null)}
          onUbahStatus={(ke) => ubahStatus(pesananModal, ke)}
          onLunas={() => tandaiLunas([pesananModal])}
          onHapus={() => hapus([pesananModal])}
          escAktif={!dialogBuka}
        />
      )}
    </div>
  );
}

// ---------- Kasir ----------

export function Kasir({ onKembali }: { onKembali: () => void }) {
  return (
    <DaftarPesanan
      tipe="pos"
      judul="Kasir"
      deskripsi="Pesanan yang dibuat langsung di kasir"
      ikon={Store}
      rincian={() => <p className="text-sm text-gray-400">Pesanan dibuat langsung di kasir.</p>}
      onKembali={onKembali}
    />
  );
}

// ---------- Pesan antar ----------

type Pengantaran = {
  recipient_name: string;
  phone: string;
  address_line: string;
  village: string | null;
  district: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  notes: string | null;
  maps_url: string | null;
  courier_name: string | null;
  tracking_number: string | null;
  delivered_at: string | null;
};

function RincianAntar({ p }: { p: Pesanan }) {
  const antar = satu(p.order_delivery as Pengantaran | Pengantaran[] | null);
  if (!antar) return <p className="text-sm text-gray-400">Tidak ada rincian pengantaran.</p>;

  const wilayah = [antar.village, antar.district, antar.city, antar.province, antar.postal_code]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-1.5">
      <Baris label="Penerima" nilai={antar.recipient_name} />
      <Baris label="Telepon" nilai={antar.phone} />
      <Baris
        label="Alamat"
        nilai={
          <>
            {antar.address_line}
            {wilayah && <span className="block text-xs font-normal text-gray-500">{wilayah}</span>}
          </>
        }
      />
      {antar.notes && <Baris label="Catatan alamat" nilai={antar.notes} />}
      {antar.courier_name && <Baris label="Kurir" nilai={antar.courier_name} />}
      {antar.tracking_number && (
        <Baris label="No. resi" nilai={<span className="font-mono">{antar.tracking_number}</span>} />
      )}
      {antar.delivered_at && <Baris label="Tiba" nilai={waktu(antar.delivered_at)} />}
      {antar.maps_url && (
        <a
          href={antar.maps_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 pt-1 text-xs font-medium text-orange-600 hover:underline"
        >
          <MapPin className="h-3.5 w-3.5" />
          Buka di Google Maps
        </a>
      )}
    </div>
  );
}

export function PesanAntar({ onKembali }: { onKembali: () => void }) {
  return (
    <DaftarPesanan
      tipe="delivery"
      judul="Pesan antar"
      deskripsi="Pesanan yang diantar ke alamat pelanggan"
      ikon={Bike}
      relasi="order_delivery(*)"
      rincian={(p) => <RincianAntar p={p} />}
      saatSelesai={async (p, sekarang, supabase) => {
        // Isi waktu tiba di tabel pendamping
        const { error } = await supabase
          .from("order_delivery")
          .update({ delivered_at: sekarang })
          .eq("order_id", p.id);
        if (error) {
          console.error("Gagal mengisi delivered_at:", error);
          return {};
        }
        const antar = satu(p.order_delivery as Pengantaran | Pengantaran[] | null);
        return antar ? { order_delivery: { ...antar, delivered_at: sekarang } } : {};
      }}
      onKembali={onKembali}
    />
  );
}

// ---------- Ambil sendiri ----------

type Ambil = { pickup_code: string; pickup_time: string | null; picked_up_at: string | null };

function RincianAmbil({ p }: { p: Pesanan }) {
  const ambil = satu(p.order_pickup as Ambil | Ambil[] | null);
  if (!ambil) return <p className="text-sm text-gray-400">Tidak ada rincian pengambilan.</p>;

  return (
    <div className="space-y-1.5">
      <Baris label="Kode ambil" nilai={<span className="font-mono">{ambil.pickup_code}</span>} />
      <Baris label="Jadwal ambil" nilai={waktu(ambil.pickup_time)} />
      {ambil.picked_up_at && <Baris label="Sudah diambil" nilai={waktu(ambil.picked_up_at)} />}
    </div>
  );
}

export function AmbilSendiri({ onKembali }: { onKembali: () => void }) {
  return (
    <DaftarPesanan
      tipe="pickup"
      judul="Ambil sendiri"
      deskripsi="Pesanan yang diambil pelanggan di toko"
      ikon={ShoppingBag}
      relasi="order_pickup(*)"
      rincian={(p) => <RincianAmbil p={p} />}
      saatSelesai={async (p, sekarang, supabase) => {
        // Isi waktu diambil di tabel pendamping
        const { error } = await supabase
          .from("order_pickup")
          .update({ picked_up_at: sekarang })
          .eq("order_id", p.id);
        if (error) {
          console.error("Gagal mengisi picked_up_at:", error);
          return {};
        }
        const ambil = satu(p.order_pickup as Ambil | Ambil[] | null);
        return ambil ? { order_pickup: { ...ambil, picked_up_at: sekarang } } : {};
      }}
      onKembali={onKembali}
    />
  );
}

// ---------- Pesan dari meja ----------

type MakanDitempat = { table_number: string; guest_count: number };

function RincianMeja({ p }: { p: Pesanan }) {
  const meja = satu(p.order_dine_in as MakanDitempat | MakanDitempat[] | null);
  if (!meja) return <p className="text-sm text-gray-400">Tidak ada rincian meja.</p>;

  return (
    <div className="space-y-1.5">
      <Baris label="Meja" nilai={meja.table_number} />
      <Baris label="Jumlah tamu" nilai={meja.guest_count} />
    </div>
  );
}

export function PesanDariMeja({ onKembali }: { onKembali: () => void }) {
  return (
    <DaftarPesanan
      tipe="dine_in"
      judul="Pesan dari meja"
      deskripsi="Pesanan makan di tempat"
      ikon={UtensilsCrossed}
      relasi="order_dine_in(*)"
      rincian={(p) => <RincianMeja p={p} />}
      onKembali={onKembali}
    />
  );
}

// ---------- Menu pesanan (komponen utama untuk halaman pengaturan) ----------

type IdLayar = "kasir" | "antar" | "ambil" | "meja";

const MENU: {
  id: IdLayar;
  /** Nilai orders.order_type */
  tipe: string;
  judul: string;
  deskripsi: string;
  ikon: LucideIcon;
  Komponen: ComponentType<{ onKembali: () => void }>;
}[] = [
  {
    id: "kasir",
    tipe: "pos",
    judul: "Kasir",
    deskripsi: "Pesanan selesai yang dibuat di kasir",
    ikon: Store,
    Komponen: Kasir,
  },
  {
    id: "antar",
    tipe: "delivery",
    judul: "Pesan antar",
    deskripsi: "Pesanan selesai yang diantar ke pelanggan",
    ikon: Bike,
    Komponen: PesanAntar,
  },
  {
    id: "ambil",
    tipe: "pickup",
    judul: "Ambil sendiri",
    deskripsi: "Pesanan selesai yang diambil di toko",
    ikon: ShoppingBag,
    Komponen: AmbilSendiri,
  },
  {
    id: "meja",
    tipe: "dine_in",
    judul: "Pesan dari meja",
    deskripsi: "Pesanan selesai makan di tempat",
    ikon: UtensilsCrossed,
    Komponen: PesanDariMeja,
  },
];

export default function MenuPesanan() {
  const { id } = useToko();
  const supabase = useMemo(() => createClient(), []);

  const [layar, setLayar] = useState<IdLayar | null>(null);
  const [jumlah, setJumlah] = useState<Partial<Record<IdLayar, number>>>({});
  const tutup = useCallback(() => setLayar(null), []);

  // Jumlah pesanan selesai per jenis (hanya hitung, tanpa mengambil datanya)
  const muatJumlah = useCallback(async () => {
    const hasil = await Promise.all(
      MENU.map(async (m) => {
        const { count, error } = await supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("shop_id", id)
          .eq("order_type", m.tipe)
          .eq("status", "completed");
        if (error) {
          console.error("Gagal menghitung pesanan:", error);
          return [m.id, null] as const;
        }
        return [m.id, count ?? 0] as const;
      })
    );
    setJumlah((lama) => {
      const baru = { ...lama };
      for (const [k, v] of hasil) if (v !== null) baru[k] = v;
      return baru;
    });
  }, [supabase, id]);

  // Muat saat dibuka, dan muat ulang setiap kembali dari layar daftar
  useEffect(() => {
    if (layar === null) void muatJumlah();
  }, [layar, muatJumlah]);

  const Aktif = MENU.find((m) => m.id === layar)?.Komponen;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {MENU.map(({ id: k, judul, deskripsi, ikon: Ikon }) => {
          const n = jumlah[k];
          return (
            <button
              key={k}
              type="button"
              onClick={() => setLayar(k)}
              className="flex items-center gap-3.5 rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm transition-colors hover:border-orange-200 hover:bg-orange-50/40"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
                <Ikon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-gray-900">{judul}</span>
                <span className="block truncate text-xs text-gray-500">{deskripsi}</span>
              </span>
              {n === undefined ? (
                <span className="h-6 w-8 shrink-0 animate-pulse rounded-full bg-gray-100" aria-hidden />
              ) : (
                <span
                  className="min-w-6 shrink-0 rounded-full bg-orange-100 px-2 text-center text-xs font-bold leading-6 text-orange-600"
                  aria-label={`${n} pesanan selesai`}
                >
                  {n.toLocaleString("id-ID")}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {Aktif && <Aktif onKembali={tutup} />}
    </>
  );
}