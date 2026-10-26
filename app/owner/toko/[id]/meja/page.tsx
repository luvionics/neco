"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Printer,
  QrCode,
  Settings2,
  Trash2,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { urlHalamanToko, useToko } from "../toko-context";
import { Dialog, Saklar } from "../ui";

// ---------- Tipe ----------

type Meja = {
  id: string;
  nomor: string; // shop_tables.table_number
  kapasitas: number | null; // shop_tables.capacity
  aktif: boolean; // shop_tables.is_active
};

type KonteksLonggar = {
  id: string;
  base?: string;
};

// ---------- Konstanta ----------

const MAKS_SEKALIGUS = 100;
const MAKS_NOMOR = 20;

// Logo Necoku untuk kartu cetak. Taruh file logo di folder public/
// lalu sesuaikan path-nya di sini. Jika file tidak ditemukan,
// logo disembunyikan dan tulisan "Necoku" tetap tercetak.
const LOGO_SRC = "/logo.png";
const NAMA_BRAND = "Necoku";

const INPUT_MODERN =
  "w-full rounded-xl border border-gray-200 bg-gray-50/70 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-500/10";

const TOMBOL_UTAMA =
  "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/25 transition-all hover:shadow-lg hover:shadow-orange-500/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70";

const TOMBOL_KECIL =
  "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

// Gaya khusus cetak: hanya area kode QR yang ikut tercetak
const GAYA_CETAK = `
.area-cetak { display: none; }
@media print {
  body > *:not(.area-cetak) { display: none !important; }
  .area-cetak {
    display: grid !important;
    grid-template-columns: repeat(2, 1fr);
    gap: 14px;
    padding: 12px;
    background: #fff;
    color: #000;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .kartu-cetak {
    break-inside: avoid;
    page-break-inside: avoid;
    border: 2px dashed #9ca3af;
    border-radius: 16px;
    padding: 18px 12px;
    text-align: center;
    font-family: system-ui, sans-serif;
  }
  @page { margin: 10mm; }
}
`;

// ---------- Fungsi bantu ----------

const teks = (v: unknown) => (typeof v === "string" ? v : "");
const urut = (a: Meja, b: Meja) =>
  a.nomor.localeCompare(b.nomor, "id", { numeric: true, sensitivity: "base" });

function dariDb(r: Record<string, unknown>): Meja {
  return {
    id: teks(r.id),
    nomor: teks(r.table_number),
    kapasitas: typeof r.capacity === "number" ? r.capacity : null,
    aktif: r.is_active !== false,
  };
}

function Kerangka() {
  return (
    <div className="space-y-6" aria-busy="true">
      <span className="sr-only">Memuat meja</span>
      <div className="h-10 w-56 animate-pulse rounded-xl bg-gray-200/70" />
      <div className="h-40 animate-pulse rounded-2xl bg-gray-200/70" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="h-56 animate-pulse rounded-2xl bg-gray-200/70" />
        <div className="h-56 animate-pulse rounded-2xl bg-gray-200/70" />
        <div className="h-56 animate-pulse rounded-2xl bg-gray-200/70" />
      </div>
    </div>
  );
}

// ---------- Halaman ----------

export default function MejaPage() {
  const { id, base } = useToko() as unknown as KonteksLonggar;
  const supabase = useMemo(() => createClient(), []);
  const alamatDasar = base ?? `/owner/toko/${id}`;

  const [memuat, setMemuat] = useState(true);
  const [galatMuat, setGalatMuat] = useState(false);
  const [namaToko, setNamaToko] = useState("");
  const [layananAktif, setLayananAktif] = useState(true);
  const [daftar, setDaftar] = useState<Meja[]>([]);
  const [origin, setOrigin] = useState("");

  const [nomor, setNomor] = useState("");
  const [kapasitas, setKapasitas] = useState("");
  const [awalan, setAwalan] = useState("");
  const [dari, setDari] = useState("1");
  const [sampai, setSampai] = useState("10");

  // "tambah" | "sekaligus" | "massal" | id meja
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [galat, setGalat] = useState("");
  const [info, setInfo] = useState("");
  const [hapus, setHapus] = useState<Meja | null>(null);
  const [cetak, setCetak] = useState<Meja[] | null>(null);

  // Edit satu meja
  const [edit, setEdit] = useState<Meja | null>(null);
  const [editNomor, setEditNomor] = useState("");
  const [editKap, setEditKap] = useState("");
  const [editGalat, setEditGalat] = useState("");

  // Pilih banyak meja
  const [pilih, setPilih] = useState<Set<string>>(new Set());
  const [hapusMassal, setHapusMassal] = useState(false);

  // Alamat situs, dipakai sebagai isi kode QR
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const muat = useCallback(async () => {
    const [resToko, resMeja] = await Promise.all([
      supabase.from("shops").select("name, dine_in_enabled").eq("id", id).maybeSingle(),
      supabase
        .from("shop_tables")
        .select("id, table_number, capacity, is_active")
        .eq("shop_id", id),
    ]);

    if (resToko.error || !resToko.data || resMeja.error) {
      setGalatMuat(true);
      setMemuat(false);
      return;
    }

    const t = resToko.data as Record<string, unknown>;
    setNamaToko(teks(t.name));
    setLayananAktif(t.dine_in_enabled === true);
    setDaftar(
      ((resMeja.data ?? []) as Record<string, unknown>[]).map(dariDb).sort(urut)
    );
    setGalatMuat(false);
    setMemuat(false);
  }, [supabase, id]);

  useEffect(() => {
    muat();
  }, [muat]);

  // Cetak: tampilkan area cetak, tunggu logo selesai dimuat,
  // panggil dialog cetak, lalu bersihkan
  useEffect(() => {
    if (!cetak) return;
    const selesai = () => setCetak(null);
    window.addEventListener("afterprint", selesai);
    let batal = false;

    const gambarSiap = () => {
      const gambar = Array.from(
        document.querySelectorAll<HTMLImageElement>(".area-cetak img")
      );
      return Promise.all(
        gambar.map((g) =>
          g.complete
            ? null
            : new Promise((r) => {
                g.onload = g.onerror = () => r(null);
              })
        )
      );
    };

    const t = setTimeout(async () => {
      await Promise.race([gambarSiap(), new Promise((r) => setTimeout(r, 1500))]);
      if (!batal) window.print();
    }, 200);

    return () => {
      batal = true;
      clearTimeout(t);
      window.removeEventListener("afterprint", selesai);
    };
  }, [cetak]);

  const urlMeja = (m: Meja) =>
    `${origin}${urlHalamanToko(id)}?meja=${encodeURIComponent(m.nomor)}`;

  const jumlahAktif = daftar.filter((m) => m.aktif).length;

  // Turunan dari pilihan (id yang sudah terhapus otomatis diabaikan)
  const terpilih = daftar.filter((m) => pilih.has(m.id));
  const semuaDipilih = daftar.length > 0 && terpilih.length === daftar.length;
  const sebagianDipilih = terpilih.length > 0 && !semuaDipilih;

  const ubahPilih = (mid: string) =>
    setPilih((p) => {
      const n = new Set(p);
      if (n.has(mid)) n.delete(mid);
      else n.add(mid);
      return n;
    });

  const ubahPilihSemua = () =>
    setPilih(semuaDipilih ? new Set() : new Set(daftar.map((m) => m.id)));

  // Simpan baris baru; nomor yang sudah ada otomatis dilewati
  const simpanBaris = async (baris: { table_number: string; capacity: number | null }[]) => {
    const { data, error } = await supabase
      .from("shop_tables")
      .upsert(
        baris.map((b) => ({ shop_id: id, ...b })),
        { onConflict: "shop_id,table_number", ignoreDuplicates: true }
      )
      .select("id, table_number, capacity, is_active");

    if (error) return { error: true, baru: 0 };

    const tambahan = ((data ?? []) as Record<string, unknown>[]).map(dariDb);
    setDaftar((d) => [...d, ...tambahan].sort(urut));
    return { error: false, baru: tambahan.length };
  };

  const tambah = async () => {
    if (sibuk) return;
    setGalat("");
    setInfo("");

    const n = nomor.trim();
    if (!n) return setGalat("Isi nomor atau nama meja");
    if (n.length > MAKS_NOMOR) return setGalat(`Nomor meja maksimal ${MAKS_NOMOR} karakter`);
    if (daftar.some((m) => m.nomor.toLowerCase() === n.toLowerCase()))
      return setGalat(`Meja ${n} sudah ada`);

    let kap: number | null = null;
    if (kapasitas.trim() !== "") {
      kap = Number(kapasitas);
      if (!Number.isInteger(kap) || kap <= 0)
        return setGalat("Kapasitas harus berupa angka lebih dari 0");
    }

    setSibuk("tambah");
    const hasil = await simpanBaris([{ table_number: n, capacity: kap }]);
    setSibuk(null);

    if (hasil.error) {
      setGalat("Gagal menambah meja. Periksa aturan RLS tabel shop_tables di Supabase.");
      return;
    }
    setNomor("");
    setKapasitas("");
    setInfo(`Meja ${n} ditambahkan`);
  };

  const tambahSekaligus = async () => {
    if (sibuk) return;
    setGalat("");
    setInfo("");

    const a = Number(dari);
    const b = Number(sampai);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0)
      return setGalat("Isi nomor awal dan akhir dengan angka bulat");
    if (a > b) return setGalat("Nomor awal tidak boleh lebih besar dari nomor akhir");
    if (b - a + 1 > MAKS_SEKALIGUS)
      return setGalat(`Maksimal ${MAKS_SEKALIGUS} meja sekali buat`);

    const pre = awalan.trim();
    const semua: string[] = [];
    for (let i = a; i <= b; i++) semua.push(`${pre}${i}`);
    if (semua.some((s) => s.length > MAKS_NOMOR))
      return setGalat(`Nomor meja maksimal ${MAKS_NOMOR} karakter`);

    const ada = new Set(daftar.map((m) => m.nomor.toLowerCase()));
    const baru = semua.filter((s) => !ada.has(s.toLowerCase()));
    if (baru.length === 0) return setInfo("Semua nomor itu sudah ada");

    setSibuk("sekaligus");
    const hasil = await simpanBaris(baru.map((s) => ({ table_number: s, capacity: null })));
    setSibuk(null);

    if (hasil.error) {
      setGalat("Gagal menambah meja. Periksa aturan RLS tabel shop_tables di Supabase.");
      return;
    }
    const dilewati = semua.length - hasil.baru;
    setInfo(
      `${hasil.baru} meja ditambahkan${dilewati > 0 ? `, ${dilewati} sudah ada dan dilewati` : ""}`
    );
  };

  const ubahAktif = async (m: Meja) => {
    if (sibuk) return;
    setGalat("");
    setInfo("");
    setSibuk(m.id);
    const baru = !m.aktif;
    setDaftar((d) => d.map((x) => (x.id === m.id ? { ...x, aktif: baru } : x)));

    const { error } = await supabase
      .from("shop_tables")
      .update({ is_active: baru, updated_at: new Date().toISOString() })
      .eq("id", m.id);

    if (error) {
      setDaftar((d) => d.map((x) => (x.id === m.id ? { ...x, aktif: !baru } : x)));
      setGalat("Gagal mengubah status meja, coba lagi");
    }
    setSibuk(null);
  };

  const konfirmasiHapus = async () => {
    if (!hapus) return;
    const m = hapus;
    setHapus(null);
    setGalat("");
    setInfo("");
    setSibuk(m.id);

    const { error } = await supabase.from("shop_tables").delete().eq("id", m.id);

    if (error) {
      setGalat("Gagal menghapus meja, coba lagi");
    } else {
      setDaftar((d) => d.filter((x) => x.id !== m.id));
      setInfo(`Meja ${m.nomor} dihapus`);
    }
    setSibuk(null);
  };

  // ----- Edit satu meja -----

  const bukaEdit = (m: Meja) => {
    setGalat("");
    setInfo("");
    setEditGalat("");
    setEditNomor(m.nomor);
    setEditKap(m.kapasitas ? String(m.kapasitas) : "");
    setEdit(m);
  };

  const simpanEdit = async () => {
    if (!edit || sibuk) return;
    setEditGalat("");

    const n = editNomor.trim();
    if (!n) return setEditGalat("Isi nomor atau nama meja");
    if (n.length > MAKS_NOMOR)
      return setEditGalat(`Nomor meja maksimal ${MAKS_NOMOR} karakter`);
    if (
      daftar.some((m) => m.id !== edit.id && m.nomor.toLowerCase() === n.toLowerCase())
    )
      return setEditGalat(`Meja ${n} sudah ada`);

    let kap: number | null = null;
    if (editKap.trim() !== "") {
      kap = Number(editKap);
      if (!Number.isInteger(kap) || kap <= 0)
        return setEditGalat("Kapasitas harus berupa angka lebih dari 0");
    }

    // Tidak ada perubahan
    if (n === edit.nomor && kap === edit.kapasitas) {
      setEdit(null);
      return;
    }

    const m = edit;
    setSibuk(m.id);
    const { error } = await supabase
      .from("shop_tables")
      .update({ table_number: n, capacity: kap, updated_at: new Date().toISOString() })
      .eq("id", m.id);
    setSibuk(null);

    if (error) {
      setEditGalat("Gagal menyimpan perubahan, coba lagi");
      return;
    }
    setDaftar((d) =>
      d.map((x) => (x.id === m.id ? { ...x, nomor: n, kapasitas: kap } : x)).sort(urut)
    );
    setEdit(null);
    setInfo(`Meja ${n} diperbarui`);
  };

  // ----- Aksi untuk meja terpilih -----

  const cetakTerpilih = () => {
    setGalat("");
    setInfo("");
    const aktif = terpilih.filter((m) => m.aktif);
    if (aktif.length === 0) {
      setGalat("Meja yang dipilih semuanya nonaktif, tidak ada yang bisa dicetak");
      return;
    }
    setCetak(aktif);
  };

  const ubahAktifTerpilih = async (nilai: boolean) => {
    if (sibuk) return;
    setGalat("");
    setInfo("");

    const target = terpilih.filter((m) => m.aktif !== nilai);
    if (target.length === 0) {
      setInfo(
        nilai
          ? "Semua meja yang dipilih sudah aktif"
          : "Semua meja yang dipilih sudah nonaktif"
      );
      return;
    }

    const ids = target.map((m) => m.id);
    setSibuk("massal");
    const { error } = await supabase
      .from("shop_tables")
      .update({ is_active: nilai, updated_at: new Date().toISOString() })
      .in("id", ids);
    setSibuk(null);

    if (error) {
      setGalat("Gagal mengubah status meja, coba lagi");
      return;
    }
    const set = new Set(ids);
    setDaftar((d) => d.map((x) => (set.has(x.id) ? { ...x, aktif: nilai } : x)));
    setInfo(`${ids.length} meja ${nilai ? "diaktifkan" : "dinonaktifkan"}`);
  };

  const konfirmasiHapusTerpilih = async () => {
    const ids = terpilih.map((m) => m.id);
    setHapusMassal(false);
    if (ids.length === 0) return;
    setGalat("");
    setInfo("");
    setSibuk("massal");

    const { error } = await supabase.from("shop_tables").delete().in("id", ids);
    setSibuk(null);

    if (error) {
      setGalat("Gagal menghapus meja, coba lagi");
      return;
    }
    const set = new Set(ids);
    setDaftar((d) => d.filter((x) => !set.has(x.id)));
    setPilih(new Set());
    setInfo(`${ids.length} meja dihapus`);
  };

  if (memuat) return <Kerangka />;

  if (galatMuat) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-100 bg-white px-6 py-14 text-center shadow-sm">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <AlertCircle className="h-6 w-6" />
        </span>
        <p className="text-sm text-gray-500">
          Data meja gagal dimuat. Muat ulang halaman, atau periksa aturan RLS tabel
          shop_tables di Supabase.
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

  // Layanan pesan dari meja belum diaktifkan
  if (!layananAktif) {
    return (
      <div className="space-y-6 md:space-y-8">
        <header>
          <p className="text-sm text-gray-500">Kode QR untuk pesan dari meja</p>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">
            Meja
          </h2>
        </header>

        <section className="flex flex-col gap-4 rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-orange-50 p-5 sm:flex-row sm:items-center md:p-6">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-amber-500 shadow-sm ring-1 ring-amber-100">
            <Settings2 className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-gray-900">
              Layanan pesan dari meja belum aktif
            </h3>
            <p className="mt-0.5 text-sm text-gray-600">
              Aktifkan layanan makan di tempat di Pengaturan toko, lalu kembali ke
              sini untuk mengatur meja dan mencetak kode QR.
            </p>
          </div>
          <Link
            href={`${alamatDasar}/pengaturan`}
            className={`group inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ${TOMBOL_UTAMA}`}
          >
            Buka Pengaturan toko
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <style>{GAYA_CETAK}</style>

      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500">Atur meja dan cetak kode QR pemesanan</p>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">
            Meja
          </h2>
        </div>
        {jumlahAktif > 0 && (
          <button
            onClick={() => setCetak(daftar.filter((m) => m.aktif))}
            className={`mt-1 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ${TOMBOL_UTAMA}`}
          >
            <Printer className="h-4 w-4" />
            Cetak semua ({jumlahAktif})
          </button>
        )}
      </header>

      {/* Tambah meja */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
              <Plus className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Tambah satu meja</h3>
              <p className="text-xs text-gray-500">Nomor atau nama, misalnya 5 atau VIP 1</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <label htmlFor="nomor-meja" className="text-sm font-medium text-gray-700">
                Nomor / nama meja
              </label>
              <input
                id="nomor-meja"
                value={nomor}
                maxLength={MAKS_NOMOR}
                onChange={(e) => setNomor(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && tambah()}
                className={INPUT_MODERN}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="kapasitas-meja" className="text-sm font-medium text-gray-700">
                Kursi
              </label>
              <input
                id="kapasitas-meja"
                type="number"
                inputMode="numeric"
                min={1}
                placeholder="Opsional"
                value={kapasitas}
                onChange={(e) => setKapasitas(e.target.value)}
                className={INPUT_MODERN}
              />
            </div>
          </div>

          <button
            onClick={tambah}
            disabled={sibuk !== null}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ${TOMBOL_UTAMA}`}
          >
            {sibuk === "tambah" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Tambah meja
          </button>
        </div>

        <div className="space-y-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
              <Layers className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Buat banyak sekaligus</h3>
              <p className="text-xs text-gray-500">
                Maksimal {MAKS_SEKALIGUS} meja, nomor yang sudah ada dilewati
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="awalan-meja" className="text-sm font-medium text-gray-700">
                Awalan
              </label>
              <input
                id="awalan-meja"
                placeholder="Opsional"
                maxLength={8}
                value={awalan}
                onChange={(e) => setAwalan(e.target.value)}
                className={INPUT_MODERN}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="dari-meja" className="text-sm font-medium text-gray-700">
                Dari
              </label>
              <input
                id="dari-meja"
                type="number"
                inputMode="numeric"
                min={0}
                value={dari}
                onChange={(e) => setDari(e.target.value)}
                className={INPUT_MODERN}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="sampai-meja" className="text-sm font-medium text-gray-700">
                Sampai
              </label>
              <input
                id="sampai-meja"
                type="number"
                inputMode="numeric"
                min={0}
                value={sampai}
                onChange={(e) => setSampai(e.target.value)}
                className={INPUT_MODERN}
              />
            </div>
          </div>

          <button
            onClick={tambahSekaligus}
            disabled={sibuk !== null}
            className="inline-flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm font-semibold text-orange-700 transition-colors hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {sibuk === "sekaligus" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Layers className="h-4 w-4" />
            )}
            Buat meja
          </button>
        </div>
      </section>

      {galat && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{galat}</p>
        </div>
      )}
      {info && !galat && (
        <div
          aria-live="polite"
          className="flex items-start gap-2.5 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{info}</p>
        </div>
      )}

      {/* Daftar meja */}
      {daftar.length === 0 ? (
        <section className="flex flex-col items-center gap-4 rounded-3xl border border-gray-100 bg-white px-6 py-16 text-center shadow-sm">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-orange-50 ring-8 ring-orange-50/60">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/30">
              <QrCode className="h-7 w-7" />
            </span>
          </span>
          <div>
            <p className="text-base font-bold text-gray-900">Belum ada meja</p>
            <p className="mt-1 text-sm text-gray-500">
              Tambahkan meja di atas, lalu cetak kode QR untuk ditempel di tiap meja.
            </p>
          </div>
        </section>
      ) : (
        <section aria-label="Daftar meja" className="space-y-3">
          {/* Bilah pilih banyak */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
            <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                ref={(el) => {
                  if (el) el.indeterminate = sebagianDipilih;
                }}
                checked={semuaDipilih}
                onChange={ubahPilihSemua}
                className="h-4 w-4 cursor-pointer rounded border-gray-300 accent-orange-500"
              />
              Pilih semua
            </label>

            <p className="text-sm text-gray-500" aria-live="polite">
              {terpilih.length > 0
                ? `${terpilih.length} meja dipilih`
                : `${jumlahAktif} meja aktif dari ${daftar.length} meja`}
            </p>

            {terpilih.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                <button
                  onClick={cetakTerpilih}
                  disabled={sibuk !== null || !origin}
                  className={`${TOMBOL_KECIL} border-gray-200 bg-white text-gray-700 hover:border-orange-200 hover:bg-orange-50/50 hover:text-orange-600`}
                >
                  <Printer className="h-3.5 w-3.5" />
                  Cetak
                </button>
                <button
                  onClick={() => ubahAktifTerpilih(true)}
                  disabled={sibuk !== null}
                  className={`${TOMBOL_KECIL} border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}
                >
                  {sibuk === "massal" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Aktifkan
                </button>
                <button
                  onClick={() => ubahAktifTerpilih(false)}
                  disabled={sibuk !== null}
                  className={`${TOMBOL_KECIL} border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100`}
                >
                  Nonaktifkan
                </button>
                <button
                  onClick={() => setHapusMassal(true)}
                  disabled={sibuk !== null}
                  className={`${TOMBOL_KECIL} border-red-200 bg-red-50 text-red-600 hover:bg-red-100`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Hapus
                </button>
                <button
                  onClick={() => setPilih(new Set())}
                  className="px-1.5 text-xs font-medium text-gray-500 underline-offset-2 hover:text-gray-700 hover:underline"
                >
                  Batal pilih
                </button>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-3">
            {daftar.map((m) => {
              const dipilih = pilih.has(m.id);
              return (
                <article
                  key={m.id}
                  className={`space-y-3.5 rounded-2xl border bg-white p-4 shadow-sm transition-colors md:p-5 ${
                    dipilih
                      ? "border-orange-300 ring-2 ring-orange-500/15"
                      : "border-gray-100"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <input
                        type="checkbox"
                        checked={dipilih}
                        onChange={() => ubahPilih(m.id)}
                        aria-label={`Pilih meja ${m.nomor}`}
                        className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 accent-orange-500"
                      />
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-bold text-gray-900">
                          Meja {m.nomor}
                        </h3>
                        <p className="flex items-center gap-1 text-xs text-gray-500">
                          <Users className="h-3.5 w-3.5" />
                          {m.kapasitas ? `${m.kapasitas} kursi` : "Kapasitas belum diisi"}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={`text-[11px] font-medium ${
                          m.aktif ? "text-emerald-600" : "text-gray-400"
                        }`}
                      >
                        {m.aktif ? "Aktif" : "Nonaktif"}
                      </span>
                      <Saklar
                        nyala={m.aktif}
                        onChange={() => ubahAktif(m)}
                        label={`Meja ${m.nomor} aktif`}
                      />
                    </div>
                  </div>

                  <div
                    className={`flex justify-center rounded-xl bg-gray-50 p-4 transition-opacity ${
                      m.aktif ? "" : "opacity-40"
                    }`}
                  >
                    {origin ? (
                      <div className="rounded-lg bg-white p-2.5 shadow-sm ring-1 ring-gray-100">
                        <QRCodeSVG value={urlMeja(m)} size={120} level="M" />
                      </div>
                    ) : (
                      <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
                    )}
                  </div>

                  <div className="flex items-center gap-2 border-t border-gray-100 pt-3.5">
                    <button
                      onClick={() => setCetak([m])}
                      disabled={!m.aktif || !origin}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:border-orange-200 hover:bg-orange-50/50 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      Cetak
                    </button>
                    <button
                      onClick={() => bukaEdit(m)}
                      disabled={sibuk === m.id || sibuk === "massal"}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:border-orange-200 hover:bg-orange-50/50 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    <button
                      onClick={() => setHapus(m)}
                      disabled={sibuk === m.id || sibuk === "massal"}
                      aria-label={`Hapus meja ${m.nomor}`}
                      className="flex h-9 w-9 items-center justify-center rounded-xl text-red-500 transition-colors hover:bg-red-50 disabled:opacity-50"
                    >
                      {sibuk === m.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          {origin && (
            <p className="text-xs text-gray-400">
              Kode QR mengarah ke {origin}. Cetak setelah website memakai alamat tetap
              (bukan alamat sementara), supaya kode yang tertempel tidak mati.
            </p>
          )}
        </section>
      )}

      {/* Edit meja */}
      {edit && (
        <Dialog judul="Edit meja" onTutup={() => setEdit(null)}>
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-500 ring-1 ring-orange-100">
              <Pencil className="h-5 w-5" />
            </span>
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-gray-900">Edit meja {edit.nomor}</h2>
              <p className="text-sm text-gray-500">
                Ubah nama atau kapasitas meja. Jika nama diubah, kode QR ikut berubah
                dan yang sudah tertempel perlu dicetak ulang.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <label htmlFor="edit-nomor" className="text-sm font-medium text-gray-700">
                Nomor / nama meja
              </label>
              <input
                id="edit-nomor"
                value={editNomor}
                maxLength={MAKS_NOMOR}
                autoFocus
                onChange={(e) => setEditNomor(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && simpanEdit()}
                className={INPUT_MODERN}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="edit-kapasitas" className="text-sm font-medium text-gray-700">
                Kursi
              </label>
              <input
                id="edit-kapasitas"
                type="number"
                inputMode="numeric"
                min={1}
                placeholder="Opsional"
                value={editKap}
                onChange={(e) => setEditKap(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && simpanEdit()}
                className={INPUT_MODERN}
              />
            </div>
          </div>

          {editGalat && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {editGalat}
            </p>
          )}

          <div className="flex gap-2.5">
            <button
              onClick={() => setEdit(null)}
              className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Batal
            </button>
            <button
              onClick={simpanEdit}
              disabled={sibuk !== null}
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold ${TOMBOL_UTAMA}`}
            >
              {sibuk === edit.id && <Loader2 className="h-4 w-4 animate-spin" />}
              Simpan
            </button>
          </div>
        </Dialog>
      )}

      {/* Konfirmasi hapus satu meja */}
      {hapus && (
        <Dialog judul="Hapus meja" onTutup={() => setHapus(null)}>
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-500 ring-1 ring-red-100">
              <Trash2 className="h-5 w-5" />
            </span>
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-gray-900">
                Hapus meja {hapus.nomor}?
              </h2>
              <p className="text-sm text-gray-500">
                Kode QR meja ini tidak akan berfungsi lagi. Riwayat pesanan dari meja
                ini tetap tersimpan.
              </p>
            </div>
          </div>
          <div className="flex gap-2.5">
            <button
              onClick={() => setHapus(null)}
              className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Batal
            </button>
            <button
              onClick={konfirmasiHapus}
              className="flex-1 rounded-xl bg-gradient-to-r from-red-500 to-rose-500 py-2.5 text-sm font-semibold text-white shadow-md shadow-red-500/25 transition-all hover:shadow-lg hover:shadow-red-500/30 active:scale-[0.98]"
            >
              Ya, hapus
            </button>
          </div>
        </Dialog>
      )}

      {/* Konfirmasi hapus banyak meja */}
      {hapusMassal && terpilih.length > 0 && (
        <Dialog judul="Hapus meja terpilih" onTutup={() => setHapusMassal(false)}>
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-500 ring-1 ring-red-100">
              <Trash2 className="h-5 w-5" />
            </span>
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-gray-900">
                Hapus {terpilih.length} meja?
              </h2>
              <p className="text-sm text-gray-500">
                {terpilih
                  .slice(0, 5)
                  .map((m) => m.nomor)
                  .join(", ")}
                {terpilih.length > 5 ? `, dan ${terpilih.length - 5} lainnya` : ""}.
                Kode QR meja-meja ini tidak akan berfungsi lagi. Riwayat pesanan tetap
                tersimpan.
              </p>
            </div>
          </div>
          <div className="flex gap-2.5">
            <button
              onClick={() => setHapusMassal(false)}
              className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Batal
            </button>
            <button
              onClick={konfirmasiHapusTerpilih}
              className="flex-1 rounded-xl bg-gradient-to-r from-red-500 to-rose-500 py-2.5 text-sm font-semibold text-white shadow-md shadow-red-500/25 transition-all hover:shadow-lg hover:shadow-red-500/30 active:scale-[0.98]"
            >
              Ya, hapus {terpilih.length} meja
            </button>
          </div>
        </Dialog>
      )}

      {/* Area cetak: dipasang langsung di body supaya hanya bagian ini yang tercetak */}
      {cetak &&
        origin &&
        createPortal(
          <div className="area-cetak">
            {cetak.map((m) => (
              <div key={m.id} className="kartu-cetak">
                {/* Brand Necoku */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    marginBottom: 10,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={LOGO_SRC}
                    alt=""
                    style={{ height: 30, width: "auto" }}
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                  <span
                    style={{
                      fontSize: 20,
                      fontWeight: 800,
                      letterSpacing: 0.3,
                      color: "#ea580c",
                    }}
                  >
                    {NAMA_BRAND}
                  </span>
                </div>

                <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>{namaToko}</p>
                <p style={{ fontSize: 18, fontWeight: 700, margin: "4px 0 12px" }}>
                  Pesan dari meja
                </p>
                <div style={{ display: "inline-block", background: "#fff", padding: 8 }}>
                  <QRCodeSVG value={urlMeja(m)} size={190} level="M" />
                </div>
                <p style={{ fontSize: 28, fontWeight: 800, margin: "12px 0 2px" }}>
                  Meja {m.nomor}
                </p>
                <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
                  Scan dengan kamera HP untuk memesan
                </p>
              </div>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}