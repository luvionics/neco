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
const DURASI_KELUAR = 220;

const DURASI_AWAL: Record<JenisToast, number> = {
  sukses: 3000,
  info: 4000,
  peringatan: 5000,
  galat: 6000,
};

const GAYA: Record<
  JenisToast,
  { ikon: LucideIcon; ikonKelas: string; bar: string; aksen: string }
> = {
  sukses: {
    ikon: CheckCircle2,
    ikonKelas: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    bar: "bg-emerald-500",
    aksen: "bg-emerald-500",
  },
  galat: {
    ikon: AlertCircle,
    ikonKelas: "bg-red-50 text-red-600 ring-red-100",
    bar: "bg-red-500",
    aksen: "bg-red-500",
  },
  info: {
    ikon: Info,
    ikonKelas: "bg-blue-50 text-blue-600 ring-blue-100",
    bar: "bg-blue-500",
    aksen: "bg-blue-500",
  },
  peringatan: {
    ikon: TriangleAlert,
    ikonKelas: "bg-amber-50 text-amber-600 ring-amber-100",
    bar: "bg-amber-500",
    aksen: "bg-amber-500",
  },
};

// ---------- Item ----------

function ItemToast({ data, onTutup }: { data: DataToast; onTutup: (id: number) => void }) {
  const [masuk, setMasuk] = useState(false);
  const [keluar, setKeluar] = useState(false);
  const [jeda, setJeda] = useState(false);

  const timerHilang = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerKeluar = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sisa = useRef(data.durasi); // sisa waktu (ms)
  const mulaiWaktu = useRef(0);
  const berjalan = useRef(false);

  const { ikon: Ikon, ikonKelas, bar, aksen } = GAYA[data.jenis];

  const tutup = useCallback(() => {
    if (timerHilang.current) clearTimeout(timerHilang.current);
    setKeluar(true);
    if (timerKeluar.current) clearTimeout(timerKeluar.current);
    timerKeluar.current = setTimeout(() => onTutup(data.id), DURASI_KELUAR);
  }, [onTutup, data.id]);

  const mulaiHitung = useCallback(() => {
    if (data.durasi <= 0 || berjalan.current) return;
    berjalan.current = true;
    setJeda(false);
    mulaiWaktu.current = Date.now();
    if (timerHilang.current) clearTimeout(timerHilang.current);
    timerHilang.current = setTimeout(tutup, sisa.current);
  }, [data.durasi, tutup]);

  const hentikanHitung = useCallback(() => {
    if (data.durasi <= 0 || !berjalan.current) return;
    berjalan.current = false;
    setJeda(true);
    if (timerHilang.current) clearTimeout(timerHilang.current);
    sisa.current = Math.max(0, sisa.current - (Date.now() - mulaiWaktu.current));
  }, [data.durasi]);

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
      onFocus={hentikanHitung}
      onBlur={mulaiHitung}
      className={`pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_10px_30px_-8px_rgba(0,0,0,0.18)] transition-all duration-200 ease-out motion-reduce:transition-none ${
        masuk && !keluar
          ? "translate-y-0 scale-100 opacity-100"
          : "-translate-y-3 scale-95 opacity-0"
      }`}
    >
      {/* Garis aksen di kiri */}
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${aksen}`} />

      <div className="flex items-start gap-3 py-3.5 pl-5 pr-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ${ikonKelas}`}
        >
          <Ikon className="h-[18px] w-[18px]" />
        </span>

        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-sm font-semibold leading-snug text-gray-900">{data.judul}</p>
          {data.deskripsi && (
            <p className="mt-0.5 break-words text-xs leading-relaxed text-gray-500">
              {data.deskripsi}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={tutup}
          aria-label="Tutup notifikasi"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 active:scale-90"
        >
          <X className="h-4 w-4" strokeWidth={2.25} />
        </button>
      </div>

      {/* Progress bar hitung mundur */}
      {data.durasi > 0 && (
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-gray-100">
          <span
            className={`block h-full origin-left ${bar} opacity-70`}
            style={{
              animation: `toast-progres ${data.durasi}ms linear forwards`,
              animationPlayState: jeda ? "paused" : "running",
            }}
          />
        </span>
      )}
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
      <style>{`
        @keyframes toast-progres {
          from { transform: scaleX(1); }
          to { transform: scaleX(0); }
        }
      `}</style>
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2.5 p-4 sm:items-end"
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