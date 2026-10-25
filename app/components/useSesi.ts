// kode hook status login
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type StatusSesi = "memuat" | "masuk" | "keluar";

export function useSesi(): StatusSesi {
  const [status, setStatus] = useState<StatusSesi>("memuat");

  useEffect(() => {
    const supabase = createClient();

    // Terpanggil sekali saat halaman dibuka, lalu setiap login/logout
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setStatus(session ? "masuk" : "keluar");
    });

    return () => subscription.unsubscribe();
  }, []);

  return status;
}
