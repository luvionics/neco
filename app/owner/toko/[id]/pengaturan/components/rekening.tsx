"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertCircle,
  Copy,
  Landmark,
  Loader2,
  Pencil,
  Plus,
  Star,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/toast";
import { useModal } from "@/components/modal";
import { useToko } from "../../components/toko-provider";

// ---------- Konstanta & tipe ----------

// Saran nama bank atau e-wallet (tetap bisa mengetik nama lain)
const SARAN_BANK = [
  "BCA",
  "BRI",
  "BNI",
  "Mandiri",
  "BSI",
  "CIMB Niaga",
  "Permata",
  "Danamon",
  "BTN",
  "Jago",
  "SeaBank",
  "GoPay",
  "OVO",
  "DANA",
  "ShopeePay",
];

const INPUT_MODERN =
  "w-full rounded-xl border border-gray-200 bg-gray-50/70 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-500/10";

// Kolom tabel shop_bank_accounts yang dibaca
const KOLOM = "id, bank_name, account_number, account_holder, is_primary";

type Rekening = {
  id: string;
  bank: string;
  nomor: string;
  atasNama: string;
  utama: boolean;
};

// id null = rekening baru
type FormRekening = {
  id: string | null;
  bank: string;
  nomor: string;
  atasNama: string;
  utama: boolean;
};

// ---------- Fungsi bantu ----------

function dariBaris(r: Record<string, unknown>): Rekening {
  return {
    id: String(r.id),
    bank: typeof r.bank_name === "string" ? r.bank_name : "",
    nomor: typeof r.account_number === "string" ? r.account_number : "",
    atasNama: typeof r.account_holder === "string" ? r.account_holder : "",
    utama: r.is_primary === true,
  };
}

// 1234567890 -> "1234 5678 90"
const formatNomor = (n: string) => n.replace(/(.{4})/g, "$1 ").trim();

function pesanGalatDb(error: { code?: string; message?: string }): string {
  if (error.code === "42P01")
    return "Tabel shop_bank_accounts belum dibuat. Jalankan SQL-nya di Supabase.";
  if (error.code === "42501") return "Kamu tidak punya izin mengelola rekening toko ini.";
  if (error.code === "23514") return "Ada isian yang tidak memenuhi aturan database.";
  if (error.code === "23505") return "Rekening utama sudah ada, coba lagi.";
  return error.message || "Coba lagi beberapa saat.";
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

function Bidang({
  id,
  label,
  bantuan,
  children,
}: {
  id: string;
  label: string;
  bantuan?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-gray-700">
        {label}
      </label>
      {children}
      {bantuan && <p className="text-xs text-gray-400">{bantuan}</p>}
    </div>
  );
}

function ModalRekening({
  form,
  menyimpan,
  onUbah,
  onTutup,
  onSimpan,
}: {
  form: FormRekening;
  menyimpan: boolean;
  onUbah: <K extends keyof FormRekening>(kunci: K, nilai: FormRekening[K]) => void;
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={form.id ? "Ubah rekening" : "Tambah rekening"}
      onClick={() => !menyimpan && onTutup()}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSimpan();
        }}
        className="w-full max-w-md space-y-4 rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-center justify-between">
          <h4 className="text-base font-semibold text-gray-900">
            {form.id ? "Ubah rekening" : "Tambah rekening"}
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

        <Bidang id="rekening-bank" label="Bank atau e-wallet" bantuan="Pilih dari saran atau ketik sendiri">
          <input
            id="rekening-bank"
            list="saran-bank"
            autoFocus
            maxLength={50}
            placeholder="Contoh: BCA"
            value={form.bank}
            onChange={(e) => onUbah("bank", e.target.value)}
            className={INPUT_MODERN}
          />
          <datalist id="saran-bank">
            {SARAN_BANK.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </Bidang>

        <Bidang id="rekening-nomor" label="Nomor rekening">
          <input
            id="rekening-nomor"
            inputMode="numeric"
            maxLength={20}
            value={form.nomor}
            onChange={(e) => onUbah("nomor", e.target.value.replace(/\D/g, ""))}
            className={INPUT_MODERN}
          />
        </Bidang>

        <Bidang id="rekening-nama" label="Atas nama" bantuan="Sesuai nama yang tertera di buku tabungan">
          <input
            id="rekening-nama"
            maxLength={100}
            value={form.atasNama}
            onChange={(e) => onUbah("atasNama", e.target.value)}
            className={INPUT_MODERN}
          />
        </Bidang>

        <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-gray-50 px-3.5 py-3">
          <input
            type="checkbox"
            checked={form.utama}
            onChange={(e) => onUbah("utama", e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 accent-orange-500"
          />
          <span>
            <span className="block text-sm font-medium text-gray-900">Jadikan rekening utama</span>
            <span className="block text-xs text-gray-500">Hanya satu rekening yang bisa jadi utama</span>
          </span>
        </label>

        <button
          type="submit"
          disabled={menyimpan}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/30 transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {menyimpan && <Loader2 className="h-4 w-4 animate-spin" />}
          {menyimpan ? "Menyimpan..." : form.id ? "Simpan perubahan" : "Tambah rekening"}
        </button>
      </form>
    </div>
  );
}

// ---------- Komponen utama ----------

export default function RekeningToko() {
  const { id } = useToko();
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const modal = useModal();

  const [daftar, setDaftar] = useState<Rekening[] | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [form, setForm] = useState<FormRekening | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const [idProses, setIdProses] = useState<string | null>(null);

  useEffect(() => {
    let batal = false;

    async function muat() {
      const { data, error } = await supabase
        .from("shop_bank_accounts")
        .select(KOLOM)
        .eq("shop_id", id)
        .order("created_at", { ascending: true });

      if (batal) return;

      if (error) {
        console.error("Gagal memuat rekening:", error);
        toast.galat("Rekening gagal dimuat", pesanGalatDb(error));
        setMemuat(false);
        return;
      }

      setDaftar((data ?? []).map((r) => dariBaris(r as Record<string, unknown>)));
      setMemuat(false);
    }

    muat();
    return () => {
      batal = true;
    };
    // toast sengaja tidak jadi dependensi agar tidak memuat ulang berulang
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, id]);

  const bukaTambah = () =>
    setForm({
      id: null,
      bank: "",
      nomor: "",
      atasNama: "",
      utama: (daftar?.length ?? 0) === 0, // rekening pertama otomatis utama
    });

  const bukaUbah = (r: Rekening) =>
    setForm({ id: r.id, bank: r.bank, nomor: r.nomor, atasNama: r.atasNama, utama: r.utama });

  const tutupForm = () => setForm(null);

  const ubahForm = <K extends keyof FormRekening>(kunci: K, nilai: FormRekening[K]) =>
    setForm((f) => (f ? { ...f, [kunci]: nilai } : f));

  // Lepas status utama dari semua rekening toko ini (dipanggil sebelum menetapkan yang baru)
  const lepasUtama = async (): Promise<boolean> => {
    const { error } = await supabase
      .from("shop_bank_accounts")
      .update({ is_primary: false })
      .eq("shop_id", id)
      .eq("is_primary", true);
    if (error) {
      console.error("Gagal melepas rekening utama:", error);
      toast.galat("Gagal mengubah rekening utama", pesanGalatDb(error));
      return false;
    }
    return true;
  };

  const simpan = async () => {
    if (!form || !daftar) return;
    const gagal = (pesan: string) => toast.galat(pesan);

    const bank = form.bank.trim();
    if (bank.length < 2) return gagal("Isi nama bank atau e-wallet");
    if (!/^[0-9]{5,20}$/.test(form.nomor)) return gagal("Nomor rekening harus 5–20 angka");
    const atasNama = form.atasNama.trim();
    if (atasNama.length < 3) return gagal("Nama pemilik rekening minimal 3 huruf");

    setMenyimpan(true);
    try {
      if (form.utama && !(await lepasUtama())) return;

      const nilai = {
        bank_name: bank,
        account_number: form.nomor,
        account_holder: atasNama,
        is_primary: form.utama,
      };

      const permintaan = form.id
        ? supabase
            .from("shop_bank_accounts")
            .update({ ...nilai, updated_at: new Date().toISOString() })
            .eq("id", form.id)
            .eq("shop_id", id)
            .select(KOLOM)
        : supabase
            .from("shop_bank_accounts")
            .insert({ ...nilai, shop_id: id })
            .select(KOLOM);

      const { data, error } = await permintaan;

      if (error) {
        console.error("Gagal menyimpan rekening:", error);
        toast.galat("Gagal menyimpan rekening", pesanGalatDb(error));
        return;
      }
      if (!data || data.length === 0) {
        toast.galat("Rekening tidak tersimpan", "Kamu tidak punya izin atau data tidak ditemukan.");
        return;
      }

      const baru = dariBaris(data[0] as Record<string, unknown>);
      // Bila rekening ini jadi utama, yang lain otomatis bukan utama
      const dasar = baru.utama ? daftar.map((r) => ({ ...r, utama: false })) : daftar;
      setDaftar(form.id ? dasar.map((r) => (r.id === baru.id ? baru : r)) : [...dasar, baru]);
      toast.sukses(form.id ? "Rekening diperbarui" : "Rekening ditambahkan");
      setForm(null);
    } catch (e) {
      console.error("Gagal menyimpan rekening:", e);
      toast.galat("Gagal menyimpan rekening", "Periksa koneksi internet lalu coba lagi.");
    } finally {
      setMenyimpan(false);
    }
  };

  const jadikanUtama = async (r: Rekening) => {
    if (!daftar || r.utama) return;
    setIdProses(r.id);
    try {
      if (!(await lepasUtama())) return;

      const { data, error } = await supabase
        .from("shop_bank_accounts")
        .update({ is_primary: true, updated_at: new Date().toISOString() })
        .eq("id", r.id)
        .eq("shop_id", id)
        .select("id");

      if (error || !data || data.length === 0) {
        if (error) console.error("Gagal menetapkan rekening utama:", error);
        toast.galat("Gagal mengubah rekening utama", error ? pesanGalatDb(error) : "Data tidak ditemukan.");
        return;
      }
      setDaftar(daftar.map((x) => ({ ...x, utama: x.id === r.id })));
      toast.sukses("Rekening utama diubah");
    } finally {
      setIdProses(null);
    }
  };

  const hapus = async (r: Rekening) => {
    if (!daftar) return;
    const setuju = await modal.konfirmasi({
      jenis: "peringatan",
      judul: "Hapus rekening?",
      deskripsi: `${r.bank} ${formatNomor(r.nomor)} a.n. ${r.atasNama} akan dihapus. Tindakan ini tidak bisa dibatalkan.`,
      teksBatal: "Batal",
      teksSetuju: "Hapus",
    });
    if (!setuju) return;

    setIdProses(r.id);
    try {
      const { data, error } = await supabase
        .from("shop_bank_accounts")
        .delete()
        .eq("id", r.id)
        .eq("shop_id", id)
        .select("id");

      if (error || !data || data.length === 0) {
        if (error) console.error("Gagal menghapus rekening:", error);
        toast.galat("Rekening gagal dihapus", error ? pesanGalatDb(error) : "Data tidak ditemukan.");
        return;
      }

      const sisa = daftar.filter((x) => x.id !== r.id);
      setDaftar(sisa);
      toast.info("Rekening dihapus");

      // Bila yang dihapus adalah rekening utama, jadikan rekening pertama yang tersisa sebagai utama
      if (r.utama && sisa.length > 0) {
        const { error: e2 } = await supabase
          .from("shop_bank_accounts")
          .update({ is_primary: true })
          .eq("id", sisa[0].id)
          .eq("shop_id", id);
        if (!e2) setDaftar(sisa.map((x, i) => ({ ...x, utama: i === 0 })));
      }
    } finally {
      setIdProses(null);
    }
  };

  const salinNomor = async (nomor: string) => {
    try {
      await navigator.clipboard.writeText(nomor);
      toast.sukses("Nomor rekening disalin");
    } catch {
      toast.galat("Gagal menyalin", "Salin nomor secara manual.");
    }
  };

  if (memuat) {
    return (
      <div aria-busy="true">
        <span className="sr-only">Memuat rekening</span>
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
          Data rekening gagal dimuat. Pastikan tabel shop_bank_accounts dan policy RLS-nya sudah
          dibuat di Supabase.
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
        ikon={Landmark}
        judul="Rekening"
        deskripsi="Tujuan pembayaran dan pencairan dana tokomu"
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
              <Landmark className="h-6 w-6" />
            </span>
            <p className="text-sm font-medium text-gray-900">Belum ada rekening</p>
            <p className="text-xs text-gray-500">
              Tambahkan rekening bank atau e-wallet untuk menerima pembayaran.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {daftar.map((r) => (
              <li
                key={r.id}
                className={`space-y-2.5 px-5 py-4 transition-opacity ${
                  idProses === r.id ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
                    <Landmark className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900">{r.bank}</p>
                      {r.utama && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-600">
                          <Star className="h-3 w-3 fill-current" />
                          Utama
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 font-mono text-sm tracking-wide text-gray-800">
                      {formatNomor(r.nomor)}
                    </p>
                    <p className="text-xs text-gray-500">a.n. {r.atasNama}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 md:pl-[3.25rem]">
                  <button
                    type="button"
                    onClick={() => salinNomor(r.nomor)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Salin
                  </button>
                  {!r.utama && (
                    <button
                      type="button"
                      onClick={() => jadikanUtama(r)}
                      disabled={idProses === r.id}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-orange-600 transition-colors hover:bg-orange-50"
                    >
                      <Star className="h-3.5 w-3.5" />
                      Jadikan utama
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => bukaUbah(r)}
                    disabled={idProses === r.id}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Ubah
                  </button>
                  <button
                    type="button"
                    onClick={() => hapus(r)}
                    disabled={idProses === r.id}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Hapus
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </KartuSection>

      {form && (
        <ModalRekening
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