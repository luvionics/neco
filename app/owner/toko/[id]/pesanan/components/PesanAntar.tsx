"use client";

import {
  Bell,
  Bike,
  CheckCheck,
  ChefHat,
  ExternalLink,
  MapPin,
  Truck,
} from "lucide-react";
import PanelPesanan, {
  Baris,
  dasarDariDb,
  nomorWa,
  satu,
  teks,
  type Konfig,
  type PesananDasar,
  type StatusDb,
} from "./PanelPesanan";

type Pesanan = PesananDasar & {
  namaAkun: string;
  alamat: string;
  patokan: string;
  petaUrl: string;
  kurir: string;
  resi: string;
};

const SELECT_PESANAN =
  "id, order_number, status, payment_status, customer_name, customer_phone, notes, discount, tax, shipping_fee, total, created_at, " +
  "order_items(id, product_name, unit_price, quantity, line_total, notes), " +
  "order_delivery(recipient_name, phone, address_line, village, district, city, notes, maps_url, courier_name, tracking_number), " +
  "payments(method, status)";

function dariDb(r: Record<string, unknown>): Pesanan {
  const d = dasarDariDb(r);
  const antar = satu(r.order_delivery);

  const alamat = antar
    ? [antar.address_line, antar.village, antar.district, antar.city]
        .map(teks)
        .filter(Boolean)
        .join(", ")
    : "";

  const telepon = teks(antar?.phone) || d.telepon;

  return {
    ...d,
    pembeli: teks(antar?.recipient_name) || d.pembeli, // nama penerima
    namaAkun: teks(r.customer_name),
    telepon,
    wa: nomorWa(telepon),
    alamat,
    patokan: teks(antar?.notes),
    petaUrl: teks(antar?.maps_url),
    kurir: teks(antar?.courier_name),
    resi: teks(antar?.tracking_number),
  };
}

const KONFIG: Konfig<Pesanan> = {
  tipe: "delivery",
  select: SELECT_PESANAN,
  dariDb,
  jejak: { tabel: "order_delivery", kolom: "delivered_at" },
  filter: [
    { id: "baru", label: "Baru", ikon: Bell },
    { id: "proses", label: "Proses", ikon: ChefHat },
    { id: "diantar", label: "Diantar", ikon: Truck },
    { id: "selesai", label: "Selesai", ikon: CheckCheck },
  ],
  pesanKosong: {
    baru: "Pesanan antar baru akan muncul di sini.",
    proses: "Pesanan antar yang sedang diproses akan muncul di sini.",
    diantar: "Pesanan yang sedang diantar akan muncul di sini.",
    selesai: "Pesanan antar yang selesai atau dibatalkan akan muncul di sini.",
  },
  cocokFilter: (p, f) =>
    (f === "baru" && p.status === "pending") ||
    (f === "proses" &&
      (p.status === "confirmed" || p.status === "preparing" || p.status === "ready")) ||
    (f === "diantar" && p.status === "on_delivery") ||
    (f === "selesai" && (p.status === "completed" || p.status === "cancelled")),
  cariIsi: (p) => [p.namaAkun, p.alamat],
  placeholder: "Cari nomor, nama, atau alamat",
  Ikon: Bike,
  labelStatus: (s: StatusDb) => {
    switch (s) {
      case "pending":
        return "Menunggu";
      case "confirmed":
        return "Diterima";
      case "preparing":
        return "Diproses";
      case "ready":
        return "Siap diantar";
      case "on_delivery":
        return "Diantar";
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
      case "ready":
        return { label: "Antar pesanan", ke: "on_delivery" };
      case "on_delivery":
        return { label: "Tandai selesai", ke: "completed", hijau: true };
      default:
        return null;
    }
  },
  statusSebelumnya: (s) => {
    switch (s) {
      case "confirmed":
      case "preparing":
        return "pending";
      case "ready":
      case "on_delivery":
        return "preparing";
      case "completed":
        return "on_delivery";
      default:
        return null;
    }
  },
  info: (p) =>
    p.alamat ? (
      <>
        <MapPin className="h-3.5 w-3.5 shrink-0 text-orange-500" />
        <span className="truncate">{p.alamat}</span>
      </>
    ) : null,
  pemesan: (p) => (
    <>
      <dl className="space-y-2 rounded-xl bg-gray-50 p-3.5">
        <Baris label="Penerima">{p.pembeli}</Baris>
        {p.namaAkun && p.namaAkun !== p.pembeli && (
          <Baris label="Nama akun">{p.namaAkun}</Baris>
        )}
        <Baris label="Telepon">{p.telepon || "-"}</Baris>
      </dl>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-900">Alamat pengantaran</h3>
        {p.alamat ? (
          <div className="space-y-2 rounded-xl bg-gray-50 p-3.5 text-sm text-gray-700">
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
              <span>{p.alamat}</span>
            </p>
            {p.patokan && (
              <p className="pl-6 text-xs text-gray-500">Patokan: {p.patokan}</p>
            )}
            {p.petaUrl && (
              <a
                href={p.petaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-6 inline-flex items-center gap-1 text-xs font-medium text-orange-600 hover:text-orange-700"
              >
                Buka di peta
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        ) : (
          <p className="rounded-xl bg-gray-50 px-3.5 py-3 text-sm text-gray-500">
            Alamat tidak tersedia.
          </p>
        )}
      </div>

      {(p.kurir || p.resi) && (
        <dl className="space-y-2 rounded-xl bg-gray-50 p-3.5">
          {p.kurir && <Baris label="Kurir">{p.kurir}</Baris>}
          {p.resi && <Baris label="Resi">{p.resi}</Baris>}
        </dl>
      )}
    </>
  ),
};

export default function PesanAntar() {
  return <PanelPesanan konfig={KONFIG} />;
}