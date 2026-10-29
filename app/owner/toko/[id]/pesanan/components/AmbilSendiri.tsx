"use client";

import { Bell, CheckCheck, ChefHat, KeyRound, PackageCheck, Store } from "lucide-react";
import PanelPesanan, {
  Baris,
  dasarDariDb,
  formatWaktu,
  satu,
  teks,
  type Konfig,
  type PesananDasar,
  type StatusDb,
} from "./PanelPesanan";

type Pesanan = PesananDasar & {
  kodeAmbil: string;
  jamAmbil: string;
};

const SELECT_PESANAN =
  "id, order_number, status, payment_status, customer_name, customer_phone, notes, discount, tax, total, created_at, " +
  "order_items(id, product_name, unit_price, quantity, line_total, notes), " +
  "order_pickup(pickup_time, pickup_code), " +
  "payments(method, status)";

function dariDb(r: Record<string, unknown>): Pesanan {
  const ambil = satu(r.order_pickup);
  return {
    ...dasarDariDb(r),
    kodeAmbil: teks(ambil?.pickup_code),
    jamAmbil: teks(ambil?.pickup_time),
  };
}

const KONFIG: Konfig<Pesanan> = {
  tipe: "pickup",
  select: SELECT_PESANAN,
  dariDb,
  jejak: { tabel: "order_pickup", kolom: "picked_up_at" },
  filter: [
    { id: "baru", label: "Baru", ikon: Bell },
    { id: "proses", label: "Proses", ikon: ChefHat },
    { id: "siap", label: "Siap diambil", ikon: PackageCheck },
    { id: "selesai", label: "Selesai", ikon: CheckCheck },
  ],
  pesanKosong: {
    baru: "Pesanan ambil sendiri baru akan muncul di sini.",
    proses: "Pesanan ambil sendiri yang sedang diproses akan muncul di sini.",
    siap: "Pesanan yang siap diambil akan muncul di sini.",
    selesai: "Pesanan ambil sendiri yang selesai atau dibatalkan akan muncul di sini.",
  },
  // Pesanan lama berstatus on_delivery tetap ditampilkan di tab Proses
  cocokFilter: (p, f) =>
    (f === "baru" && p.status === "pending") ||
    (f === "proses" &&
      (p.status === "confirmed" || p.status === "preparing" || p.status === "on_delivery")) ||
    (f === "siap" && p.status === "ready") ||
    (f === "selesai" && (p.status === "completed" || p.status === "cancelled")),
  cariIsi: (p) => [p.kodeAmbil],
  placeholder: "Cari nomor, nama, atau kode ambil",
  Ikon: Store,
  labelStatus: (s: StatusDb) => {
    switch (s) {
      case "pending":
        return "Menunggu";
      case "confirmed":
        return "Diterima";
      case "preparing":
        return "Diproses";
      case "ready":
        return "Siap diambil";
      case "on_delivery":
        return "Dikirim";
      case "completed":
        return "Selesai";
      default:
        return "Dibatalkan";
    }
  },
  aksiLanjut: (s) => {
    switch (s) {
      case "confirmed":
      case "preparing":
      case "on_delivery":
        return { label: "Siap diambil", ke: "ready" };
      case "ready":
        return { label: "Sudah diambil", ke: "completed", hijau: true };
      default:
        return null;
    }
  },
  statusSebelumnya: (s) => {
    switch (s) {
      case "confirmed":
      case "preparing":
      case "on_delivery":
        return "pending";
      case "ready":
        return "preparing";
      case "completed":
        return "ready";
      default:
        return null;
    }
  },
  info: (p) => {
    const jam = formatWaktu(p.jamAmbil);
    if (!p.kodeAmbil && !jam) return null;
    return (
      <>
        <KeyRound className="h-3.5 w-3.5 shrink-0 text-orange-500" />
        <span className="truncate">
          {p.kodeAmbil && (
            <>
              Kode <b className="font-bold tracking-wider text-gray-900">{p.kodeAmbil}</b>
            </>
          )}
          {p.kodeAmbil && jam && " · "}
          {jam}
        </span>
      </>
    );
  },
  pemesan: (p) => (
    <>
      <dl className="space-y-2 rounded-xl bg-gray-50 p-3.5">
        <Baris label="Nama">{p.pembeli}</Baris>
        <Baris label="Telepon">{p.telepon || "-"}</Baris>
      </dl>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-900">Pengambilan</h3>
        <dl className="space-y-2 rounded-xl bg-gray-50 p-3.5">
          <Baris label="Kode ambil">
            {p.kodeAmbil ? (
              <b className="font-bold tracking-wider">{p.kodeAmbil}</b>
            ) : (
              "-"
            )}
          </Baris>
          <Baris label="Diambil sekitar">{formatWaktu(p.jamAmbil) || "-"}</Baris>
        </dl>
      </div>
    </>
  ),
};

export default function AmbilSendiri() {
  return <PanelPesanan konfig={KONFIG} />;
}