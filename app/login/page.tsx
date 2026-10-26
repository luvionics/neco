// kode login
"use client";

import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  User,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Mode = "masuk" | "daftar";

const INPUT =
  "w-full rounded-xl border border-gray-200 bg-gray-50/70 py-3 pl-10 pr-3.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-500/10";

const TOMBOL_UTAMA =
  "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/25 transition-all hover:shadow-lg hover:shadow-orange-500/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70";

// Terjemahkan pesan galat Supabase ke bahasa Indonesia
function terjemahkan(pesan: string) {
  const p = pesan.toLowerCase();
  if (p.includes("invalid login credentials"))
    return "Email atau kata sandi salah";
  if (p.includes("email not confirmed"))
    return "Email belum dikonfirmasi. Cek kotak masuk emailmu";
  if (p.includes("already registered"))
    return "Email ini sudah terdaftar, silakan masuk";
  if (p.includes("rate limit"))
    return "Terlalu banyak percobaan, coba lagi beberapa menit lagi";
  if (p.includes("password should be"))
    return "Kata sandi minimal 6 karakter";
  return "Terjadi kesalahan, coba lagi";
}

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("masuk");
  const [nama, setNama] = useState("");
  const [email, setEmail] = useState("");
  const [sandi, setSandi] = useState("");
  const [lihat, setLihat] = useState(false);
  const [galat, setGalat] = useState("");
  const [info, setInfo] = useState("");
  const [proses, setProses] = useState(false);

  // Galat dari link konfirmasi email (lihat app/auth/callback/route.ts)
  useEffect(() => {
    const galatUrl = new URLSearchParams(window.location.search).get("galat");
    if (galatUrl === "konfirmasi") {
      setGalat(
        "Link konfirmasi tidak valid atau sudah kedaluwarsa. Coba masuk atau daftar lagi"
      );
    }
  }, []);

  const ganti = (m: Mode) => {
    setMode(m);
    setGalat("");
    setInfo("");
  };

  const kirim = async (e: FormEvent) => {
    e.preventDefault();
    setGalat("");
    setInfo("");

    const mail = email.trim();
    if (mode === "daftar" && nama.trim().length < 3) {
      setGalat("Nama minimal 3 huruf");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(mail)) {
      setGalat("Format email tidak valid");
      return;
    }
    if (sandi.length < 6) {
      setGalat("Kata sandi minimal 6 karakter");
      return;
    }

    setProses(true);
    const supabase = createClient();

    try {
      if (mode === "masuk") {
        const { error } = await supabase.auth.signInWithPassword({
          email: mail,
          password: sandi,
        });
        if (error) throw error;
        window.location.assign("/");
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: mail,
        password: sandi,
        options: {
          data: { nama: nama.trim() },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;

      // Konfirmasi email dimatikan: langsung login
      if (data.session) {
        window.location.assign("/");
        return;
      }

      // Email sudah terdaftar (Supabase mengembalikan user tanpa identitas)
      if (data.user?.identities?.length === 0) {
        setGalat("Email ini sudah terdaftar, silakan masuk");
        return;
      }

      setInfo(
        `Kami mengirim link konfirmasi ke ${mail}. Buka emailmu lalu klik link tersebut untuk mengaktifkan akun.`
      );
    } catch (err) {
      setGalat(terjemahkan(err instanceof Error ? err.message : ""));
    } finally {
      setProses(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-orange-500 via-red-500 to-pink-500 px-4 py-10">
      {/* Hiasan latar */}
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-white/10" />

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <a
          href="/"
          className="mb-6 flex flex-col items-center gap-2 text-center text-white"
        >
          <span className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white p-1.5 shadow-lg shadow-black/10">
              <Image
                src="/logo.png"
                alt="Necoku"
                width={48}
                height={48}
                className="h-full w-full object-contain"
              />
            </span>
            <span className="text-3xl font-extrabold tracking-widest">Necoku</span>
          </span>
          <span className="text-sm text-white/90">
            Belanja dari toko tetanggamu
          </span>
        </a>

        {/* Kartu */}
        <div className="space-y-5 rounded-3xl bg-white p-6 shadow-2xl shadow-black/15 md:p-8">
          {/* Pilihan mode */}
          <div
            role="tablist"
            className="grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1"
          >
            {(["masuk", "daftar"] as const).map((m) => {
              const aktif = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={aktif}
                  onClick={() => ganti(m)}
                  className={`rounded-lg py-2 text-sm transition-all ${
                    aktif
                      ? "bg-white font-semibold text-orange-600 shadow-sm"
                      : "font-medium text-gray-500 hover:text-gray-800"
                  }`}
                >
                  {m === "masuk" ? "Masuk" : "Daftar"}
                </button>
              );
            })}
          </div>

          <form onSubmit={kirim} noValidate className="space-y-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {mode === "masuk" ? "Masuk ke akunmu" : "Buat akun baru"}
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                {mode === "masuk"
                  ? "Lihat pesanan dan kelola tokomu."
                  : "Gratis, cukup beberapa detik."}
              </p>
            </div>

            {galat && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-600 ring-1 ring-red-100"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {galat}
              </p>
            )}

            {info && (
              <p
                role="status"
                className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700 ring-1 ring-emerald-100"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                {info}
              </p>
            )}

            {mode === "daftar" && (
              <div className="space-y-1.5">
                <label htmlFor="nama" className="block text-sm font-medium text-gray-700">
                  Nama
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    id="nama"
                    autoComplete="name"
                    value={nama}
                    onChange={(e) => setNama(e.target.value)}
                    placeholder="Nama lengkapmu"
                    className={INPUT}
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@email.com"
                  className={INPUT}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="sandi" className="block text-sm font-medium text-gray-700">
                Kata sandi
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  id="sandi"
                  type={lihat ? "text" : "password"}
                  autoComplete={mode === "masuk" ? "current-password" : "new-password"}
                  value={sandi}
                  onChange={(e) => setSandi(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  className={`${INPUT} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setLihat((v) => !v)}
                  aria-label={lihat ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                >
                  {lihat ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={proses}
              className={`mt-1 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold ${TOMBOL_UTAMA}`}
            >
              {proses && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "masuk" ? "Masuk" : "Daftar"}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500">
            {mode === "masuk" ? "Belum punya akun?" : "Sudah punya akun?"}{" "}
            <button
              type="button"
              onClick={() => ganti(mode === "masuk" ? "daftar" : "masuk")}
              className="font-semibold text-orange-600 hover:text-orange-700"
            >
              {mode === "masuk" ? "Daftar sekarang" : "Masuk"}
            </button>
          </p>
        </div>

        <p className="mt-6 text-center text-sm">
          <a
            href="/"
            className="text-white/90 transition-colors hover:text-white"
          >
            ← Kembali ke beranda
          </a>
        </p>
      </div>
    </div>
  );
}
