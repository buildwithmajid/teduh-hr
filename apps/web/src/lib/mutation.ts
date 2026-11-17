'use client';

import { QueryKey, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui';

/** Mutasi standar: invalidate cache terkait + toast sukses + callback. */
export function useApiMutation<TVars, TResult = unknown>(
  fn: (vars: TVars) => Promise<TResult>,
  opts: { invalidate: QueryKey[]; success?: string | ((r: TResult) => string); onDone?: (r: TResult) => void },
) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result) => {
      for (const key of opts.invalidate) void queryClient.invalidateQueries({ queryKey: key });
      if (opts.success) toast(typeof opts.success === 'function' ? opts.success(result) : opts.success);
      opts.onDone?.(result);
    },
  });
}
