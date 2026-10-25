// Tipe dan fungsi bantu untuk data profil (tabel profiles)

export type Profil = {
  avatar: string; // profiles.avatar_url
  nama: string; // profiles.full_name
  username: string; // profiles.username
  gender: string; // profiles.gender
  tglLahir: string; // profiles.birth_date (YYYY-MM-DD)
  whatsapp: string; // profiles.whatsapp
  phone: string; // profiles.phone
  penerima: string; // profiles.recipient_name
  alamat: string; // profiles.address_line
  area: string; // profiles.village
  kecamatan: string; // profiles.district
  kota: string; // profiles.city
  provinsi: string; // profiles.province
  kodePos: string; // profiles.postal_code
  negara: string; // profiles.country
  catatan: string; // profiles.address_notes
  maps: string; // profiles.maps_url
  lat: string; // profiles.latitude
  lng: string; // profiles.longitude
  fotoRumah: string; // profiles.house_photo_url
};

export type Galat = Partial<Record<keyof Profil, string>>;

export const PROFIL_KOSONG: Profil = {
  avatar: "",
  nama: "",
  username: "",
  gender: "",
  tglLahir: "",
  whatsapp: "",
  phone: "",
  penerima: "",
  alamat: "",
  area: "",
  kecamatan: "",
  kota: "",
  provinsi: "",
  kodePos: "",
  negara: "Indonesia",
  catatan: "",
  maps: "",
  lat: "",
  lng: "",
  fotoRumah: "",
};

// Kolom yang diambil dari tabel profiles
export const KOLOM_DB =
  "avatar_url, full_name, username, gender, birth_date, whatsapp, phone, recipient_name, address_line, village, district, city, province, postal_code, country, address_notes, maps_url, latitude, longitude, house_photo_url";

// Sesuai constraint profiles.gender: 'male' | 'female' | 'other'
export const OPSI_GENDER = [
  { value: "male", label: "Laki-laki" },
  { value: "female", label: "Perempuan" },
  { value: "other", label: "Lainnya" },
];

// Data yang dianggap "lengkap". Kalau ada yang kosong, tombol "Lengkapi data" muncul.
// Urutkan sesuai urutan tampil di form (kolom pertama yang kosong akan difokuskan).
export const KOLOM_LENGKAP: { key: keyof Profil; label: string }[] = [
  { key: "avatar", label: "Foto profil" },
  { key: "nama", label: "Nama" },
  { key: "whatsapp", label: "Nomor WhatsApp" },
  { key: "alamat", label: "Alamat lengkap" },
  { key: "area", label: "Area" },
  { key: "kecamatan", label: "Kecamatan" },
  { key: "kota", label: "Kota/Kabupaten" },
  { key: "provinsi", label: "Provinsi" },
  { key: "kodePos", label: "Kode pos" },
  { key: "lat", label: "Titik lokasi" },
];

export const kolomKurang = (p: Profil) =>
  KOLOM_LENGKAP.filter((k) => !p[k.key].trim());

// Tampilkan 081234567890 sebagai 0812 3456 7890
export const formatWa = (v: string) =>
  /^0\d+$/.test(v) ? v.replace(/(\d{4})(?=\d)/g, "$1 ") : v;

const teks = (v: unknown) =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : "";

// Baris dari Supabase -> Profil
export function dariDb(row: object | null | undefined, namaCadangan = ""): Profil {
  const r = (row ?? {}) as Record<string, unknown>;
  return {
    avatar: teks(r.avatar_url),
    nama: teks(r.full_name) || namaCadangan,
    username: teks(r.username),
    gender: teks(r.gender),
    tglLahir: teks(r.birth_date),
    whatsapp: teks(r.whatsapp),
    phone: teks(r.phone),
    penerima: teks(r.recipient_name),
    alamat: teks(r.address_line),
    area: teks(r.village),
    kecamatan: teks(r.district),
    kota: teks(r.city),
    provinsi: teks(r.province),
    kodePos: teks(r.postal_code),
    negara: teks(r.country) || "Indonesia",
    catatan: teks(r.address_notes),
    maps: teks(r.maps_url),
    lat: teks(r.latitude),
    lng: teks(r.longitude),
    fotoRumah: teks(r.house_photo_url),
  };
}

// Profil -> baris Supabase (kolom opsional yang kosong disimpan sebagai null)
export function keDb(p: Profil) {
  const n = (v: string) => (v.trim() === "" ? null : v.trim());
  const angka = (v: string) => (v.trim() === "" ? null : Number(v));
  return {
    avatar_url: n(p.avatar),
    full_name: p.nama,
    username: n(p.username),
    gender: n(p.gender),
    birth_date: n(p.tglLahir),
    whatsapp: p.whatsapp,
    phone: n(p.phone),
    recipient_name: n(p.penerima),
    address_line: n(p.alamat),
    village: p.area,
    district: n(p.kecamatan),
    city: n(p.kota),
    province: n(p.provinsi),
    postal_code: n(p.kodePos),
    country: p.negara || "Indonesia", // kolom not null
    address_notes: n(p.catatan),
    maps_url: n(p.maps),
    latitude: angka(p.lat),
    longitude: angka(p.lng),
    house_photo_url: n(p.fotoRumah),
  };
}

// Rapikan spasi sebelum divalidasi dan disimpan
export function bersihkan(p: Profil): Profil {
  const t = Object.fromEntries(
    Object.entries(p).map(([k, v]) => [k, (v as string).trim()])
  ) as Profil;
  return {
    ...t,
    whatsapp: t.whatsapp.replace(/[\s-]/g, ""),
    phone: t.phone.replace(/[\s-]/g, ""),
    lat: t.lat.replace(",", "."),
    lng: t.lng.replace(",", "."),
  };
}

export function validasi(p: Profil): Galat {
  const e: Galat = {};

  if (p.nama.length < 3) e.nama = "Nama minimal 3 huruf";

  // DB: username minimal 3 karakter dan unik
  if (p.username && !/^[a-zA-Z0-9_.]{3,20}$/.test(p.username))
    e.username = "3-20 karakter: huruf, angka, titik, atau garis bawah";

  if (p.tglLahir) {
    const d = new Date(p.tglLahir);
    if (Number.isNaN(d.getTime()) || d > new Date() || d.getFullYear() < 1900)
      e.tglLahir = "Tanggal lahir tidak valid";
  }

  if (!/^(\+62|62|0)8[1-9][0-9]{6,10}$/.test(p.whatsapp))
    e.whatsapp = "Nomor WhatsApp tidak valid, contoh: 0812 3456 7890";

  // DB: ^\+?[0-9]{9,15}$
  if (p.phone && !/^\+?[0-9]{9,15}$/.test(p.phone))
    e.phone = "Nomor telepon 9-15 angka, boleh diawali +";

  if (!p.area) e.area = "Isi area sekitarmu";

  // DB: ^[0-9]{5}$
  if (p.kodePos && !/^\d{5}$/.test(p.kodePos))
    e.kodePos = "Kode pos terdiri dari 5 angka";

  if (!p.negara) e.negara = "Negara tidak boleh kosong";

  if (p.maps && !/^https?:\/\//i.test(p.maps))
    e.maps = "Tautan harus diawali http:// atau https://";

  // DB: latitude -90..90, longitude -180..180
  if (p.lat || p.lng) {
    if (!p.lat) e.lat = "Isi garis lintang (latitude)";
    else if (!Number.isFinite(Number(p.lat)) || Math.abs(Number(p.lat)) > 90)
      e.lat = "Lintang harus berupa angka antara -90 dan 90";

    if (!p.lng) e.lng = "Isi garis bujur (longitude)";
    else if (!Number.isFinite(Number(p.lng)) || Math.abs(Number(p.lng)) > 180)
      e.lng = "Bujur harus berupa angka antara -180 dan 180";
  }

  return e;
}