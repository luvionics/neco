"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertCircle,
  Calculator,
  ClipboardList,
  LayoutDashboard,
  Loader2,
  Mail,
  Package,
  Pencil,
  Plus,
  Settings,
  Trash2,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/toast";
import { useModal } from "@/components/modal";
import { useToko } from "../../components/toko-provider";

// ---------- Konstanta & tipe ----------

// Nilai k harus sama dengan check constraint nav_access pada tabel shop_employees
const AKSES_NAVIGASI: { k: string; label: string; ikon: LucideIcon }[] = [
  { k: "ringkasan", label: "Ringkasan", ikon: LayoutDashboard },
  { k: "kasir", label: "Kasir", ikon: Calculator },
  { k: "pesanan", label: "Pesanan", ikon: ClipboardList },
  { k: "produk", label: "Produk", ikon: Package },
  { k: "pengaturan", label: "Pengaturan toko", ikon: Settings },
];

const INPUT_MODERN =
  "w-full rounded-xl border border-gray-200 bg-gray-50/70 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-500/10";

type Karyawan = {
  id: string;
  userId: string;
  email: string;
  nama: string; // dari profiles.full_name, bisa kosong
  akses: string[];
};

// id null = karyawan baru
type FormKaryawan = { id: string | null; email: string; akses: string[] };

// ---------- Fungsi bantu ----------

function dariBaris(r: Record<string, unknown>): Karyawan {
  const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
  const nama =
    p && typeof p === "object" && typeof (p as Record<string, unknown>).full_name === "string"
      ? ((p as Record<string, unknown>).full_name as string)
      : "";
  return {
    id: String(r.id),
    userId: String(r.user_id),
    email: typeof r.email === "string" ? r.email : "",
    nama,
    akses: Array.isArray(r.nav_access)
      ? (r.nav_access as unknown[]).filter((a): a is string => typeof a === "string")
      : [],
  };
}

function inisial(k: Karyawan): string {
  const sumber = (k.nama || k.email).trim();
  const kata = sumber.split(/[\s@._-]+/).filter(Boolean);
  return ((kata[0]?.[0] ?? "?") + (kata[1]?.[0] ?? "")).toUpperCase();
}

// Terjemahkan error RPC dan Postgres menjadi kalimat yang jelas
function pesanGalatDb(error: { code?: string; message?: string }): string {
  const m = error.message ?? "";
  if (m.includes("email_belum_terdaftar"))
    return "Email ini belum terdaftar sebagai akun. Minta karyawan mendaftar dulu, lalu tambahkan lagi.";
  if (m.includes("email_pemilik")) return "Email pemilik toko tidak perlu ditambahkan sebagai karyawan.";
  if (m.includes("sudah_terdaftar")) return "Email ini sudah menjadi karyawan di toko ini.";
  if (m.includes("bukan_pemilik")) return "Hanya pemilik toko yang bisa menambah karyawan.";
  if (error.code === "42P01") return "Tabel shop_employees belum dibuat. Jalankan SQL-nya di Supabase.";
  if (error.code === "PGRST202")
    return "Fungsi tambah_karyawan_toko belum dibuat. Jalankan SQL-nya di Supabase.";
  if (error.code === "42501") return "Kamu tidak punya izin mengelola karyawan toko ini.";
  if (error.code === "23514") return "Pilih minimal satu akses navigasi.";
  return m || "Coba lagi beberapa saat.";
}

// ---------- Komponen kecil ----------

function KartuSection({
  ikon: Ikon,
  judul,
  deskripsi,
  aksi,
  children,
}: {
  ikon: LucideIcon;
  judul: string;
  deskripsi?: string;
  aksi?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
          <Ikon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-900">{judul}</h3>
          {deskripsi && <p className="text-xs text-gray-500">{deskripsi}</p>}
        </div>
        {aksi}
      </div>
      {children}
    </section>
  );
}

function ModalKaryawan({
  form,
  menyimpan,
  onUbah,
  onTutup,
  onSimpan,
}: {
  form: FormKaryawan;
  menyimpan: boolean;
  onUbah: <K extends keyof FormKaryawan>(kunci: K, nilai: FormKaryawan[K]) => void;
  onTutup: () => void;
  onSimpan: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !menyimpan) onTutup();
    };
    window.addEventListener("keydown", onKey);
    const overflowLama = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflowLama;
    };
  }, [onTutup, menyimpan]);

  const semua = form.akses.length === AKSES_NAVIGASI.length;

  const toggle = (k: string) =>
    onUbah("akses", form.akses.includes(k) ? form.akses.filter((a) => a !== k) : [...form.akses, k]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={form.id ? "Ubah akses karyawan" : "Tambah karyawan"}
      onClick={() => !menyimpan && onTutup()}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSimpan();
        }}
        className="max-h-[92vh] w-full max-w-md space-y-4 overflow-y-auto rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-center justify-between">
          <h4 className="text-base font-semibold text-gray-900">
            {form.id ? "Ubah akses karyawan" : "Tambah karyawan"}
          </h4>
          <button
            type="button"
            onClick={onTutup}
            disabled={menyimpan}
            aria-label="Tutup"
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="karyawan-email" className="text-sm font-medium text-gray-700">
            Email akun karyawan
          </label>
          <input
            id="karyawan-email"
            type="email"
            inputMode="email"
            autoFocus={!form.id}
            readOnly={form.id !== null}
            placeholder="nama@email.com"
            value={form.email}
            onChange={(e) => onUbah("email", e.target.value)}
            className={`${INPUT_MODERN} ${form.id ? "cursor-not-allowed opacity-70" : ""}`}
          />
          {!form.id && (
            <p className="text-xs text-gray-400">
              Karyawan harus sudah punya akun dengan email ini.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">Akses navigasi</p>
            <button
              type="button"
              onClick={() =>
                onUbah("akses", semua ? [] : AKSES_NAVIGASI.map((a) => a.k))
              }
              className="text-xs font-medium text-orange-600 transition-colors hover:text-orange-700"
            >
              {semua ? "Kosongkan" : "Pilih semua"}
            </button>
          </div>
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200">
            {AKSES_NAVIGASI.map(({ k, label, ikon: Ikon }) => {
              const nyala = form.akses.includes(k);
              return (
                <li key={k}>
                  <label className="flex cursor-pointer items-center gap-3 px-3.5 py-3 transition-colors hover:bg-gray-50">
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                        nyala ? "bg-orange-50 text-orange-500" : "bg-gray-100 text-gray-400"
                      }`}
                    >
                      <Ikon className="h-4 w-4" />
                    </span>
                    <span className="flex-1 text-sm font-medium text-gray-900">{label}</span>
                    <input
                      type="checkbox"
                      checked={nyala}
                      onChange={() => toggle(k)}
                      className="h-4 w-4 rounded border-gray-300 accent-orange-500"
                    />
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

        <button
          type="submit"
          disabled={menyimpan}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/30 transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {menyimpan && <Loader2 className="h-4 w-4 animate-spin" />}
          {menyimpan ? "Menyimpan..." : form.id ? "Simpan akses" : "Tambah karyawan"}
        </button>
      </form>
    </div>
  );
}

// ---------- Komponen utama ----------

export default function KaryawanToko() {
  const { id } = useToko();
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const modal = useModal();

  const [daftar, setDaftar] = useState<Karyawan[] | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [form, setForm] = useState<FormKaryawan | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const [idProses, setIdProses] = useState<string | null>(null);

  // Ambil daftar karyawan toko ini. Mengembalikan null bila gagal (toast sudah tampil).
  const ambilDaftar = async (): Promise<Karyawan[] | null> => {
    const { data, error } = await supabase
      .from("shop_employees")
      .select("id, user_id, email, nav_access, profiles(full_name)")
      .eq("shop_id", id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Gagal memuat karyawan:", error);
      toast.galat("Karyawan gagal dimuat", pesanGalatDb(error));
      return null;
    }
    return (data ?? []).map((r) => dariBaris(r as Record<string, unknown>));
  };

  useEffect(() => {
    let batal = false;
    ambilDaftar().then((hasil) => {
      if (batal) return;
      setDaftar(hasil);
      setMemuat(false);
    });
    return () => {
      batal = true;
    };
    // fungsi dan toast sengaja tidak jadi dependensi agar tidak memuat ulang berulang
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, id]);

  const bukaTambah = () => setForm({ id: null, email: "", akses: ["pesanan"] });

  const bukaUbah = (k: Karyawan) => setForm({ id: k.id, email: k.email, akses: k.akses });

  const tutupForm = () => setForm(null);

  const ubahForm = <K extends keyof FormKaryawan>(kunci: K, nilai: FormKaryawan[K]) =>
    setForm((f) => (f ? { ...f, [kunci]: nilai } : f));

  const simpan = async () => {
    if (!form || !daftar) return;
    const gagal = (pesan: string) => toast.galat(pesan);

    const email = form.email.trim().toLowerCase();
    if (!form.id && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return gagal("Format email belum benar");
    if (form.akses.length === 0) return gagal("Pilih minimal satu akses navigasi");

    // Urutkan sesuai urutan menu agar data konsisten
    const akses = AKSES_NAVIGASI.map((a) => a.k).filter((k) => form.akses.includes(k));

    setMenyimpan(true);
    try {
      if (form.id) {
        // Ubah akses karyawan yang sudah ada
        const { data, error } = await supabase
          .from("shop_employees")
          .update({ nav_access: akses, updated_at: new Date().toISOString() })
          .eq("id", form.id)
          .eq("shop_id", id)
          .select("id");

        if (error) {
          console.error("Gagal mengubah akses karyawan:", error);
          toast.galat("Gagal menyimpan akses", pesanGalatDb(error));
          return;
        }
        if (!data || data.length === 0) {
          toast.galat("Akses tidak tersimpan", "Kamu tidak punya izin atau data tidak ditemukan.");
          return;
        }

        setDaftar(daftar.map((k) => (k.id === form.id ? { ...k, akses } : k)));
        toast.sukses("Akses karyawan diperbarui");
      } else {
        // Tambah lewat RPC: user_id dicari dari email di sisi database
        const { error } = await supabase.rpc("tambah_karyawan_toko", {
          p_shop_id: id,
          p_email: email,
          p_nav_access: akses,
        });

        if (error) {
          console.error("Gagal menambah karyawan:", error);
          toast.galat("Karyawan gagal ditambahkan", pesanGalatDb(error));
          return;
        }

        const segar = await ambilDaftar();
        if (segar) setDaftar(segar);
        toast.sukses("Karyawan ditambahkan", email);
      }
      setForm(null);
    } catch (e) {
      console.error("Gagal menyimpan karyawan:", e);
      toast.galat("Gagal menyimpan karyawan", "Periksa koneksi internet lalu coba lagi.");
    } finally {
      setMenyimpan(false);
    }
  };

  const hapus = async (k: Karyawan) => {
    if (!daftar) return;
    const setuju = await modal.konfirmasi({
      jenis: "peringatan",
      judul: "Hapus karyawan?",
      deskripsi: `${k.email} tidak akan bisa lagi mengakses toko ini. Akun miliknya tetap ada.`,
      teksBatal: "Batal",
      teksSetuju: "Hapus",
    });
    if (!setuju) return;

    setIdProses(k.id);
    try {
      const { data, error } = await supabase
        .from("shop_employees")
        .delete()
        .eq("id", k.id)
        .eq("shop_id", id)
        .select("id");

      if (error || !data || data.length === 0) {
        if (error) console.error("Gagal menghapus karyawan:", error);
        toast.galat("Karyawan gagal dihapus", error ? pesanGalatDb(error) : "Data tidak ditemukan.");
        return;
      }
      setDaftar(daftar.filter((x) => x.id !== k.id));
      toast.info("Karyawan dihapus");
    } finally {
      setIdProses(null);
    }
  };

  if (memuat) {
    return (
      <div aria-busy="true">
        <span className="sr-only">Memuat karyawan</span>
        <div className="h-64 animate-pulse rounded-2xl bg-gray-200/70" />
      </div>
    );
  }

  if (!daftar) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-100 bg-white px-6 py-14 text-center shadow-sm">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <AlertCircle className="h-6 w-6" />
        </span>
        <p className="text-sm text-gray-500">
          Data karyawan gagal dimuat. Pastikan tabel shop_employees dan fungsi tambah_karyawan_toko
          sudah dibuat di Supabase.
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
        ikon={Users}
        judul="Karyawan"
        deskripsi={
          daftar.length > 0
            ? `${daftar.length} orang punya akses`
            : "Beri akses ke akun lain untuk membantu mengelola toko"
        }
        aksi={
          <button
            type="button"
            onClick={bukaTambah}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700 transition-colors hover:bg-orange-100"
          >
            <Plus className="h-3.5 w-3.5" />
            Tambah
          </button>
        }
      >
        {daftar.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
              <Users className="h-6 w-6" />
            </span>
            <p className="text-sm font-medium text-gray-900">Belum ada karyawan</p>
            <p className="text-xs text-gray-500">
              Tambahkan lewat email akun mereka, lalu pilih menu apa saja yang boleh dibuka.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {daftar.map((k) => {
              const labelAkses = AKSES_NAVIGASI.filter((a) => k.akses.includes(a.k)).map(
                (a) => a.label
              );
              const semua = labelAkses.length === AKSES_NAVIGASI.length;
              return (
                <li
                  key={k.id}
                  className={`flex items-start gap-3 px-5 py-4 transition-opacity ${
                    idProses === k.id ? "opacity-60" : ""
                  }`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-50 text-xs font-bold text-orange-600">
                    {inisial(k)}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="min-w-0">
                      {k.nama && (
                        <p className="truncate text-sm font-medium text-gray-900">{k.nama}</p>
                      )}
                      <p
                        className={`flex items-center gap-1.5 truncate ${
                          k.nama ? "text-xs text-gray-500" : "text-sm font-medium text-gray-900"
                        }`}
                      >
                        <Mail className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        <span className="truncate">{k.email}</span>
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {semua ? (
                        <span className="rounded-full bg-orange-50 px-2.5 py-0.5 text-[11px] font-medium text-orange-700">
                          Semua akses
                        </span>
                      ) : (
                        labelAkses.map((l) => (
                          <span
                            key={l}
                            className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gray-600"
                          >
                            {l}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => bukaUbah(k)}
                    disabled={idProses === k.id}
                    aria-label={`Ubah akses ${k.email}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => hapus(k)}
                    disabled={idProses === k.id}
                    aria-label={`Hapus ${k.email}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-red-600 transition-colors hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </KartuSection>

      {form && (
        <ModalKaryawan
          form={form}
          menyimpan={menyimpan}
          onUbah={ubahForm}
          onTutup={tutupForm}
          onSimpan={simpan}
        />
      )}
    </div>
  );
}