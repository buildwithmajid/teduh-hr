'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useAuth } from './auth';
import type { Department, EmployeeSummary, Paged, Position, Role, SalaryComponent, WorkLocation } from './types';

export const qk = {
  departments: ['departments'] as const,
  positions: ['positions'] as const,
  locations: ['work-locations'] as const,
  employees: ['employees'] as const,
  employee: (id: string) => ['employees', id] as const,
  salaryComponents: ['salary-components'] as const,
  roles: ['roles'] as const,
  users: ['users'] as const,
};

export function useDepartments() {
  const { can } = useAuth();
  return useQuery({
    queryKey: qk.departments,
    queryFn: () => api.get<Department[]>('/departments'),
    enabled: can('department.view'),
  });
}

export function usePositions() {
  const { can } = useAuth();
  return useQuery({
    queryKey: qk.positions,
    queryFn: () => api.get<Position[]>('/positions'),
    enabled: can('department.view'),
  });
}

export function useWorkLocations() {
  const { can } = useAuth();
  return useQuery({
    queryKey: qk.locations,
    queryFn: () => api.get<WorkLocation[]>('/work-locations'),
    enabled: can('location.view'),
  });
}

/** Karyawan aktif untuk pilihan atasan / kepala departemen (maks 100). */
export function useActiveEmployees(enabled = true) {
  const { can } = useAuth();
  return useQuery({
    queryKey: [...qk.employees, 'active-options'],
    queryFn: () => api.get<Paged<EmployeeSummary>>('/employees?status=active&pageSize=100'),
    enabled: enabled && can('employee.view'),
    select: (d) => d.items,
  });
}

export function useSalaryComponents() {
  const { can } = useAuth();
  return useQuery({
    queryKey: qk.salaryComponents,
    queryFn: () => api.get<SalaryComponent[]>('/salary-components'),
    enabled: can('salary.view'),
  });
}

export function useRoles() {
  const { can } = useAuth();
  return useQuery({ queryKey: qk.roles, queryFn: () => api.get<Role[]>('/roles'), enabled: can('user.manage') });
}
