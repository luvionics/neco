import { AlertCircle } from "lucide-react";

export function PesanGalat({ children }: { children: string }) {
  return (
    <p role="alert" className="flex items-center gap-1 text-xs text-red-600">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
      {children}
    </p>
  );
}

// Kelas untuk <input>, <select>, <textarea>
export function kelasInput(galat?: boolean, kosong?: boolean) {
  const dasar =
    "w-full rounded-xl border px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:bg-white focus:ring-4";
  if (galat)
    return `${dasar} border-red-300 bg-red-50/40 focus:border-red-400 focus:ring-red-500/10`;
  if (kosong)
    return `${dasar} border-amber-300 bg-amber-50/50 focus:border-orange-400 focus:ring-orange-500/10`;
  return `${dasar} border-gray-200 bg-gray-50/70 focus:border-orange-400 focus:ring-orange-500/10`;
}

type Props = {
  id: string;
  label: string;
  wajib?: boolean;
  kosong?: boolean; // tandai "Belum diisi" (mode lengkapi data)
  galat?: string;
  petunjuk?: string;
  children: React.ReactNode;
};

export default function Bidang({
  id,
  label,
  wajib,
  kosong,
  galat,
  petunjuk,
  children,
}: Props) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="block text-sm font-medium text-gray-700">
          {label}
          {wajib && <span className="ml-0.5 text-red-500">*</span>}
        </label>
        {kosong && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
            Belum diisi
          </span>
        )}
      </div>
      {children}
      {petunjuk && !galat && <p className="text-xs text-gray-400">{petunjuk}</p>}
      {galat && <PesanGalat>{galat}</PesanGalat>}
    </div>
  );
}