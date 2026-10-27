"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertCircle,
  FileText,
  Link2,
  Loader2,
  LocateFixed,
  Mail,
  MapPin,
  Phone,
  Save,
  Store,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/toast";
import { useToko } from "../../components/toko-context";

// ---------- Konstanta & tipe ----------

// Tombol simpan melayang. Di layar kecil dinaikkan agar tidak tertimpa navigasi bawah.
const POSISI_TOMBOL_SIMPAN = "bottom-[calc(6rem+env(safe-area-inset-bottom))] md:bottom-8";

const INPUT_MODERN =
  "w-full rounded-xl border border-gray-200 bg-gray-50/70 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-500/10";

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
};

// ---------- Fungsi bantu ----------

const teks = (v: unknown) => (typeof v === "string" ? v : "");
const strAngka = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const bersihNomor = (s: string) => s.replace(/[\s-]/g, "");
const kosongJadiNull = (s: string) => (s.trim() === "" ? null : s.trim());

// "" -> null, angka valid -> number, selain itu NaN
function angkaAtauNull(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  return Number(t);
}

function pesanGalatDb(error: { code?: string; message?: string }): string {
  if (error.code === "42501") return "Kamu tidak punya izin mengubah toko ini.";
  if (error.code === "23514") return "Ada isian yang tidak memenuhi aturan database.";
  if (error.code === "23505") return "Data yang sama sudah dipakai.";
  return error.message || "Coba lagi beberapa saat.";
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
      <label htmlFor={id} className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
        {Ikon && <Ikon className="h-4 w-4 text-gray-400" />}
        {label}
      </label>
      {children}
      {bantuan && <p className="text-xs text-gray-400">{bantuan}</p>}
    </div>
  );
}

function TombolSimpan({
  tampil,
  menyimpan,
  onSimpan,
}: {
  tampil: boolean;
  menyimpan: boolean;
  onSimpan: () => void;
}) {
  return (
    <div
      aria-hidden={!tampil}
      className={`pointer-events-none fixed right-4 z-40 transition-all duration-200 md:right-8 ${POSISI_TOMBOL_SIMPAN} ${
        tampil ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      }`}
    >
      <button
        type="button"
        onClick={onSimpan}
        tabIndex={tampil ? 0 : -1}
        disabled={!tampil || menyimpan}
        className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/30 transition-all hover:shadow-xl hover:shadow-orange-500/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {menyimpan ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {menyimpan ? "Menyimpan..." : "Simpan perubahan"}
      </button>
    </div>
  );
}

// ---------- Komponen utama ----------

export default function InfoToko() {
  const { id, perbaruiToko } = useToko();
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const [form, setForm] = useState<Form | null>(null);
  const [awal, setAwal] = useState<string | null>(null); // cuplikan terakhir tersimpan
  const [memuat, setMemuat] = useState(true);
  const [menyimpan, setMenyimpan] = useState(false);
  const [mencariLokasi, setMencariLokasi] = useState(false);

  const adaPerubahan = form !== null && awal !== null && JSON.stringify(form) !== awal;

  // Peringatkan sebelum meninggalkan halaman bila ada perubahan belum tersimpan
  useEffect(() => {
    if (!adaPerubahan) return;
    const onSebelumTutup = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onSebelumTutup);
    return () => window.removeEventListener("beforeunload", onSebelumTutup);
  }, [adaPerubahan]);

  // Muat data dari tabel shops
  useEffect(() => {
    let batal = false;

    async function muat() {
      const { data, error } = await supabase
        .from("shops")
        .select(
          "name, description, phone, whatsapp, email, address_line, village, district, city, province, postal_code, maps_url, latitude, longitude"
        )
        .eq("id", id)
        .maybeSingle();

      if (batal) return;

      if (error || !data) {
        if (error) console.error("Gagal memuat info toko:", error);
        setMemuat(false);
        return;
      }

      const r = data as Record<string, unknown>;
      const formAwal: Form = {
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
      };
      setForm(formAwal);
      setAwal(JSON.stringify(formAwal));
      setMemuat(false);
    }

    muat();
    return () => {
      batal = true;
    };
  }, [supabase, id]);

  const ubah = <K extends keyof Form>(kunci: K, nilai: Form[K]) =>
    setForm((f) => (f ? { ...f, [kunci]: nilai } : f));

  const gunakanLokasiSaya = () => {
    if (!navigator.geolocation) {
      toast.galat("Lokasi tidak didukung", "Peramban ini tidak mendukung pencarian lokasi.");
      return;
    }
    setMencariLokasi(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        ubah("lintang", pos.coords.latitude.toFixed(6));
        ubah("bujur", pos.coords.longitude.toFixed(6));
        setMencariLokasi(false);
        toast.sukses("Lokasi berhasil diambil", "Jangan lupa simpan perubahan.");
      },
      () => {
        setMencariLokasi(false);
        toast.galat(
          "Lokasi tidak bisa diambil",
          "Izinkan akses lokasi di peramban, atau isi lintang dan bujur secara manual."
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const simpan = async () => {
    if (!form) return;
    const gagal = (pesan: string) => toast.galat(pesan);

    // ----- Validasi (sesuai constraint tabel shops) -----
    const nama = form.nama.trim();
    if (nama.length < 3) return gagal("Nama toko minimal 3 huruf");
    if (nama.length > 100) return gagal("Nama toko maksimal 100 huruf");

    const alamat = form.alamat.trim();
    if (alamat.length < 8)
      return gagal("Tulis alamat yang cukup jelas, misalnya nama jalan dan nomor");

    const telepon = bersihNomor(form.telepon);
    const whatsapp = bersihNomor(form.whatsapp);
    const polaNomor = /^\+?[0-9]{9,15}$/;
    if (telepon && !polaNomor.test(telepon))
      return gagal("Nomor telepon harus 9–15 angka, boleh diawali +");
    if (whatsapp && !polaNomor.test(whatsapp))
      return gagal("Nomor WhatsApp harus 9–15 angka, boleh diawali +");

    const email = form.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return gagal("Format email belum benar");

    const kodePos = form.kodePos.trim();
    if (kodePos && !/^[0-9]{5}$/.test(kodePos)) return gagal("Kode pos harus 5 angka");

    const petaUrl = form.petaUrl.trim();
    if (petaUrl && !/^https?:\/\//i.test(petaUrl))
      return gagal("Tautan peta harus diawali http:// atau https://");

    const lintang = angkaAtauNull(form.lintang);
    const bujur = angkaAtauNull(form.bujur);
    if (lintang !== null && (!Number.isFinite(lintang) || lintang < -90 || lintang > 90))
      return gagal("Lintang harus berupa angka antara -90 dan 90");
    if (bujur !== null && (!Number.isFinite(bujur) || bujur < -180 || bujur > 180))
      return gagal("Bujur harus berupa angka antara -180 dan 180");
    if ((lintang === null) !== (bujur === null))
      return gagal("Isi lintang dan bujur sekaligus, atau kosongkan keduanya");

    setMenyimpan(true);
    const cuplikan = JSON.stringify(form);

    try {
      const { data, error } = await supabase
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
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("id");

      if (error) {
        console.error("Gagal menyimpan info toko:", error);
        toast.galat("Gagal menyimpan perubahan", pesanGalatDb(error));
        return;
      }

      // RLS yang menolak update tidak mengembalikan error, hanya 0 baris
      if (!data || data.length === 0) {
        toast.galat(
          "Perubahan tidak tersimpan",
          "Kamu tidak punya izin mengubah toko ini, atau toko tidak ditemukan."
        );
        return;
      }

      perbaruiToko({ nama, alamat, area: form.desa.trim() });
      setAwal(cuplikan);
      toast.sukses("Perubahan tersimpan", "Info toko berhasil diperbarui.");
    } catch (e) {
      console.error("Gagal menyimpan info toko:", e);
      toast.galat("Gagal menyimpan perubahan", "Periksa koneksi internet lalu coba lagi.");
    } finally {
      setMenyimpan(false);
    }
  };

  if (memuat) {
    return (
      <div className="space-y-6" aria-busy="true">
        <span className="sr-only">Memuat info toko</span>
        <div className="h-48 animate-pulse rounded-2xl bg-gray-200/70" />
        <div className="h-64 animate-pulse rounded-2xl bg-gray-200/70" />
        <div className="h-64 animate-pulse rounded-2xl bg-gray-200/70" />
      </div>
    );
  }

  if (!form) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-100 bg-white px-6 py-14 text-center shadow-sm">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <AlertCircle className="h-6 w-6" />
        </span>
        <p className="text-sm text-gray-500">
          Info toko gagal dimuat. Muat ulang halaman dan periksa aturan RLS tabel shops di Supabase.
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

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Profil toko */}
      <KartuSection ikon={Store} judul="Profil toko" deskripsi={lokasi ? `Area ${lokasi}` : undefined}>
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

      {/* Ruang kosong agar konten terakhir tidak tertutup tombol simpan melayang */}
      <div aria-hidden className="h-16" />

      <TombolSimpan tampil={adaPerubahan} menyimpan={menyimpan} onSimpan={simpan} />
    </div>
  );
}