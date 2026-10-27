"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X, type LucideIcon } from "lucide-react";

// ---------- Tipe ----------

export type JenisToast = "sukses" | "galat" | "info" | "peringatan";

/** Bisa berupa string (dianggap deskripsi) atau objek untuk mengatur durasi. */
export type OpsiToast = string | { deskripsi?: string; durasi?: number };

type DataToast = {
  id: number;
  jenis: JenisToast;
  judul: string;
  deskripsi?: string;
  durasi: number; // ms, 0 = tidak hilang otomatis
};

export type AksiToast = {
  tampil: (jenis: JenisToast, judul: string, opsi?: OpsiToast) => number;
  sukses: (judul: string, opsi?: OpsiToast) => number;
  galat: (judul: string, opsi?: OpsiToast) => number;
  info: (judul: string, opsi?: OpsiToast) => number;
  peringatan: (judul: string, opsi?: OpsiToast) => number;
  tutup: (id: number) => void;
  tutupSemua: () => void;
};

// ---------- Konstanta ----------

const MAKS_TAMPIL = 4;
const DURASI_KELUAR = 200;

const DURASI_AWAL: Record<JenisToast, number> = {
  sukses: 3000,
  info: 4000,
  peringatan: 5000,
  galat: 6000,
};

const GAYA: Record<JenisToast, { ikon: LucideIcon; lingkar: string; ikonKelas: string }> = {
  sukses: { ikon: CheckCircle2, lingkar: "ring-emerald-100", ikonKelas: "bg-emerald-50 text-emerald-600" },
  galat: { ikon: AlertCircle, lingkar: "ring-red-100", ikonKelas: "bg-red-50 text-red-600" },
  info: { ikon: Info, lingkar: "ring-blue-100", ikonKelas: "bg-blue-50 text-blue-600" },
  peringatan: { ikon: TriangleAlert, lingkar: "ring-amber-100", ikonKelas: "bg-amber-50 text-amber-600" },
};

// ---------- Item ----------

function ItemToast({ data, onTutup }: { data: DataToast; onTutup: (id: number) => void }) {
  const [masuk, setMasuk] = useState(false);
  const [keluar, setKeluar] = useState(false);
  const timerHilang = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerKeluar = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { ikon: Ikon, lingkar, ikonKelas } = GAYA[data.jenis];

  const tutup = useCallback(() => {
    setKeluar(true);
    if (timerKeluar.current) clearTimeout(timerKeluar.current);
    timerKeluar.current = setTimeout(() => onTutup(data.id), DURASI_KELUAR);
  }, [onTutup, data.id]);

  const mulaiHitung = useCallback(() => {
    if (data.durasi <= 0) return;
    if (timerHilang.current) clearTimeout(timerHilang.current);
    timerHilang.current = setTimeout(tutup, data.durasi);
  }, [data.durasi, tutup]);

  const hentikanHitung = () => {
    if (timerHilang.current) clearTimeout(timerHilang.current);
  };

  // Animasi masuk + mulai hitung mundur
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMasuk(true));
    mulaiHitung();
    return () => {
      cancelAnimationFrame(frame);
      if (timerHilang.current) clearTimeout(timerHilang.current);
      if (timerKeluar.current) clearTimeout(timerKeluar.current);
    };
  }, [mulaiHitung]);

  return (
    <div
      role={data.jenis === "galat" ? "alert" : "status"}
      onMouseEnter={hentikanHitung}
      onMouseLeave={mulaiHitung}
      className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-gray-100 bg-white p-3.5 shadow-lg ring-1 transition-all duration-200 ${lingkar} ${
        masuk && !keluar ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
      }`}
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${ikonKelas}`}>
        <Ikon className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-sm font-semibold text-gray-900">{data.judul}</p>
        {data.deskripsi && (
          <p className="mt-0.5 break-words text-xs text-gray-500">{data.deskripsi}</p>
        )}
      </div>
      <button
        type="button"
        onClick={tutup}
        aria-label="Tutup notifikasi"
        className="-mr-1 -mt-0.5 shrink-0 rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ---------- Provider & hook ----------

const ToastContext = createContext<AksiToast | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [daftar, setDaftar] = useState<DataToast[]>([]);
  const penghitung = useRef(0);

  const tutup = useCallback((id: number) => {
    setDaftar((d) => d.filter((t) => t.id !== id));
  }, []);

  const tutupSemua = useCallback(() => setDaftar([]), []);

  const tampil = useCallback((jenis: JenisToast, judul: string, opsi?: OpsiToast) => {
    const o = typeof opsi === "string" ? { deskripsi: opsi } : opsi ?? {};
    const id = ++penghitung.current;

    setDaftar((d) => {
      // Cegah toast kembar yang masih tampil (mis. tombol diklik berkali-kali)
      if (d.some((t) => t.jenis === jenis && t.judul === judul && t.deskripsi === o.deskripsi)) {
        return d;
      }
      const baru: DataToast = {
        id,
        jenis,
        judul,
        deskripsi: o.deskripsi,
        durasi: o.durasi ?? DURASI_AWAL[jenis],
      };
      return [...d, baru].slice(-MAKS_TAMPIL);
    });

    return id;
  }, []);

  const aksi = useMemo<AksiToast>(
    () => ({
      tampil,
      sukses: (judul, opsi) => tampil("sukses", judul, opsi),
      galat: (judul, opsi) => tampil("galat", judul, opsi),
      info: (judul, opsi) => tampil("info", judul, opsi),
      peringatan: (judul, opsi) => tampil("peringatan", judul, opsi),
      tutup,
      tutupSemua,
    }),
    [tampil, tutup, tutupSemua]
  );

  return (
    <ToastContext.Provider value={aksi}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 p-4 sm:items-end"
      >
        {daftar.map((t) => (
          <ItemToast key={t.id} data={t} onTutup={tutup} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): AksiToast {
  const nilai = useContext(ToastContext);
  if (!nilai) throw new Error("useToast harus dipakai di dalam ToastProvider");
  return nilai;
}