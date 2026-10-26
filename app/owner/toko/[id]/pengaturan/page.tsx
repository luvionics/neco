"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Bike,
  Calculator,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  ImageIcon,
  Link2,
  Loader2,
  LocateFixed,
  Mail,
  MapPin,
  Phone,
  QrCode,
  Save,
  Store,
  Trash2,
  Upload,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { urlHalamanToko, useToko } from "../toko-context";
import { JENIS_PESANAN, Saklar } from "../ui";

// ---------- Konstanta ----------

// Bucket Supabase Storage (harus publik) untuk logo dan banner toko.
const BUCKET_TOKO = "shop-images";
const MAKS_GAMBAR = 2 * 1024 * 1024; // 2 MB

// Halaman tujuan tombol "Atur dan cetak kode QR", relatif terhadap alamat toko.
// Ubah bila folder halamannya bernama lain.
const RUTE_QR_MEJA = "/meja";

const INPUT_MODERN =
  "w-full rounded-xl border border-gray-200 bg-gray-50/70 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-500/10";

const HARI = [
  { k: "mon", label: "Senin" },
  { k: "tue", label: "Selasa" },
  { k: "wed", label: "Rabu" },
  { k: "thu", label: "Kamis" },
  { k: "fri", label: "Jumat" },
  { k: "sat", label: "Sabtu" },
  { k: "sun", label: "Minggu" },
] as const;

type HariKunci = (typeof HARI)[number]["k"];
type JamHari = { buka: boolean; open: string; close: string };

type Form = {
  nama: string;
  deskripsi: string;
  telepon: string;
  whatsapp: string;
  email: string;
  alamat: string;
  desa: string;
  kecamatan: string;
  kota: string;
  provinsi: string;
  kodePos: string;
  petaUrl: string;
  lintang: string;
  bujur: string;
  minPesan: string;
  ongkir: string;
  logo: string;
  banner: string;
  antar: boolean;
  ambil: boolean;
  meja: boolean;
  kasir: boolean;
  jam: Record<HariKunci, JamHari>;
};

// Data ringkas yang disinkronkan ke context toko (bila context menyediakannya)
type PerubahanRingkas = {
  nama: string;
  alamat: string;
  buka: string;
  tutup: string;
  antar: boolean;
  ambil: boolean;
  meja: boolean;
  kasir: boolean;
};

type KonteksLonggar = {
  id: string;
  base?: string;
  toko: { status?: unknown };
  perbaruiToko?: (p: PerubahanRingkas) => Promise<string | null>;
};

// ---------- Fungsi bantu ----------

const teks = (v: unknown) => (typeof v === "string" ? v : "");
const jamPendek = (v: unknown) => (typeof v === "string" ? v.slice(0, 5) : "");
const strAngka = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const bersihNomor = (s: string) => s.replace(/[\s-]/g, "");
const kosongJadiNull = (s: string) => (s.trim() === "" ? null : s.trim());

// "" -> null, angka valid -> number, selain itu NaN
function angkaAtauNull(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  return Number(t);
}

// ---------- Komponen kecil ----------

function KartuSection({
  ikon: Ikon,
  judul,
  deskripsi,
  children,
}: {
  ikon: LucideIcon;
  judul: string;
  deskripsi?: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
          <Ikon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">{judul}</h3>
          {deskripsi && <p className="text-xs text-gray-500">{deskripsi}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Bidang({
  id,
  label,
  ikon: Ikon,
  bantuan,
  children,
}: {
  id: string;
  label: string;
  ikon?: LucideIcon;
  bantuan?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="flex items-center gap-1.5 text-sm font-medium text-gray-700"
      >
        {Ikon && <Ikon className="h-4 w-4 text-gray-400" />}
        {label}
      </label>
      {children}
      {bantuan && <p className="text-xs text-gray-400">{bantuan}</p>}
    </div>
  );
}

function BarisFitur({
  ikon: Ikon,
  judul,
  deskripsi,
  nyala,
  onChange,
  aksi,
}: {
  ikon: LucideIcon;
  judul: string;
  deskripsi?: string;
  nyala: boolean;
  onChange: () => void;
  /** Konten tambahan di bawah baris, hanya tampil saat fitur menyala */
  aksi?: ReactNode;
}) {
  return (
    <li className="transition-colors hover:bg-gray-50/70">
      <div className="flex items-center gap-3.5 px-5 py-3.5">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
            nyala ? "bg-orange-50 text-orange-500" : "bg-gray-100 text-gray-400"
          }`}
        >
          <Ikon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900">{judul}</p>
          {deskripsi && <p className="text-xs text-gray-500">{deskripsi}</p>}
        </div>
        <Saklar nyala={nyala} onChange={onChange} label={judul} />
      </div>
      {nyala && aksi && <div className="px-5 pb-4 md:pl-[4.625rem]">{aksi}</div>}
    </li>
  );
}

function BidangGambar({
  label,
  bantuan,
  url,
  lebar,
  sedangUnggah,
  onPilih,
  onHapus,
}: {
  label: string;
  bantuan: string;
  url: string;
  lebar: boolean;
  sedangUnggah: boolean;
  onPilih: (file: File) => void;
  onHapus: () => void;
}) {
  const pilih = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onPilih(file);
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">{label}</p>
      <div className="flex items-center gap-3.5">
        <div
          className={`flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-gray-200 bg-gray-50 ${
            lebar ? "h-20 w-36" : "h-20 w-20"
          }`}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-6 w-6 text-gray-300" />
          )}
        </div>
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:border-orange-200 hover:bg-orange-50/50 hover:text-orange-600">
              {sedangUnggah ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              {url ? "Ganti" : "Unggah"}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={sedangUnggah}
                onChange={pilih}
              />
            </label>
            {url && !sedangUnggah && (
              <button
                type="button"
                onClick={onHapus}
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Hapus
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400">{bantuan}</p>
        </div>
      </div>
    </div>
  );
}

function Kerangka() {
  return (
    <div className="space-y-6" aria-busy="true">
      <span className="sr-only">Memuat pengaturan toko</span>
      <div className="h-10 w-48 animate-pulse rounded-xl bg-gray-200/70" />
      <div className="h-48 animate-pulse rounded-2xl bg-gray-200/70" />
      <div className="h-64 animate-pulse rounded-2xl bg-gray-200/70" />
      <div className="h-64 animate-pulse rounded-2xl bg-gray-200/70" />
    </div>
  );
}

// ---------- Halaman ----------

export default function PengaturanTokoPage() {
  const { id, base, toko, perbaruiToko } = useToko() as unknown as KonteksLonggar;
  const supabase = useMemo(() => createClient(), []);

  const [form, setForm] = useState<Form | null>(null);
  const [mejaTersimpan, setMejaTersimpan] = useState(false);
  const [memuat, setMemuat] = useState(true);
  const [galatMuat, setGalatMuat] = useState(false);

  const [tersimpan, setTersimpan] = useState(false);
  const [menyimpan, setMenyimpan] = useState(false);
  const [galat, setGalat] = useState("");
  const [unggah, setUnggah] = useState<"logo" | "banner" | null>(null);
  const [mencariLokasi, setMencariLokasi] = useState(false);

  // Context bisa memakai "aktif" atau "active"
  const statusToko = String(toko.status ?? "");
  const aktif = statusToko === "aktif" || statusToko === "active";

  // Alamat dasar halaman toko ini, dipakai untuk tombol ke halaman lain
  const alamatDasar = base ?? `/owner/toko/${id}`;

  // Muat data lengkap toko dari tabel shops
  useEffect(() => {
    let batal = false;

    async function muat() {
      const { data, error } = await supabase
        .from("shops")
        .select(
          "name, description, phone, whatsapp, email, address_line, village, district, city, province, postal_code, maps_url, latitude, longitude, min_order, delivery_fee, logo_url, banner_url, opening_hours, delivery_enabled, pickup_enabled, dine_in_enabled, pos_enabled"
        )
        .eq("id", id)
        .maybeSingle();

      if (batal) return;

      if (error || !data) {
        setGalatMuat(true);
        setMemuat(false);
        return;
      }

      const r = data as Record<string, unknown>;
      const mentah =
        r.opening_hours && typeof r.opening_hours === "object"
          ? (r.opening_hours as Record<string, unknown>)
          : {};
      const belumDiatur = Object.keys(mentah).length === 0;

      const jam = {} as Record<HariKunci, JamHari>;
      HARI.forEach(({ k }) => {
        const j = mentah[k] as { open?: unknown; close?: unknown } | null | undefined;
        if (belumDiatur) {
          // Awalan bila jam buka belum pernah diatur: semua hari buka kecuali Minggu
          jam[k] = { buka: k !== "sun", open: "08:00", close: "17:00" };
        } else if (j && j.open && j.close) {
          jam[k] = { buka: true, open: jamPendek(j.open), close: jamPendek(j.close) };
        } else {
          jam[k] = { buka: false, open: "08:00", close: "17:00" };
        }
      });

      setMejaTersimpan(r.dine_in_enabled === true);
      setForm({
        nama: teks(r.name),
        deskripsi: teks(r.description),
        telepon: teks(r.phone),
        whatsapp: teks(r.whatsapp),
        email: teks(r.email),
        alamat: teks(r.address_line),
        desa: teks(r.village),
        kecamatan: teks(r.district),
        kota: teks(r.city),
        provinsi: teks(r.province),
        kodePos: teks(r.postal_code),
        petaUrl: teks(r.maps_url),
        lintang: strAngka(r.latitude),
        bujur: strAngka(r.longitude),
        minPesan: strAngka(r.min_order ?? 0),
        ongkir: strAngka(r.delivery_fee ?? 0),
        logo: teks(r.logo_url),
        banner: teks(r.banner_url),
        antar: r.delivery_enabled === true,
        ambil: r.pickup_enabled === true,
        meja: r.dine_in_enabled === true,
        kasir: r.pos_enabled === true,
        jam,
      });
      setMemuat(false);
    }

    muat();
    return () => {
      batal = true;
    };
  }, [supabase, id]);

  const ubah = <K extends keyof Form>(kunci: K, nilai: Form[K]) =>
    setForm((f) => (f ? { ...f, [kunci]: nilai } : f));

  const ubahHari = (k: HariKunci, bagian: Partial<JamHari>) =>
    setForm((f) => (f ? { ...f, jam: { ...f.jam, [k]: { ...f.jam[k], ...bagian } } } : f));

  const samakanSemuaHari = () =>
    setForm((f) => {
      if (!f) return f;
      const acuan = HARI.map(({ k }) => f.jam[k]).find((j) => j.buka);
      if (!acuan) return f;
      const jam = { ...f.jam };
      HARI.forEach(({ k }) => {
        if (jam[k].buka) jam[k] = { ...jam[k], open: acuan.open, close: acuan.close };
      });
      return { ...f, jam };
    });

  const gunakanLokasiSaya = () => {
    if (!navigator.geolocation) {
      setGalat("Peramban ini tidak mendukung pencarian lokasi");
      return;
    }
    setMencariLokasi(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        ubah("lintang", pos.coords.latitude.toFixed(6));
        ubah("bujur", pos.coords.longitude.toFixed(6));
        setMencariLokasi(false);
      },
      () => {
        setGalat("Lokasi tidak bisa diambil. Izinkan akses lokasi atau isi manual.");
        setMencariLokasi(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const unggahGambar = async (file: File, jenis: "logo" | "banner") => {
    if (!file.type.startsWith("image/")) {
      setGalat("File harus berupa gambar");
      return;
    }
    if (file.size > MAKS_GAMBAR) {
      setGalat("Ukuran gambar maksimal 2 MB");
      return;
    }

    setGalat("");
    setUnggah(jenis);
    const ekstensi = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${id}/${jenis}-${Date.now()}.${ekstensi || "jpg"}`;

    const { error } = await supabase.storage
      .from(BUCKET_TOKO)
      .upload(path, file, { contentType: file.type, upsert: false });

    if (error) {
      setGalat(
        `Gagal mengunggah gambar. Pastikan bucket "${BUCKET_TOKO}" ada, publik, dan punya policy upload.`
      );
      setUnggah(null);
      return;
    }

    const { data } = supabase.storage.from(BUCKET_TOKO).getPublicUrl(path);
    ubah(jenis, data.publicUrl);
    setUnggah(null);
  };

  const simpan = async () => {
    if (!form) return;

    // ----- Validasi (sesuai constraint tabel shops) -----
    const nama = form.nama.trim();
    if (nama.length < 3) return setGalat("Nama toko minimal 3 huruf");
    if (nama.length > 100) return setGalat("Nama toko maksimal 100 huruf");

    const alamat = form.alamat.trim();
    if (alamat.length < 8)
      return setGalat("Tulis alamat yang cukup jelas, misalnya nama jalan dan nomor");

    const telepon = bersihNomor(form.telepon);
    const whatsapp = bersihNomor(form.whatsapp);
    const polaNomor = /^\+?[0-9]{9,15}$/;
    if (telepon && !polaNomor.test(telepon))
      return setGalat("Nomor telepon harus 9–15 angka, boleh diawali +");
    if (whatsapp && !polaNomor.test(whatsapp))
      return setGalat("Nomor WhatsApp harus 9–15 angka, boleh diawali +");

    const email = form.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return setGalat("Format email belum benar");

    const kodePos = form.kodePos.trim();
    if (kodePos && !/^[0-9]{5}$/.test(kodePos))
      return setGalat("Kode pos harus 5 angka");

    const petaUrl = form.petaUrl.trim();
    if (petaUrl && !/^https?:\/\//i.test(petaUrl))
      return setGalat("Tautan peta harus diawali http:// atau https://");

    const lintang = angkaAtauNull(form.lintang);
    const bujur = angkaAtauNull(form.bujur);
    if (lintang !== null && (!Number.isFinite(lintang) || lintang < -90 || lintang > 90))
      return setGalat("Lintang harus berupa angka antara -90 dan 90");
    if (bujur !== null && (!Number.isFinite(bujur) || bujur < -180 || bujur > 180))
      return setGalat("Bujur harus berupa angka antara -180 dan 180");
    if ((lintang === null) !== (bujur === null))
      return setGalat("Isi lintang dan bujur sekaligus, atau kosongkan keduanya");

    const minPesan = angkaAtauNull(form.minPesan) ?? 0;
    const ongkir = angkaAtauNull(form.ongkir) ?? 0;
    if (!Number.isFinite(minPesan) || minPesan < 0)
      return setGalat("Minimal pesanan tidak boleh negatif");
    if (!Number.isFinite(ongkir) || ongkir < 0)
      return setGalat("Ongkos kirim tidak boleh negatif");

    if (!form.antar && !form.ambil && !form.meja)
      return setGalat("Aktifkan minimal satu layanan untuk pembeli");

    const hariBuka = HARI.filter(({ k }) => form.jam[k].buka);
    if (hariBuka.length === 0) return setGalat("Aktifkan minimal satu hari buka");
    for (const { k, label } of hariBuka) {
      const j = form.jam[k];
      if (!j.open || !j.close) return setGalat(`Isi jam buka dan tutup hari ${label}`);
      if (j.open === j.close)
        return setGalat(`Jam tutup hari ${label} harus berbeda dari jam buka`);
    }

    setGalat("");
    setMenyimpan(true);

    // Sinkronkan data ringkas ke context toko bila tersedia (jam diambil dari hari buka pertama)
    if (perbaruiToko) {
      const acuan = form.jam[hariBuka[0].k];
      const pesan = await perbaruiToko({
        nama,
        alamat,
        buka: acuan.open,
        tutup: acuan.close,
        antar: form.antar,
        ambil: form.ambil,
        meja: form.meja,
        kasir: form.kasir,
      });

      if (pesan) {
        setGalat(pesan);
        setMenyimpan(false);
        return;
      }
    }

    // Simpan data lengkap (termasuk jam per hari) langsung ke tabel shops
    const openingHours: Record<string, { open: string; close: string } | null> = {};
    HARI.forEach(({ k }) => {
      const j = form.jam[k];
      openingHours[k] = j.buka ? { open: j.open, close: j.close } : null;
    });

    const { error } = await supabase
      .from("shops")
      .update({
        name: nama,
        description: kosongJadiNull(form.deskripsi),
        phone: kosongJadiNull(telepon),
        whatsapp: kosongJadiNull(whatsapp),
        email: kosongJadiNull(email),
        address_line: alamat,
        village: kosongJadiNull(form.desa),
        district: kosongJadiNull(form.kecamatan),
        city: kosongJadiNull(form.kota),
        province: kosongJadiNull(form.provinsi),
        postal_code: kosongJadiNull(kodePos),
        maps_url: kosongJadiNull(petaUrl),
        latitude: lintang,
        longitude: bujur,
        min_order: minPesan,
        delivery_fee: ongkir,
        logo_url: kosongJadiNull(form.logo),
        banner_url: kosongJadiNull(form.banner),
        opening_hours: openingHours,
        delivery_enabled: form.antar,
        pickup_enabled: form.ambil,
        dine_in_enabled: form.meja,
        pos_enabled: form.kasir,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    setMenyimpan(false);

    if (error) {
      setGalat("Gagal menyimpan perubahan, coba lagi");
      return;
    }
    setMejaTersimpan(form.meja);
    setTersimpan(true);
    setTimeout(() => setTersimpan(false), 2500);
  };

  if (memuat) return <Kerangka />;

  if (galatMuat || !form) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-100 bg-white px-6 py-14 text-center shadow-sm">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <AlertCircle className="h-6 w-6" />
        </span>
        <p className="text-sm text-gray-500">
          Data toko gagal dimuat. Muat ulang halaman, atau periksa aturan RLS tabel
          shops di Supabase.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 text-xs font-medium text-orange-600 transition-colors hover:bg-orange-100"
        >
          Muat ulang
        </button>
      </div>
    );
  }

  const lokasi = [form.desa, form.kota].filter(Boolean).join(", ");

  // Tombol ke halaman kode QR meja. Baru bisa dibuka setelah layanan meja tersimpan.
  const mejaBelumTersimpan = form.meja !== mejaTersimpan;
  const aksiMeja = mejaBelumTersimpan ? (
    <p className="flex items-start gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-100">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      Simpan perubahan dulu, setelah itu tombol atur dan cetak kode QR bisa dibuka.
    </p>
  ) : (
    <Link
      href={`${alamatDasar}${RUTE_QR_MEJA}`}
      className="inline-flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3.5 py-2 text-xs font-semibold text-orange-700 transition-colors hover:bg-orange-100"
    >
      <QrCode className="h-4 w-4" />
      Atur dan cetak kode QR
    </Link>
  );

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Header */}
      <header>
        <p className="text-sm text-gray-500">Atur profil dan layanan toko Anda</p>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">
          Pengaturan toko
        </h2>
      </header>

      {/* Gambar toko */}
      <KartuSection
        ikon={ImageIcon}
        judul="Gambar toko"
        deskripsi="Logo dan banner agar toko lebih dikenali"
      >
        <div className="grid gap-6 p-5 md:grid-cols-2">
          <BidangGambar
            label="Logo"
            bantuan="Persegi, maksimal 2 MB"
            url={form.logo}
            lebar={false}
            sedangUnggah={unggah === "logo"}
            onPilih={(f) => unggahGambar(f, "logo")}
            onHapus={() => ubah("logo", "")}
          />
          <BidangGambar
            label="Banner"
            bantuan="Persegi panjang, maksimal 2 MB"
            url={form.banner}
            lebar
            sedangUnggah={unggah === "banner"}
            onPilih={(f) => unggahGambar(f, "banner")}
            onHapus={() => ubah("banner", "")}
          />
        </div>
      </KartuSection>

      {/* Profil toko */}
      <KartuSection
        ikon={Store}
        judul="Profil toko"
        deskripsi={lokasi ? `Area ${lokasi}` : undefined}
      >
        <div className="space-y-5 p-5">
          <Bidang id="nama-toko" label="Nama toko">
            <input
              id="nama-toko"
              value={form.nama}
              maxLength={100}
              onChange={(e) => ubah("nama", e.target.value)}
              className={INPUT_MODERN}
            />
          </Bidang>

          <Bidang
            id="deskripsi-toko"
            label="Deskripsi"
            ikon={FileText}
            bantuan="Ceritakan singkat tentang tokomu: menu andalan, keunggulan, dan sebagainya"
          >
            <textarea
              id="deskripsi-toko"
              rows={3}
              maxLength={500}
              value={form.deskripsi}
              onChange={(e) => ubah("deskripsi", e.target.value)}
              className={`${INPUT_MODERN} resize-none`}
            />
          </Bidang>
        </div>
      </KartuSection>

      {/* Kontak */}
      <KartuSection ikon={Phone} judul="Kontak" deskripsi="Agar pembeli mudah menghubungi">
        <div className="grid gap-5 p-5 md:grid-cols-2">
          <Bidang id="telepon" label="Telepon" ikon={Phone} bantuan="Contoh: 081234567890">
            <input
              id="telepon"
              type="tel"
              inputMode="tel"
              value={form.telepon}
              onChange={(e) => ubah("telepon", e.target.value)}
              className={INPUT_MODERN}
            />
          </Bidang>
          <Bidang id="whatsapp" label="WhatsApp" ikon={Phone} bantuan="Contoh: 081234567890">
            <input
              id="whatsapp"
              type="tel"
              inputMode="tel"
              value={form.whatsapp}
              onChange={(e) => ubah("whatsapp", e.target.value)}
              className={INPUT_MODERN}
            />
          </Bidang>
          <div className="md:col-span-2">
            <Bidang id="email" label="Email" ikon={Mail}>
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => ubah("email", e.target.value)}
                className={INPUT_MODERN}
              />
            </Bidang>
          </div>
        </div>
      </KartuSection>

      {/* Alamat dan lokasi */}
      <KartuSection
        ikon={MapPin}
        judul="Alamat dan lokasi"
        deskripsi="Dipakai pembeli untuk menemukan tokomu"
      >
        <div className="space-y-5 p-5">
          <Bidang id="alamat-toko" label="Alamat lengkap" ikon={MapPin}>
            <textarea
              id="alamat-toko"
              rows={2}
              value={form.alamat}
              onChange={(e) => ubah("alamat", e.target.value)}
              className={`${INPUT_MODERN} resize-none`}
            />
          </Bidang>

          <div className="grid gap-5 md:grid-cols-2">
            <Bidang id="desa" label="Desa / Kelurahan">
              <input
                id="desa"
                value={form.desa}
                onChange={(e) => ubah("desa", e.target.value)}
                className={INPUT_MODERN}
              />
            </Bidang>
            <Bidang id="kecamatan" label="Kecamatan">
              <input
                id="kecamatan"
                value={form.kecamatan}
                onChange={(e) => ubah("kecamatan", e.target.value)}
                className={INPUT_MODERN}
              />
            </Bidang>
            <Bidang id="kota" label="Kota / Kabupaten">
              <input
                id="kota"
                value={form.kota}
                onChange={(e) => ubah("kota", e.target.value)}
                className={INPUT_MODERN}
              />
            </Bidang>
            <Bidang id="provinsi" label="Provinsi">
              <input
                id="provinsi"
                value={form.provinsi}
                onChange={(e) => ubah("provinsi", e.target.value)}
                className={INPUT_MODERN}
              />
            </Bidang>
            <Bidang id="kode-pos" label="Kode pos">
              <input
                id="kode-pos"
                inputMode="numeric"
                maxLength={5}
                value={form.kodePos}
                onChange={(e) => ubah("kodePos", e.target.value.replace(/\D/g, ""))}
                className={INPUT_MODERN}
              />
            </Bidang>
            <Bidang id="peta-url" label="Tautan Google Maps" ikon={Link2}>
              <input
                id="peta-url"
                type="url"
                inputMode="url"
                placeholder="https://maps.app.goo.gl/..."
                value={form.petaUrl}
                onChange={(e) => ubah("petaUrl", e.target.value)}
                className={INPUT_MODERN}
              />
            </Bidang>
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3 md:gap-4">
              <Bidang id="lintang" label="Lintang (latitude)">
                <input
                  id="lintang"
                  inputMode="decimal"
                  placeholder="-7.250445"
                  value={form.lintang}
                  onChange={(e) => ubah("lintang", e.target.value)}
                  className={INPUT_MODERN}
                />
              </Bidang>
              <Bidang id="bujur" label="Bujur (longitude)">
                <input
                  id="bujur"
                  inputMode="decimal"
                  placeholder="112.768845"
                  value={form.bujur}
                  onChange={(e) => ubah("bujur", e.target.value)}
                  className={INPUT_MODERN}
                />
              </Bidang>
            </div>
            <button
              type="button"
              onClick={gunakanLokasiSaya}
              disabled={mencariLokasi}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:border-orange-200 hover:bg-orange-50/50 hover:text-orange-600 disabled:opacity-60"
            >
              {mencariLokasi ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <LocateFixed className="h-3.5 w-3.5" />
              )}
              Gunakan lokasi saya sekarang
            </button>
          </div>
        </div>
      </KartuSection>

      {/* Jam buka */}
      <KartuSection
        ikon={Clock}
        judul="Jam buka"
        deskripsi="Atur jam tiap hari, matikan untuk hari libur"
      >
        <ul className="divide-y divide-gray-100">
          {HARI.map(({ k, label }) => {
            const j = form.jam[k];
            return (
              <li
                key={k}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3.5"
              >
                <span className="w-20 text-sm font-medium text-gray-900">{label}</span>
                <Saklar
                  nyala={j.buka}
                  onChange={() => ubahHari(k, { buka: !j.buka })}
                  label={`Buka hari ${label}`}
                />
                {j.buka ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      aria-label={`Jam buka ${label}`}
                      value={j.open}
                      onChange={(e) => ubahHari(k, { open: e.target.value })}
                      className={`${INPUT_MODERN} !w-auto`}
                    />
                    <span className="text-gray-400">-</span>
                    <input
                      type="time"
                      aria-label={`Jam tutup ${label}`}
                      value={j.close}
                      onChange={(e) => ubahHari(k, { close: e.target.value })}
                      className={`${INPUT_MODERN} !w-auto`}
                    />
                  </div>
                ) : (
                  <span className="text-sm text-gray-400">Libur</span>
                )}
              </li>
            );
          })}
        </ul>
        <div className="border-t border-gray-100 px-5 py-3">
          <button
            type="button"
            onClick={samakanSemuaHari}
            className="text-xs font-medium text-orange-600 transition-colors hover:text-orange-700"
          >
            Samakan jam semua hari buka dengan hari buka pertama
          </button>
        </div>
      </KartuSection>

      {/* Layanan untuk pembeli */}
      <KartuSection
        ikon={Store}
        judul="Layanan untuk pembeli"
        deskripsi="Pilih cara pembeli memesan"
      >
        <ul className="divide-y divide-gray-100">
          {JENIS_PESANAN.map(({ id: k, label, ikon }) => (
            <BarisFitur
              key={k}
              ikon={ikon}
              judul={label}
              nyala={form[k]}
              onChange={() => ubah(k, !form[k])}
              aksi={k === "meja" ? aksiMeja : undefined}
            />
          ))}
        </ul>
      </KartuSection>

      {/* Biaya pesanan */}
      <KartuSection
        ikon={Wallet}
        judul="Biaya pesanan"
        deskripsi="Minimal belanja dan ongkos kirim"
      >
        <div className="grid gap-5 p-5 md:grid-cols-2">
          <Bidang
            id="min-pesan"
            label="Minimal pesanan (Rp)"
            bantuan="Isi 0 jika tidak ada minimal"
          >
            <input
              id="min-pesan"
              type="number"
              inputMode="numeric"
              min={0}
              step={500}
              value={form.minPesan}
              onChange={(e) => ubah("minPesan", e.target.value)}
              className={INPUT_MODERN}
            />
          </Bidang>
          {form.antar && (
            <Bidang
              id="ongkir"
              label="Ongkos kirim (Rp)"
              ikon={Bike}
              bantuan="Isi 0 untuk gratis ongkir"
            >
              <input
                id="ongkir"
                type="number"
                inputMode="numeric"
                min={0}
                step={500}
                value={form.ongkir}
                onChange={(e) => ubah("ongkir", e.target.value)}
                className={INPUT_MODERN}
              />
            </Bidang>
          )}
        </div>
      </KartuSection>

      {/* Fitur toko */}
      <KartuSection
        ikon={Calculator}
        judul="Fitur toko"
        deskripsi="Tambahan untuk mengelola toko"
      >
        <ul>
          <BarisFitur
            ikon={Calculator}
            judul="Kasir"
            deskripsi="Munculkan menu Kasir di navigasi"
            nyala={form.kasir}
            onChange={() => ubah("kasir", !form.kasir)}
          />
        </ul>
      </KartuSection>

      {galat && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{galat}</p>
        </div>
      )}

      {/* Aksi */}
      <div className="flex flex-wrap items-center gap-3">
        {aktif && (
          <Link
            href={urlHalamanToko(id)}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:border-orange-200 hover:bg-orange-50/50 hover:text-orange-600 md:hidden"
          >
            <ExternalLink className="h-4 w-4" />
            Lihat halaman toko
          </Link>
        )}

        <span aria-live="polite" className="min-h-6">
          {tersimpan && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-600 ring-1 ring-emerald-100">
              <CheckCircle2 className="h-4 w-4" />
              Perubahan tersimpan
            </span>
          )}
        </span>

        <button
          onClick={simpan}
          disabled={menyimpan || unggah !== null}
          className="ml-auto inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-orange-500/25 transition-all hover:shadow-lg hover:shadow-orange-500/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {menyimpan ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {menyimpan ? "Menyimpan..." : "Simpan perubahan"}
        </button>
      </div>
    </div>
  );
}