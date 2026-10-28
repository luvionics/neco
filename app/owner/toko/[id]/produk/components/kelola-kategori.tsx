"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Pencil, Plus, Tags, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/toast";
import { useModal } from "@/components/modal";

type Kategori = { id: string; nama: string };

type Props = {
  idToko: string;
  kategori: Kategori[];
  /** Jumlah produk per id kategori. */
  jumlahProduk: Map<string, number>;
  onTutup: () => void;
  /**
   * Dipanggil setelah data berubah. `muatProduk` true jika daftar produk juga
   * perlu dimuat ulang (misalnya setelah kategori dihapus).
   */
  onBerubah: (muatProduk: boolean) => Promise<void>;
  /** BARU: dipanggil setelah kategori baru tersimpan dan daftar sudah dimuat ulang. */
  onDitambah?: (idBaru: string) => void;
  /** BARU: dipanggil tepat setelah kategori berhasil dihapus dari database. */
  onDihapus?: (idKategori: string) => void;
};

/** Mengambil pesan dari Error maupun objek error Supabase. */
function pesanError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  return "Terjadi kesalahan.";
}

export default function KelolaKategori({
  idToko,
  kategori,
  jumlahProduk,
  onTutup,
  onBerubah,
  onDitambah,
  onDihapus,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const modal = useModal();

  const [namaBaru, setNamaBaru] = useState("");
  const [menambah, setMenambah] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [namaEdit, setNamaEdit] = useState("");
  /** Id kategori yang sedang diproses (simpan nama atau hapus). */
  const [sibukId, setSibukId] = useState<string | null>(null);

  // Esc menutup dialog
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onTutup();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onTutup]);

  /** Nama kembar (tanpa membedakan huruf besar kecil) di toko yang sama. */
  const adaKembar = (nama: string, kecualiId?: string) =>
    kategori.some(
      (k) =>
        k.id !== kecualiId &&
        k.nama.trim().toLowerCase() === nama.trim().toLowerCase()
    );

  const mulaiEdit = (k: Kategori) => {
    setEditId(k.id);
    setNamaEdit(k.nama);
  };

  const batalEdit = () => {
    setEditId(null);
    setNamaEdit("");
  };

  const tambah = async (e: React.FormEvent) => {
    e.preventDefault();
    const nama = namaBaru.trim();
    if (!nama || menambah) return;

    if (adaKembar(nama)) {
      toast.galat("Kategori sudah ada", `Kategori "${nama}" sudah ada di tokomu.`);
      return;
    }

    setMenambah(true);
    try {
      const { data, error } = await supabase
        .from("product_categories")
        .insert({ shop_id: idToko, name: nama, sort_order: kategori.length })
        .select("id");

      if (error) {
        if (error.code === "23505") {
          throw new Error(`Kategori "${nama}" sudah ada di tokomu.`);
        }
        throw error;
      }
      // RLS yang menolak insert bisa mengembalikan 0 baris
      if (!data || data.length === 0) {
        throw new Error("Kategori tidak tersimpan. Kamu tidak punya izin menambahnya.");
      }

      setNamaBaru("");
      await onBerubah(false);
      // BARU: dipanggil setelah daftar dimuat ulang supaya opsinya sudah ada
      onDitambah?.(String(data[0].id));
    } catch (err) {
      console.error("Gagal menambah kategori:", err);
      toast.galat("Gagal menambah kategori", pesanError(err));
    } finally {
      setMenambah(false);
    }
  };

  const simpanEdit = async (e: React.FormEvent, k: Kategori) => {
    e.preventDefault();
    const nama = namaEdit.trim();
    if (!nama || sibukId) return;

    if (nama === k.nama) {
      batalEdit();
      return;
    }
    if (adaKembar(nama, k.id)) {
      toast.galat("Kategori sudah ada", `Kategori "${nama}" sudah ada di tokomu.`);
      return;
    }

    setSibukId(k.id);
    try {
      const { data, error } = await supabase
        .from("product_categories")
        .update({ name: nama, updated_at: new Date().toISOString() })
        .eq("id", k.id)
        .eq("shop_id", idToko)
        .select("id");

      if (error) {
        if (error.code === "23505") {
          throw new Error(`Kategori "${nama}" sudah ada di tokomu.`);
        }
        throw error;
      }
      if (!data || data.length === 0) {
        throw new Error("Perubahan tidak tersimpan. Kamu tidak punya izin mengubahnya.");
      }

      batalEdit();
      await onBerubah(false);
    } catch (err) {
      console.error("Gagal mengubah kategori:", err);
      toast.galat("Gagal mengubah kategori", pesanError(err));
    } finally {
      setSibukId(null);
    }
  };

  const hapus = async (k: Kategori) => {
    if (sibukId) return;
    const jumlah = jumlahProduk.get(k.id) ?? 0;

    const setuju = await modal.konfirmasi({
      judul: `Hapus kategori "${k.nama}"?`,
      deskripsi:
        jumlah > 0
          ? `${jumlah} produk di kategori ini akan menjadi tanpa kategori. Produknya tidak ikut terhapus.`
          : "Kategori ini akan dihapus.",
      jenis: "peringatan",
      teksSetuju: "Hapus",
      teksBatal: "Batal",
    });
    if (!setuju) return;

    setSibukId(k.id);
    try {
      const { data, error } = await supabase
        .from("product_categories")
        .delete()
        .eq("id", k.id)
        .eq("shop_id", idToko)
        .select("id");

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Kategori tidak terhapus. Kamu tidak punya izin menghapusnya.");
      }

      // BARU: beri tahu pemanggil lebih dulu agar pilihan yang menunjuk
      // kategori ini langsung dikosongkan sebelum daftar dimuat ulang
      onDihapus?.(k.id);

      // category_id produk otomatis NULL (on delete set null), muat ulang produk
      await onBerubah(true);
    } catch (err) {
      console.error("Gagal menghapus kategori:", err);
      toast.galat("Gagal menghapus kategori", pesanError(err));
    } finally {
      setSibukId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onTutup();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Kelola kategori produk"
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
              <Tags className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-gray-900">Kategori produk</h3>
              <p className="text-xs text-gray-500">{kategori.length} kategori</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onTutup}
            aria-label="Tutup"
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tambah kategori */}
        <form onSubmit={tambah} className="flex gap-2 px-5 pt-4">
          <input
            value={namaBaru}
            onChange={(e) => setNamaBaru(e.target.value)}
            placeholder="Nama kategori baru..."
            aria-label="Nama kategori baru"
            maxLength={60}
            className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm outline-none transition placeholder:text-gray-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-500/10"
          />
          <button
            type="submit"
            disabled={!namaBaru.trim() || menambah}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-orange-500/25 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {menambah ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Tambah
          </button>
        </form>

        {/* Daftar kategori */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {kategori.length === 0 ? (
            <p className="rounded-xl bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
              Belum ada kategori. Tambahkan yang pertama di atas.
            </p>
          ) : (
            <ul className="space-y-2">
              {kategori.map((k) => {
                const sibuk = sibukId === k.id;
                const jumlah = jumlahProduk.get(k.id) ?? 0;

                if (editId === k.id) {
                  return (
                    <li key={k.id}>
                      <form
                        onSubmit={(e) => void simpanEdit(e, k)}
                        className="flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50/40 p-2"
                      >
                        <input
                          autoFocus
                          value={namaEdit}
                          onChange={(e) => setNamaEdit(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              e.stopPropagation();
                              batalEdit();
                            }
                          }}
                          aria-label={`Ubah nama kategori ${k.nama}`}
                          maxLength={60}
                          className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-500/10"
                        />
                        <button
                          type="submit"
                          disabled={!namaEdit.trim() || sibuk}
                          aria-label="Simpan nama"
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white transition-opacity disabled:opacity-50"
                        >
                          {sibuk ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={batalEdit}
                          disabled={sibuk}
                          aria-label="Batal ubah"
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 disabled:opacity-50"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </form>
                    </li>
                  );
                }

                return (
                  <li
                    key={k.id}
                    className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-3.5 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-900">
                        {k.nama}
                      </p>
                      <p className="text-[11px] text-gray-400">{jumlah} produk</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => mulaiEdit(k)}
                      disabled={sibukId !== null}
                      aria-label={`Ubah kategori ${k.nama}`}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-orange-50 hover:text-orange-600 disabled:opacity-60"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void hapus(k)}
                      disabled={sibukId !== null}
                      aria-label={`Hapus kategori ${k.nama}`}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
                    >
                      {sibuk ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}