import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface PriceUpdateData {
  productId: string;
  name: string;
  oldPrice: number;
  newPrice: number;
  change: number;
  currency: string;
}

interface PriceAlertData {
  productId: string;
  name: string;
  newPrice: number;
  threshold: number;
  currency: string;
}

interface ExportReadyData {
  exportId: string;
  downloadUrl: string;
  expiresAt: string;
}

interface ScrapeStatusData {
  productId: string;
  name: string;
  price?: number;
  currency?: string;
  error?: string;
}

export interface SseCallbacks {
  onPriceAlert?: (data: PriceAlertData) => void;
  onScrapeCompleted?: (data: ScrapeStatusData) => void;
  onScrapeError?: (data: ScrapeStatusData) => void;
  onExportReady?: (data: ExportReadyData) => void;
}

export function useSse(userId: string | null, callbacks?: SseCallbacks): void {
  const queryClient = useQueryClient();
  const esRef = useRef<EventSource | null>(null);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks; // always use latest callbacks without re-subscribing

  useEffect(() => {
    if (!userId) return;

    const es = new EventSource('/api/sse/stream', { withCredentials: true });
    esRef.current = es;

    es.addEventListener('price-update', (e: MessageEvent<string>) => {
      const data = JSON.parse(e.data) as PriceUpdateData;
      // Invalidate TanStack Query cache — components refetch automatically
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['product', data.productId] });
    });

    es.addEventListener('price-alert', (e: MessageEvent<string>) => {
      const data = JSON.parse(e.data) as PriceAlertData;
      callbacksRef.current?.onPriceAlert?.(data);
      // Also invalidate so the price badge updates in the UI
      void queryClient.invalidateQueries({ queryKey: ['product', data.productId] });
    });

    es.addEventListener('scrape-completed', (e: MessageEvent<string>) => {
      const data = JSON.parse(e.data) as ScrapeStatusData;
      callbacksRef.current?.onScrapeCompleted?.(data);
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['product', data.productId] });
    });

    es.addEventListener('scrape-error', (e: MessageEvent<string>) => {
      const data = JSON.parse(e.data) as ScrapeStatusData;
      callbacksRef.current?.onScrapeError?.(data);
      void queryClient.invalidateQueries({ queryKey: ['product', data.productId] });
    });

    es.addEventListener('export-ready', (e: MessageEvent<string>) => {
      const data = JSON.parse(e.data) as ExportReadyData;
      callbacksRef.current?.onExportReady?.(data);
    });

    // EventSource auto-reconnects on error — no manual retry needed
    es.onerror = () => {
      // browser reconnects automatically after ~3s
    };

    // MUST close on unmount to prevent memory leak on the server (req never closes)
    return () => {
      es.close();
      esRef.current = null;
    };
  }, [userId, queryClient]);
}
