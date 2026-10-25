// kode komponen lencana (angka belum dibaca)
export default function Lencana({
  jumlah,
  kelas,
}: {
  jumlah: number;
  kelas: string;
}) {
  if (jumlah <= 0) return null;
  return (
    <span
      className={`absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none ${kelas}`}
    >
      {jumlah > 9 ? "9+" : jumlah}
      <span className="sr-only"> belum dibaca</span>
    </span>
  );
}