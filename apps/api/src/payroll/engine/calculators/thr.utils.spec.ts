import { calculateServiceMonths, calculateThr } from './thr.utils';

describe('THR Calculator (Permenaker No. 6/2016)', () => {
  it('returns 0 when service duration is under 1 month', () => {
    const res = calculateThr(
      12_000_000,
      new Date('2026-03-01T00:00:00Z'),
      new Date('2026-03-20T00:00:00Z'),
    );
    expect(res).toEqual({ serviceMonths: 0, eligible: false, isProrated: false, amount: 0 });
  });

  it('prorates proportionally for 1 to 11 full months of service', () => {
    const res = calculateThr(
      12_000_000,
      new Date('2025-10-01T00:00:00Z'),
      new Date('2026-04-01T00:00:00Z'),
    );
    expect(res.serviceMonths).toBe(6);
    expect(res.eligible).toBe(true);
    expect(res.isProrated).toBe(true);
    expect(res.amount).toBe(6_000_000);
  });

  it('pays full 1 month wage for 12+ months of service', () => {
    const res = calculateThr(
      15_500_000,
      new Date('2024-01-15T00:00:00Z'),
      new Date('2026-03-25T00:00:00Z'),
    );
    expect(res.serviceMonths).toBe(26);
    expect(res.eligible).toBe(true);
    expect(res.isProrated).toBe(false);
    expect(res.amount).toBe(15_500_000);
  });

  it('handles day-of-month boundary accurately', () => {
    expect(
      calculateServiceMonths(new Date('2025-04-20T00:00:00Z'), new Date('2026-04-19T00:00:00Z')),
    ).toBe(11);
    expect(
      calculateServiceMonths(new Date('2025-04-20T00:00:00Z'), new Date('2026-04-20T00:00:00Z')),
    ).toBe(12);
  });
});
