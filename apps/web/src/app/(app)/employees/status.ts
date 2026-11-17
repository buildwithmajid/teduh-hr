import type { EmploymentStatus } from '@/lib/types';

export type EmployeeStatusTone = 'green' | 'gray' | 'red';

export function statusTone(status: EmploymentStatus): EmployeeStatusTone {
  return status === 'active' ? 'green' : status === 'terminated' ? 'red' : 'gray';
}
