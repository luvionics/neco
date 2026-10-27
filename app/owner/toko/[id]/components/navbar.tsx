"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  Calculator,
  ExternalLink,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
} from "lucide-react";
import { STATUS_TOKO, urlHalamanToko, useToko } from "./toko-context";
import { Saklar } from "../ui";

export default function Navbar() {
  const { id, base, toko, totalBaru, ubahBukaSekarang } = useToko();
  const pathname = usePathname().replace(/\/$/, "");

  const aktif = toko.status === "aktif";
  const infoStatus = STATUS_TOKO[toko.status];

  // Menu Pesanan hanya ada jika minimal satu layanan pembeli diaktifkan
  const adaPesanan = toko.antar || toko.ambil || toko.meja;

  // Urutan menu: Ringkasan, Kasir, Pesanan, Produk, Pengaturan
  const MENU = [
    { href: base, label: "Ringkasan", ikon: LayoutDashboard, cocok: pathname === base, jumlah: 0 },
    // Menu Kasir hanya ada jika fitur kasir diaktifkan
    ...(toko.kasir
      ? [{ href: `${base}/kasir`, label: "Kasir", ikon: Calculator, cocok: pathname.startsWith(`${base}/kasir`), jumlah: 0 }]
      : []),
    ...(adaPesanan
      ? [{ href: `${base}/pesanan`, label: "Pesanan", ikon: Receipt, cocok: pathname.startsWith(`${base}/pesanan`), jumlah: totalBaru }]
      : []),
    { href: `${base}/produk`, label: "Produk", ikon: Package, cocok: pathname.startsWith(`${base}/produk`), jumlah: 0 },
    { href: `${base}/pengaturan`, label: "Pengaturan toko", ikon: Settings, cocok: pathname.startsWith(`${base}/pengaturan`), jumlah: 0 },
  ];

  const titik = (
    <span
      className={`h-2 w-2 rounded-full ${
        toko.bukaSekarang
          ? "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.2)]"
          : "bg-gray-400"
      }`}
    />
  );

  // Kontrol buka/tutup untuk sidebar (desktop)
  const statusSidebar = (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-gray-50 px-3.5 py-3 ring-1 ring-gray-100">
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
          Status toko
        </p>
        {aktif ? (
          <p className="mt-0.5 flex items-center gap-2 text-sm font-semibold text-gray-900">
            {titik}
            {toko.bukaSekarang ? "Buka" : "Tutup"}
          </p>
        ) : (
          <span
            className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${infoStatus.kelas}`}
          >
            {infoStatus.label}
          </span>
        )}
      </div>
      {aktif && (
        <Saklar
          nyala={toko.bukaSekarang}
          onChange={ubahBukaSekarang}
          label={`Status buka ${toko.nama}`}
        />
      )}
    </div>
  );

  // Kontrol buka/tutup untuk header (mobile)
  const statusHeader = aktif ? (
    <label className="flex shrink-0 items-center gap-2 rounded-full bg-gray-100 py-1 pl-3 pr-1.5 text-xs font-semibold text-gray-700">
      {titik}
      <span>{toko.bukaSekarang ? "Buka" : "Tutup"}</span>
      <Saklar
        nyala={toko.bukaSekarang}
        onChange={ubahBukaSekarang}
        label={`Status buka ${toko.nama}`}
      />
    </label>
  ) : (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${infoStatus.kelas}`}
    >
      {infoStatus.label}
    </span>
  );

  return (
    <>
      {/* SIDEBAR (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-gray-100 bg-white md:flex">
        <div className="space-y-4 p-4 pb-3">
          <Link
            href="/owner"
            className="group inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 transition-colors hover:text-orange-600"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            Daftar toko
          </Link>

          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-50 to-amber-50 p-2 ring-1 ring-orange-100">
              <Image
                src="/logo.png"
                alt="Necoku"
                width={40}
                height={40}
                className="h-full w-full object-contain"
              />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <h1 className="truncate text-sm font-bold leading-tight text-gray-900">
                  {toko.nama}
                </h1>
                {toko.terverifikasi && (
                  <BadgeCheck className="h-4 w-4 shrink-0 text-sky-500" />
                )}
              </div>
              <p className="truncate text-xs text-gray-500">{toko.kategori}</p>
            </div>
          </div>

          {statusSidebar}
        </div>

        <nav aria-label="Menu toko" className="flex-1 overflow-y-auto px-3 py-2">
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            Menu
          </p>
          <ul className="space-y-1">
            {MENU.map(({ href, label, ikon: Ikon, cocok, jumlah }) => (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={cocok ? "page" : undefined}
                  className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200 ${
                    cocok
                      ? "bg-gradient-to-r from-orange-500 to-amber-500 font-semibold text-white shadow-md shadow-orange-500/25"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  <Ikon
                    className={`h-5 w-5 shrink-0 transition-colors ${
                      cocok ? "" : "text-gray-400 group-hover:text-orange-500"
                    }`}
                  />
                  <span className="flex-1">{label}</span>
                  {jumlah > 0 && (
                    <span
                      className={`rounded-full px-1.5 text-[10px] font-bold leading-4 ${
                        cocok
                          ? "bg-white text-orange-600"
                          : "bg-orange-500 text-white"
                      }`}
                    >
                      {jumlah}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {aktif && (
          <div className="p-3">
            <Link
              href={urlHalamanToko(id)}
              className="group flex items-center gap-2.5 rounded-xl border border-gray-100 px-3 py-2.5 text-sm font-medium text-gray-600 transition-all hover:border-orange-200 hover:bg-orange-50/50 hover:text-orange-600"
            >
              <ExternalLink className="h-4 w-4" />
              <span className="flex-1">Lihat halaman toko</span>
            </Link>
          </div>
        )}
      </aside>

      {/* HEADER (mobile) */}
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/80 backdrop-blur-xl md:hidden">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-3 py-2.5">
          <Link
            href="/owner"
            aria-label="Kembali ke daftar toko"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-700 transition-colors hover:bg-gray-200"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-50 to-amber-50 p-1.5 ring-1 ring-orange-100">
            <Image
              src="/logo.png"
              alt="Necoku"
              width={40}
              height={40}
              className="h-full w-full object-contain"
            />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <h1 className="truncate text-sm font-bold leading-tight text-gray-900">
                {toko.nama}
              </h1>
              {toko.terverifikasi && (
                <BadgeCheck className="h-4 w-4 shrink-0 text-sky-500" />
              )}
            </div>
            <p className="truncate text-xs text-gray-500">{toko.kategori}</p>
          </div>
          {statusHeader}
        </div>
      </header>

      {/* BOTTOM NAV (mobile, melayang) */}
      <nav
        aria-label="Menu toko"
        className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 rounded-2xl border border-gray-100 bg-white/90 shadow-xl shadow-gray-900/10 backdrop-blur-xl md:hidden"
      >
        <ul className="flex p-1.5">
          {MENU.map(({ href, label, ikon: Ikon, cocok, jumlah }) => (
            <li key={href} className="min-w-0 flex-1">
              <Link
                href={href}
                aria-current={cocok ? "page" : undefined}
                className={`flex w-full flex-col items-center gap-1 py-1.5 text-[10px] font-medium transition-colors ${
                  cocok ? "text-orange-600" : "text-gray-400"
                }`}
              >
                <span
                  className={`relative flex h-8 w-14 items-center justify-center rounded-full transition-all duration-200 ${
                    cocok ? "bg-orange-100" : ""
                  }`}
                >
                  <Ikon className={`h-5 w-5 ${cocok ? "stroke-[2.5]" : ""}`} />
                  {jumlah > 0 && (
                    <span className="absolute right-1.5 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
                      {jumlah > 9 ? "9+" : jumlah}
                      <span className="sr-only"> pesanan baru</span>
                    </span>
                  )}
                </span>
                <span className="truncate">{label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}