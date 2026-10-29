"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import {
  AlertCircle,
  Bike,
  Check,
  ChevronRight,
  Clock,
  LifeBuoy,
  Loader2,
  LogOut,
  MapPin,
  Package,
  Pencil,
  Plus,
  ShieldCheck,
  Store,
} from "lucide-react";
import Header from "@/app/components/Header";
import Lencana from "@/app/components/Lencana";
import { NavBawah } from "@/app/components/Navbar";
import TeksBerjalan from "@/app/components/TeksBerjalan";
import { createClient } from "@/lib/supabase/client";
import FormProfil from "./components/FormProfil";
import {
  KOLOM_DB,
  PROFIL_KOSONG,
  dariDb,
  formatWa,
  keDb,
  kolomKurang,
  type Profil,
} from "./components/profil";

type TokoRingkas = { id: string; nama: string; status: string };

// Pengelompokan status pesanan untuk kartu "Pesanan saya".
// Sesuai constraint orders.status:
// pending, confirmed, preparing, ready, on_delivery, completed, cancelled
const RINGKAS_PESANAN = [
  { label: "Menunggu", ikon: Clock, status: ["pending"] },
  { label: "Diproses", ikon: Package, status: ["confirmed", "preparing"] },
  { label: "Diantar / siap", ikon: Bike, status: ["ready", "on_delivery"] },
  { label: "Selesai", ikon: Check, status: ["completed"] },
];

// Sesuai constraint shops.status: pending, active, suspended, closed
const STATUS_TOKO_AKTIF = ["active"];

const STATUS_TOKO_INFO: Record<string, { label: string; kelas: string }> = {
  active: { label: "Aktif", kelas: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" },
  pending: { label: "Diproses", kelas: "bg-amber-50 text-amber-700 ring-1 ring-amber-100" },
  suspended: { label: "Ditangguhkan", kelas: "bg-red-50 text-red-700 ring-1 ring-red-100" },
  closed: { label: "Ditutup", kelas: "bg-gray-100 text-gray-600 ring-1 ring-gray-200" },
};

// Jumlah toko yang tampil di akses cepat
const BATAS_TOKO = 3;

// Teks berjalan di header: keterangan seputar akun
const TEKS_AKUN = [
  "Ubah data dirimu, nomor WhatsApp, dan alamat lewat tombol Ubah",
  "Lengkapi data profil agar toko terdekat lebih mudah ditemukan",
  "Pantau status pesananmu di kartu Pesanan saya",
  "Punya usaha? Daftarkan tokomu gratis lewat menu Daftarkan toko",
  "Masuk ke dashboard tokomu lewat kartu Toko saya",
  "Butuh bantuan? Buka Pusat bantuan kapan saja",
  "Jangan lupa keluar dari akun saat memakai perangkat bersama",
];

// ---------- Komponen kecil ----------

function BarisMenu({
  ikon: Ikon,
  judul,
  ket,
  href,
  onClick,
  bahaya,
}: {
  ikon: React.ComponentType<{ className?: string }>;
  judul: string;
  ket?: string;
  href?: string;
  onClick?: () => void;
  bahaya?: boolean;
}) {
  const kelas = `group flex w-full items-center gap-3.5 px-5 py-3.5 text-left transition-colors ${
    bahaya ? "hover:bg-red-50/60" : "hover:bg-gray-50/70"
  }`;
  const isi = (
    <>
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
          bahaya
            ? "bg-red-50 text-red-500 ring-1 ring-red-100"
            : "bg-orange-50 text-orange-500 ring-1 ring-orange-100 group-hover:bg-orange-500 group-hover:text-white"
        }`}
      >
        <Ikon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block text-sm font-medium ${
            bahaya ? "text-red-600" : "text-gray-900"
          }`}
        >
          {judul}
        </span>
        {ket && <span className="block text-xs text-gray-500">{ket}</span>}
      </span>
      {!bahaya && (
        <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-orange-500" />
      )}
    </>
  );
  return href ? (
    <a href={href} className={kelas}>
      {isi}
    </a>
  ) : (
    <button type="button" onClick={onClick} className={kelas}>
      {isi}
    </button>
  );
}

function BarisToko({ toko }: { toko: TokoRingkas }) {
  const info = STATUS_TOKO_INFO[toko.status] ?? STATUS_TOKO_INFO.closed;
  return (
    <a
      href={`/owner/toko/${toko.id}`}
      className="group flex w-full items-center gap-3.5 py-3 pl-8 pr-5 transition-colors hover:bg-gray-50/70 md:pl-9"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 transition-colors group-hover:bg-orange-500 group-hover:text-white">
        <Store className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
        {toko.nama}
      </span>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${info.kelas}`}
      >
        {info.label}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-orange-500" />
    </a>
  );
}

function Kartu({
  judul,
  aksi,
  children,
}: {
  judul?: string;
  aksi?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      {judul && (
        <div className="flex items-center justify-between px-5 pb-1 pt-4">
          <h2 className="text-base font-semibold text-gray-900">{judul}</h2>
          {aksi}
        </div>
      )}
      {children}
    </section>
  );
}

// Tampilan sementara saat data masih dimuat
function Kerangka() {
  return (
    <div className="space-y-4 md:space-y-5" aria-busy="true">
      <span className="sr-only">Memuat akun</span>
      <div className="h-48 animate-pulse rounded-3xl bg-gray-200/70" />
      <div className="h-36 animate-pulse rounded-2xl bg-gray-200/70" />
      <div className="h-32 animate-pulse rounded-2xl bg-gray-200/70" />
      <div className="h-44 animate-pulse rounded-2xl bg-gray-200/70" />
    </div>
  );
}

// ---------- Halaman ----------

export default function AkunPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [memuat, setMemuat] = useState(true);
  const [galatMuat, setGalatMuat] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profil, setProfil] = useState<Profil>(PROFIL_KOSONG);
  const [ringkas, setRingkas] = useState<number[]>(RINGKAS_PESANAN.map(() => 0));
  const [daftarToko, setDaftarToko] = useState<TokoRingkas[]>([]);
  const [daftarArea, setDaftarArea] = useState<string[]>([]);

  // null = form tertutup, "ubah" = ubah profil, "lengkapi" = lengkapi data
  const [formBuka, setFormBuka] = useState<null | "ubah" | "lengkapi">(null);

  const [keluar, setKeluar] = useState(false);
  const [keluarProses, setKeluarProses] = useState(false);

  // Ambil semua data akun saat halaman dibuka
  useEffect(() => {
    let batal = false;

    async function muat() {
      const {
        data: { user: u },
      } = await supabase.auth.getUser();

      // Belum login: arahkan ke halaman login
      if (!u) {
        window.location.replace("/login");
        return;
      }

      const [resProfil, resToko, resArea, jumlahPesanan] = await Promise.all([
        supabase.from("profiles").select(KOLOM_DB).eq("id", u.id).maybeSingle(),
        supabase
          .from("shops")
          .select("id, name, status, created_at")
          .eq("owner_id", u.id)
          .order("created_at", { ascending: true }),
        supabase.from("shops").select("village").not("village", "is", null).limit(500),
        Promise.all(
          RINGKAS_PESANAN.map(async (k) => {
            const { count, error } = await supabase
              .from("orders")
              .select("id", { count: "exact", head: true })
              .eq("customer_id", u.id)
              .in("status", k.status);
            return { jumlah: count ?? 0, error };
          })
        ),
      ]);

      if (batal) return;

      const meta = u.user_metadata ?? {};
      const namaMeta =
        (meta.nama as string) ||
        (meta.full_name as string) ||
        u.email?.split("@")[0] ||
        "";

      setUser(u);
      setProfil(dariDb(resProfil.data, namaMeta));

      setDaftarToko(
        (resToko.data ?? []).map((t) => ({
          id: String(t.id),
          nama: typeof t.name === "string" ? t.name : "",
          status: typeof t.status === "string" ? t.status : "",
        }))
      );

      setRingkas(jumlahPesanan.map((j) => j.jumlah));

      setDaftarArea(
        Array.from(
          new Set(
            (resArea.data ?? [])
              .map((s) => (s.village ?? "").trim())
              .filter(Boolean)
          )
        ).sort((a, b) => a.localeCompare(b, "id"))
      );

      setGalatMuat(
        Boolean(resProfil.error || resToko.error || jumlahPesanan.some((j) => j.error))
      );
      setMemuat(false);
    }

    muat();
    return () => {
      batal = true;
    };
  }, [supabase]);

  const inisial = profil.nama.trim().charAt(0).toUpperCase() || "?";
  const kurang = kolomKurang(profil);

  const totalToko = daftarToko.length;
  const tokoAktif = daftarToko.filter((t) => STATUS_TOKO_AKTIF.includes(t.status)).length;
  const ketToko =
    totalToko === 1
      ? tokoAktif > 0
        ? "Tokomu aktif"
        : "Tokomu belum aktif"
      : `${tokoAktif} dari ${totalToko} toko aktif`;

  // Dipanggil FormProfil. Kembalikan pesan galat, atau null bila berhasil.
  const simpanProfil = async (data: Profil): Promise<string | null> => {
    if (!user) return "Sesi tidak ditemukan, muat ulang halaman";

    const baris = { ...keDb(data), updated_at: new Date().toISOString() };

    // Perbarui baris profil. Kalau belum ada, buat baru.
    const { data: hasil, error } = await supabase
      .from("profiles")
      .update(baris)
      .eq("id", user.id)
      .select("id");

    let galatDb = error;
    if (!error && (hasil?.length ?? 0) === 0) {
      const { error: errInsert } = await supabase
        .from("profiles")
        .insert({ id: user.id, ...baris });
      galatDb = errInsert;
    }

    if (galatDb) {
      if (galatDb.code === "23505") return "Username sudah dipakai, pilih yang lain";
      if (galatDb.code === "23514")
        return "Ada isian yang tidak sesuai format, periksa kembali";
      if (galatDb.code === "42501")
        return "Tidak punya izin menyimpan, periksa aturan RLS tabel profiles";
      return "Gagal menyimpan perubahan, coba lagi";
    }

    setProfil(data);
    setFormBuka(null);
    return null;
  };

  const keluarAkun = async () => {
    setKeluarProses(true);
    await supabase.auth.signOut();
    router.replace("/");
  };

  const ringkasan = [profil.kota, profil.provinsi].filter(Boolean).join(", ");

  return (
    <div className="min-h-screen bg-gray-50 pb-28 text-gray-800 md:pb-0">
      {/* HEADER */}
      <Header aktif="Akun">
        {/* Judul halaman, disembunyikan secara visual untuk pembaca layar */}
        <h1 className="sr-only">Akun</h1>

        {/* Teks berjalan: keterangan tentang akun */}
        <TeksBerjalan teks={TEKS_AKUN} className="min-w-0 flex-1" />
      </Header>

      <main className="mx-auto max-w-2xl space-y-4 px-3 py-4 md:space-y-5 md:px-4 md:py-8">
        {memuat ? (
          <Kerangka />
        ) : (
          <>
            {galatMuat && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700 ring-1 ring-amber-100"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                Sebagian data gagal dimuat. Muat ulang halaman, atau periksa
                aturan RLS tabel di Supabase.
              </p>
            )}

            {/* PROFIL */}
            <section className="rounded-3xl border border-gray-100 bg-white shadow-sm">
              {/* Banner: overflow-hidden + rounded atas agar lingkaran dekoratif tetap terpotong rapi */}
              <div className="relative h-20 overflow-hidden rounded-t-3xl bg-gradient-to-r from-orange-500 via-orange-500 to-amber-500">
                <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/10" />
                <div className="pointer-events-none absolute -bottom-12 left-1/3 h-32 w-32 rounded-full bg-white/10" />
              </div>
              <div className="relative z-10 px-5 pb-5">
                <div className="-mt-10 flex items-end justify-between gap-3">
                  {profil.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profil.avatar}
                      alt=""
                      className="relative h-20 w-20 shrink-0 rounded-full object-cover shadow-lg shadow-orange-500/30 ring-4 ring-white"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-red-500 text-3xl font-extrabold text-white shadow-lg shadow-orange-500/30 ring-4 ring-white"
                    >
                      {inisial}
                    </span>
                  )}
                  <button
                    onClick={() => setFormBuka("ubah")}
                    className="flex shrink-0 items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-xs font-medium text-orange-600 transition-colors hover:bg-orange-100"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Ubah
                  </button>
                </div>
                <div className="mt-3 space-y-1">
                  <h2 className="truncate text-lg font-bold tracking-tight text-gray-900">
                    {profil.nama || "Nama belum diisi"}
                  </h2>
                  {profil.username && (
                    <p className="truncate text-xs text-gray-500">@{profil.username}</p>
                  )}
                  {user?.email && (
                    <p className="truncate text-xs text-gray-400">{user.email}</p>
                  )}
                  <p className="text-sm text-gray-500">
                    {profil.whatsapp
                      ? formatWa(profil.whatsapp)
                      : "Nomor WhatsApp belum diisi"}
                  </p>
                  <p className="flex items-center gap-1 text-xs text-gray-500">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-orange-500" />
                    <span className="truncate">
                      {profil.area
                        ? ringkasan
                          ? `${profil.area}, ${ringkasan}`
                          : profil.area
                        : "Area belum diisi"}
                    </span>
                  </p>
                </div>

                {/* DATA BELUM LENGKAP */}
                {kurang.length > 0 && (
                  <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-amber-50 p-3.5 ring-1 ring-amber-100 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-start gap-2">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      <div className="min-w-0 text-xs text-amber-800">
                        <p className="font-semibold">Data profilmu belum lengkap</p>
                        <p className="mt-0.5">
                          Belum diisi:{" "}
                          {kurang
                            .slice(0, 3)
                            .map((k) => k.label)
                            .join(", ")}
                          {kurang.length > 3 && ` dan ${kurang.length - 3} lainnya`}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setFormBuka("lengkapi")}
                      className="shrink-0 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-orange-500/25 transition-all hover:shadow-lg active:scale-[0.98]"
                    >
                      Lengkapi data
                    </button>
                  </div>
                )}
              </div>
            </section>

            {/* PESANAN */}
            <Kartu
              judul="Pesanan saya"
              aksi={
                <a
                  href="/pesanan"
                  className="flex items-center gap-0.5 text-xs font-medium text-orange-600 transition-colors hover:text-orange-700"
                >
                  Lihat semua
                  <ChevronRight className="h-3.5 w-3.5" />
                </a>
              }
            >
              <ul className="grid grid-cols-4 gap-1 px-3 pb-4 pt-3">
                {RINGKAS_PESANAN.map(({ label, ikon: Ikon }, i) => (
                  <li key={label}>
                    <a
                      href="/pesanan"
                      className="group flex flex-col items-center gap-2 rounded-2xl px-1 py-2 text-center transition-colors hover:bg-gray-50"
                    >
                      <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-500 ring-1 ring-orange-100 transition-colors group-hover:bg-orange-500 group-hover:text-white">
                        <Ikon className="h-6 w-6" />
                        <Lencana
                          jumlah={ringkas[i]}
                          kelas="bg-orange-500 text-white ring-2 ring-white"
                        />
                      </span>
                      <span className="text-[11px] font-medium leading-tight text-gray-600">
                        {label}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </Kartu>

            {/* TOKO SAYA */}
            <Kartu judul="Toko saya">
              <div className="divide-y divide-gray-100 pt-2">
                {totalToko > 0 ? (
                  <>
                    <BarisMenu
                      ikon={Store}
                      judul="Kelola toko"
                      ket={ketToko}
                      href="/owner"
                    />
                    {daftarToko.slice(0, BATAS_TOKO).map((t) => (
                      <BarisToko key={t.id} toko={t} />
                    ))}
                    {totalToko > BATAS_TOKO && (
                      <a
                        href="/owner"
                        className="flex items-center justify-center gap-0.5 py-3 text-xs font-medium text-orange-600 transition-colors hover:bg-orange-50/50 hover:text-orange-700"
                      >
                        Lihat semua ({totalToko} toko)
                        <ChevronRight className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <BarisMenu
                      ikon={Plus}
                      judul="Toko baru"
                      ket="Daftarkan toko lain, gratis"
                      href="/owner/daftar"
                    />
                  </>
                ) : (
                  <BarisMenu
                    ikon={Plus}
                    judul="Daftarkan toko"
                    ket="Gratis, mudah ditemukan tetangga"
                    href="/owner/daftar"
                  />
                )}
              </div>
            </Kartu>

            {/* BANTUAN & KELUAR */}
            <Kartu>
              <div className="divide-y divide-gray-100">
                <BarisMenu ikon={LifeBuoy} judul="Pusat bantuan" href="/bantuan" />
                <BarisMenu
                  ikon={ShieldCheck}
                  judul="Syarat dan kebijakan privasi"
                  href="/kebijakan"
                />
                <BarisMenu
                  ikon={LogOut}
                  judul="Keluar"
                  bahaya
                  onClick={() => setKeluar(true)}
                />
              </div>
            </Kartu>

            <p className="pt-2 text-center text-xs text-gray-400">Necoku · Versi 1.0</p>
          </>
        )}
      </main>

      {/* BOTTOM NAV */}
      <NavBawah aktif="Akun" />

      {/* UBAH PROFIL / LENGKAPI DATA (LAYAR PENUH) */}
      {formBuka && user && (
        <FormProfil
          key={formBuka}
          userId={user.id}
          awal={profil}
          mode={formBuka}
          daftarArea={daftarArea}
          onSimpan={simpanProfil}
          onGambarTersimpan={(kunci, url) => setProfil((p) => ({ ...p, [kunci]: url }))}
          onTutup={() => setFormBuka(null)}
        />
      )}

      {/* KONFIRMASI KELUAR */}
      {keluar && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/40 backdrop-blur-sm md:items-center md:justify-center"
          onClick={() => !keluarProses && setKeluar(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="judul-keluar"
            onClick={(e) => e.stopPropagation()}
            className="w-full space-y-4 rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl md:max-w-sm md:rounded-3xl"
          >
            <div className="mx-auto h-1.5 w-10 rounded-full bg-gray-200 md:hidden" />
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-500 ring-1 ring-red-100">
                <LogOut className="h-5 w-5" />
              </span>
              <div className="space-y-1">
                <h2 id="judul-keluar" className="text-lg font-bold text-gray-900">
                  Keluar dari akun?
                </h2>
                <p className="text-sm text-gray-500">
                  Kamu perlu masuk lagi untuk melihat pesanan dan mengelola tokomu.
                </p>
              </div>
            </div>
            <div className="flex gap-2.5">
              <button
                onClick={() => setKeluar(false)}
                disabled={keluarProses}
                className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                onClick={keluarAkun}
                disabled={keluarProses}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-rose-500 py-2.5 text-sm font-semibold text-white shadow-md shadow-red-500/25 transition-all hover:shadow-lg hover:shadow-red-500/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {keluarProses && <Loader2 className="h-4 w-4 animate-spin" />}
                Ya, keluar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}