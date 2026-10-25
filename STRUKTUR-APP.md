# Struktur Folder `app`, `lib`, dan `public`

```text
app/
├── akun/
│   └── page.tsx
├── auth/
│   └── callback/
│       └── route.ts
├── components/
│   ├── Header.tsx
│   ├── Lencana.tsx
│   ├── Navbar.tsx
│   ├── TeksBerjalan.tsx
│   └── useSesi.ts
├── login/
│   └── page.tsx
├── notifikasi/
│   └── page.tsx
├── owner/
│   ├── daftar/
│   │   └── page.tsx
│   ├── toko/
│   │   └── [id]/
│   │       ├── info/
│   │       │   └── page.tsx
│   │       ├── kasir/
│   │       │   └── page.tsx
│   │       ├── pesanan/
│   │       │   └── page.tsx
│   │       ├── produk/
│   │       │   └── page.tsx
│   │       ├── layout.tsx
│   │       ├── navbar.tsx
│   │       ├── page.tsx
│   │       ├── toko-context.tsx
│   │       └── ui.tsx
│   └── page.tsx
├── pesanan/
│   └── page.tsx
├── apple-icon.png
├── favicon.ico
├── globals.css
├── icon.png
├── layout.tsx
└── page.tsx
```

`owner/toko/[id]` menggunakan segmen dinamis: `[id]` mewakili ID toko.

```text
lib/
└── supabase/
    ├── client.ts
    ├── proxy.ts
    └── server.ts
```

```text
public/
├── icons/
│   ├── icon-192.png
│   ├── icon-512.png
│   ├── icon-maskable-192.png
│   └── icon-maskable-512.png
├── file.svg
├── globe.svg
├── logo.png
├── next.svg
├── vercel.svg
└── window.svg
```
