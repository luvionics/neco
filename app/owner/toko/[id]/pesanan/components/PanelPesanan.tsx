"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Banknote,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageCircle,
  Receipt,
  RefreshCw,
  Search,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToko } from "../../components/toko-provider";
import { rupiah } from "../../components/toko";
import { Dialog } from "../../ui";

// ---------- Tipe ----------

// Sesuai constraint orders.status
export type StatusDb =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready"
  | "on_delivery"
  | "completed"
  | "cancelled";

export type StatusBayar = "unpaid" | "partial" | "paid" | "refunded";

export type ItemPesanan = {
  id: string;
  nama: string;
  harga: number;
  qty: number;
  total: number;
  catatan: string;
};

export type PesananDasar = {
  id: string;
  nomor: string;
  status: StatusDb;
  statusBayar: StatusBayar;
  metodeBayar: string;
  pembeli: string;
  telepon: string;
  wa: string;
  catatan: string;
  diskon: number;
  pajak: number;
  ongkir?: number; // hanya terisi untuk pesanan antar
  total: number;
  waktu: string;
  item: ItemPesanan[];
};

export type Aksi = { label: string; ke: StatusDb; hijau?: boolean };

export type FilterTab = { id: string; label: string; ikon: LucideIcon };

export type Konfig<P extends PesananDasar> = {
  tipe: string; // nilai orders.order_type
  select: string;
  dariDb: (r: Record<string, unknown>) => P;
  /** Tabel turunan yang menyimpan waktu selesai (picked_up_at / delivered_at) */
  jejak?: { tabel: string; kolom: string };
  filter: FilterTab[];
  pesanKosong: Record<string, string>;
  cocokFilter: (p: P, filterId: string) => boolean;
  cariIsi: (p: P) => string[];
  placeholder: string;
  Ikon: LucideIcon;
  labelStatus: (s: StatusDb) => string;
  aksiLanjut: (s: StatusDb) => Aksi | null;
  statusSebelumnya: (s: StatusDb) => StatusDb | null;
  /** Satu baris info singkat di kartu (opsional) */
  info?: (p: P) => ReactNode;
  /** Isi langkah "Informasi pemesan" di modal */
  pemesan: (p: P) => ReactNode;
};

// ---------- Konstanta ----------

const KELAS_STATUS: Record<StatusDb, string> = {
  pending: "bg-orange-50 text-orange-700 ring-1 ring-orange-100",
  confirmed: "bg-blue-50 text-blue-700 ring-1 ring-blue-100",
  preparing: "bg-blue-50 text-blue-700 ring-1 ring-blue-100",
  ready: "bg-violet-50 text-violet-700 ring-1 ring-violet-100",
  on_delivery: "bg-sky-50 text-sky-700 ring-1 ring-sky-100",
  completed: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  cancelled: "bg-red-50 text-red-700 ring-1 ring-red-100",
};

const KELAS_BAYAR: Record<StatusBayar, string> = {
  unpaid: "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
  partial: "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
  paid: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  refunded: "bg-gray-100 text-gray-600 ring-1 ring-gray-200",
};

export const LABEL_METODE: Record<string, string> = {
  cash: "Tunai",
  qris: "QRIS",
  transfer: "Transfer",
  card: "Kartu",
  ewallet: "E-wallet",
  cod: "Bayar di tempat",
};

export const LABEL_STATUS_BAYAR: Record<StatusBayar, string> = {
  unpaid: "Belum dibayar",
  partial: "Dibayar sebagian",
  paid: "Lunas",
  refunded: "Dikembalikan",
};

// ---------- Fungsi bantu ----------

export const teks = (v: unknown) => (typeof v === "string" ? v : "");
export const angka = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

// Relasi satu-ke-satu bisa datang sebagai objek atau array berisi satu objek
export function satu(v: unknown): Record<string, unknown> | null {
  if (Array.isArray(v)) return (v[0] as Record<string, unknown>) ?? null;
  if (v && typeof v === "object") return v as Record<string, unknown>;
  return null;
}

export function nomorWa(s: string) {
  let n = s.replace(/[^\d+]/g, "");
  if (n.startsWith("+")) n = n.slice(1);
  else if (n.startsWith("0")) n = `62${n.slice(1)}`;
  return n.length >= 9 ? n : "";
}

export function formatWaktu(iso: string) {
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

/** Bagian pesanan yang sama untuk semua layanan. */
export function dasarDariDb(r: Record<string, unknown>): PesananDasar {
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
        total:
          x.line_total !== null && x.line_total !== undefined
            ? angka(x.line_total)
            : harga * qty,
        catatan: teks(x.notes),
      };
    }
  );

  const telepon = teks(r.customer_phone);

  return {
    id: teks(r.id),
    nomor: teks(r.order_number),
    status: teks(r.status) as StatusDb,
    statusBayar: (teks(r.payment_status) || "unpaid") as StatusBayar,
    metodeBayar: teks(bayar?.method),
    pembeli: teks(r.customer_name) || "Pelanggan",
    telepon,
    wa: nomorWa(telepon),
    catatan: teks(r.notes),
    diskon: angka(r.discount),
    pajak: angka(r.tax),
    ongkir: "shipping_fee" in r ? angka(r.shipping_fee) : undefined,
    total: angka(r.total),
    waktu: teks(r.created_at),
    item,
  };
}

/** Pesanan yang belum lunas dan tidak dibatalkan bisa ditandai dibayar. */
const bisaTandaiBayar = (p: PesananDasar) =>
  p.status !== "cancelled" && (p.statusBayar === "unpaid" || p.statusBayar === "partial");

/** Pesanan lunas bisa dikembalikan ke belum dibayar (misalnya salah tandai). */
const bisaKembalikanBayar = (p: PesananDasar) =>
  p.status !== "cancelled" && p.statusBayar === "paid";

const linkWa = (p: PesananDasar, namaToko: string) =>
  p.wa
    ? `https://wa.me/${p.wa}?text=${encodeURIComponent(
        `Halo ${p.pembeli}, soal pesanan ${p.nomor} di ${namaToko}`
      )}`
    : "";

// ---------- Komponen kecil ----------

export function Baris({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <dt className="shrink-0 text-gray-500">{label}</dt>
      <dd className="min-w-0 text-right font-medium text-gray-900">{children}</dd>
    </div>
  );
}

/** Ikon tab dengan badge di pojok (badge di pojok hanya saat tab tidak aktif). */
export function IkonLencana({
  Ikon,
  jumlah,
  sel,
  kelas = "h-5 w-5",
}: {
  Ikon: LucideIcon;
  jumlah: number;
  sel: boolean;
  kelas?: string;
}) {
  return (
    <span className="relative flex shrink-0">
      <Ikon className={kelas} />
      {jumlah > 0 && !sel && (
        <span className="absolute -right-2.5 -top-2 min-w-4 rounded-full bg-orange-500 px-1 text-center text-[10px] font-bold leading-4 text-white ring-2 ring-white">
          {jumlah > 99 ? "99+" : jumlah}
          <span className="sr-only"> pesanan</span>
        </span>
      )}
    </span>
  );
}

function Kerangka() {
  return (
    <div className="space-y-4" aria-busy="true">
      <span className="sr-only">Memuat pesanan</span>
      <div className="h-11 animate-pulse rounded-xl bg-gray-200/70" />
      <div className="h-12 animate-pulse rounded-2xl bg-gray-200/70" />
      <div className="grid gap-3 xl:grid-cols-2">
        <div className="h-44 animate-pulse rounded-2xl bg-gray-200/70" />
        <div className="h-44 animate-pulse rounded-2xl bg-gray-200/70" />
      </div>
    </div>
  );
}

// ---------- Kartu pesanan ----------

function Kartu<P extends PesananDasar>({
  p,
  konfig,
  namaToko,
  lagi,
  onBuka,
  onTolak,
  onUbah,
  onBayar,
}: {
  p: P;
  konfig: Konfig<P>;
  namaToko: string;
  lagi: boolean;
  onBuka: () => void;
  onTolak: () => void;
  onUbah: (ke: StatusDb) => void;
  onBayar: () => void;
}) {
  const Ikon = konfig.Ikon;
  const final = p.status === "completed" || p.status === "cancelled";
  const lanjut = konfig.aksiLanjut(p.status);
  const baru = p.status === "pending";
  const info = konfig.info?.(p);
  const adaAksi = !final || bisaTandaiBayar(p);
  const pertama = p.item[0];
  const sisa = p.item.length - 1;
  const wa = linkWa(p, namaToko);

  return (
    <article
      tabIndex={0}
      onClick={onBuka}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onBuka();
        }
      }}
      className={`cursor-pointer space-y-3 rounded-2xl border bg-white p-4 shadow-sm outline-none transition-shadow hover:shadow-md focus-visible:ring-4 focus-visible:ring-orange-100 ${
        baru ? "border-orange-200 ring-1 ring-orange-100" : "border-gray-100"
      }`}
    >
      {/* Kepala: pembeli + status */}
      <div className="flex items-center gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            baru
              ? "bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/25"
              : "bg-orange-50 text-orange-500"
          }`}
        >
          <Ikon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">{p.pembeli}</p>
          <p className="truncate text-xs text-gray-500">
            {p.nomor} · {formatWaktu(p.waktu)}
          </p>
        </div>
        <span
          className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ${KELAS_STATUS[p.status] ?? KELAS_STATUS.pending}`}
        >
          {konfig.labelStatus(p.status)}
        </span>
      </div>

      {/* Ringkasan produk: satu baris */}
      {pertama && (
        <div className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2.5 text-sm">
          <span className="min-w-0 flex-1 truncate text-gray-800">
            {pertama.nama}{" "}
            <span className="font-medium text-gray-400">×{pertama.qty}</span>
          </span>
          {sisa > 0 && (
            <span className="shrink-0 whitespace-nowrap text-xs text-gray-500">
              +{sisa} lainnya
            </span>
          )}
        </div>
      )}

      {/* Info singkat layanan: satu baris */}
      {info && (
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-gray-600">{info}</p>
      )}

      {/* Status bayar + total */}
      <div className="flex items-center justify-between gap-3">
        <span
          className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ${KELAS_BAYAR[p.statusBayar] ?? KELAS_BAYAR.unpaid}`}
        >
          {LABEL_STATUS_BAYAR[p.statusBayar] ?? p.statusBayar}
        </span>
        <p className="whitespace-nowrap text-lg font-extrabold leading-tight text-gray-900">
          {rupiah(p.total)}
        </p>
      </div>

      {/* Aksi: ikon di kiri, tombol utama di kanan */}
      {adaAksi && (
        <div
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          className="flex items-center justify-end gap-2 border-t border-gray-100 pt-3"
        >
          {!final && wa && (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Hubungi pembeli"
              title="Hubungi pembeli"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
            >
              <MessageCircle className="h-4 w-4" />
            </a>
          )}

          {bisaTandaiBayar(p) && (
            <button
              onClick={onBayar}
              disabled={lagi}
              aria-label="Tandai sudah dibayar"
              title="Tandai sudah dibayar"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md shadow-emerald-500/30 transition-all hover:bg-emerald-600 active:scale-95 disabled:opacity-60"
            >
              {lagi ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-5 w-5" strokeWidth={3} />
              )}
            </button>
          )}

          {baru && (
            <>
              <button
                onClick={onTolak}
                disabled={lagi}
                className="h-10 shrink-0 whitespace-nowrap rounded-xl border border-red-200 bg-white px-4 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
              >
                Tolak
              </button>
              <button
                onClick={() => onUbah("preparing")}
                disabled={lagi}
                className="inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 text-xs font-semibold text-white shadow-md shadow-orange-500/25 transition-all hover:shadow-lg hover:shadow-orange-500/30 active:scale-[0.98] disabled:opacity-60"
              >
                {lagi && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Terima
              </button>
            </>
          )}

          {lanjut && (
            <button
              onClick={() => onUbah(lanjut.ke)}
              disabled={lagi}
              className={`inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-4 text-xs font-semibold text-white shadow-md transition-all hover:shadow-lg active:scale-[0.98] disabled:opacity-60 ${
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
}

// ---------- Modal detail ----------

function ModalDetail<P extends PesananDasar>({
  p,
  konfig,
  namaToko,
  sibuk,
  onTutup,
  onBayar,
  onKembalikanBayar,
  onKembalikanStatus,
}: {
  p: P;
  konfig: Konfig<P>;
  namaToko: string;
  sibuk: boolean;
  onTutup: () => void;
  onBayar: () => void;
  onKembalikanBayar: () => void;
  onKembalikanStatus: (ke: StatusDb) => void;
}) {
  const [langkah, setLangkah] = useState<"pesanan" | "pemesan">("pesanan");
  const sebelumnya = konfig.statusSebelumnya(p.status);
  const wa = linkWa(p, namaToko);

  return (
    <Dialog
      judul={langkah === "pesanan" ? "Info pesanan" : "Informasi pemesan"}
      onTutup={onTutup}
    >
      {langkah === "pesanan" ? (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900">Info pesanan</h2>
              <p className="truncate text-xs text-gray-500">
                {p.nomor} · {formatWaktu(p.waktu)}
              </p>
            </div>
            <span
              className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ${KELAS_STATUS[p.status] ?? KELAS_STATUS.pending}`}
            >
              {konfig.labelStatus(p.status)}
            </span>
          </div>

          <ul className="space-y-2 rounded-xl bg-gray-50 p-3.5 text-sm">
            {p.item.map((i) => (
              <li key={i.id} className="flex justify-between gap-3">
                <span className="min-w-0 text-gray-800">
                  {i.nama} <span className="font-medium text-gray-400">×{i.qty}</span>
                  {i.catatan && (
                    <span className="block text-xs text-gray-400">{i.catatan}</span>
                  )}
                </span>
                <span className="shrink-0 text-gray-600">{rupiah(i.total)}</span>
              </li>
            ))}
          </ul>

          <dl className="space-y-1.5 text-sm">
            <Baris label="Subtotal">
              {rupiah(p.item.reduce((n, i) => n + i.total, 0))}
            </Baris>
            {p.diskon > 0 && (
              <Baris label="Diskon">
                <span className="text-red-500">-{rupiah(p.diskon)}</span>
              </Baris>
            )}
            {p.pajak > 0 && <Baris label="Pajak">{rupiah(p.pajak)}</Baris>}
            {p.ongkir !== undefined && (
              <Baris label="Ongkos antar">
                {p.ongkir > 0 ? rupiah(p.ongkir) : "Gratis"}
              </Baris>
            )}
            <div className="flex justify-between gap-4 border-t border-gray-200 pt-2 text-base font-bold text-gray-900">
              <dt>Total</dt>
              <dd>{rupiah(p.total)}</dd>
            </div>
          </dl>

          <dl className="space-y-1.5 border-t border-dashed border-gray-200 pt-3">
            <Baris label="Pembayaran">
              {LABEL_METODE[p.metodeBayar] ?? (p.metodeBayar || "-")}
            </Baris>
            <Baris label="Status bayar">
              <span className={p.statusBayar === "paid" ? "text-emerald-600" : ""}>
                {LABEL_STATUS_BAYAR[p.statusBayar] ?? p.statusBayar}
              </span>
            </Baris>
          </dl>

          {p.catatan && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-100">
              Catatan: {p.catatan}
            </p>
          )}

          {bisaTandaiBayar(p) && (
            <button
              onClick={onBayar}
              disabled={sibuk}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-500/25 transition-all hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-60"
            >
              {sibuk ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-5 w-5" />
              )}
              Tandai sudah dibayar
            </button>
          )}

          {/* Koreksi: dipindah ke sini supaya kartu tidak ramai */}
          {(bisaKembalikanBayar(p) || sebelumnya) && (
            <div className="flex flex-col gap-1 border-t border-gray-100 pt-3">
              {bisaKembalikanBayar(p) && (
                <button
                  onClick={onKembalikanBayar}
                  disabled={sibuk}
                  className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900 disabled:opacity-60"
                >
                  <Banknote className="h-4 w-4" />
                  Kembalikan status bayar
                </button>
              )}
              {sebelumnya && (
                <button
                  onClick={() => onKembalikanStatus(sebelumnya)}
                  disabled={sibuk}
                  className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900 disabled:opacity-60"
                >
                  <Undo2 className="h-4 w-4" />
                  Kembalikan status pesanan
                </button>
              )}
            </div>
          )}

          <div className="flex gap-2.5 pt-1">
            <button
              onClick={onTutup}
              className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Kembali
            </button>
            <button
              onClick={() => setLangkah("pemesan")}
              className="flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 py-2.5 text-sm font-semibold text-white shadow-md shadow-orange-500/25 transition-all hover:shadow-lg hover:shadow-orange-500/30 active:scale-[0.98]"
            >
              Info pemesan
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900">Informasi pemesan</h2>
            <p className="truncate text-xs text-gray-500">{p.nomor}</p>
          </div>

          {konfig.pemesan(p)}

          <div className="flex gap-2.5 pt-1">
            <button
              onClick={() => setLangkah("pesanan")}
              className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Kembali
            </button>
            {wa ? (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-600"
              >
                <MessageCircle className="h-4 w-4" />
                Hubungi
              </a>
            ) : (
              <button
                onClick={onTutup}
                className="flex-1 rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
              >
                Tutup
              </button>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}

// ---------- Panel (daftar + filter + dialog) ----------

export default function PanelPesanan<P extends PesananDasar>({
  konfig,
}: {
  konfig: Konfig<P>;
}) {
  const { id, toko } = useToko();
  const supabase = useMemo(() => createClient(), []);

  const [orders, setOrders] = useState<P[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [menyegarkan, setMenyegarkan] = useState(false);
  const [galatMuat, setGalatMuat] = useState(false);
  const [galat, setGalat] = useState("");
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>(konfig.filter[0].id);
  const [cari, setCari] = useState("");
  const [tolak, setTolak] = useState<P | null>(null);
  const [kembalikanBayar, setKembalikanBayar] = useState<P | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const muat = useCallback(
    async (senyap = false) => {
      if (senyap) setMenyegarkan(true);
      else setMemuat(true);

      const { data, error } = await supabase
        .from("orders")
        .select(konfig.select)
        .eq("shop_id", id)
        .eq("order_type", konfig.tipe)
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) {
        setGalatMuat(true);
      } else {
        setOrders(
          ((data ?? []) as unknown as Record<string, unknown>[]).map(konfig.dariDb)
        );
        setGalatMuat(false);
      }
      setMemuat(false);
      setMenyegarkan(false);
    },
    [supabase, id, konfig]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void muat(), 0);
    return () => window.clearTimeout(timer);
  }, [muat]);

  // Pesanan baru atau perubahan status langsung muncul (butuh Realtime aktif untuk tabel orders)
  useEffect(() => {
    const kanal = supabase
      .channel(`pesanan-${konfig.tipe}-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `shop_id=eq.${id}` },
        () => void muat(true)
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(kanal);
    };
  }, [supabase, id, konfig.tipe, muat]);

  const q = cari.trim().toLowerCase();
  const hasilCari = useMemo(
    () =>
      orders.filter((p) =>
        !q
          ? true
          : [p.nomor, p.pembeli, p.telepon, ...konfig.cariIsi(p), ...p.item.map((i) => i.nama)]
              .join("\n")
              .toLowerCase()
              .includes(q)
      ),
    [orders, q, konfig]
  );
  const tampil = hasilCari.filter((p) => konfig.cocokFilter(p, filter));
  const detail = detailId ? (orders.find((p) => p.id === detailId) ?? null) : null;

  const ubahStatus = async (p: P, ke: StatusDb) => {
    if (sibuk) return;
    setSibuk(p.id);
    setGalat("");

    const sekarang = new Date().toISOString();
    const ubah: Record<string, unknown> = { status: ke, updated_at: sekarang };
    if (ke === "completed") ubah.completed_at = sekarang;
    // Dikembalikan dari selesai: kosongkan waktu selesai
    if (p.status === "completed" && ke !== "completed") ubah.completed_at = null;

    // Riwayat status dicatat otomatis oleh trigger log_order_status di database
    const { error } = await supabase.from("orders").update(ubah).eq("id", p.id);

    if (error) {
      setGalat("Gagal mengubah status pesanan, coba lagi");
      setSibuk(null);
      return;
    }

    if (konfig.jejak) {
      if (ke === "completed") {
        await supabase
          .from(konfig.jejak.tabel)
          .update({ [konfig.jejak.kolom]: sekarang })
          .eq("order_id", p.id);
      } else if (p.status === "completed") {
        await supabase
          .from(konfig.jejak.tabel)
          .update({ [konfig.jejak.kolom]: null })
          .eq("order_id", p.id);
      }
    }

    setOrders((daftar) => daftar.map((x) => (x.id === p.id ? { ...x, status: ke } : x)));
    setSibuk(null);
    // Beri tahu badge di navbar dan tab agar langsung diperbarui
    window.dispatchEvent(new Event("pesanan:berubah"));
  };

  const ubahBayar = async (p: P, ke: StatusBayar) => {
    if (sibuk) return;
    setSibuk(p.id);
    setGalat("");

    // payment_status dilindungi trigger protect_order_columns, jadi lewat RPC
    const { error } = await supabase.rpc("ubah_status_bayar", {
      p_order_id: p.id,
      p_status: ke,
    });

    if (error) {
      setGalat(error.message || "Gagal mengubah status pembayaran, coba lagi");
      setSibuk(null);
      return;
    }

    setOrders((daftar) => daftar.map((x) => (x.id === p.id ? { ...x, statusBayar: ke } : x)));
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

  return (
    <div className="space-y-4 md:space-y-5">
      {/* Pencarian + segarkan (terpisah dari tab) */}
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder={konfig.placeholder}
            aria-label="Cari pesanan"
            className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-10 text-sm outline-none transition placeholder:text-gray-400 focus:border-orange-300 focus:ring-4 focus:ring-orange-100 [&::-webkit-search-cancel-button]:hidden"
          />
          {cari && (
            <button
              onClick={() => setCari("")}
              aria-label="Hapus pencarian"
              className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          onClick={() => muat(true)}
          disabled={menyegarkan}
          aria-label="Segarkan daftar pesanan"
          title="Segarkan"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition-colors hover:border-orange-200 hover:bg-orange-50/50 hover:text-orange-600 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${menyegarkan ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Tab status: ikon + badge, teks hanya di tab aktif */}
      <nav
        aria-label="Filter status pesanan"
        className="flex gap-1.5 rounded-2xl border border-gray-100 bg-white p-1.5 shadow-sm"
      >
        {konfig.filter.map((f) => {
          const jumlah = hasilCari.filter((p) => konfig.cocokFilter(p, f.id)).length;
          const sel = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              aria-pressed={sel}
              aria-label={f.label}
              title={f.label}
              className={`flex h-10 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2 text-xs font-semibold transition-all duration-200 ${
                sel
                  ? "flex-[3] bg-gray-900 text-white shadow-md shadow-gray-900/20"
                  : "flex-1 text-gray-500 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <IkonLencana Ikon={f.ikon} jumlah={jumlah} sel={sel} kelas="h-4 w-4" />
              {sel && <span>{f.label}</span>}
              {sel && jumlah > 0 && (
                <span className="rounded-full bg-white/20 px-1.5 text-[11px] font-bold leading-5">
                  {jumlah > 99 ? "99+" : jumlah}
                </span>
              )}
            </button>
          );
        })}
      </nav>

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
              {q ? <Search className="h-7 w-7" /> : <Receipt className="h-7 w-7" />}
            </span>
          </span>
          <div>
            <p className="text-base font-bold text-gray-900">
              {q ? "Pesanan tidak ditemukan" : "Belum ada pesanan"}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {q
                ? `Tidak ada pesanan di tab ini yang cocok dengan “${cari.trim()}”. Coba periksa tab lain.`
                : konfig.pesanKosong[filter]}
            </p>
          </div>
        </section>
      ) : (
        <div className="grid gap-3 md:gap-4 xl:grid-cols-2">
          {tampil.map((p) => (
            <Kartu
              key={p.id}
              p={p}
              konfig={konfig}
              namaToko={toko.nama}
              lagi={sibuk === p.id}
              onBuka={() => setDetailId(p.id)}
              onTolak={() => setTolak(p)}
              onUbah={(ke) => void ubahStatus(p, ke)}
              onBayar={() => void ubahBayar(p, "paid")}
            />
          ))}
        </div>
      )}

      {detail && (
        <ModalDetail
          key={detail.id}
          p={detail}
          konfig={konfig}
          namaToko={toko.nama}
          sibuk={sibuk === detail.id}
          onTutup={() => setDetailId(null)}
          onBayar={() => void ubahBayar(detail, "paid")}
          onKembalikanBayar={() => setKembalikanBayar(detail)}
          onKembalikanStatus={(ke) => void ubahStatus(detail, ke)}
        />
      )}

      {kembalikanBayar && (
        <Dialog judul="Kembalikan status bayar" onTutup={() => setKembalikanBayar(null)}>
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
              <Banknote className="h-5 w-5" />
            </span>
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-gray-900">
                Kembalikan ke belum dibayar?
              </h2>
              <p className="text-sm text-gray-500">
                Pesanan {kembalikanBayar.nomor} dari {kembalikanBayar.pembeli} akan
                ditandai belum dibayar lagi. Gunakan ini jika pesanan salah ditandai
                lunas.
              </p>
            </div>
          </div>
          <div className="flex gap-2.5">
            <button
              onClick={() => setKembalikanBayar(null)}
              className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Batal
            </button>
            <button
              onClick={() => {
                void ubahBayar(kembalikanBayar, "unpaid");
                setKembalikanBayar(null);
              }}
              className="flex-1 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 py-2.5 text-sm font-semibold text-white shadow-md shadow-orange-500/25 transition-all hover:shadow-lg hover:shadow-orange-500/30 active:scale-[0.98]"
            >
              Ya, kembalikan
            </button>
          </div>
        </Dialog>
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
                void ubahStatus(tolak, "cancelled");
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