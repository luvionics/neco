"use client";

/**
 * TAB INFO TOKO — komponen mandiri.
 *
 * Tidak menerima props dan tidak berbagi data dengan komponen lain.
 * Membaca id toko dari URL, mengambil datanya sendiri (fungsi database
 * detail_toko_publik), dan menampilkan: foto, identitas, deskripsi, kontak,
 * lokasi, cara belanja, dan jam buka.
 *
 * Semua fungsi bantu sengaja ditulis di file ini supaya mengubah tampilan
 * atau perilaku info toko cukup dengan mengubah file ini saja.
 */

import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Store,
  Star,
  MapPin,
  Package,
  BadgeCheck,
  Utensils,
  Bike,
  Clock,
  Loader2,
  LocateFixed,
  Share2,
  Navigation,
  Check,
  Phone,
  MessageCircle,
  ShoppingBag,
} from "lucide-react";

// ---------- Tipe ----------

type BarisToko = {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  place_photos: string[] | null;
  phone: string | null;
  whatsapp: string | null;
  address_line: string | null;
  village: string | null;
  district: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  maps_url: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  is_open: boolean;
  opening_hours: unknown;
  min_order: number | string | null;
  delivery_fee: number | string | null;
  delivery_enabled: boolean;
  pickup_enabled: boolean;
  dine_in_enabled: boolean;
  is_verified: boolean;
  rating_avg: number | string | null;
  rating_count: number | null;
  total_sales: number | null;
  jumlah_produk: number | string | null;
};

type Lokasi = { lat: number; lng: number };
type JamBuka = { open?: string; close?: string } | null;

// ---------- Konstanta ----------

const HARI = [
  { kode: "mon", label: "Senin" },
  { kode: "tue", label: "Selasa" },
  { kode: "wed", label: "Rabu" },
  { kode: "thu", label: "Kamis" },
  { kode: "fri", label: "Jumat" },
  { kode: "sat", label: "Sabtu" },
  { kode: "sun", label: "Minggu" },
];

const WARNA_TOKO = [
  "from-amber-400 to-orange-500",
  "from-red-400 to-rose-500",
  "from-pink-400 to-fuchsia-500",
  "from-violet-400 to-purple-600",
  "from-blue-400 to-indigo-600",
  "from-sky-400 to-cyan-600",
  "from-emerald-400 to-teal-600",
  "from-lime-400 to-green-600",
];

const SEMBUNYIKAN_SCROLLBAR =
  "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------- Fungsi bantu ----------

function formatJarak(m: number) {
  if (m < 1000) return `${m} m`;
  return `${(m / 1000).toFixed(1).replace(".", ",")} km`;
}

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
}

/** Jarak garis lurus (rumus haversine), dalam meter. */
function jarakMeter(a: Lokasi, lat: number, lng: number) {
  const R = 6371000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(lat - a.lat);
  const dLng = rad(lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

function warnaDariId(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return WARNA_TOKO[h % WARNA_TOKO.length];
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

function labelJam(j: JamBuka | undefined) {
  if (!j?.open || !j?.close) return "";
  return `${j.open.replace(":", ".")} - ${j.close.replace(":", ".")}`;
}

/** Menentukan buka/tutup sekarang dari is_open dan opening_hours hari ini. */
function statusBuka(
  isOpen: boolean,
  jam: unknown,
  now: { hari: string; menit: number }
) {
  const peta =
    jam && typeof jam === "object" ? (jam as Record<string, JamBuka>) : null;
  const hariIni = peta ? peta[now.hari] : undefined;
  const mulai = keMenit(hariIni?.open);
  const selesai = keMenit(hariIni?.close);
  const label = labelJam(hariIni);

  if (!isOpen) return { buka: false, jam: label };
  if (peta && hariIni === null) return { buka: false, jam: "" }; // hari libur
  if (mulai === null || selesai === null) return { buka: true, jam: label };

  const dalam =
    mulai <= selesai
      ? now.menit >= mulai && now.menit < selesai
      : now.menit >= mulai || now.menit < selesai; // buka melewati tengah malam
  return { buka: dalam, jam: label };
}

/** Nomor WhatsApp/telepon Indonesia ke format internasional tanpa tanda "+". */
function nomorInternasional(nomor: string) {
  const digit = nomor.replace(/\D/g, "");
  if (digit.startsWith("0")) return `62${digit.slice(1)}`;
  if (digit.startsWith("8")) return `62${digit}`;
  return digit;
}

// ---------- Komponen ----------

export default function InfoToko() {
  const supabase = useMemo(() => createClient(), []);
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const idValid = UUID.test(id ?? "");

  const [toko, setToko] = useState<BarisToko | null>(null);
  const [memuat, setMemuat] = useState(idValid);
  const [galat, setGalat] = useState("");
  const [cobaLagi, setCobaLagi] = useState(0);

  const [fotoAktif, setFotoAktif] = useState(0);
  const [disalin, setDisalin] = useState(false);

  const [lokasi, setLokasi] = useState<Lokasi | null>(null);
  const [statusLokasi, setStatusLokasi] = useState<
    "diam" | "meminta" | "ditolak" | "tidak-ada"
  >("diam");

  // Penanda menit berjalan, agar status buka/tutup ikut diperbarui
  const [menit, setMenit] = useState(() => Math.floor(Date.now() / 60000));
  useEffect(() => {
    const timer = setInterval(
      () => setMenit(Math.floor(Date.now() / 60000)),
      60000
    );
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!idValid) return;
    let batal = false;

    async function muat() {
      setMemuat(true);
      setGalat("");
      const { data, error } = await supabase.rpc("detail_toko_publik", {
        p_id: id,
      });
      if (batal) return;
      if (error) {
        setGalat(error.message);
      } else {
        setToko(((data ?? []) as BarisToko[])[0] ?? null);
      }
      setMemuat(false);
    }

    void muat();
    return () => {
      batal = true;
    };
  }, [supabase, id, idValid, cobaLagi]);

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

  const bagikan = async () => {
    const url = `${window.location.origin}/toko/${id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: toko?.name ?? "Toko", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setDisalin(true);
      setTimeout(() => setDisalin(false), 2000);
    } catch {
      /* dibatalkan pengguna */
    }
  };

  // ---- Turunan data ----

  const lat = toko?.latitude == null ? NaN : Number(toko.latitude);
  const lng = toko?.longitude == null ? NaN : Number(toko.longitude);
  const adaKoordinat = Number.isFinite(lat) && Number.isFinite(lng);

  const jarakM = useMemo(
    () => (lokasi && adaKoordinat ? jarakMeter(lokasi, lat, lng) : null),
    [lokasi, adaKoordinat, lat, lng]
  );

  const status = useMemo(() => {
    // `menit` hanya pemicu hitung ulang status buka/tutup
    void menit;
    if (!toko) return { buka: false, jam: "" };
    return statusBuka(toko.is_open, toko.opening_hours, sekarangWib());
  }, [toko, menit]);

  const hariIniKode = useMemo(() => {
    void menit;
    return sekarangWib().hari;
  }, [menit]);

  const foto = useMemo(() => {
    if (!toko) return [];
    const semua = [toko.banner_url, ...(toko.place_photos ?? [])].filter(
      (f): f is string => Boolean(f)
    );
    return Array.from(new Set(semua));
  }, [toko]);

  const jadwal = useMemo(() => {
    const peta =
      toko?.opening_hours && typeof toko.opening_hours === "object"
        ? (toko.opening_hours as Record<string, JamBuka>)
        : null;
    if (!peta) return null;
    return HARI.map((h) => ({
      ...h,
      jam: peta[h.kode] ? labelJam(peta[h.kode]) : "",
      libur: peta[h.kode] === null || peta[h.kode] === undefined,
    }));
  }, [toko]);

  // ---- Tampilan ----

  if (memuat) return <RangkaInfo />;

  if (galat) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-gray-100 bg-white px-6 py-14 text-center shadow-sm">
        <p className="font-semibold text-gray-900">Gagal memuat toko</p>
        <p role="alert" className="text-sm text-gray-500">
          {galat}
        </p>
        <button
          onClick={() => setCobaLagi((n) => n + 1)}
          className="rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-600"
        >
          Coba lagi
        </button>
      </div>
    );
  }

  if (!toko) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-3xl border border-gray-100 bg-white px-6 py-16 text-center shadow-sm">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/30">
          <Store className="h-7 w-7" />
        </span>
        <div>
          <p className="font-semibold text-gray-900">Toko tidak ditemukan</p>
          <p className="mt-1 text-sm text-gray-500">
            Tokonya mungkin sudah tidak aktif atau tautannya salah.
          </p>
        </div>
        <a
          href="/"
          className="rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-600"
        >
          Cari toko lain
        </a>
      </div>
    );
  }

  const warna = warnaDariId(toko.id);
  const adaRating = (toko.rating_count ?? 0) > 0;
  const minOrder = Number(toko.min_order) || 0;
  const ongkir = Number(toko.delivery_fee) || 0;
  const nomorWa = toko.whatsapp ? nomorInternasional(toko.whatsapp) : "";
  const alamatLengkap = [
    toko.address_line,
    toko.village,
    toko.district,
    toko.city,
    toko.province,
    toko.postal_code,
  ]
    .filter(Boolean)
    .join(", ");
  const urlPeta =
    toko.maps_url ||
    (adaKoordinat
      ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          `${toko.name} ${alamatLengkap}`
        )}`);

  return (
    <div className="space-y-4 md:space-y-5">
      {/* FOTO DAN IDENTITAS */}
      <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
        <div
          className={`relative h-44 bg-gradient-to-br md:h-72 ${warna} ${
            status.buka ? "" : "grayscale"
          }`}
        >
          {foto.length > 0 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={foto[fotoAktif] ?? foto[0]}
              alt={`Foto ${toko.name}`}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Store className="h-20 w-20 text-white/40" />
            </div>
          )}
          {foto.length > 1 && (
            <span className="absolute bottom-3 right-3 rounded-full bg-black/55 px-2.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
              {fotoAktif + 1} / {foto.length}
            </span>
          )}
        </div>

        {foto.length > 1 && (
          <div
            className={`flex gap-2 overflow-x-auto px-4 pt-3 ${SEMBUNYIKAN_SCROLLBAR}`}
          >
            {foto.map((f, i) => (
              <button
                key={f}
                onClick={() => setFotoAktif(i)}
                aria-label={`Lihat foto ${i + 1}`}
                aria-pressed={fotoAktif === i}
                className={`h-14 w-14 shrink-0 overflow-hidden rounded-xl ring-2 transition-all ${
                  fotoAktif === i
                    ? "ring-orange-500"
                    : "opacity-70 ring-transparent hover:opacity-100"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={f}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}

        <div className="flex items-start gap-3 p-4 md:gap-4 md:p-5">
          <div
            className={`flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br shadow-sm md:h-20 md:w-20 ${warna}`}
          >
            {toko.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={toko.logo_url}
                alt={`Logo ${toko.name}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <Store className="h-8 w-8 text-white" />
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <h1 className="text-lg font-extrabold leading-tight text-gray-900 md:text-2xl">
                {toko.name}
              </h1>
              {toko.is_verified && (
                <BadgeCheck
                  className="h-5 w-5 shrink-0 text-sky-500"
                  aria-label="Terverifikasi"
                />
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs md:text-sm">
              <span className="rounded-full bg-orange-50 px-2.5 py-0.5 font-medium text-orange-600 ring-1 ring-orange-100">
                {toko.category || "Lainnya"}
              </span>
              <span className="flex items-center gap-1 text-gray-500">
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                {adaRating ? (
                  <>
                    <b className="text-gray-700">
                      {(Number(toko.rating_avg) || 0).toFixed(1)}
                    </b>
                    <span>({toko.rating_count} ulasan)</span>
                  </>
                ) : (
                  <b className="text-gray-400">Belum ada ulasan</b>
                )}
              </span>
              <span className="flex items-center gap-1 text-gray-500">
                <Package className="h-4 w-4 text-gray-400" />
                {Number(toko.jumlah_produk) || 0} produk
              </span>
              {(toko.total_sales ?? 0) > 0 && (
                <span className="flex items-center gap-1 text-gray-500">
                  <ShoppingBag className="h-4 w-4 text-gray-400" />
                  {toko.total_sales} terjual
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-xs md:text-sm">
              <span
                className={`h-2 w-2 rounded-full ${
                  status.buka ? "bg-emerald-500" : "bg-gray-300"
                }`}
              />
              <span
                className={`font-semibold ${
                  status.buka ? "text-emerald-600" : "text-gray-400"
                }`}
              >
                {status.buka ? "Buka" : "Tutup"}
              </span>
              {status.jam && (
                <>
                  <Clock className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-gray-500">Hari ini {status.jam}</span>
                </>
              )}
            </div>
          </div>

          <button
            onClick={bagikan}
            aria-label="Bagikan toko"
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            {disalin ? (
              <Check className="h-4 w-4" />
            ) : (
              <Share2 className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">
              {disalin ? "Tautan disalin" : "Bagikan"}
            </span>
          </button>
        </div>

        {toko.description && (
          <p className="whitespace-pre-line border-t border-gray-100 px-4 py-4 text-sm leading-relaxed text-gray-600 md:px-5">
            {toko.description}
          </p>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2 md:gap-5">
        {/* Kontak */}
        {(nomorWa || toko.phone) && (
          <section className="space-y-2 rounded-3xl border border-gray-100 bg-white p-4 shadow-sm md:p-5">
            <h2 className="text-sm font-semibold text-gray-900">Hubungi toko</h2>
            {nomorWa && (
              <a
                href={`https://wa.me/${nomorWa}?text=${encodeURIComponent(
                  `Halo ${toko.name}, saya mau tanya.`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-600"
              >
                <MessageCircle className="h-4 w-4" />
                Chat WhatsApp
              </a>
            )}
            {toko.phone && (
              <a
                href={`tel:${toko.phone.replace(/[^\d+]/g, "")}`}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
              >
                <Phone className="h-4 w-4" />
                {toko.phone}
              </a>
            )}
          </section>
        )}

        {/* Lokasi */}
        <section className="space-y-3 rounded-3xl border border-gray-100 bg-white p-4 shadow-sm md:p-5">
          <h2 className="text-sm font-semibold text-gray-900">Lokasi</h2>
          <div className="flex items-start gap-2 text-sm text-gray-600">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
            <span>{alamatLengkap || "Alamat belum diisi penjual"}</span>
          </div>

          {jarakM !== null ? (
            <p className="rounded-xl bg-orange-50 px-3 py-2 text-sm text-orange-700">
              Sekitar <b>{formatJarak(jarakM)}</b> dari lokasimu
            </p>
          ) : adaKoordinat ? (
            <button
              onClick={mintaLokasi}
              disabled={statusLokasi === "meminta"}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50 px-3.5 py-2 text-sm font-semibold text-orange-600 transition-colors hover:bg-orange-100 disabled:opacity-60"
            >
              {statusLokasi === "meminta" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LocateFixed className="h-4 w-4" />
              )}
              {statusLokasi === "meminta"
                ? "Mencari lokasi..."
                : "Lihat jarak dari lokasimu"}
            </button>
          ) : null}
          {(statusLokasi === "ditolak" || statusLokasi === "tidak-ada") && (
            <p role="alert" className="text-xs text-amber-600">
              {statusLokasi === "ditolak"
                ? "Izin lokasi ditolak. Aktifkan izin lokasi di pengaturan browser untuk melihat jarak."
                : "Browser ini tidak mendukung lokasi."}
            </p>
          )}

          {(toko.maps_url || adaKoordinat || alamatLengkap) && (
            <a
              href={urlPeta}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              <Navigation className="h-4 w-4" />
              Buka di Google Maps
            </a>
          )}
        </section>

        {/* Cara belanja */}
        <section className="space-y-3 rounded-3xl border border-gray-100 bg-white p-4 shadow-sm md:p-5">
          <h2 className="text-sm font-semibold text-gray-900">Cara belanja</h2>
          <ul className="space-y-2">
            <LayananBaris
              aktif={toko.delivery_enabled}
              ikon={Bike}
              label="Diantar ke rumah"
              keterangan={
                toko.delivery_enabled
                  ? ongkir > 0
                    ? `Ongkir ${formatRupiah(ongkir)}`
                    : "Gratis ongkir"
                  : undefined
              }
            />
            <LayananBaris
              aktif={toko.pickup_enabled}
              ikon={Store}
              label="Ambil di toko"
            />
            <LayananBaris
              aktif={toko.dine_in_enabled}
              ikon={Utensils}
              label="Makan di tempat"
            />
          </ul>
          {minOrder > 0 && (
            <p className="rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600">
              Minimal pesanan <b>{formatRupiah(minOrder)}</b>
            </p>
          )}
        </section>

        {/* Jam buka */}
        <section className="space-y-3 rounded-3xl border border-gray-100 bg-white p-4 shadow-sm md:p-5">
          <h2 className="text-sm font-semibold text-gray-900">Jam buka</h2>
          {jadwal ? (
            <ul className="divide-y divide-gray-100 text-sm">
              {jadwal.map((h) => {
                const hariIni = h.kode === hariIniKode;
                return (
                  <li
                    key={h.kode}
                    className={`flex items-center justify-between py-2 ${
                      hariIni ? "font-semibold text-gray-900" : "text-gray-600"
                    }`}
                  >
                    <span>
                      {h.label}
                      {hariIni && (
                        <span className="ml-2 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-600 ring-1 ring-orange-100">
                          Hari ini
                        </span>
                      )}
                    </span>
                    <span className={h.libur ? "text-gray-400" : ""}>
                      {h.libur ? "Libur" : h.jam || "-"}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">
              Jam buka belum diatur penjual.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

// ---------- Komponen kecil (hanya dipakai di file ini) ----------

function LayananBaris({
  aktif,
  ikon: Ikon,
  label,
  keterangan,
}: {
  aktif: boolean;
  ikon: ComponentType<{ className?: string }>;
  label: string;
  keterangan?: string;
}) {
  return (
    <li
      className={`flex items-center gap-3 text-sm ${
        aktif ? "text-gray-800" : "text-gray-400"
      }`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
          aktif ? "bg-orange-50 text-orange-500" : "bg-gray-100 text-gray-300"
        }`}
      >
        <Ikon className="h-4 w-4" />
      </span>
      <span className="flex-1">
        {label}
        {keterangan && (
          <span className="block text-xs text-gray-500">{keterangan}</span>
        )}
      </span>
      <span className="text-xs font-medium">
        {aktif ? "Tersedia" : "Tidak tersedia"}
      </span>
    </li>
  );
}

function RangkaInfo() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
        <div className="h-44 bg-gray-100 md:h-72" />
        <div className="flex items-center gap-3 p-4">
          <div className="h-16 w-16 shrink-0 rounded-2xl bg-gray-100" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-1/2 rounded bg-gray-100" />
            <div className="h-3 w-2/3 rounded bg-gray-100" />
            <div className="h-3 w-1/3 rounded bg-gray-100" />
          </div>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-40 rounded-3xl border border-gray-100 bg-white shadow-sm" />
        <div className="h-40 rounded-3xl border border-gray-100 bg-white shadow-sm" />
      </div>
    </div>
  );
}
