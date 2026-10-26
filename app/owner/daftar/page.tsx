"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import type { User } from "@supabase/supabase-js";
import {
  AlertCircle,
  ArrowLeft,
  BadgeCheck,
  Bike,
  Calculator,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageCircle,
  Store,
  UtensilsCrossed,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Bidang, { PesanGalat, kelasInput } from "@/app/akun/components/Bidang";
import PilihLokasi from "@/app/akun/components/PilihLokasi";

// ---------- Data pilihan ----------

const HARI = [
  { id: "mon", label: "Sen" },
  { id: "tue", label: "Sel" },
  { id: "wed", label: "Rab" },
  { id: "thu", label: "Kam" },
  { id: "fri", label: "Jum" },
  { id: "sat", label: "Sab" },
  { id: "sun", label: "Min" },
];

const LANGKAH = ["Info toko", "Lokasi & jam", "Layanan & kontak"];

// ---------- Tipe & nilai awal ----------

type Form = {
  nama: string; // shops.name
  deskripsi: string; // shops.description
  alamat: string; // shops.address_line
  area: string; // shops.village
  kecamatan: string; // shops.district
  kota: string; // shops.city
  provinsi: string; // shops.province
  kodePos: string; // shops.postal_code
  lat: string; // shops.latitude
  lng: string; // shops.longitude
  maps: string; // shops.maps_url
  buka: string;
  tutup: string;
  hari: string[]; // id hari: mon..sun
  antar: boolean; // shops.delivery_enabled
  ambil: boolean; // shops.pickup_enabled
  makan: boolean; // shops.dine_in_enabled
  kasir: boolean; // shops.pos_enabled
  ongkir: string; // shops.delivery_fee
  minOrder: string; // shops.min_order
  wa: string; // shops.whatsapp
  phone: string; // shops.phone
  email: string; // shops.email
};

type Galat = Partial<Record<keyof Form, string>>;

const AWAL: Form = {
  nama: "",
  deskripsi: "",
  alamat: "",
  area: "",
  kecamatan: "",
  kota: "",
  provinsi: "",
  kodePos: "",
  lat: "",
  lng: "",
  maps: "",
  buka: "08:00",
  tutup: "17:00",
  hari: ["mon", "tue", "wed", "thu", "fri", "sat"],
  antar: false,
  ambil: true,
  makan: false,
  kasir: false,
  ongkir: "",
  minOrder: "",
  wa: "",
  phone: "",
  email: "",
};

// ---------- Fungsi bantu ----------

const bersihNomor = (v: string) => v.replace(/[\s-]/g, "");
const n = (v: string) => (v.trim() === "" ? null : v.trim());

// "Warung Bu Siti" -> "warung-bu-siti" (sesuai constraint slug di database)
function buatSlug(nama: string) {
  const dasar = nama
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 50)
    .replace(/^-+|-+$/g, "");
  return dasar || "toko";
}

const akhiranAcak = () => Math.random().toString(36).slice(2, 6);

// Format jam buka yang disimpan di shops.opening_hours (jsonb)
function bangunJamBuka(f: Form) {
  return Object.fromEntries(
    HARI.map((h) => [
      h.id,
      f.hari.includes(h.id) ? { open: f.buka, close: f.tutup } : null,
    ])
  );
}

function validasi(langkah: number, f: Form): Galat {
  const e: Galat = {};

  if (langkah === 0) {
    const nama = f.nama.trim();
    if (nama.length < 3) e.nama = "Nama toko minimal 3 huruf";
    else if (nama.length > 100) e.nama = "Nama toko maksimal 100 huruf";
  }

  if (langkah === 1) {
    if (!f.area.trim()) e.area = "Isi desa/kelurahan tokomu";
    if (f.alamat.trim().length < 8)
      e.alamat = "Tulis alamat yang cukup jelas, misalnya nama jalan dan nomor";
    if (f.kodePos.trim() && !/^\d{5}$/.test(f.kodePos.trim()))
      e.kodePos = "Kode pos terdiri dari 5 angka";
    if (f.maps.trim() && !/^https?:\/\//i.test(f.maps.trim()))
      e.maps = "Tautan harus diawali http:// atau https://";

    const lat = f.lat.trim().replace(",", ".");
    const lng = f.lng.trim().replace(",", ".");
    if (lat || lng) {
      if (!lat) e.lat = "Isi garis lintang (latitude)";
      else if (!Number.isFinite(Number(lat)) || Math.abs(Number(lat)) > 90)
        e.lat = "Lintang harus berupa angka antara -90 dan 90";
      if (!lng) e.lng = "Isi garis bujur (longitude)";
      else if (!Number.isFinite(Number(lng)) || Math.abs(Number(lng)) > 180)
        e.lng = "Bujur harus berupa angka antara -180 dan 180";
    }

    if (f.hari.length === 0) e.hari = "Pilih minimal satu hari buka";
    if (f.buka === f.tutup) e.tutup = "Jam tutup harus berbeda dari jam buka";
  }

  if (langkah === 2) {
    if (!f.antar && !f.ambil && !f.makan)
      e.ambil = "Pilih minimal satu layanan untuk pembeli";
    if (!/^(\+62|62|0)8[1-9][0-9]{6,10}$/.test(bersihNomor(f.wa)))
      e.wa = "Nomor WhatsApp tidak valid, contoh: 0812 3456 7890";
    if (f.phone.trim() && !/^\+?[0-9]{9,15}$/.test(bersihNomor(f.phone)))
      e.phone = "Nomor telepon 9-15 angka, boleh diawali +";
    if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()))
      e.email = "Format email tidak valid";
  }

  return e;
}

// Id elemen untuk fokus saat ada galat
const idKolom = (k: string) => (k === "lat" || k === "lng" ? `f-${k}` : `d-${k}`);

// ---------- Komponen kecil ----------

const CHIP_AKTIF =
  "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/25";
const CHIP_NONAKTIF =
  "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900";

const TOMBOL_UTAMA =
  "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/25 transition-all hover:shadow-lg hover:shadow-orange-500/30 active:scale-[0.98]";

function PilihanLayanan({
  aktif,
  onClick,
  ikon: Ikon,
  judul,
  teks,
}: {
  aktif: boolean;
  onClick: () => void;
  ikon: React.ComponentType<{ className?: string }>;
  judul: string;
  teks: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={aktif}
      className={`flex w-full items-center gap-3.5 rounded-2xl border p-3.5 text-left transition-all duration-200 ${
        aktif
          ? "border-orange-300 bg-orange-50/60 ring-1 ring-orange-100"
          : "border-gray-100 bg-white shadow-sm hover:border-orange-200"
      }`}
    >
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
          aktif
            ? "bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/25"
            : "bg-gray-100 text-gray-400"
        }`}
      >
        <Ikon className="h-5 w-5" />
      </span>
      <span className="flex-1">
        <span className="block text-sm font-semibold text-gray-900">{judul}</span>
        <span className="block text-xs text-gray-500">{teks}</span>
      </span>
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
          aktif
            ? "border-orange-500 bg-orange-500 text-white"
            : "border-gray-300 bg-white"
        }`}
      >
        {aktif && <Check className="h-3.5 w-3.5" />}
      </span>
    </button>
  );
}

function Stepper({ langkah }: { langkah: number }) {
  return (
    <ol className="flex items-center">
      {LANGKAH.map((nama, i) => {
        const selesai = i < langkah;
        const aktif = i === langkah;
        return (
          <li key={nama} className="flex flex-1 items-center last:flex-none">
            <div className="flex items-center gap-2.5">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all duration-200 ${
                  aktif
                    ? "bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/30 ring-4 ring-orange-100"
                    : selesai
                    ? "bg-orange-500 text-white"
                    : "bg-gray-100 text-gray-400"
                }`}
              >
                {selesai ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span
                className={`hidden text-xs sm:inline ${
                  aktif ? "font-semibold text-gray-900" : "text-gray-500"
                }`}
              >
                {nama}
              </span>
            </div>
            {i < LANGKAH.length - 1 && (
              <span className="mx-3 h-1 flex-1 overflow-hidden rounded-full bg-gray-100">
                <span
                  className={`block h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-500 transition-all duration-300 ${
                    selesai ? "w-full" : "w-0"
                  }`}
                />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ---------- Halaman ----------

export default function DaftarToko() {
  const supabase = useMemo(() => createClient(), []);

  const [memuat, setMemuat] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [namaCadangan, setNamaCadangan] = useState("");
  const [tokoAda, setTokoAda] = useState<{ nama: string; status: string } | null>(null);
  const [daftarArea, setDaftarArea] = useState<string[]>([]);
  const [dariProfil, setDariProfil] = useState(false);

  const [langkah, setLangkah] = useState(0);
  const [form, setForm] = useState<Form>(AWAL);
  const [galat, setGalat] = useState<Galat>({});
  const [galatKirim, setGalatKirim] = useState("");
  const [kirim, setKirim] = useState(false);
  const [selesai, setSelesai] = useState(false);

  // Cek login, cek apakah sudah punya toko, dan isi awal dari profil
  useEffect(() => {
    let batal = false;

    async function muat() {
      const {
        data: { user: u },
      } = await supabase.auth.getUser();

      if (!u) {
        window.location.replace("/login");
        return;
      }

      const [resToko, resProfil, resArea] = await Promise.all([
        supabase.from("shops").select("name, status").eq("owner_id", u.id).maybeSingle(),
        supabase
          .from("profiles")
          .select(
            "full_name, whatsapp, address_line, village, district, city, province, postal_code, maps_url, latitude, longitude"
          )
          .eq("id", u.id)
          .maybeSingle(),
        supabase.from("shops").select("village").not("village", "is", null).limit(500),
      ]);

      if (batal) return;

      const meta = u.user_metadata ?? {};
      setNamaCadangan(
        (meta.nama as string) ||
          (meta.full_name as string) ||
          u.email?.split("@")[0] ||
          ""
      );
      setUser(u);

      if (resToko.data) {
        setTokoAda({ nama: resToko.data.name, status: resToko.data.status });
      }

      const p = resProfil.data;
      if (p) {
        const t = (v: unknown) =>
          typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
        const isian = {
          wa: t(p.whatsapp),
          alamat: t(p.address_line),
          area: t(p.village),
          kecamatan: t(p.district),
          kota: t(p.city),
          provinsi: t(p.province),
          kodePos: t(p.postal_code),
          maps: t(p.maps_url),
          lat: t(p.latitude),
          lng: t(p.longitude),
        };
        setForm((f) => ({ ...f, ...isian }));
        setDariProfil(Boolean(isian.alamat || isian.area));
      }

      setDaftarArea(
        Array.from(
          new Set(
            (resArea.data ?? [])
              .map((s) => (s.village ?? "").trim())
              .filter(Boolean)
          )
        ).sort((a, b) => a.localeCompare(b, "id"))
      );

      setMemuat(false);
    }

    muat();
    return () => {
      batal = true;
    };
  }, [supabase]);

  const ubah = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setGalat((g) => ({ ...g, [k]: undefined }));
  };

  const toggleHari = (id: string) =>
    ubah(
      "hari",
      form.hari.includes(id) ? form.hari.filter((x) => x !== id) : [...form.hari, id]
    );

  const fokus = (key: string) => {
    const el = document.getElementById(idKolom(key));
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    (el as HTMLElement | null)?.focus({ preventScroll: true });
  };

  // Kembalikan pesan galat, atau null bila berhasil
  const simpanToko = async (): Promise<string | null> => {
    if (!user) return "Sesi tidak ditemukan, muat ulang halaman";

    const wa = bersihNomor(form.wa);

    // shops.owner_id mengacu ke profiles.id, jadi baris profil harus ada
    const { data: profilAda, error: errProfil } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    if (errProfil) return "Gagal memeriksa profil, coba lagi";

    if (!profilAda) {
      const { error } = await supabase
        .from("profiles")
        .insert({ id: user.id, full_name: namaCadangan || null, whatsapp: wa });
      if (error) return "Gagal menyiapkan profil, lengkapi profilmu di halaman Akun dulu";
    }

    const angka = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
    const dasarSlug = buatSlug(form.nama);

    const data = {
      owner_id: user.id,
      name: form.nama.trim(),
      description: n(form.deskripsi),
      phone: n(bersihNomor(form.phone)),
      whatsapp: wa,
      email: n(form.email),
      address_line: form.alamat.trim(),
      village: form.area.trim(),
      district: n(form.kecamatan),
      city: n(form.kota),
      province: n(form.provinsi),
      postal_code: n(form.kodePos),
      country: "Indonesia",
      maps_url: n(form.maps),
      latitude: angka(form.lat),
      longitude: angka(form.lng),
      opening_hours: bangunJamBuka(form),
      min_order: Number(form.minOrder || 0),
      delivery_enabled: form.antar,
      pickup_enabled: form.ambil,
      dine_in_enabled: form.makan,
      pos_enabled: form.kasir,
      delivery_fee: form.antar ? Number(form.ongkir || 0) : 0,
      status: "active", // langsung aktif; is_verified tetap false (label tambahan)
    };

    // Coba slug polos dulu. Kalau bentrok, tambahkan akhiran acak.
    for (let percobaan = 0; percobaan < 4; percobaan++) {
      const slug = percobaan === 0 ? dasarSlug : `${dasarSlug}-${akhiranAcak()}`;
      const { error } = await supabase.from("shops").insert({ ...data, slug });

      if (!error) return null;

      const info = `${error.message} ${error.details ?? ""}`.toLowerCase();

      if (error.code === "23505") {
        if (info.includes("owner_id")) return "Kamu sudah punya toko";
        if (info.includes("slug")) continue; // coba lagi dengan slug lain
      }
      if (error.code === "23503") return "Profilmu belum siap, buka halaman Akun dan simpan profil dulu";
      if (error.code === "23514") return "Ada isian yang tidak sesuai format, periksa kembali";
      if (error.code === "42501") return "Tidak punya izin membuat toko, periksa aturan RLS tabel shops";
      return "Gagal mendaftarkan toko, coba lagi";
    }
    return "Nama toko terlalu umum, coba tambahkan kata pembeda";
  };

  const lanjut = async () => {
    const e = validasi(langkah, form);
    setGalat(e);
    setGalatKirim("");
    if (Object.keys(e).length > 0) {
      fokus(Object.keys(e)[0]);
      return;
    }

    if (langkah < LANGKAH.length - 1) {
      setLangkah(langkah + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setKirim(true);
    const pesan = await simpanToko();
    setKirim(false);

    if (pesan) {
      setGalatKirim(pesan);
      return;
    }
    setSelesai(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const kembali = () => {
    setGalat({});
    setGalatKirim("");
    setLangkah((l) => Math.max(0, l - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const layananAktif = [
    form.antar && "Antar ke rumah",
    form.ambil && "Ambil di toko",
    form.makan && "Makan di tempat",
    form.kasir && "Kasir (POS)",
  ].filter(Boolean) as string[];

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      {/* HEADER */}
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-3 py-2.5 md:px-4">
          <a
            href="/akun"
            aria-label="Kembali ke akun"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-700 transition-colors hover:bg-gray-200"
          >
            <ArrowLeft className="h-5 w-5" />
          </a>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-50 to-amber-50 p-1.5 ring-1 ring-orange-100">
            <Image
              src="/logo.png"
              alt="Necoku"
              width={40}
              height={40}
              className="h-full w-full object-contain"
            />
          </span>
          <div>
            <h1 className="text-base font-bold leading-tight text-gray-900">
              Daftarkan tokomu
            </h1>
            <p className="text-xs text-gray-500">
              Gratis, langsung aktif setelah 3 langkah
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-3 py-5 md:px-4 md:py-8">
        {memuat ? (
          <div className="space-y-4" aria-busy="true">
            <span className="sr-only">Memuat</span>
            <div className="h-20 animate-pulse rounded-2xl bg-gray-200/70" />
            <div className="h-96 animate-pulse rounded-2xl bg-gray-200/70" />
          </div>
        ) : selesai ? (
          /* ---------- SUKSES ---------- */
          <section className="relative space-y-6 overflow-hidden rounded-3xl border border-gray-100 bg-white p-6 text-center shadow-sm md:p-8">
            <div className="pointer-events-none absolute -left-12 -top-12 h-40 w-40 rounded-full bg-emerald-50" />
            <div className="pointer-events-none absolute -bottom-14 -right-10 h-44 w-44 rounded-full bg-orange-50" />

            <div className="relative space-y-5">
              <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 ring-8 ring-emerald-50/60">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30">
                  <Check className="h-7 w-7" />
                </span>
              </span>
              <div className="space-y-1.5">
                <h2 className="text-xl font-extrabold tracking-tight text-gray-900">
                  Tokomu sudah aktif
                </h2>
                <p className="mx-auto max-w-sm text-sm text-gray-500">
                  <b className="text-gray-700">{form.nama.trim()}</b> sudah bisa
                  dilihat dan dipesan pembeli. Tambahkan produk agar tokomu siap
                  berjualan.
                </p>
              </div>

              <dl className="divide-y divide-gray-100 rounded-2xl bg-gray-50 text-left text-sm ring-1 ring-gray-100">
                {[
                  ["Area", form.area],
                  ["Alamat", form.alamat],
                  [
                    "Jam buka",
                    `${form.buka.replace(":", ".")} - ${form.tutup.replace(":", ".")}`,
                  ],
                  [
                    "Hari buka",
                    HARI.filter((h) => form.hari.includes(h.id))
                      .map((h) => h.label)
                      .join(", "),
                  ],
                  ["Layanan", layananAktif.join(", ")],
                ].map(([k, v]) => (
                  <div key={k} className="flex gap-3 px-4 py-3">
                    <dt className="w-24 shrink-0 text-gray-500">{k}</dt>
                    <dd className="flex-1 font-medium text-gray-900">{v}</dd>
                  </div>
                ))}
              </dl>

              <a
                href="/owner"
                className={`inline-block rounded-xl px-5 py-2.5 text-sm font-semibold ${TOMBOL_UTAMA}`}
              >
                Kelola toko
              </a>
            </div>
          </section>
        ) : tokoAda ? (
          /* ---------- SUDAH PUNYA TOKO ---------- */
          <section className="space-y-4 rounded-3xl border border-gray-100 bg-white p-6 text-center shadow-sm md:p-8">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50 text-orange-500 ring-1 ring-orange-100">
              <Store className="h-8 w-8" />
            </span>
            <div className="space-y-1.5">
              <h2 className="text-xl font-extrabold tracking-tight text-gray-900">
                Kamu sudah punya toko
              </h2>
              <p className="mx-auto max-w-sm text-sm text-gray-500">
                <b className="text-gray-700">{tokoAda.nama}</b>{" "}
                {tokoAda.status === "active"
                  ? "sudah aktif."
                  : tokoAda.status === "suspended"
                  ? "sedang ditangguhkan."
                  : tokoAda.status === "closed"
                  ? "sedang ditutup."
                  : "terdaftar di akunmu."}{" "}
                Satu akun hanya bisa memiliki satu toko.
              </p>
            </div>
            <a
              href="/owner"
              className={`inline-block rounded-xl px-5 py-2.5 text-sm font-semibold ${TOMBOL_UTAMA}`}
            >
              Kelola toko
            </a>
          </section>
        ) : (
          /* ---------- FORM ---------- */
          <div className="space-y-4">
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm md:p-5">
              <Stepper langkah={langkah} />
            </div>

            <section className="space-y-5 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm md:p-6">
              <div>
                <p className="text-xs font-medium text-orange-600">
                  Langkah {langkah + 1} dari {LANGKAH.length}
                </p>
                <h2 className="text-xl font-bold tracking-tight text-gray-900">
                  {LANGKAH[langkah]}
                </h2>
              </div>

              {galatKirim && (
                <div className="rounded-xl bg-red-50 px-3.5 py-2.5 ring-1 ring-red-100">
                  <PesanGalat>{galatKirim}</PesanGalat>
                </div>
              )}

              {/* LANGKAH 1 */}
              {langkah === 0 && (
                <>
                  <Bidang id="d-nama" label="Nama toko" wajib galat={galat.nama}>
                    <input
                      id="d-nama"
                      value={form.nama}
                      onChange={(e) => ubah("nama", e.target.value)}
                      placeholder="Contoh: Warung Bu Siti"
                      maxLength={100}
                      className={kelasInput(!!galat.nama)}
                    />
                  </Bidang>

                  <Bidang
                    id="d-deskripsi"
                    label="Deskripsi singkat"
                    galat={galat.deskripsi}
                    petunjuk={`Opsional · ${form.deskripsi.length}/200 · Ceritakan apa yang dijual dan keunggulan tokomu`}
                  >
                    <textarea
                      id="d-deskripsi"
                      value={form.deskripsi}
                      onChange={(e) => ubah("deskripsi", e.target.value)}
                      rows={3}
                      maxLength={200}
                      placeholder="Contoh: Sembako lengkap, gas 3 kg, dan pulsa."
                      className={`${kelasInput(!!galat.deskripsi)} resize-none`}
                    />
                  </Bidang>
                </>
              )}

              {/* LANGKAH 2 */}
              {langkah === 1 && (
                <>
                  {dariProfil && (
                    <p className="flex items-start gap-2 rounded-xl bg-sky-50 px-3.5 py-2.5 text-xs text-sky-800 ring-1 ring-sky-100">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Alamat diisi dari profilmu. Ubah bila alamat tokomu berbeda.
                    </p>
                  )}

                  <Bidang id="d-alamat" label="Alamat lengkap" wajib galat={galat.alamat}>
                    <textarea
                      id="d-alamat"
                      value={form.alamat}
                      onChange={(e) => ubah("alamat", e.target.value)}
                      rows={2}
                      placeholder="Nama jalan, RT/RW, nomor"
                      className={`${kelasInput(!!galat.alamat)} resize-none`}
                    />
                  </Bidang>

                  <Bidang
                    id="d-area"
                    label="Area (desa/kelurahan)"
                    wajib
                    galat={galat.area}
                  >
                    <input
                      id="d-area"
                      list="daftar-area-toko"
                      value={form.area}
                      onChange={(e) => ubah("area", e.target.value)}
                      placeholder="Pilih dari saran atau ketik sendiri"
                      className={kelasInput(!!galat.area)}
                    />
                    <datalist id="daftar-area-toko">
                      {daftarArea.map((a) => (
                        <option key={a} value={a} />
                      ))}
                    </datalist>
                  </Bidang>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Bidang id="d-kecamatan" label="Kecamatan" galat={galat.kecamatan}>
                      <input
                        id="d-kecamatan"
                        value={form.kecamatan}
                        onChange={(e) => ubah("kecamatan", e.target.value)}
                        className={kelasInput(!!galat.kecamatan)}
                      />
                    </Bidang>
                    <Bidang id="d-kota" label="Kota/Kabupaten" galat={galat.kota}>
                      <input
                        id="d-kota"
                        value={form.kota}
                        onChange={(e) => ubah("kota", e.target.value)}
                        className={kelasInput(!!galat.kota)}
                      />
                    </Bidang>
                    <Bidang id="d-provinsi" label="Provinsi" galat={galat.provinsi}>
                      <input
                        id="d-provinsi"
                        value={form.provinsi}
                        onChange={(e) => ubah("provinsi", e.target.value)}
                        className={kelasInput(!!galat.provinsi)}
                      />
                    </Bidang>
                    <Bidang id="d-kodePos" label="Kode pos" galat={galat.kodePos}>
                      <input
                        id="d-kodePos"
                        inputMode="numeric"
                        maxLength={5}
                        value={form.kodePos}
                        onChange={(e) => ubah("kodePos", e.target.value)}
                        className={kelasInput(!!galat.kodePos)}
                      />
                    </Bidang>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-sm font-medium text-gray-700">Titik lokasi toko</p>
                    <PilihLokasi
                      lat={form.lat}
                      lng={form.lng}
                      galatLat={galat.lat}
                      galatLng={galat.lng}
                      onChange={(lat, lng) => {
                        setForm((f) => ({ ...f, lat, lng }));
                        setGalat((g) => ({ ...g, lat: undefined, lng: undefined }));
                      }}
                    />
                    <p className="text-xs text-gray-400">
                      Opsional. Berdiri di depan tokomu lalu tekan Gunakan lokasi saya.
                    </p>
                  </div>

                  <Bidang
                    id="d-maps"
                    label="Tautan Google Maps"
                    galat={galat.maps}
                    petunjuk="Opsional"
                  >
                    <input
                      id="d-maps"
                      type="url"
                      inputMode="url"
                      value={form.maps}
                      onChange={(e) => ubah("maps", e.target.value)}
                      placeholder="https://maps.app.goo.gl/..."
                      className={kelasInput(!!galat.maps)}
                    />
                  </Bidang>

                  <div className="grid grid-cols-2 gap-3 md:gap-4">
                    <Bidang id="d-buka" label="Jam buka">
                      <input
                        id="d-buka"
                        type="time"
                        value={form.buka}
                        onChange={(e) => ubah("buka", e.target.value)}
                        className={kelasInput()}
                      />
                    </Bidang>
                    <Bidang id="d-tutup" label="Jam tutup" galat={galat.tutup}>
                      <input
                        id="d-tutup"
                        type="time"
                        value={form.tutup}
                        onChange={(e) => ubah("tutup", e.target.value)}
                        className={kelasInput(!!galat.tutup)}
                      />
                    </Bidang>
                  </div>

                  <Bidang id="d-hari" label="Hari buka" galat={galat.hari}>
                    <div id="d-hari" tabIndex={-1} className="grid grid-cols-7 gap-1.5">
                      {HARI.map((h) => {
                        const aktif = form.hari.includes(h.id);
                        return (
                          <button
                            key={h.id}
                            type="button"
                            onClick={() => toggleHari(h.id)}
                            aria-pressed={aktif}
                            className={`rounded-xl py-2.5 text-xs font-semibold transition-all duration-200 ${
                              aktif ? CHIP_AKTIF : CHIP_NONAKTIF
                            }`}
                          >
                            {h.label}
                          </button>
                        );
                      })}
                    </div>
                  </Bidang>
                </>
              )}

              {/* LANGKAH 3 */}
              {langkah === 2 && (
                <>
                  <Bidang
                    id="d-ambil"
                    label="Layanan untuk pembeli"
                    wajib
                    galat={galat.ambil}
                    petunjuk="Pilih semua yang bisa kamu layani"
                  >
                    <div id="d-ambil" tabIndex={-1} className="space-y-2.5">
                      <PilihanLayanan
                        aktif={form.antar}
                        onClick={() => ubah("antar", !form.antar)}
                        ikon={Bike}
                        judul="Antar ke rumah"
                        teks="Kamu atau kurir tokomu mengantar pesanan"
                      />
                      <PilihanLayanan
                        aktif={form.ambil}
                        onClick={() => ubah("ambil", !form.ambil)}
                        ikon={Store}
                        judul="Ambil di toko"
                        teks="Pembeli datang dan mengambil sendiri"
                      />
                      <PilihanLayanan
                        aktif={form.makan}
                        onClick={() => ubah("makan", !form.makan)}
                        ikon={UtensilsCrossed}
                        judul="Makan di tempat"
                        teks="Pembeli memesan dari meja di tokomu"
                      />
                    </div>
                  </Bidang>

                  <div className="grid gap-4 md:grid-cols-2">
                    {form.antar && (
                      <Bidang
                        id="d-ongkir"
                        label="Ongkos antar (Rp)"
                        galat={galat.ongkir}
                        petunjuk="Kosongkan bila gratis ongkir"
                      >
                        <input
                          id="d-ongkir"
                          inputMode="numeric"
                          value={form.ongkir}
                          onChange={(e) =>
                            ubah("ongkir", e.target.value.replace(/\D/g, ""))
                          }
                          placeholder="0"
                          className={kelasInput(!!galat.ongkir)}
                        />
                      </Bidang>
                    )}
                    <Bidang
                      id="d-minOrder"
                      label="Minimal belanja (Rp)"
                      galat={galat.minOrder}
                      petunjuk="Opsional"
                    >
                      <input
                        id="d-minOrder"
                        inputMode="numeric"
                        value={form.minOrder}
                        onChange={(e) =>
                          ubah("minOrder", e.target.value.replace(/\D/g, ""))
                        }
                        placeholder="0"
                        className={kelasInput(!!galat.minOrder)}
                      />
                    </Bidang>
                  </div>

                  <PilihanLayanan
                    aktif={form.kasir}
                    onClick={() => ubah("kasir", !form.kasir)}
                    ikon={Calculator}
                    judul="Aktifkan kasir (POS)"
                    teks="Catat penjualan langsung di tokomu lewat aplikasi"
                  />

                  <Bidang
                    id="d-wa"
                    label="Nomor WhatsApp toko"
                    wajib
                    galat={galat.wa}
                    petunjuk="Dipakai pembeli untuk bertanya dan memesan"
                  >
                    <div className="relative">
                      <MessageCircle className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-500" />
                      <input
                        id="d-wa"
                        type="tel"
                        inputMode="tel"
                        value={form.wa}
                        onChange={(e) => ubah("wa", e.target.value)}
                        placeholder="0812 3456 7890"
                        className={`${kelasInput(!!galat.wa)} pl-10`}
                      />
                    </div>
                  </Bidang>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Bidang
                      id="d-phone"
                      label="Nomor telepon lain"
                      galat={galat.phone}
                      petunjuk="Opsional"
                    >
                      <input
                        id="d-phone"
                        type="tel"
                        inputMode="tel"
                        value={form.phone}
                        onChange={(e) => ubah("phone", e.target.value)}
                        className={kelasInput(!!galat.phone)}
                      />
                    </Bidang>
                    <Bidang
                      id="d-email"
                      label="Email toko"
                      galat={galat.email}
                      petunjuk="Opsional"
                    >
                      <input
                        id="d-email"
                        type="email"
                        inputMode="email"
                        autoCapitalize="none"
                        value={form.email}
                        onChange={(e) => ubah("email", e.target.value)}
                        className={kelasInput(!!galat.email)}
                      />
                    </Bidang>
                  </div>

                  <p className="flex items-start gap-2.5 rounded-xl border border-orange-100 bg-gradient-to-br from-orange-50 to-amber-50 p-3.5 text-xs text-orange-800">
                    <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" />
                    Tokomu langsung aktif setelah didaftarkan. Label Terverifikasi
                    bisa didapat nanti setelah kami periksa, sebagai tanda
                    tambahan agar lebih dipercaya pembeli.
                  </p>
                </>
              )}
            </section>

            {/* TOMBOL */}
            <div className="flex items-center gap-3">
              {langkah > 0 && (
                <button
                  onClick={kembali}
                  disabled={kirim}
                  className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Kembali
                </button>
              )}
              <button
                onClick={lanjut}
                disabled={kirim}
                className={`ml-auto flex items-center gap-1.5 rounded-xl px-6 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-70 ${TOMBOL_UTAMA}`}
              >
                {kirim ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Mendaftarkan...
                  </>
                ) : langkah === LANGKAH.length - 1 ? (
                  "Daftarkan toko"
                ) : (
                  <>
                    Lanjut
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}