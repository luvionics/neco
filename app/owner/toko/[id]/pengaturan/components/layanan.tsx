"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Bike,
  Calculator,
  Loader2,
  QrCode,
  Save,
  Store,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/toast";
import { useToko } from "../../components/toko-context";
import { JENIS_PESANAN, Saklar } from "../../ui";

// ---------- Konstanta & tipe ----------

// Halaman tujuan tombol "Atur dan cetak kode QR", relatif terhadap alamat toko.
// Ubah bila folder halamannya bernama lain.
const RUTE_QR_MEJA = "/meja";

const POSISI_TOMBOL_SIMPAN = "bottom-[calc(6rem+env(safe-area-inset-bottom))] md:bottom-8";

const INPUT_MODERN =
  "w-full rounded-xl border border-gray-200 bg-gray-50/70 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-500/10";

type Form = {
  antar: boolean;
  ambil: boolean;
  meja: boolean;
  kasir: boolean;
  minPesan: string;
  ongkir: string;
};

// ---------- Fungsi bantu ----------

const strAngka = (v: unknown) => (v === null || v === undefined ? "" : String(v));

// "" -> null, angka valid -> number, selain itu NaN
function angkaAtauNull(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  return Number(t);
}

function pesanGalatDb(error: { code?: string; message?: string }): string {
  if (error.code === "42501") return "Kamu tidak punya izin mengubah toko ini.";
  if (error.code === "23514") return "Ada isian yang tidak memenuhi aturan database.";
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

export default function Layanan() {
  const { id, base, perbaruiToko } = useToko();
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const [form, setForm] = useState<Form | null>(null);
  const [awal, setAwal] = useState<string | null>(null);
  const [mejaTersimpan, setMejaTersimpan] = useState(false);
  const [memuat, setMemuat] = useState(true);
  const [menyimpan, setMenyimpan] = useState(false);

  // Alamat dasar halaman toko ini, dipakai untuk tombol ke halaman lain
  const alamatDasar = base ?? `/owner/toko/${id}`;

  const adaPerubahan = form !== null && awal !== null && JSON.stringify(form) !== awal;

  useEffect(() => {
    if (!adaPerubahan) return;
    const onSebelumTutup = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onSebelumTutup);
    return () => window.removeEventListener("beforeunload", onSebelumTutup);
  }, [adaPerubahan]);

  useEffect(() => {
    let batal = false;

    async function muat() {
      const { data, error } = await supabase
        .from("shops")
        .select("delivery_enabled, pickup_enabled, dine_in_enabled, pos_enabled, min_order, delivery_fee")
        .eq("id", id)
        .maybeSingle();

      if (batal) return;

      if (error || !data) {
        if (error) console.error("Gagal memuat layanan toko:", error);
        setMemuat(false);
        return;
      }

      const r = data as Record<string, unknown>;
      const formAwal: Form = {
        antar: r.delivery_enabled === true,
        ambil: r.pickup_enabled === true,
        meja: r.dine_in_enabled === true,
        kasir: r.pos_enabled === true,
        minPesan: strAngka(r.min_order ?? 0),
        ongkir: strAngka(r.delivery_fee ?? 0),
      };

      setMejaTersimpan(r.dine_in_enabled === true);
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

  const simpan = async () => {
    if (!form) return;
    const gagal = (pesan: string) => toast.galat(pesan);

    const minPesan = angkaAtauNull(form.minPesan) ?? 0;
    const ongkir = angkaAtauNull(form.ongkir) ?? 0;
    if (!Number.isFinite(minPesan) || minPesan < 0)
      return gagal("Minimal pesanan tidak boleh negatif");
    if (!Number.isFinite(ongkir) || ongkir < 0) return gagal("Ongkos kirim tidak boleh negatif");

    if (!form.antar && !form.ambil && !form.meja)
      return gagal("Aktifkan minimal satu layanan untuk pembeli");

    setMenyimpan(true);
    const cuplikan = JSON.stringify(form);

    try {
      const { data, error } = await supabase
        .from("shops")
        .update({
          delivery_enabled: form.antar,
          pickup_enabled: form.ambil,
          dine_in_enabled: form.meja,
          pos_enabled: form.kasir,
          min_order: minPesan,
          delivery_fee: ongkir,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("id");

      if (error) {
        console.error("Gagal menyimpan layanan toko:", error);
        toast.galat("Gagal menyimpan perubahan", pesanGalatDb(error));
        return;
      }
      if (!data || data.length === 0) {
        toast.galat(
          "Perubahan tidak tersimpan",
          "Kamu tidak punya izin mengubah toko ini, atau toko tidak ditemukan."
        );
        return;
      }

      perbaruiToko({ antar: form.antar, ambil: form.ambil, meja: form.meja, kasir: form.kasir });

      setMejaTersimpan(form.meja);
      setAwal(cuplikan);
      toast.sukses("Perubahan tersimpan", "Layanan toko berhasil diperbarui.");
    } catch (e) {
      console.error("Gagal menyimpan layanan toko:", e);
      toast.galat("Gagal menyimpan perubahan", "Periksa koneksi internet lalu coba lagi.");
    } finally {
      setMenyimpan(false);
    }
  };

  if (memuat) {
    return (
      <div className="space-y-6" aria-busy="true">
        <span className="sr-only">Memuat layanan toko</span>
        <div className="h-64 animate-pulse rounded-2xl bg-gray-200/70" />
        <div className="h-40 animate-pulse rounded-2xl bg-gray-200/70" />
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
          Layanan toko gagal dimuat. Muat ulang halaman dan periksa aturan RLS tabel shops di
          Supabase.
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
      {/* Layanan untuk pembeli */}
      <KartuSection ikon={Store} judul="Layanan untuk pembeli" deskripsi="Pilih cara pembeli memesan">
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
      <KartuSection ikon={Wallet} judul="Biaya pesanan" deskripsi="Minimal belanja dan ongkos kirim">
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
      <KartuSection ikon={Calculator} judul="Fitur toko" deskripsi="Tambahan untuk mengelola toko">
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

      <div aria-hidden className="h-16" />

      <TombolSimpan tampil={adaPerubahan} menyimpan={menyimpan} onSimpan={simpan} />
    </div>
  );
}