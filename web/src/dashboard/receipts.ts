import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { MAX_RECEIPT_BYTES, type Receipt } from '@/shared/receipts';
import { ApiError, errorMessage, useApi, useApiJson } from '../api';

const RECEIPTS_API_BASE_PATH = '/api/receipts';
const MAX_SIDE = 2048;
const JPEG_QUALITY = 0.85;

/**
 * Downscales a photo and re-encodes it as JPEG: a phone photo shrinks from several MB to a few
 * hundred KB, and the re-encode drops EXIF data such as GPS location.
 */
export async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = new OffscreenCanvas(
    Math.round(bitmap.width * scale),
    Math.round(bitmap.height * scale),
  );
  const context = canvas.getContext('2d')!;

  // JPEG has no transparency; a transparent PNG would turn black.
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });

  if (blob.size > MAX_RECEIPT_BYTES) {
    throw new Error('Image is too large even after shrinking it');
  }

  return blob;
}

export function useReceipts(rowKey: string | null) {
  const get = useApiJson();

  return useQuery({
    queryKey: ['receipts', rowKey],
    queryFn: () => get<Receipt[]>(`${RECEIPTS_API_BASE_PATH}/transactions/${rowKey}`),
    enabled: rowKey !== null,
  });
}

/**
 * Refreshes a transaction's receipts and, since the counts live on the transaction rows, those
 * lists too. Call it once after a batch of changes rather than after each one.
 */
export function useRefreshReceipts(rowKey: string) {
  const client = useQueryClient();

  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['receipts', rowKey] }),
      client.invalidateQueries({ queryKey: ['transactions'] }),
    ]);
}

export function useUploadReceipt(rowKey: string) {
  const api = useApi();

  return useMutation({
    mutationFn: async (file: File) => {
      const body = await compressImage(file);
      const response = await api(`${RECEIPTS_API_BASE_PATH}/transactions/${rowKey}`, {
        method: 'POST',
        headers: { 'Content-Type': body.type },
        body,
      });

      if (!response.ok) {
        throw new ApiError(response.status, await errorMessage(response));
      }
    },
  });
}

export function useDeleteReceipt(rowKey: string) {
  const send = useApiJson();
  const refresh = useRefreshReceipts(rowKey);

  return useMutation({
    mutationFn: (id: string) => send(`${RECEIPTS_API_BASE_PATH}/${id}`, { method: 'DELETE' }),
    onSettled: refresh,
  });
}

/**
 * An <img> can't send the Bearer token, so the image is fetched with it and shown from an object
 * URL. Receipts never change, so each is fetched once.
 */
export function useReceiptImage(id: string) {
  const api = useApi();
  const [url, setUrl] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['receipt-image', id],
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      const response = await api(`${RECEIPTS_API_BASE_PATH}/${id}`);

      if (!response.ok) {
        throw new ApiError(response.status, await errorMessage(response));
      }

      return response.blob();
    },
  });

  useEffect(() => {
    if (!query.data) {
      return;
    }

    const objectUrl = URL.createObjectURL(query.data);

    setUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [query.data]);

  return { url, loading: query.isPending, failed: query.isError };
}
