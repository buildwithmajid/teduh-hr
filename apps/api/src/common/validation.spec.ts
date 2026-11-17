import { wouldCreateCycle } from './validation';

describe('wouldCreateCycle', () => {
  // A ← B ← C (A puncak, C bawahan B)
  const parents: Record<string, string | null> = { A: null, B: 'A', C: 'B', D: null };
  const getParent = async (id: string) => parents[id] ?? null;

  it('tidak ada siklus saat memindah ke cabang lain', async () => {
    expect(await wouldCreateCycle('C', 'D', getParent)).toBe(false);
  });

  it('siklus jika atasan baru adalah bawahan sendiri', async () => {
    expect(await wouldCreateCycle('A', 'C', getParent)).toBe(true);
  });

  it('siklus jika atasan baru adalah diri sendiri', async () => {
    expect(await wouldCreateCycle('B', 'B', getParent)).toBe(true);
  });

  it('menghapus atasan (null) tidak pernah siklus', async () => {
    expect(await wouldCreateCycle('B', null, getParent)).toBe(false);
  });
});
