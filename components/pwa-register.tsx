"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Download, WifiOff, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function PwaRegister() {
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
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

  // Tombol pasang aplikasi.
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

  async function handleInstall() {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  }

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

      {installEvent && !dismissed && (
        <div className="fixed inset-x-4 bottom-4 z-[100] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-orange-200 bg-white p-3 shadow-lg">
          <Image
            src="/icons/icon-192.png"
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 rounded-xl"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900">
              Pasang NECOKU
            </p>
            <p className="text-xs text-gray-500">
              Akses lebih cepat dan bisa dipakai offline.
            </p>
          </div>
          <button
            onClick={handleInstall}
            className="flex items-center gap-1 rounded-xl bg-orange-500 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600"
          >
            <Download size={14} />
            Pasang
          </button>
          <button
            onClick={() => setDismissed(true)}
            aria-label="Tutup"
            className="rounded-lg p-1 text-gray-400 hover:text-gray-600"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
}
