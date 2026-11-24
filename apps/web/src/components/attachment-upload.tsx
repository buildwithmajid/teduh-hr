'use client';

import { FileText, Loader2, Paperclip, Trash2, Upload } from 'lucide-react';
import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { ApiError, fetchAttachmentBlob, uploadAttachment } from '@/lib/api';
import { Alert, Button, Modal, Spinner } from './ui';

export function AttachmentUpload({
  value,
  onChange,
  label = 'Unggah bukti (JPG, PNG, WebP, atau PDF · maks. 5 MB)',
}: {
  value: string | null;
  onChange: (key: string | null) => void;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('Ukuran file maksimal 5 MB.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await uploadAttachment(file);
      setFileName(res.originalName);
      onChange(res.key);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal mengunggah file.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-1.5">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={handleFile}
      />
      {value ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs">
          <span className="flex min-w-0 items-center gap-2 text-emerald-900">
            <Paperclip className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate font-medium">{fileName ?? value}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              setFileName(null);
              onChange(null);
            }}
            className="cursor-pointer rounded p-1 text-emerald-800 hover:bg-emerald-100"
            aria-label="Hapus lampiran"
          >
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-line-strong bg-canvas/50 px-3 py-3 text-xs text-ink-muted transition-colors hover:border-brand-500 hover:bg-brand-50/30 hover:text-ink disabled:cursor-not-allowed"
        >
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin text-brand-600" aria-hidden />
              <span>Mengunggah…</span>
            </>
          ) : (
            <>
              <Upload className="size-4 text-brand-600" aria-hidden />
              <span>{label}</span>
            </>
          )}
        </button>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}

export function AttachmentPreviewModal({
  attachmentKey,
  onClose,
  title = 'Pratinjau dokumen bukti',
}: {
  attachmentKey: string | null;
  onClose: () => void;
  title?: string;
}) {
  const [state, setState] = useState<{
    loading: boolean;
    url: string | null;
    mimeType: string | null;
    error: string | null;
  }>({ loading: false, url: null, mimeType: null, error: null });

  useEffect(() => {
    if (!attachmentKey) return;
    let active = true;
    let objectUrl: string | null = null;
    setState({ loading: true, url: null, mimeType: null, error: null });

    fetchAttachmentBlob(attachmentKey)
      .then((res) => {
        objectUrl = res.url;
        if (active) setState({ loading: false, url: res.url, mimeType: res.mimeType, error: null });
      })
      .catch((err) => {
        if (active) {
          setState({
            loading: false,
            url: null,
            mimeType: null,
            error: err instanceof ApiError ? err.message : 'Gagal memuat lampiran.',
          });
        }
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachmentKey]);

  const isPdf = state.mimeType === 'application/pdf' || attachmentKey?.endsWith('.pdf');

  return (
    <Modal open={Boolean(attachmentKey)} onClose={onClose} title={title} size="lg">
      {state.loading ? (
        <Spinner label="Memuat dokumen…" />
      ) : state.error ? (
        <Alert tone="red">{state.error}</Alert>
      ) : state.url ? (
        <div className="space-y-3">
          {isPdf ? (
            <iframe
              src={state.url}
              title={title}
              className="h-[65vh] w-full rounded-md border border-line"
            />
          ) : (
            <div className="flex justify-center overflow-hidden rounded-md border border-line bg-canvas p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={state.url}
                alt={title}
                className="max-h-[65vh] w-auto rounded object-contain"
              />
            </div>
          )}
          <div className="flex justify-end">
            <a href={state.url} target="_blank" rel="noreferrer">
              <Button variant="secondary" size="sm">
                <FileText className="size-3.5" aria-hidden /> Buka di tab baru
              </Button>
            </a>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
