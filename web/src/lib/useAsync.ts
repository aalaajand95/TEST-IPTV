import { useCallback, useEffect, useRef, useState } from 'react';

/** Runs an async loader whenever deps change; ignores results from stale runs. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({ loading: true });
  const run = useRef(0);

  const load = useCallback(() => {
    const id = ++run.current;
    setState((s) => ({ data: s.data, loading: true }));
    fn().then(
      (data) => id === run.current && setState({ data, loading: false }),
      (error: Error) => id === run.current && setState({ error, loading: false }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(load, [load]);
  return { ...state, reload: load };
}
