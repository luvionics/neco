"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  MessageCircle,
  Receipt,
  Settings2,
} from "lucide-react";
import {
  KELAS_STATUS_PESANAN,
  labelStatusPesanan,
  rupiah,
  sedangBerjalan,
  totalPesanan,
  useToko,
  type JenisPesanan,
  type PesananMasuk,
  type StatusPesanan,
} from "../toko-context";
import { Dialog, JENIS_PESANAN, SEMBUNYIKAN_SCROLLBAR } from "../ui";

type FilterPesanan = "baru" | "proses" | "selesai";

const FILTER_PESANAN: { id: FilterPesanan; label: string }[] = [
  { id: "baru", label: "Baru" },
  { id: "proses", label: "Proses" },
  { id: "selesai", label: "Selesai" },
];

const cocokFilter = (p: PesananMasuk, f: FilterPesanan) =>
  (f === "baru" && p.status === "menunggu") ||
  (f === "proses" && sedangBerjalan(p)) ||
  (f === "selesai" && (p.status === "selesai" || p.status === "ditolak"));

const LABEL_BAYAR = {
  cod: "Bayar di tempat",
  transfer: "Transfer",
  kasir: "Bayar di kasir",
} as const;

/** Langkah berikutnya untuk pesanan yang sudah diterima, tergantung jenisnya. */
function aksiLanjut(
  p: PesananMasuk
): { label: string; ke: StatusPesanan; hijau?: boolean } | null {
  switch (p.status) {
    case "diproses":
      if (p.jenis === "antar") return { label: "Antar pesanan", ke: "dikirim" };
      return {
        label: p.jenis === "meja" ? "Siap disajikan" : "Siap diambil",
        ke: "siap",
      };
    case "dikirim":
      return { label: "Tandai selesai", ke: "selesai", hijau: true };
    case "siap":
      return {
        label: p.jenis === "meja" ? "Sudah disajikan" : "Sudah diambil",
        ke: "selesai",
        hijau: true,
      };
    default:
      return null;
  }
}

/** Pakai jenis dari URL jika aktif, kalau tidak pakai jenis aktif pertama. */
function pilihJenis(nilai: string | null, aktif: JenisPesanan[]): JenisPesanan | null {
  if (nilai && (aktif as string[]).includes(nilai)) return nilai as JenisPesanan;
  return aktif[0] ?? null;
}

function IsiPesanan() {
  const { base, toko, pesanan, jumlahBaru, ubahStatus } = useToko();
  const param = useSearchParams().get("jenis");

  // Hanya jenis pesanan yang diaktifkan
  const daftarAktif = JENIS_PESANAN.filter((j) => toko[j.id]);
  const jenis = pilihJenis(param, daftarAktif.map((j) => j.id));

  const [filter, setFilter] = useState<FilterPesanan>("baru");
  const [tolak, setTolak] = useState<PesananMasuk | null>(null);

  const daftarJenis = useMemo(
    () => (jenis ? pesanan.filter((p) => p.jenis === jenis) : []),
    [pesanan, jenis]
  );
  const tampil = useMemo(
    () => daftarJenis.filter((p) => cocokFilter(p, filter)),
    [daftarJenis, filter]
  );

  if (!jenis) {
    return (
      <div className="space-y-6 md:space-y-8">
        <header>
          <p className="text-sm text-gray-500">Kelola pesanan masuk</p>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">
            Pesanan
          </h2>
        </header>

        <section className="flex flex-col gap-4 rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-orange-50 p-5 sm:flex-row sm:items-center md:p-6">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-amber-500 shadow-sm ring-1 ring-amber-100">
            <Settings2 className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-gray-900">
              Belum ada layanan pesanan yang aktif
            </h3>
            <p className="mt-0.5 text-sm text-gray-600">
              Aktifkan layanan antar, ambil sendiri, atau pesan di meja di
              pengaturan Info toko.
            </p>
          </div>
          <Link
            href={`${base}/info`}
            className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-orange-500/25 transition-all hover:shadow-lg hover:shadow-orange-500/30"
          >
            Buka Info toko
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </section>
      </div>
    );
  }

  const infoJenis = JENIS_PESANAN.find((j) => j.id === jenis)!;

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Header */}
      <header>
        <p className="text-sm text-gray-500">
          Pesanan {infoJenis.label.toLowerCase()}
        </p>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">
          Pesanan
        </h2>
      </header>

      <div className="space-y-3">
        {/* Sub navigasi jenis pesanan (hanya yang aktif) */}
        {daftarAktif.length > 1 && (
          <nav
            aria-label="Jenis pesanan"
            className={`flex gap-1 overflow-x-auto rounded-2xl border border-gray-100 bg-white p-1.5 shadow-sm ${SEMBUNYIKAN_SCROLLBAR}`}
          >
            {daftarAktif.map(({ id, label, ikon: Ikon }) => {
              const sel = id === jenis;
              return (
                <Link
                  key={id}
                  href={`${base}/pesanan?jenis=${id}`}
                  scroll={false}
                  aria-current={sel ? "page" : undefined}
                  className={`flex flex-1 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm transition-all duration-200 ${
                    sel
                      ? "bg-gradient-to-r from-orange-500 to-amber-500 font-semibold text-white shadow-md shadow-orange-500/25"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  <Ikon className="h-4 w-4 shrink-0" />
                  {label}
                  {jumlahBaru[id] > 0 && (
                    <span
                      className={`rounded-full px-1.5 text-[10px] font-bold leading-4 ${
                        sel
                          ? "bg-white text-orange-600"
                          : "bg-orange-500 text-white"
                      }`}
                    >
                      {jumlahBaru[id]}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        )}

        {/* Filter status */}
        <div className={`flex gap-2 overflow-x-auto py-0.5 ${SEMBUNYIKAN_SCROLLBAR}`}>
          {FILTER_PESANAN.map((f) => {
            const jumlah = daftarJenis.filter((p) => cocokFilter(p, f.id)).length;
            const sel = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                aria-pressed={sel}
                className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-xs font-medium transition-all duration-200 md:text-sm ${
                  sel
                    ? "bg-gray-900 text-white shadow-md shadow-gray-900/20"
                    : "border border-gray-100 bg-white text-gray-600 shadow-sm hover:border-orange-200 hover:text-orange-600"
                }`}
              >
                {f.label}
                <span
                  className={`min-w-5 rounded-full px-1.5 text-center text-[11px] font-bold leading-5 ${
                    sel ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {jumlah}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {tampil.length === 0 ? (
        <section className="flex flex-col items-center gap-4 rounded-3xl border border-gray-100 bg-white px-6 py-16 text-center shadow-sm">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-orange-50 ring-8 ring-orange-50/60">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/30">
              <Receipt className="h-7 w-7" />
            </span>
          </span>
          <div>
            <p className="text-base font-bold text-gray-900">Belum ada pesanan</p>
            <p className="mt-1 text-sm text-gray-500">
              Pesanan {infoJenis.label.toLowerCase()} akan muncul di sini.
            </p>
          </div>
        </section>
      ) : (
        <div className="grid gap-3 md:gap-4 xl:grid-cols-2">
          {tampil.map((p) => {
            const final = p.status === "selesai" || p.status === "ditolak";
            const lanjut = aksiLanjut(p);
            const IkonJenis = JENIS_PESANAN.find((j) => j.id === p.jenis)!.ikon;
            const baru = p.status === "menunggu";
            return (
              <article
                key={p.id}
                className={`space-y-3.5 rounded-2xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md md:p-5 ${
                  baru
                    ? "border-orange-200 ring-1 ring-orange-100"
                    : "border-gray-100"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                      baru
                        ? "bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/25"
                        : "bg-orange-50 text-orange-500"
                    }`}
                  >
                    <IkonJenis className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-gray-900">
                      <span className="truncate">{p.pembeli}</span>
                      {p.jenis === "meja" && (
                        <span className="rounded-md bg-orange-50 px-1.5 py-0.5 text-xs font-bold text-orange-600">
                          Meja {p.meja}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {p.id} · {p.waktu}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${KELAS_STATUS_PESANAN[p.status]}`}
                  >
                    {labelStatusPesanan(p)}
                  </span>
                </div>

                <ul className="space-y-1.5 rounded-xl bg-gray-50 p-3.5 text-sm">
                  {p.item.map((i) => (
                    <li key={i.nama} className="flex justify-between gap-3">
                      <span className="text-gray-800">
                        {i.nama}{" "}
                        <span className="font-medium text-gray-400">×{i.qty}</span>
                      </span>
                      <span className="shrink-0 text-gray-600">
                        {rupiah(i.harga * i.qty)}
                      </span>
                    </li>
                  ))}
                  {p.ongkir > 0 && (
                    <li className="flex justify-between gap-3 border-t border-dashed border-gray-200 pt-1.5 text-gray-500">
                      <span>Ongkos antar</span>
                      <span>{rupiah(p.ongkir)}</span>
                    </li>
                  )}
                </ul>

                <div className="flex items-end justify-between gap-3">
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <IkonJenis className="h-3.5 w-3.5 text-orange-500" />
                      {p.jenis === "antar"
                        ? "Antar ke rumah"
                        : p.jenis === "ambil"
                          ? "Ambil sendiri"
                          : `Makan di tempat, meja ${p.meja}`}
                    </span>
                    <span className="flex items-center gap-1">
                      <Banknote className="h-3.5 w-3.5 text-orange-500" />
                      {LABEL_BAYAR[p.bayar]}
                    </span>
                  </p>
                  <div className="shrink-0 text-right">
                    <p className="text-[11px] text-gray-400">Total</p>
                    <p className="text-lg font-extrabold leading-tight text-gray-900">
                      {rupiah(totalPesanan(p))}
                    </p>
                  </div>
                </div>

                {!final && (
                  <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-3.5">
                    {p.wa && (
                      <a
                        href={`https://wa.me/${p.wa}?text=${encodeURIComponent(
                          `Halo ${p.pembeli}, soal pesanan ${p.id} di ${toko.nama}`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mr-auto flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3.5 py-2 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100 transition-colors hover:bg-emerald-100"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        Hubungi pembeli
                      </a>
                    )}

                    {p.status === "menunggu" && (
                      <>
                        <button
                          onClick={() => setTolak(p)}
                          className="rounded-xl border border-red-200 bg-white px-4 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                        >
                          Tolak
                        </button>
                        <button
                          onClick={() => ubahStatus(p.id, "diproses")}
                          className="rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-orange-500/25 transition-all hover:shadow-lg hover:shadow-orange-500/30 active:scale-[0.98]"
                        >
                          Terima pesanan
                        </button>
                      </>
                    )}

                    {lanjut && (
                      <button
                        onClick={() => ubahStatus(p.id, lanjut.ke)}
                        className={`rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-md transition-all hover:shadow-lg active:scale-[0.98] ${
                          lanjut.hijau
                            ? "bg-gradient-to-r from-emerald-500 to-teal-500 shadow-emerald-500/25 hover:shadow-emerald-500/30"
                            : "bg-gradient-to-r from-orange-500 to-amber-500 shadow-orange-500/25 hover:shadow-orange-500/30"
                        }`}
                      >
                        {lanjut.label}
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {tolak && (
        <Dialog judul="Tolak pesanan" onTutup={() => setTolak(null)}>
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-500 ring-1 ring-red-100">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-gray-900">
                Tolak pesanan ini?
              </h2>
              <p className="text-sm text-gray-500">
                Pesanan {tolak.id} dari {tolak.pembeli} akan ditolak dan pembeli
                diberi tahu. Tindakan ini tidak bisa dibatalkan.
              </p>
            </div>
          </div>
          <div className="flex gap-2.5">
            <button
              onClick={() => setTolak(null)}
              className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Batal
            </button>
            <button
              onClick={() => {
                ubahStatus(tolak.id, "ditolak");
                setTolak(null);
              }}
              className="flex-1 rounded-xl bg-gradient-to-r from-red-500 to-rose-500 py-2.5 text-sm font-semibold text-white shadow-md shadow-red-500/25 transition-all hover:shadow-lg hover:shadow-red-500/30 active:scale-[0.98]"
            >
              Ya, tolak
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

// useSearchParams wajib dibungkus Suspense agar build tidak error
export default function PesananPage() {
  return (
    <Suspense fallback={null}>
      <IsiPesanan />
    </Suspense>
  );
}