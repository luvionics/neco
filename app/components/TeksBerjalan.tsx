import { Megaphone } from "lucide-react";

// Keterangan seputar pencarian, bisa diganti lewat prop `teks`
const TEKS_BAWAAN = [
  "Mau cari toko? Buka Beranda lalu pilih kategori toko",
  "Persempit pencarian toko lewat pilihan Jarak dan Area",
  "Urutkan toko berdasarkan terdekat, rating, atau produk terbanyak",
  "Cari pesananmu lewat tab Berlangsung, Selesai, atau Dibatalkan",
  "Cek jam buka toko sebelum memesan",
  "Toko bertanda centang biru sudah terverifikasi",
  "Pesan lagi dari toko langgananmu lewat tombol Pesan lagi",
  "Tidak menemukan yang dicari? Hubungi toko langsung lewat WhatsApp",
];

type Props = {
  teks?: string[];
  detik?: number; // durasi satu putaran penuh
  className?: string;
};

export default function TeksBerjalan({
  teks = TEKS_BAWAAN,
  detik = 40,
  className = "",
}: Props) {
  return (
    <div
      role="marquee"
      aria-label="Keterangan pencarian"
      className={`flex items-center gap-2.5 overflow-hidden rounded-xl bg-white/15 px-3 py-2.5 text-sm text-white ring-1 ring-white/20 ${className}`}
    >
      <Megaphone className="h-4 w-4 shrink-0" aria-hidden="true" />

      <div className="min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]">
        <div
          className="neco-marquee flex w-max"
          style={{ animationDuration: `${detik}s` }}
        >
          {/* Daftar diduplikasi agar putarannya mulus tanpa jeda */}
          {[0, 1].map((salinan) => (
            <ul
              key={salinan}
              aria-hidden={salinan === 1}
              className="flex shrink-0 items-center"
            >
              {teks.map((t) => (
                <li key={t} className="flex items-center whitespace-nowrap">
                  <span className="px-4">{t}</span>
                  <span className="h-1 w-1 rounded-full bg-white/60" />
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes neco-marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .neco-marquee {
          animation: neco-marquee linear infinite;
        }
        .neco-marquee:hover {
          animation-play-state: paused;
        }
        @media (prefers-reduced-motion: reduce) {
          .neco-marquee { animation: none; }
        }
      `}</style>
    </div>
  );
}