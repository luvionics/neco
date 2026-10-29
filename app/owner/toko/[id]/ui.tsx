"use client";

import type { ReactNode } from "react";
import { Bike, ShoppingBag, UtensilsCrossed, type LucideIcon } from "lucide-react";
import type { JenisPesanan } from "./components/toko";

export const SEMBUNYIKAN_SCROLLBAR =
  "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

export const INPUT =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-gray-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20";

export const JENIS_PESANAN: { id: JenisPesanan; label: string; ikon: LucideIcon }[] = [
  { id: "antar", label: "Pesan antar", ikon: Bike },
  { id: "ambil", label: "Ambil sendiri", ikon: ShoppingBag },
  { id: "meja", label: "Pesan dari meja", ikon: UtensilsCrossed },
];

export function Saklar({
  nyala,
  onChange,
  label,
}: {
  nyala: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={nyala}
      aria-label={label}
      onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${
        nyala ? "bg-emerald-500" : "bg-gray-300"
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          nyala ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
}

export function Dialog({
  judul,
  onTutup,
  children,
}: {
  judul: string;
  onTutup: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/40 md:items-center md:justify-center"
      onClick={onTutup}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={judul}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full space-y-4 overflow-y-auto rounded-t-2xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:max-w-md md:rounded-xl"
      >
        {children}
      </div>
    </div>
  );
}
