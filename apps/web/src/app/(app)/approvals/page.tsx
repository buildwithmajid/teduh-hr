'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Paperclip, X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { AttachmentPreviewModal } from '@/components/attachment-upload';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  ModalActions,
  PageHeader,
  Table,
  TableSkeleton,
  Td,
  Textarea,
  Th,
  useToast,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, LABELS } from '@/lib/format';
import type { ApprovalRequestType, PendingApproval } from '@/lib/types';

function endpointFor(type: ApprovalRequestType, id: string, action: 'approve' | 'reject'): string {
  if (type === 'leave') return `/leaves/requests/${id}/${action}`;
  if (type === 'overtime') return `/overtime/${id}/${action}`;
  if (type === 'reimbursement') return `/reimbursements/${id}/${action}`;
  return `/attendance/corrections/${id}/${action}`;
}

export default function ApprovalsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [target, setTarget] = useState<{ item: PendingApproval; action: 'approve' | 'reject' } | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);

  const pending = useQuery({
    queryKey: ['approvals', 'pending'],
    queryFn: () => api.get<PendingApproval[]>('/approvals/pending'),
  });

  const decide = useMutation({
    mutationFn: ({ item, action, notes }: { item: PendingApproval; action: 'approve' | 'reject'; notes?: string }) =>
      api.post(endpointFor(item.requestType, item.requestId, action), notes ? { notes } : {}),
    onSuccess: (_, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['approvals'] });
      void queryClient.invalidateQueries({ queryKey: ['leaves'] });
      void queryClient.invalidateQueries({ queryKey: ['overtime'] });
      void queryClient.invalidateQueries({ queryKey: ['attendance'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      setTarget(null);
      toast(vars.action === 'approve' ? 'Pengajuan disetujui' : 'Pengajuan ditolak');
    },
  });

  return (
    <>
      <PageHeader
        title="Persetujuan"
        description="Daftar pengajuan cuti, lembur, dan koreksi absensi yang menunggu keputusan Anda."
      />

      <Card>
        {pending.isPending ? (
          <TableSkeleton rows={4} cols={5} />
        ) : pending.isError ? (
          <div className="p-4">
            <Alert>{errorMessage(pending.error)}</Alert>
          </div>
        ) : pending.data.length === 0 ? (
          <EmptyState
            title="Tidak ada pengajuan menunggu"
            description="Semua pengajuan tim yang menjadi tanggung jawab Anda sudah diproses."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Pemohon</Th>
                <Th>Pengajuan</Th>
                <Th>Alasan</Th>
                <Th>Tahap</Th>
                <Th className="text-right">Keputusan</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {pending.data.map((item) => (
                <tr key={`${item.requestType}-${item.requestId}`} className="hover:bg-canvas/60">
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={item.employee.fullName} size="sm" />
                      <div>
                        <p className="font-medium text-ink">{item.employee.fullName}</p>
                        <p className="text-xs text-ink-muted">{item.employee.department}</p>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <Badge tone="brand">{LABELS.approvalRequestType[item.requestType]}</Badge>
                      <span className="font-medium text-ink">{item.title}</span>
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-ink-muted">{item.subtitle}</p>
                    <p className="mt-0.5 text-[11px] text-ink-subtle">Diajukan {formatDateTime(item.createdAt)}</p>
                  </Td>
                  <Td className="max-w-xs text-xs text-ink-muted">
                    <p>{item.reason}</p>
                    {item.attachmentKey && (
                      <button
                        type="button"
                        onClick={() => setPreviewKey(item.attachmentKey!)}
                        className="mt-1 inline-flex cursor-pointer items-center gap-1 text-[11px] font-medium text-brand-700 hover:underline"
                      >
                        <Paperclip className="size-3" aria-hidden /> Lihat dokumen bukti
                      </button>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap font-mono text-xs text-ink-muted">
                    Tahap {item.stepOrder}/{item.totalSteps}
                  </Td>
                  <Td className="whitespace-nowrap text-right">
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" variant="secondary" onClick={() => setTarget({ item, action: 'reject' })}>
                        <X className="size-3.5" aria-hidden /> Tolak
                      </Button>
                      <Button size="sm" onClick={() => setTarget({ item, action: 'approve' })}>
                        <Check className="size-3.5" aria-hidden /> Setujui
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={target !== null}
        onClose={() => {
          decide.reset();
          setTarget(null);
        }}
        size="sm"
        title={target?.action === 'approve' ? 'Setujui pengajuan' : 'Tolak pengajuan'}
        description={target ? `${target.item.employee.fullName} — ${target.item.title}` : undefined}
      >
        <form
          className="space-y-4"
          onSubmit={(e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            if (!target) return;
            const notes = String(new FormData(e.currentTarget).get('notes') ?? '').trim();
            decide.mutate({ item: target.item, action: target.action, notes: notes || undefined });
          }}
        >
          {decide.isError && <Alert>{errorMessage(decide.error)}</Alert>}
          <Field label={target?.action === 'reject' ? 'Alasan penolakan' : 'Catatan (opsional)'} required={target?.action === 'reject'}>
            {(id) => <Textarea id={id} name="notes" required={target?.action === 'reject'} maxLength={500} />}
          </Field>
          <ModalActions>
            <Button variant="secondary" onClick={() => setTarget(null)}>Batal</Button>
            <Button type="submit" variant={target?.action === 'reject' ? 'danger' : 'primary'} loading={decide.isPending}>
              {target?.action === 'approve' ? 'Setujui' : 'Tolak'}
            </Button>
          </ModalActions>
        </form>
      </Modal>

      <AttachmentPreviewModal
        attachmentKey={previewKey}
        onClose={() => setPreviewKey(null)}
        title="Pratinjau dokumen bukti"
      />
    </>
  );
}
