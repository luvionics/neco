"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertCircle, Clock, Loader2, Save, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/toast";
import { useToko } from "../../components/toko-context";
import { Saklar } from "../../ui";

// ---------- Konstanta & tipe ----------

const POSISI_TOMBOL_SIMPAN = "bottom-[calc(6rem+env(safe-area-inset-bottom))] md:bottom-8";

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
type JamSemua = Record<HariKunci, JamHari>;

// ---------- Fungsi bantu ----------

const jamPendek = (v: unknown) => (typeof v === "string" ? v.slice(0, 5) : "");

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

export default function JamBuka() {
  const { id, perbaruiToko } = useToko();
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const [jam, setJam] = useState<JamSemua | null>(null);
  const [awal, setAwal] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [menyimpan, setMenyimpan] = useState(false);

  const adaPerubahan = jam !== null && awal !== null && JSON.stringify(jam) !== awal;

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
        .select("opening_hours")
        .eq("id", id)
        .maybeSingle();

      if (batal) return;

      if (error || !data) {
        if (error) console.error("Gagal memuat jam buka:", error);
        setMemuat(false);
        return;
      }

      const r = data as Record<string, unknown>;
      const mentah =
        r.opening_hours && typeof r.opening_hours === "object"
          ? (r.opening_hours as Record<string, unknown>)
          : {};
      const belumDiatur = Object.keys(mentah).length === 0;

      const hasil = {} as JamSemua;
      HARI.forEach(({ k }) => {
        const j = mentah[k] as { open?: unknown; close?: unknown } | null | undefined;
        if (belumDiatur) {
          // Awalan bila jam buka belum pernah diatur: semua hari buka kecuali Minggu
          hasil[k] = { buka: k !== "sun", open: "08:00", close: "17:00" };
        } else if (j && j.open && j.close) {
          hasil[k] = { buka: true, open: jamPendek(j.open), close: jamPendek(j.close) };
        } else {
          hasil[k] = { buka: false, open: "08:00", close: "17:00" };
        }
      });

      setJam(hasil);
      setAwal(JSON.stringify(hasil));
      setMemuat(false);
    }

    muat();
    return () => {
      batal = true;
    };
  }, [supabase, id]);

  const ubahHari = (k: HariKunci, bagian: Partial<JamHari>) =>
    setJam((j) => (j ? { ...j, [k]: { ...j[k], ...bagian } } : j));

  const samakanSemuaHari = () => {
    if (!jam) return;
    const acuan = HARI.map(({ k }) => jam[k]).find((j) => j.buka);
    if (!acuan) {
      toast.peringatan("Belum ada hari buka", "Aktifkan minimal satu hari dulu.");
      return;
    }
    setJam((j) => {
      if (!j) return j;
      const baru = { ...j };
      HARI.forEach(({ k }) => {
        if (baru[k].buka) baru[k] = { ...baru[k], open: acuan.open, close: acuan.close };
      });
      return baru;
    });
    toast.info("Jam disamakan", `Semua hari buka sekarang ${acuan.open} - ${acuan.close}.`);
  };

  const simpan = async () => {
    if (!jam) return;
    const gagal = (pesan: string) => toast.galat(pesan);

    const hariBuka = HARI.filter(({ k }) => jam[k].buka);
    if (hariBuka.length === 0) return gagal("Aktifkan minimal satu hari buka");
    for (const { k, label } of hariBuka) {
      const j = jam[k];
      if (!j.open || !j.close) return gagal(`Isi jam buka dan tutup hari ${label}`);
      if (j.open === j.close) return gagal(`Jam tutup hari ${label} harus berbeda dari jam buka`);
    }

    setMenyimpan(true);
    const cuplikan = JSON.stringify(jam);

    // Susun jam buka per hari untuk kolom jsonb
    const openingHours: Record<string, { open: string; close: string } | null> = {};
    HARI.forEach(({ k }) => {
      const j = jam[k];
      openingHours[k] = j.buka ? { open: j.open, close: j.close } : null;
    });

    try {
      const { data, error } = await supabase
        .from("shops")
        .update({ opening_hours: openingHours, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("id");

      if (error) {
        console.error("Gagal menyimpan jam buka:", error);
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

      // Jam di context toko diambil dari hari buka pertama
      const acuan = jam[hariBuka[0].k];
      perbaruiToko({ buka: acuan.open, tutup: acuan.close });

      setAwal(cuplikan);
      toast.sukses("Perubahan tersimpan", "Jam buka berhasil diperbarui.");
    } catch (e) {
      console.error("Gagal menyimpan jam buka:", e);
      toast.galat("Gagal menyimpan perubahan", "Periksa koneksi internet lalu coba lagi.");
    } finally {
      setMenyimpan(false);
    }
  };

  if (memuat) {
    return (
      <div aria-busy="true">
        <span className="sr-only">Memuat jam buka</span>
        <div className="h-96 animate-pulse rounded-2xl bg-gray-200/70" />
      </div>
    );
  }

  if (!jam) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-100 bg-white px-6 py-14 text-center shadow-sm">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <AlertCircle className="h-6 w-6" />
        </span>
        <p className="text-sm text-gray-500">
          Jam buka gagal dimuat. Muat ulang halaman dan periksa aturan RLS tabel shops di Supabase.
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

  return (
    <div className="space-y-6">
      <KartuSection
        ikon={Clock}
        judul="Jam buka"
        deskripsi="Atur jam tiap hari, matikan untuk hari libur"
      >
        <ul className="divide-y divide-gray-100">
          {HARI.map(({ k, label }) => {
            const j = jam[k];
            return (
              <li key={k} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3.5">
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

      <div aria-hidden className="h-16" />

      <TombolSimpan tampil={adaPerubahan} menyimpan={menyimpan} onSimpan={simpan} />
    </div>
  );
}