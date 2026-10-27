"use client";

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Loader2, Package, Pencil, Plus, Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/toast";
import { useModal } from "@/components/modal";
import {
  rupiah,
  useToko,
  type InputProduk,
  type Produk,
} from "../components/toko-context";
import { Saklar } from "../ui";
import FormProduct, {
  type GrupInput,
  type InputUbahProduk,
} from "./components/formproduct";

const BATAS_STOK = 5;

/** Jumlah kartu produk yang dirender per tahap (infinite scroll). */
const UKURAN_TAHAP = 24;

/** Bucket Supabase Storage (public). Foto produk ada di {idToko}/products/. */
const BUCKET = "shops";
const MAKS_UKURAN_GAMBAR = 2 * 1024 * 1024; // 2 MB

/** Baris hasil query grup pilihan beserta pilihannya. */
type BarisGrup = {
  id: string;
  name: string;
  is_required: boolean;
  max_select: number;
  sort_order: number;
  product_options:
    | {
        id: string;
        name: string;
        price_delta: number;
        is_available: boolean;
        sort_order: number;
      }[]
    | null;
};

/** Mengambil pesan dari Error maupun objek error Supabase. */
function pesanError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  return "Terjadi kesalahan.";
}

/** Ambil path file di bucket dari URL publik. null jika bukan dari bucket ini. */
function pathDariUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const penanda = `/storage/v1/object/public/${BUCKET}/`;
  const i = url.indexOf(penanda);
  if (i === -1) return null;
  try {
    return decodeURIComponent(url.slice(i + penanda.length).split("?")[0]);
  } catch {
    return null;
  }
}

/** Perkecil dimensi dan turunkan kualitas sampai ukuran di bawah batas. */
async function kompresGambar(file: File, maksByte: number): Promise<File> {
  const bmp = await createImageBitmap(file);
  try {
    let sisi = Math.min(1600, Math.max(bmp.width, bmp.height));
    for (let putaran = 0; putaran < 4; putaran++) {
      const skala = Math.min(1, sisi / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bmp.width * skala));
      canvas.height = Math.max(1, Math.round(bmp.height * skala));
      const ctx = canvas.getContext("2d");
      if (!ctx) break;
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);

      for (const mutu of [0.85, 0.75, 0.65, 0.5]) {
        const blob = await new Promise<Blob | null>((r) =>
          canvas.toBlob(r, "image/webp", mutu)
        );
        if (blob && blob.size <= maksByte) {
          const nama = file.name.replace(/\.[^.]+$/, "") + ".webp";
          return new File([blob], nama, { type: "image/webp" });
        }
      }
      sisi = Math.round(sisi * 0.75);
    }
  } finally {
    bmp.close();
  }
  throw new Error("Foto masih lebih dari 2 MB setelah dikompres.");
}

/** Kolom tabel products dari data form. Dipakai bersama oleh tambah dan ubah. */
function kolomProduk(
  p: Omit<InputUbahProduk, "grup" | "gambarUrl">,
  gambarUrl: string | null
) {
  return {
    category_id: p.kategoriId,
    name: p.nama,
    description: p.deskripsi || null,
    // string kosong harus jadi NULL agar tidak bentrok dengan UNIQUE (shop_id, sku)
    sku: p.sku || null,
    price: p.harga,
    image_url: gambarUrl,
    // produk tanpa stok: stok tidak dilacak dan stok = 0
    track_stock: !p.nonStok,
    stock: p.nonStok ? 0 : p.stok,
    is_available: p.tersedia,
  };
}

export default function ProdukPage() {
  const { id, toko, produk, setProduk, kategori, muatUlangProduk } = useToko();

  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const modal = useModal();

  const [cari, setCari] = useState("");
  const [tambah, setTambah] = useState(false);
  const [diubah, setDiubah] = useState<Produk | null>(null);
  /** Grup pilihan produk yang sedang diubah, dimuat sebelum form dibuka. */
  const [grupAwal, setGrupAwal] = useState<GrupInput[]>([]);
  /** Produk yang sedang dimuat grup pilihannya (tombol ubah menampilkan spinner). */
  const [membukaId, setMembukaId] = useState<string | null>(null);

  /** Berapa kartu yang sedang dirender. Bertambah saat pengguna menggulir ke bawah. */
  const [jumlahTampil, setJumlahTampil] = useState(UKURAN_TAHAP);
  const penandaRef = useRef<HTMLLIElement>(null);

  /** Mode ubah: URL foto yang saat ini tersimpan di database untuk produk yang dibuka. */
  const urlTersimpanRef = useRef<string | null>(null);
  /** Mode tambah: path foto yang sudah diunggah tapi produknya belum disimpan. */
  const pathTambahRef = useRef<string | null>(null);

  const namaKategori = useMemo(
    () => new Map(kategori.map((k) => [k.id, k.nama])),
    [kategori]
  );

  // Kolom input tetap responsif; penyaringan daftar mengikuti dengan prioritas lebih rendah
  const kataCari = useDeferredValue(cari);

  // Penyaringan dilakukan di memori, jadi hasil pencarian instan tanpa query ke Supabase
  const tampil = useMemo(() => {
    const q = kataCari.trim().toLowerCase();
    if (!q) return produk;
    return produk.filter(
      (p) =>
        p.nama.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
    );
  }, [produk, kataCari]);

  // Hanya sebagian yang dirender agar DOM tetap ringan
  const tampilBertahap = useMemo(
    () => tampil.slice(0, jumlahTampil),
    [tampil, jumlahTampil]
  );
  const adaLagi = tampilBertahap.length < tampil.length;

  const jumlahTersedia = produk.filter((p) => p.tersedia).length;

  const ubahCari = (nilai: string) => {
    setCari(nilai);
    // Pencarian baru dimulai lagi dari tahap pertama
    setJumlahTampil(UKURAN_TAHAP);
  };

  // Infinite scroll: tambah kartu saat penanda di akhir daftar mendekati layar.
  // Observer dibuat ulang tiap jumlah berubah, jadi jika penanda masih terlihat
  // (layar tinggi) tahap berikutnya langsung dimuat.
  useEffect(() => {
    const penanda = penandaRef.current;
    if (!adaLagi || !penanda) return;

    const observer = new IntersectionObserver(
      (entri) => {
        if (entri[0]?.isIntersecting) {
          setJumlahTampil((n) => n + UKURAN_TAHAP);
        }
      },
      { rootMargin: "400px" }
    );
    observer.observe(penanda);
    return () => observer.disconnect();
  }, [adaLagi, jumlahTampil]);

  // ---------- Storage ----------

  /** Mengunggah foto ke {idToko}/products/. Melempar error jika gagal. */
  const unggahFoto = async (file: File) => {
    const ekstensi =
      file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ||
      "jpg";
    const path = `${id}/products/${Date.now()}-${crypto
      .randomUUID()
      .slice(0, 8)}.${ekstensi}`;

    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });
    if (error) {
      const pesan = /row-level security/i.test(error.message)
        ? "Tidak punya izin mengunggah ke bucket. Periksa policy Storage di Supabase."
        : error.message;
      throw new Error(`Gagal mengunggah foto: ${pesan}`);
    }

    const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    return { path, url };
  };

  /** Menghapus file dari Storage. Gagal dihapus tidak boleh menggagalkan proses utama. */
  const hapusFoto = async (path: string | null) => {
    if (!path) return;
    try {
      const { error } = await supabase.storage.from(BUCKET).remove([path]);
      if (error) console.error("Gagal menghapus file dari Storage:", error.message);
    } catch (e) {
      console.error("Gagal menghapus file dari Storage:", e);
    }
  };

  // ---------- Grup pilihan (variant) ----------

  /** Memuat grup pilihan beserta pilihannya untuk satu produk. */
  const muatGrup = async (produkId: string): Promise<GrupInput[]> => {
    const { data, error } = await supabase
      .from("product_option_groups")
      .select(
        "id, name, is_required, max_select, sort_order, product_options(id, name, price_delta, is_available, sort_order)"
      )
      .eq("product_id", produkId)
      .eq("shop_id", id)
      .order("sort_order", { ascending: true });

    if (error) throw error;

    return ((data ?? []) as unknown as BarisGrup[]).map((g) => ({
      id: g.id,
      nama: g.name,
      wajib: g.is_required,
      maksPilih: g.max_select,
      opsi: [...(g.product_options ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((o) => ({
          id: o.id,
          nama: o.name,
          tambahHarga: o.price_delta,
          tersedia: o.is_available,
        })),
    }));
  };

  /**
   * Menyimpan grup pilihan sebuah produk. Semua grup dan pilihan sudah punya id
   * (dibuat di form), jadi cukup upsert; yang hilang dari form dihapus.
   * `lama` = kondisi yang tersimpan sebelumnya (kosong untuk produk baru).
   */
  const simpanGrup = async (
    produkId: string,
    grup: GrupInput[],
    lama: GrupInput[]
  ) => {
    const barisGrup = grup.map((g, i) => ({
      id: g.id,
      shop_id: id,
      product_id: produkId,
      name: g.nama,
      is_required: g.wajib,
      min_select: g.wajib ? 1 : 0,
      max_select: g.maksPilih,
      sort_order: i,
    }));
    const barisOpsi = grup.flatMap((g) =>
      g.opsi.map((o, i) => ({
        id: o.id,
        shop_id: id,
        group_id: g.id,
        name: o.nama,
        price_delta: o.tambahHarga,
        is_available: o.tersedia,
        sort_order: i,
      }))
    );

    const izinDitolak = new Error(
      "Pilihan produk tidak tersimpan. Kamu tidak punya izin mengubahnya."
    );

    if (barisGrup.length > 0) {
      const { data, error } = await supabase
        .from("product_option_groups")
        .upsert(barisGrup, { onConflict: "id" })
        .select("id");
      if (error) throw error;
      // RLS yang menolak tidak mengembalikan error, hanya baris yang kurang
      if (!data || data.length !== barisGrup.length) throw izinDitolak;
    }

    if (barisOpsi.length > 0) {
      const { data, error } = await supabase
        .from("product_options")
        .upsert(barisOpsi, { onConflict: "id" })
        .select("id");
      if (error) throw error;
      if (!data || data.length !== barisOpsi.length) throw izinDitolak;
    }

    // Hapus pilihan dan grup yang sudah dibuang dari form
    const opsiBaruIds = new Set(barisOpsi.map((o) => o.id));
    const grupBaruIds = new Set(barisGrup.map((g) => g.id));

    const opsiDihapus = lama
      .flatMap((g) => g.opsi.map((o) => o.id))
      .filter((oid) => !opsiBaruIds.has(oid));
    if (opsiDihapus.length > 0) {
      const { error } = await supabase
        .from("product_options")
        .delete()
        .in("id", opsiDihapus)
        .eq("shop_id", id);
      if (error) throw error;
    }

    // Menghapus grup ikut menghapus pilihannya (on delete cascade)
    const grupDihapus = lama.map((g) => g.id).filter((gid) => !grupBaruIds.has(gid));
    if (grupDihapus.length > 0) {
      const { error } = await supabase
        .from("product_option_groups")
        .delete()
        .in("id", grupDihapus)
        .eq("shop_id", id);
      if (error) throw error;
    }
  };

  // ---------- Aksi foto (dipanggil FormProduct) ----------

  /**
   * Menyimpan foto saja ke produk (mode ubah), tanpa tombol Simpan.
   * Melempar error jika gagal sehingga pemanggil bisa membatalkan.
   */
  const ubahGambar = async (produkId: string, url: string | null) => {
    const { data, error } = await supabase
      .from("products")
      .update({ image_url: url, updated_at: new Date().toISOString() })
      .eq("id", produkId)
      .eq("shop_id", id)
      .select("id");

    if (error) throw error;

    // RLS yang menolak update tidak mengembalikan error, hanya 0 baris
    if (!data || data.length === 0) {
      throw new Error(
        "Foto tidak tersimpan. Kamu tidak punya izin mengubah produk ini, atau produk tidak ditemukan."
      );
    }

    // Perbarui daftar di belakang dialog agar langsung terlihat
    setProduk((d) =>
      d.map((p) => (p.id === produkId ? { ...p, gambarUrl: url } : p))
    );
  };

  /**
   * Pengguna memilih file. produkId null = mode tambah.
   * Mengembalikan URL foto baru, atau null jika pengguna membatalkan.
   */
  const pilihGambar = async (
    file: File,
    produkId: string | null
  ): Promise<string | null> => {
    if (!file.type.startsWith("image/")) {
      throw new Error("File harus berupa gambar");
    }

    let berkas = file;
    if (file.size > MAKS_UKURAN_GAMBAR) {
      const setuju = await modal.konfirmasi({
        judul: "Ukuran foto melebihi 2 MB",
        deskripsi: `Foto ini berukuran ${(file.size / 1024 / 1024).toFixed(
          1
        )} MB. Kompres otomatis agar di bawah 2 MB lalu unggah?`,
        jenis: "peringatan",
        teksSetuju: "Kompres dan upload",
        teksBatal: "Batal",
      });
      if (!setuju) return null;
      berkas = await kompresGambar(file, MAKS_UKURAN_GAMBAR);
    }

    const hasil = await unggahFoto(berkas);

    if (produkId) {
      // Simpan ke produk dulu; jika gagal, unggahan dibatalkan
      try {
        await ubahGambar(produkId, hasil.url);
      } catch (err) {
        await hapusFoto(hasil.path);
        throw err;
      }
      const lama = urlTersimpanRef.current;
      urlTersimpanRef.current = hasil.url;
      // Foto sebelumnya sudah tidak dipakai produk
      await hapusFoto(pathDariUrl(lama));
    } else {
      // Mode tambah belum punya baris produk: foto ikut tersimpan saat produk disimpan
      await hapusFoto(pathTambahRef.current);
      pathTambahRef.current = hasil.path;
    }

    return hasil.url;
  };

  /** Pengguna menghapus foto. produkId null = mode tambah. */
  const hapusGambar = async (produkId: string | null) => {
    if (produkId) {
      await ubahGambar(produkId, null);
      const lama = urlTersimpanRef.current;
      urlTersimpanRef.current = null;
      await hapusFoto(pathDariUrl(lama));
    } else {
      await hapusFoto(pathTambahRef.current);
      pathTambahRef.current = null;
    }
  };

  // ---------- Buka dan tutup form ----------

  /** Memuat grup pilihan dulu, baru form dibuka agar isinya langsung lengkap. */
  const bukaUbah = async (p: Produk) => {
    if (membukaId) return;
    setMembukaId(p.id);
    try {
      const grup = await muatGrup(p.id);
      urlTersimpanRef.current = p.gambarUrl;
      setGrupAwal(grup);
      setDiubah(p);
    } catch (e) {
      console.error("Gagal memuat pilihan produk:", e);
      toast.galat("Gagal membuka produk", pesanError(e));
    } finally {
      setMembukaId(null);
    }
  };

  const tutupUbah = () => {
    setDiubah(null);
    setGrupAwal([]);
  };

  const tutupTambah = () => {
    // Foto yang diunggah tapi produknya tidak jadi disimpan dibuang
    void hapusFoto(pathTambahRef.current);
    pathTambahRef.current = null;
    setTambah(false);
  };

  // ---------- Aksi produk ----------

  /** Menyegarkan daftar produk. Data sudah tersimpan, jadi gagal di sini tidak dianggap gagal menyimpan. */
  const segarkan = async () => {
    try {
      await muatUlangProduk();
    } catch (e) {
      console.error("Produk tersimpan, tetapi gagal memuat ulang daftar:", e);
    }
  };

  /** Menambah produk. Jika gagal, error dilempar ke FormProduct yang menampilkannya di dialog. */
  const simpanProduk = async (p: InputUbahProduk) => {
    const { data: baru, error } = await supabase
      .from("products")
      .insert({ shop_id: id, ...kolomProduk(p, p.gambarUrl) })
      .select("id")
      .single();

    if (error || !baru) {
      if (error?.code === "23505") {
        throw new Error("SKU sudah dipakai produk lain di tokomu.");
      }
      throw error ?? new Error("Produk tidak tersimpan.");
    }

    if (p.grup.length > 0) {
      try {
        await simpanGrup(baru.id, p.grup, []);
      } catch (e) {
        // Batalkan produk yang baru dibuat agar tidak ada duplikat saat pengguna mencoba lagi
        await supabase
          .from("products")
          .delete()
          .eq("id", baru.id)
          .eq("shop_id", id);
        throw new Error(`Pilihan produk gagal disimpan: ${pesanError(e)}`);
      }
    }

    // Foto sudah terpasang di produk, jadi tidak perlu dibersihkan lagi
    pathTambahRef.current = null;
    await segarkan();
    setTambah(false);
  };

  /** Menyimpan perubahan produk. Jika gagal, error dilempar ke FormProduct. */
  const simpanPerubahan = async (data: InputUbahProduk) => {
    if (!diubah) return;

    const { data: hasilUpdate, error } = await supabase
      .from("products")
      .update({
        ...kolomProduk(data, data.gambarUrl),
        updated_at: new Date().toISOString(),
      })
      .eq("id", diubah.id)
      .eq("shop_id", id)
      .select("id");

    if (error) {
      if (error.code === "23505") {
        throw new Error("SKU sudah dipakai produk lain di tokomu.");
      }
      throw error;
    }

    // RLS yang menolak update tidak mengembalikan error, hanya 0 baris
    if (!hasilUpdate || hasilUpdate.length === 0) {
      throw new Error(
        "Perubahan tidak tersimpan. Kamu tidak punya izin mengubah produk ini, atau produk tidak ditemukan."
      );
    }

    try {
      await simpanGrup(diubah.id, data.grup, grupAwal);
    } catch (e) {
      throw new Error(`Pilihan produk gagal disimpan: ${pesanError(e)}`);
    }

    await segarkan();
    tutupUbah();
  };

  /** Mengubah ketersediaan produk. Tampilan diperbarui dulu, dikembalikan jika gagal. */
  const ubahTersedia = async (produkId: string) => {
    const lama = produk.find((p) => p.id === produkId);
    if (!lama) return;
    const baru = !lama.tersedia;

    const setTersedia = (nilai: boolean) =>
      setProduk((d) =>
        d.map((p) => (p.id === produkId ? { ...p, tersedia: nilai } : p))
      );

    setTersedia(baru);

    try {
      const { data, error } = await supabase
        .from("products")
        .update({ is_available: baru })
        .eq("id", produkId)
        .eq("shop_id", id)
        .select("id");

      if (error) {
        console.error("Gagal mengubah ketersediaan produk:", error);
        setTersedia(lama.tersedia);
        toast.galat("Gagal mengubah ketersediaan produk", error.message);
        return;
      }

      // RLS yang menolak update tidak mengembalikan error, hanya 0 baris
      if (!data || data.length === 0) {
        setTersedia(lama.tersedia);
        toast.galat(
          "Perubahan tidak tersimpan",
          "Kamu tidak punya izin mengubah produk ini, atau produk tidak ditemukan."
        );
      }
    } catch (e) {
      console.error("Gagal mengubah ketersediaan produk:", e);
      setTersedia(lama.tersedia);
      toast.galat(
        "Gagal mengubah ketersediaan produk",
        "Periksa koneksi internet lalu coba lagi."
      );
    }
  };

  // ---------- Tampilan ----------

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Header */}
      <header>
        <p className="text-sm text-gray-500">
          {produk.length} produk · {jumlahTersedia} tersedia
        </p>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">
          Produk
        </h2>
      </header>

      {/* Pencarian + tambah */}
      <section className="flex gap-2.5">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={cari}
            onChange={(e) => ubahCari(e.target.value)}
            placeholder="Cari nama atau SKU..."
            aria-label="Cari produk"
            className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-10 text-sm shadow-sm outline-none transition placeholder:text-gray-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-500/10"
          />
          {cari && (
            <button
              onClick={() => ubahCari("")}
              aria-label="Hapus pencarian"
              className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          onClick={() => setTambah(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-orange-500/25 transition-all hover:shadow-lg hover:shadow-orange-500/30 active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Tambah produk</span>
          <span className="sm:hidden">Tambah</span>
        </button>
      </section>

      {produk.length === 0 ? (
        <section className="flex flex-col items-center gap-4 rounded-3xl border border-gray-100 bg-white px-6 py-16 text-center shadow-sm">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-orange-50 ring-8 ring-orange-50/60">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/30">
              <Package className="h-7 w-7" />
            </span>
          </span>
          <div>
            <p className="text-base font-bold text-gray-900">Belum ada produk</p>
            <p className="mt-1 text-sm text-gray-500">
              Tambahkan produk agar pembeli bisa memesan dari tokomu.
            </p>
          </div>
          <button
            onClick={() => setTambah(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-orange-500/25 transition-all hover:shadow-lg hover:shadow-orange-500/30 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            Tambah produk pertama
          </button>
        </section>
      ) : tampil.length === 0 ? (
        <section className="flex flex-col items-center gap-3 rounded-2xl border border-gray-100 bg-white px-6 py-12 text-center shadow-sm">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
            <Search className="h-6 w-6" />
          </span>
          <p className="text-sm text-gray-500">
            Tidak ada produk yang cocok dengan pencarian
          </p>
        </section>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {tampilBertahap.map((p) => {
            const habis = !p.nonStok && p.stok === 0;
            const menipis = !p.nonStok && !habis && p.stok <= BATAS_STOK;

            const labelStok = p.nonStok
              ? "Tanpa stok"
              : habis
              ? "Stok habis"
              : `Stok ${p.stok}`;

            const warnaBadge = p.nonStok
              ? "bg-sky-50 text-sky-600"
              : habis
              ? "bg-red-50 text-red-600"
              : menipis
              ? "bg-amber-50 text-amber-600"
              : "bg-gray-100 text-gray-600";

            const warnaTitik = p.nonStok
              ? "bg-sky-500"
              : habis
              ? "bg-red-500"
              : menipis
              ? "bg-amber-500"
              : "bg-emerald-500";

            const infoTambahan = [
              p.kategoriId ? namaKategori.get(p.kategoriId) : null,
              p.sku ? `SKU ${p.sku}` : null,
            ]
              .filter(Boolean)
              .join(" · ");

            const sedangDibuka = membukaId === p.id;

            return (
              <li
                key={p.id}
                className="flex items-center gap-3.5 rounded-2xl border border-gray-100 bg-white p-3.5 shadow-sm transition-all duration-200 hover:border-orange-200 hover:shadow-lg hover:shadow-orange-500/10 md:p-4"
              >
                {p.gambarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.gambarUrl}
                    alt={p.nama}
                    loading="lazy"
                    decoding="async"
                    className={`h-14 w-14 shrink-0 rounded-2xl object-cover shadow-sm ${
                      p.tersedia ? "" : "opacity-50 grayscale"
                    }`}
                  />
                ) : (
                  <span
                    className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br shadow-sm ${toko.warna} ${
                      p.tersedia ? "" : "opacity-50 grayscale"
                    }`}
                  >
                    <Package className="h-7 w-7 text-white" />
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-sm font-semibold ${
                      p.tersedia ? "text-gray-900" : "text-gray-400"
                    }`}
                  >
                    {p.nama}
                  </p>
                  {infoTambahan && (
                    <p className="truncate text-[11px] text-gray-400">
                      {infoTambahan}
                    </p>
                  )}
                  <p
                    className={`mt-0.5 text-base font-extrabold leading-tight ${
                      p.tersedia ? "text-orange-600" : "text-gray-400"
                    }`}
                  >
                    {rupiah(p.harga)}
                  </p>
                  <span
                    className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${warnaBadge}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${warnaTitik}`} />
                    {labelStok}
                  </span>
                </div>

                <div className="flex shrink-0 flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void bukaUbah(p)}
                    disabled={membukaId !== null}
                    aria-label={`Ubah produk ${p.nama}`}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-orange-50 hover:text-orange-600 disabled:opacity-60"
                  >
                    {sedangDibuka ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Pencil className="h-4 w-4" />
                    )}
                  </button>
                  <label className="flex flex-col items-center gap-1.5 text-[11px] font-medium text-gray-500">
                    <Saklar
                      nyala={p.tersedia}
                      onChange={() => ubahTersedia(p.id)}
                      label={`Produk ${p.nama} tersedia`}
                    />
                    {p.tersedia ? "Tersedia" : "Disembunyikan"}
                  </label>
                </div>
              </li>
            );
          })}

          {/* Penanda akhir daftar: saat mendekati layar, tahap berikutnya dirender */}
          {adaLagi && (
            <li
              ref={penandaRef}
              aria-hidden="true"
              className="flex items-center justify-center py-4 md:col-span-2"
            >
              <Loader2 className="h-5 w-5 animate-spin text-orange-400" />
            </li>
          )}
        </ul>
      )}

      {tambah && (
        <FormProduct
          onTutup={tutupTambah}
          onSimpan={simpanProduk}
          onPilihGambar={(file) => pilihGambar(file, null)}
          onHapusGambar={() => hapusGambar(null)}
        />
      )}

      {diubah && (
        <FormProduct
          key={diubah.id}
          produk={diubah}
          grupAwal={grupAwal}
          onTutup={tutupUbah}
          onSimpan={simpanPerubahan}
          onPilihGambar={(file) => pilihGambar(file, diubah.id)}
          onHapusGambar={() => hapusGambar(diubah.id)}
        />
      )}
    </div>
  );
}