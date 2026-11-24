import { OvertimeDayType, WorkPattern } from '@prisma/client';
import { RateSet, TerCategory, TerRateRow } from '../../engine/types';

/**
 * Data seed awal tarif regulasi Indonesia (PP 58/2023 TER, UU HPP Pasal 17, BPJS 2024, PP 35/2021).
 * Hanya dipakai untuk mengisi database pertama kali; sumber kebenaran runtime = tabel DB.
 */
export const EFFECTIVE_DATE_2024 = '2024-01-01';

const buildTer = (kategori: TerCategory, tiers: [number | null, number][]): TerRateRow[] => {
  const rows: TerRateRow[] = [];
  let prevUpper = -1;
  for (const [upper, rate] of tiers) {
    const batasBawah = prevUpper === -1 ? 0 : prevUpper + 1;
    rows.push({ kategori, batasBawah, batasAtas: upper, tarif: rate });
    if (upper !== null) prevUpper = upper;
  }
  return rows;
};

// Lampiran PP 58/2023 — Kategori A (TK/0, TK/1, K/0)
const TER_A = buildTer('A', [
  [5_400_000, 0],
  [5_650_000, 0.0025],
  [5_950_000, 0.005],
  [6_300_000, 0.0075],
  [6_750_000, 0.01],
  [7_500_000, 0.0125],
  [8_550_000, 0.015],
  [9_650_000, 0.0175],
  [10_050_000, 0.02],
  [10_350_000, 0.0225],
  [10_700_000, 0.025],
  [11_050_000, 0.03],
  [11_600_000, 0.035],
  [12_500_000, 0.04],
  [13_750_000, 0.05],
  [15_100_000, 0.06],
  [16_950_000, 0.07],
  [19_750_000, 0.08],
  [24_150_000, 0.09],
  [26_450_000, 0.1],
  [28_000_000, 0.11],
  [30_050_000, 0.12],
  [32_400_000, 0.13],
  [35_400_000, 0.14],
  [39_100_000, 0.15],
  [43_850_000, 0.16],
  [47_800_000, 0.17],
  [51_400_000, 0.18],
  [56_300_000, 0.19],
  [62_200_000, 0.2],
  [68_600_000, 0.21],
  [77_500_000, 0.22],
  [89_000_000, 0.23],
  [103_000_000, 0.24],
  [125_000_000, 0.25],
  [157_000_000, 0.26],
  [206_000_000, 0.27],
  [337_000_000, 0.28],
  [454_000_000, 0.29],
  [550_000_000, 0.3],
  [695_000_000, 0.31],
  [910_000_000, 0.32],
  [1_400_000_000, 0.33],
  [null, 0.34],
]);

// Lampiran PP 58/2023 — Kategori B (TK/2, TK/3, K/1, K/2)
const TER_B = buildTer('B', [
  [6_200_000, 0],
  [6_500_000, 0.0025],
  [6_850_000, 0.005],
  [7_300_000, 0.0075],
  [9_200_000, 0.01],
  [10_750_000, 0.015],
  [11_250_000, 0.02],
  [11_600_000, 0.025],
  [12_600_000, 0.03],
  [13_600_000, 0.04],
  [14_950_000, 0.05],
  [16_400_000, 0.06],
  [18_450_000, 0.07],
  [21_850_000, 0.08],
  [26_000_000, 0.09],
  [27_700_000, 0.1],
  [29_350_000, 0.11],
  [31_450_000, 0.12],
  [33_950_000, 0.13],
  [37_100_000, 0.14],
  [41_100_000, 0.15],
  [45_800_000, 0.16],
  [49_500_000, 0.17],
  [53_800_000, 0.18],
  [58_500_000, 0.19],
  [64_000_000, 0.2],
  [71_000_000, 0.21],
  [80_000_000, 0.22],
  [93_000_000, 0.23],
  [109_000_000, 0.24],
  [129_000_000, 0.25],
  [163_000_000, 0.26],
  [211_000_000, 0.27],
  [374_000_000, 0.28],
  [459_000_000, 0.29],
  [555_000_000, 0.3],
  [704_000_000, 0.31],
  [957_000_000, 0.32],
  [1_405_000_000, 0.33],
  [null, 0.34],
]);

// Lampiran PP 58/2023 — Kategori C (K/3)
const TER_C = buildTer('C', [
  [6_600_000, 0],
  [6_950_000, 0.0025],
  [7_350_000, 0.005],
  [7_800_000, 0.0075],
  [8_850_000, 0.01],
  [9_800_000, 0.0125],
  [10_950_000, 0.015],
  [11_200_000, 0.0175],
  [12_050_000, 0.02],
  [12_950_000, 0.03],
  [14_150_000, 0.04],
  [15_550_000, 0.05],
  [17_050_000, 0.06],
  [19_500_000, 0.07],
  [22_700_000, 0.08],
  [26_600_000, 0.09],
  [28_100_000, 0.1],
  [30_100_000, 0.11],
  [32_600_000, 0.12],
  [35_400_000, 0.13],
  [38_900_000, 0.14],
  [43_000_000, 0.15],
  [47_400_000, 0.16],
  [51_200_000, 0.17],
  [55_800_000, 0.18],
  [60_400_000, 0.19],
  [66_700_000, 0.2],
  [74_500_000, 0.21],
  [83_200_000, 0.22],
  [95_600_000, 0.23],
  [110_400_000, 0.24],
  [134_000_000, 0.25],
  [169_000_000, 0.26],
  [221_000_000, 0.27],
  [390_000_000, 0.28],
  [463_000_000, 0.29],
  [561_000_000, 0.3],
  [709_000_000, 0.31],
  [965_000_000, 0.32],
  [1_419_000_000, 0.33],
  [null, 0.34],
]);

export const OVERTIME_RULES_PP35: {
  workPattern: WorkPattern;
  dayType: OvertimeDayType;
  hourFrom: number;
  hourTo: number | null;
  multiplier: number;
}[] = [
  // Hari kerja biasa (5 hari & 6 hari sama)
  { workPattern: 'FIVE_DAY', dayType: 'workday', hourFrom: 1, hourTo: 1, multiplier: 1.5 },
  { workPattern: 'FIVE_DAY', dayType: 'workday', hourFrom: 2, hourTo: null, multiplier: 2.0 },
  { workPattern: 'SIX_DAY', dayType: 'workday', hourFrom: 1, hourTo: 1, multiplier: 1.5 },
  { workPattern: 'SIX_DAY', dayType: 'workday', hourFrom: 2, hourTo: null, multiplier: 2.0 },
  // Hari istirahat / libur — 5 hari kerja
  { workPattern: 'FIVE_DAY', dayType: 'rest_day', hourFrom: 1, hourTo: 8, multiplier: 2.0 },
  { workPattern: 'FIVE_DAY', dayType: 'rest_day', hourFrom: 9, hourTo: 9, multiplier: 3.0 },
  { workPattern: 'FIVE_DAY', dayType: 'rest_day', hourFrom: 10, hourTo: 12, multiplier: 4.0 },
  { workPattern: 'FIVE_DAY', dayType: 'holiday', hourFrom: 1, hourTo: 8, multiplier: 2.0 },
  { workPattern: 'FIVE_DAY', dayType: 'holiday', hourFrom: 9, hourTo: 9, multiplier: 3.0 },
  { workPattern: 'FIVE_DAY', dayType: 'holiday', hourFrom: 10, hourTo: 12, multiplier: 4.0 },
  // Hari istirahat / libur — 6 hari kerja
  { workPattern: 'SIX_DAY', dayType: 'rest_day', hourFrom: 1, hourTo: 7, multiplier: 2.0 },
  { workPattern: 'SIX_DAY', dayType: 'rest_day', hourFrom: 8, hourTo: 8, multiplier: 3.0 },
  { workPattern: 'SIX_DAY', dayType: 'rest_day', hourFrom: 9, hourTo: 11, multiplier: 4.0 },
  { workPattern: 'SIX_DAY', dayType: 'holiday', hourFrom: 1, hourTo: 7, multiplier: 2.0 },
  { workPattern: 'SIX_DAY', dayType: 'holiday', hourFrom: 8, hourTo: 8, multiplier: 3.0 },
  { workPattern: 'SIX_DAY', dayType: 'holiday', hourFrom: 9, hourTo: 11, multiplier: 4.0 },
  // 6 hari kerja — libur di hari kerja terpendek
  { workPattern: 'SIX_DAY', dayType: 'holiday_shortest_day', hourFrom: 1, hourTo: 5, multiplier: 2.0 },
  { workPattern: 'SIX_DAY', dayType: 'holiday_shortest_day', hourFrom: 6, hourTo: 6, multiplier: 3.0 },
  { workPattern: 'SIX_DAY', dayType: 'holiday_shortest_day', hourFrom: 7, hourTo: 9, multiplier: 4.0 },
];

export const INDONESIA_2024_RATE_SET: RateSet = {
  effectiveAsOf: EFFECTIVE_DATE_2024,
  terRates: [...TER_A, ...TER_B, ...TER_C],
  ptkpRates: {
    'TK/0': { status: 'TK/0', amountPerYear: 54_000_000, terCategory: 'A' },
    'TK/1': { status: 'TK/1', amountPerYear: 58_500_000, terCategory: 'A' },
    'K/0': { status: 'K/0', amountPerYear: 58_500_000, terCategory: 'A' },
    'TK/2': { status: 'TK/2', amountPerYear: 63_000_000, terCategory: 'B' },
    'K/1': { status: 'K/1', amountPerYear: 63_000_000, terCategory: 'B' },
    'TK/3': { status: 'TK/3', amountPerYear: 67_500_000, terCategory: 'B' },
    'K/2': { status: 'K/2', amountPerYear: 67_500_000, terCategory: 'B' },
    'K/3': { status: 'K/3', amountPerYear: 72_000_000, terCategory: 'C' },
  },
  progressiveBrackets: [
    { batasBawah: 0, batasAtas: 60_000_000, tarif: 0.05 },
    { batasBawah: 60_000_001, batasAtas: 250_000_000, tarif: 0.15 },
    { batasBawah: 250_000_001, batasAtas: 500_000_000, tarif: 0.25 },
    { batasBawah: 500_000_001, batasAtas: 5_000_000_000, tarif: 0.3 },
    { batasBawah: 5_000_000_001, batasAtas: null, tarif: 0.35 },
  ],
  biayaJabatan: { pct: 0.05, maxPerMonth: 500_000 },
  bpjs: {
    kesehatan: { companyPct: 0.04, employeePct: 0.01, extraFamilyPct: 0.01, wageCap: 12_000_000 },
    jht: { companyPct: 0.037, employeePct: 0.02 },
    jkkByRiskClass: {
      I: { companyPct: 0.0024 },
      II: { companyPct: 0.0054 },
      III: { companyPct: 0.0089 },
      IV: { companyPct: 0.0127 },
      V: { companyPct: 0.0174 },
    },
    jkm: { companyPct: 0.003 },
    jp: { companyPct: 0.02, employeePct: 0.01, wageCap: 10_042_300 },
  },
  overtimeRules: OVERTIME_RULES_PP35,
};
