"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Download, WifiOff, X } from "lucide-react";
// Sesuaikan path import ini dengan lokasi client.ts milikmu
import { createClient } from "@/lib/supabase/client";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const MIN_ACCOUNT_AGE_MS = 24 * 60 * 60 * 1000; // akun minimal 1 hari
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000; // ditunda 3 hari

export default function PwaRegister() {
  const supabase = useMemo(() => createClient(), []);
  const userIdRef = useRef<string | null>(null);

  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [eligible, setEligible] = useState(false);
  const [closed, setClosed] = useState(false);
  const [offline, setOffline] = useState(false);

  // Registrasi service worker (hanya production agar dev tidak ikut ter-cache).
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    let reloaded = false;
    const onControllerChange = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          worker?.addEventListener("statechange", () => {
            if (
              worker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              worker.postMessage("SKIP_WAITING");
            }
          });
        });
      })
      .catch((err) => console.error("Gagal mendaftarkan service worker:", err));

    // Hanya muat ulang saat SW baru mengambil alih dari SW lama.
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        onControllerChange
      );
    }
    return () =>
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange
      );
  }, []);

  // Tangkap event install dari browser.
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstallEvent(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Cek syarat tampil: sudah login, akun >= 1 hari, penundaan sudah lewat.
  useEffect(() => {
    // Sudah dibuka sebagai aplikasi terpasang -> tidak perlu modal.
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    async function checkEligibility(userId: string) {
      const { data, error } = await supabase
        .from("profiles")
        .select("created_at, install_prompt_snooze_until")
        .eq("id", userId)
        .single();

      if (error || !data) {
        setEligible(false);
        return;
      }

      const oldEnough =
        Date.now() - new Date(data.created_at).getTime() >= MIN_ACCOUNT_AGE_MS;
      const snoozeOver =
        !data.install_prompt_snooze_until ||
        new Date(data.install_prompt_snooze_until).getTime() <= Date.now();

      setEligible(oldEnough && snoozeOver);
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const userId = session?.user?.id ?? null;
      userIdRef.current = userId;

      if (!userId) {
        setEligible(false);
        return;
      }
      // Jangan await query Supabase langsung di dalam callback ini.
      setTimeout(() => checkEligibility(userId), 0);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  // Indikator offline.
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const showModal = !!installEvent && eligible && !closed;

  // Tutup modal dan simpan penundaan 3 hari ke Supabase.
  async function snooze() {
    setClosed(true);
    const userId = userIdRef.current;
    if (!userId) return;

    const until = new Date(Date.now() + SNOOZE_MS).toISOString();
    const { data, error } = await supabase
      .from("profiles")
      .update({ install_prompt_snooze_until: until })
      .eq("id", userId)
      .select("id");

    if (error) {
      console.error("Gagal menyimpan penundaan modal install:", error);
    } else if (!data || data.length === 0) {
      console.warn(
        "Penundaan tidak tersimpan (0 baris ter-update). Cek policy UPDATE di tabel profiles."
      );
    }
  }

  async function handleInstall() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    setInstallEvent(null);
    // Kalau pengguna menolak di dialog bawaan browser, tunda juga.
    if (choice.outcome === "dismissed") await snooze();
  }

  // Tutup dengan tombol Escape.
  useEffect(() => {
    if (!showModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") snooze();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showModal]);

  return (
    <>
      {offline && (
        <div
          role="status"
          className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 bg-gray-900 px-4 py-2 text-sm font-medium text-white"
        >
          <WifiOff size={16} />
          Anda sedang offline. Data terbaru belum bisa dimuat.
        </div>
      )}

      {showModal && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4"
          onClick={snooze}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-title"
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl"
          >
            <button
              onClick={snooze}
              aria-label="Tutup"
              className="absolute right-3 top-3 rounded-lg p-1 text-gray-400 hover:text-gray-600"
            >
              <X size={18} />
            </button>

            <Image
              src="/icons/icon-192.png"
              alt=""
              width={64}
              height={64}
              className="mx-auto h-16 w-16 rounded-2xl"
            />
            <h2
              id="install-title"
              className="mt-4 text-lg font-bold text-gray-900"
            >
              Pasang NECOKU
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Akses lebih cepat langsung dari layar utama.
            </p>

            <button
              onClick={handleInstall}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-600"
            >
              <Download size={16} />
              Pasang Sekarang
            </button>
            <button
              onClick={snooze}
              className="mt-2 w-full rounded-xl px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              Nanti saja
            </button>
          </div>
        </div>
      )}
    </>
  );
}