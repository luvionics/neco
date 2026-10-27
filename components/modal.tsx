"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert, type LucideIcon } from "lucide-react";

// ---------- Tipe ----------

export type JenisModal = "info" | "sukses" | "peringatan" | "galat";

export type OpsiKonfirmasi = {
  judul: string;
  /** String (baris baru dihormati) atau elemen React */
  deskripsi?: ReactNode;
  /** Menentukan ikon dan warna. Awalan: "info" */
  jenis?: JenisModal;
  /** Teks tombol setuju. Awalan: "Lanjutkan" */
  teksSetuju?: string;
  /** Teks tombol batal. Awalan: "Batal". Isi null untuk menyembunyikannya. */
  teksBatal?: string | null;
  /** Tombol setuju berwarna merah (untuk aksi merusak, mis. hapus) */
  bahaya?: boolean;
  /** Klik latar gelap menutup modal (sama dengan batal). Awalan: true */
  tutupDenganLatar?: boolean;
};

export type AksiModal = {
  /** Resolve true bila setuju, false bila batal / Esc / klik latar. */
  konfirmasi: (opsi: OpsiKonfirmasi) => Promise<boolean>;
  /** Modal satu tombol, resolve saat ditutup. */
  pemberitahuan: (opsi: Omit<OpsiKonfirmasi, "teksBatal" | "bahaya">) => Promise<void>;
};

type ItemModal = {
  id: number;
  opsi: OpsiKonfirmasi;
  selesai: (hasil: boolean) => void;
};

// ---------- Gaya ----------

const GAYA: Record<JenisModal, { ikon: LucideIcon; ikonKelas: string }> = {
  sukses: { ikon: CheckCircle2, ikonKelas: "bg-emerald-50 text-emerald-600" },
  galat: { ikon: AlertCircle, ikonKelas: "bg-red-50 text-red-600" },
  info: { ikon: Info, ikonKelas: "bg-blue-50 text-blue-600" },
  peringatan: { ikon: TriangleAlert, ikonKelas: "bg-amber-50 text-amber-600" },
};

// ---------- Kotak modal ----------

function KotakModal({
  item,
  onSelesai,
}: {
  item: ItemModal;
  onSelesai: (hasil: boolean) => void;
}) {
  const { opsi } = item;
  const jenis = opsi.jenis ?? "info";
  const { ikon: Ikon, ikonKelas } = GAYA[jenis];
  const tampilBatal = opsi.teksBatal !== null;

  const [masuk, setMasuk] = useState(false);
  const kotakRef = useRef<HTMLDivElement>(null);
  const setujuRef = useRef<HTMLButtonElement>(null);
  const batalRef = useRef<HTMLButtonElement>(null);
  const idJudul = useId();
  const idDeskripsi = useId();

  // Simpan callback terbaru supaya efek di bawah tidak jalan ulang tiap render
  const selesaiRef = useRef(onSelesai);
  useEffect(() => {
    selesaiRef.current = onSelesai;
  });

  useEffect(() => {
    const sebelumnya = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => setMasuk(true));

    // Aksi merusak: fokus awal di tombol batal agar tidak terpencet tidak sengaja
    const fokusAwal = opsi.bahaya && batalRef.current ? batalRef.current : setujuRef.current;
    fokusAwal?.focus();

    const overflowLama = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        selesaiRef.current(false);
        return;
      }
      if (e.key !== "Tab") return;

      // Jebak fokus di dalam modal
      const fokus = kotakRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])");
      if (!fokus || fokus.length === 0) return;
      const pertama = fokus[0];
      const terakhir = fokus[fokus.length - 1];
      if (e.shiftKey && document.activeElement === pertama) {
        e.preventDefault();
        terakhir.focus();
      } else if (!e.shiftKey && document.activeElement === terakhir) {
        e.preventDefault();
        pertama.focus();
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflowLama;
      sebelumnya?.focus?.();
    };
  }, [opsi.bahaya]);

  const kelasSetuju = opsi.bahaya
    ? "bg-red-600 text-white shadow-md shadow-red-600/20 hover:bg-red-700"
    : "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/25 hover:shadow-lg hover:shadow-orange-500/30";

  return (
    <div
      onClick={() => {
        if (opsi.tutupDenganLatar !== false) onSelesai(false);
      }}
      className={`fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4 transition-opacity duration-200 ${
        masuk ? "opacity-100" : "opacity-0"
      }`}
    >
      <div
        ref={kotakRef}
        role={jenis === "galat" ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={idJudul}
        aria-describedby={opsi.deskripsi ? idDeskripsi : undefined}
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl transition-all duration-200 sm:p-6 ${
          masuk ? "translate-y-0 scale-100" : "translate-y-2 scale-95"
        }`}
      >
        <div className="flex items-start gap-3.5">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ikonKelas}`}
          >
            <Ikon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 id={idJudul} className="text-base font-semibold text-gray-900">
              {opsi.judul}
            </h2>
            {opsi.deskripsi && (
              <div
                id={idDeskripsi}
                className="mt-1.5 max-h-[40vh] overflow-y-auto whitespace-pre-line break-words text-sm text-gray-500"
              >
                {opsi.deskripsi}
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {tampilBatal && (
            <button
              ref={batalRef}
              type="button"
              onClick={() => onSelesai(false)}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              {opsi.teksBatal ?? "Batal"}
            </button>
          )}
          <button
            ref={setujuRef}
            type="button"
            onClick={() => onSelesai(true)}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.98] ${kelasSetuju}`}
          >
            {opsi.teksSetuju ?? "Lanjutkan"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Provider & hook ----------

const ModalContext = createContext<AksiModal | null>(null);

export function ModalProvider({ children }: { children: ReactNode }) {
  // Modal ditampilkan satu per satu; yang lain menunggu di antrian
  const [antrian, setAntrian] = useState<ItemModal[]>([]);
  const penghitung = useRef(0);

  const konfirmasi = useCallback(
    (opsi: OpsiKonfirmasi) =>
      new Promise<boolean>((resolve) => {
        const id = ++penghitung.current;
        setAntrian((a) => [...a, { id, opsi, selesai: resolve }]);
      }),
    []
  );

  const pemberitahuan = useCallback<AksiModal["pemberitahuan"]>(
    (opsi) =>
      konfirmasi({
        ...opsi,
        teksSetuju: opsi.teksSetuju ?? "Mengerti",
        teksBatal: null,
      }).then(() => undefined),
    [konfirmasi]
  );

  const aksi = useMemo<AksiModal>(
    () => ({ konfirmasi, pemberitahuan }),
    [konfirmasi, pemberitahuan]
  );

  const aktif = antrian[0];

  const selesai = useCallback(
    (hasil: boolean) => {
      if (!aktif) return;
      aktif.selesai(hasil);
      setAntrian((a) => a.filter((x) => x.id !== aktif.id));
    },
    [aktif]
  );

  return (
    <ModalContext.Provider value={aksi}>
      {children}
      {aktif && <KotakModal key={aktif.id} item={aktif} onSelesai={selesai} />}
    </ModalContext.Provider>
  );
}

export function useModal(): AksiModal {
  const nilai = useContext(ModalContext);
  if (!nilai) throw new Error("useModal harus dipakai di dalam ModalProvider");
  return nilai;
}