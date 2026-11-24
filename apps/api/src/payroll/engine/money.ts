import { RoundingMode } from '@prisma/client';

export type Rupiah = number;
export type RoundingFn = (value: number) => Rupiah;

/**
 * Aritmetika pembulatan integer rupiah.
 * Menggunakan epsilon kecil (1e-9) untuk menghindari bias representasi IEEE-754
 * (misal 466763.50000000006 atau 187053.25999999998).
 */
export function makeRounding(mode: RoundingMode = 'round_half_up'): RoundingFn {
  switch (mode) {
    case 'floor':
      return (v) => Math.floor(v + 1e-9);
    case 'ceil':
      return (v) => Math.ceil(v - 1e-9);
    case 'round_half_up':
    default:
      return (v) => {
        if (v >= 0) return Math.floor(v + 0.5 + 1e-9);
        return -Math.floor(-v + 0.5 + 1e-9);
      };
  }
}

/** Pembulatan ke bawah ke ribuan penuh untuk PKP (Pasal 17 ayat 4 UU PPh). */
export function floorThousands(value: number): Rupiah {
  if (value <= 0) return 0;
  return Math.floor(value / 1000) * 1000;
}

export function assertRupiah(value: number, label: string): Rupiah {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} harus integer rupiah (didapat ${value})`);
  }
  return value;
}
