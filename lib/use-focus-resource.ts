import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

export function useFocusResource<T>(fetcher: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const request = ++generation.current;
    try {
      const value = await fetcher();
      if (request === generation.current) { setData(value); setError(''); }
    } catch (reason) {
      if (request === generation.current) setError(reason instanceof Error ? reason.message : 'Could not load. Please try again.');
    }
  }, [fetcher]);
  useFocusEffect(useCallback(() => { void reload(); return () => { generation.current += 1; }; }, [reload]));
  return { data, error: data === null ? error : '', reload };
}
