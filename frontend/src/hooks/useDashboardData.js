import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchDashboardSnapshot } from '../api/dashboardApi.js';

const EMPTY_DATA = {
  mesh: { devices: [], idempotencyCacheSize: 0 },
  accounts: [],
  transactions: [],
  serverKey: null,
};

export function useDashboardData() {
  const mounted = useRef(true);
  const [data, setData] = useState(EMPTY_DATA);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (silent = false) => {
    if (silent) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const snapshot = await fetchDashboardSnapshot();
      if (!mounted.current) return;
      setData(snapshot);
      setError('');
    } catch (err) {
      if (!mounted.current) return;
      setError(err.message || 'Unable to reach the backend');
    } finally {
      if (!mounted.current) return;
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    load(false);
    const timerId = window.setInterval(() => load(true), 3000);

    return () => {
      mounted.current = false;
      window.clearInterval(timerId);
    };
  }, [load]);

  return {
    data,
    isLoading,
    isRefreshing,
    error,
    reload: load,
  };
}
