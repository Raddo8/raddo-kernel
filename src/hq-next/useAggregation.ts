/** HQ-NEXT · AGGREGATION READ HOOK
 * Same shape as useHqRead: loading, error, data. No polling.
 * The RPC takes no arguments and scopes itself server side. */
import React from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AggregationPayload } from './contracts/aggregation';

export type AggregationRead =
  | { status: 'loading'; data: null; error: null }
  | { status: 'error'; data: null; error: string }
  | { status: 'ready'; data: AggregationPayload; error: null };

export interface UseAggregationResult {
  read: AggregationRead;
  reload: () => void;
}

export function useAggregation(): UseAggregationResult {
  const [nonce, setNonce] = React.useState(0);
  const [read, setRead] = React.useState<AggregationRead>({ status: 'loading', data: null, error: null });

  React.useEffect(() => {
    let cancelled = false;
    setRead({ status: 'loading', data: null, error: null });

    void (async () => {
      const { data, error } = await supabase.rpc('hq_progress_bar_me');
      if (cancelled) return;
      if (error) {
        setRead({ status: 'error', data: null, error: error.message });
        return;
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        setRead({ status: 'error', data: null, error: 'the read returned no aggregation object' });
        return;
      }
      setRead({ status: 'ready', data: data as unknown as AggregationPayload, error: null });
    })();

    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const reload = React.useCallback(() => setNonce((n) => n + 1), []);
  return { read, reload };
}
