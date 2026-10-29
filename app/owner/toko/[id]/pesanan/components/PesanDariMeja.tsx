"use client";

import { Bell, ChefHat, CheckCheck, ConciergeBell, Users, Utensils } from "lucide-react";
import PanelPesanan, {
  Baris,
  angka,
  dasarDariDb,
  satu,
  teks,
  type Konfig,
  type PesananDasar,
  type StatusDb,
} from "./PanelPesanan";

type Pesanan = PesananDasar & {
  meja: string;
  tamu: number;
};

const SELECT_PESANAN =
  "id, order_number, status, payment_status, customer_name, customer_phone, notes, discount, tax, total, created_at, " +
  "order_items(id, product_name, unit_price, quantity, line_total, notes), " +
  "order_dine_in(table_number, guest_count), " +
  "payments(method, status)";

function dariDb(r: Record<string, unknown>): Pesanan {
  const makan = satu(r.order_dine_in);
  return {
    ...dasarDariDb(r),
    meja: teks(makan?.table_number),
    tamu: angka(makan?.guest_count),
  };
}

const KONFIG: Konfig<Pesanan> = {
  tipe: "dine_in",
  select: SELECT_PESANAN,
  dariDb,
  filter: [
    { id: "baru", label: "Baru", ikon: Bell },
    { id: "proses", label: "Proses", ikon: ChefHat },
    { id: "disajikan", label: "Disajikan", ikon: ConciergeBell },
    { id: "selesai", label: "Selesai", ikon: CheckCheck },
  ],
  pesanKosong: {
    baru: "Pesanan dari meja yang baru masuk akan muncul di sini.",
    proses: "Pesanan dari meja yang sedang diproses akan muncul di sini.",
    disajikan: "Pesanan yang siap disajikan akan muncul di sini.",
    selesai: "Pesanan dari meja yang selesai atau dibatalkan akan muncul di sini.",
  },
  // Pesanan lama berstatus on_delivery tetap ditampilkan di tab Proses
  cocokFilter: (p, f) =>
    (f === "baru" && p.status === "pending") ||
    (f === "proses" &&
      (p.status === "confirmed" || p.status === "preparing" || p.status === "on_delivery")) ||
    (f === "disajikan" && p.status === "ready") ||
    (f === "selesai" && (p.status === "completed" || p.status === "cancelled")),
  cariIsi: (p) => [p.meja],
  placeholder: "Cari nomor, nama, atau meja",
  Ikon: Utensils,
  labelStatus: (s: StatusDb) => {
    switch (s) {
      case "pending":
        return "Menunggu";
      case "confirmed":
        return "Diterima";
      case "preparing":
        return "Diproses";
      case "ready":
        return "Siap disajikan";
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
        return { label: "Siap disajikan", ke: "ready" };
      case "ready":
        return { label: "Sudah disajikan", ke: "completed", hijau: true };
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
    if (!p.meja && p.tamu <= 0) return null;
    return (
      <>
        <Users className="h-3.5 w-3.5 shrink-0 text-orange-500" />
        <span className="truncate">
          {p.meja && (
            <>
              Meja <b className="font-bold text-gray-900">{p.meja}</b>
            </>
          )}
          {p.meja && p.tamu > 0 && " · "}
          {p.tamu > 0 && `${p.tamu} tamu`}
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
        <h3 className="text-sm font-semibold text-gray-900">Tempat duduk</h3>
        <dl className="space-y-2 rounded-xl bg-gray-50 p-3.5">
          <Baris label="Nomor meja">{p.meja || "-"}</Baris>
          <Baris label="Jumlah tamu">{p.tamu > 0 ? `${p.tamu} tamu` : "-"}</Baris>
        </dl>
      </div>
    </>
  ),
};

export default function PesanDariMeja() {
  return <PanelPesanan konfig={KONFIG} />;
}