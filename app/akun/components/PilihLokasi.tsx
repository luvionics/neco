"use client";

import { useState } from "react";
import { ExternalLink, Loader2, LocateFixed } from "lucide-react";
import Bidang, { PesanGalat, kelasInput } from "./Bidang";

type Props = {
  lat: string;
  lng: string;
  kosong?: boolean;
  galatLat?: string;
  galatLng?: string;
  onChange: (lat: string, lng: string) => void;
};

export default function PilihLokasi({
  lat,
  lng,
  kosong,
  galatLat,
  galatLng,
  onChange,
}: Props) {
  const [mencari, setMencari] = useState(false);
  const [pesan, setPesan] = useState("");

  const pakaiLokasi = () => {
    if (!("geolocation" in navigator)) {
      setPesan("Perangkatmu tidak mendukung pengambilan lokasi");
      return;
    }
    setMencari(true);
    setPesan("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange(pos.coords.latitude.toFixed(6), pos.coords.longitude.toFixed(6));
        setMencari(false);
      },
      (err) => {
        setMencari(false);
        setPesan(
          err.code === err.PERMISSION_DENIED
            ? "Izin lokasi ditolak. Aktifkan izin lokasi di pengaturan browser"
            : "Lokasi tidak dapat ditemukan, coba lagi"
        );
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const adaTitik =
    lat !== "" &&
    lng !== "" &&
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lng));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={pakaiLokasi}
          disabled={mencari}
          className="flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-xs font-medium text-orange-600 transition-colors hover:bg-orange-100 disabled:opacity-60"
        >
          {mencari ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <LocateFixed className="h-3.5 w-3.5" />
          )}
          Gunakan lokasi saya
        </button>
        {adaTitik && (
          <a
            href={`https://www.google.com/maps?q=${lat},${lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs font-medium text-gray-500 transition-colors hover:text-orange-600"
          >
            Lihat di peta
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
      {pesan && <PesanGalat>{pesan}</PesanGalat>}

      <div className="grid gap-4 md:grid-cols-2">
        <Bidang id="f-lat" label="Lintang (latitude)" kosong={kosong} galat={galatLat}>
          <input
            id="f-lat"
            inputMode="decimal"
            value={lat}
            onChange={(e) => onChange(e.target.value, lng)}
            placeholder="-7.257472"
            className={kelasInput(!!galatLat, kosong)}
          />
        </Bidang>
        <Bidang id="f-lng" label="Bujur (longitude)" galat={galatLng}>
          <input
            id="f-lng"
            inputMode="decimal"
            value={lng}
            onChange={(e) => onChange(lat, e.target.value)}
            placeholder="112.752090"
            className={kelasInput(!!galatLng)}
          />
        </Bidang>
      </div>
    </div>
  );
}