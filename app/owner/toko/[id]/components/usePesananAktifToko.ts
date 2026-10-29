"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  EVENT_PESANAN,
  STATUS_AKTIF,
} from "@/app/components/usePesananAktif";

const POLLING_MS = 60000;

/** Jumlah pesanan aktif untuk satu toko (sisi pemilik/staf). */
export function usePesananAktifToko(shopId: string) {
  const supabase = useMemo(() => createClient(), []);
  const idKanal = useId();
  const [jumlah, setJumlah] = useState(0);

  const hitung = useCallback(async () => {
    const { count, error } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .in("status", STATUS_AKTIF);
    // Jika galat, pertahankan angka sebelumnya
    if (!error) setJumlah(count ?? 0);
  }, [supabase, shopId]);

  useEffect(() => {
    if (!shopId) return;
    void hitung();

    const kanal = supabase
      .channel(`badge-pesanan-toko:${shopId}:${idKanal}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `shop_id=eq.${shopId}`,
        },
        () => void hitung()
      )
      .subscribe();

    const saatBerubah = () => void hitung();
    window.addEventListener(EVENT_PESANAN, saatBerubah);

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void hitung();
    }, POLLING_MS);

    return () => {
      void supabase.removeChannel(kanal);
      window.removeEventListener(EVENT_PESANAN, saatBerubah);
      clearInterval(timer);
    };
  }, [supabase, shopId, idKanal, hitung]);

  return jumlah;
}