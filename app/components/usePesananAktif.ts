"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Status database yang dianggap pesanan aktif (belum selesai/dibatalkan). */
export const STATUS_AKTIF = ["pending", "confirmed", "preparing", "ready", "on_delivery"];

/** Kirim event ini setelah mengubah pesanan agar badge langsung diperbarui. */
export const EVENT_PESANAN = "pesanan:berubah";

const POLLING_MS = 60000;

export function usePesananAktif() {
  const supabase = useMemo(() => createClient(), []);
  // Nama kanal harus unik per pemakai, karena NavDesktop dan NavBawah
  // bisa tampil bersamaan di halaman yang sama.
  const idKanal = useId();

  const [userId, setUserId] = useState<string | null>(null);
  const [jumlah, setJumlah] = useState(0);

  // Ikuti status login
  useEffect(() => {
    let batal = false;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!batal) setUserId(user?.id ?? null);
    });
    const { data: langganan } = supabase.auth.onAuthStateChange(
      (_event, sesi) => setUserId(sesi?.user.id ?? null)
    );
    return () => {
      batal = true;
      langganan.subscription.unsubscribe();
    };
  }, [supabase]);

  const hitung = useCallback(async () => {
    if (!userId) {
      setJumlah(0);
      return;
    }
    const { count, error } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", userId)
      .in("status", STATUS_AKTIF);
    // Jika galat, pertahankan angka sebelumnya
    if (!error) setJumlah(count ?? 0);
  }, [supabase, userId]);

  useEffect(() => {
    void hitung();
  }, [hitung]);

  // Realtime, event manual, dan polling sebagai cadangan
  useEffect(() => {
    if (!userId) return;

    const kanal = supabase
      .channel(`badge-pesanan:${userId}:${idKanal}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `customer_id=eq.${userId}`,
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
  }, [supabase, userId, idKanal, hitung]);

  return jumlah;
}