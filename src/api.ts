import { useEffect, useState } from "react";

// Only public snapshot responses are cached. Account/session data never enters this cache.
const cache = new Map<string, { data: unknown; expires: number }>();
const cacheLifetime = 5 * 60 * 1000;
function cached<T>(path: string): T | null {
  const entry = cache.get(path);
  if (!entry) return null;
  if (entry.expires <= Date.now()) {
    cache.delete(path);
    return null;
  }
  return entry.data as T;
}

export function useApi<T>(path: string, enabled = true) {
  const [state, setState] = useState<{
    path: string;
    data: T | null;
    loading: boolean;
    error: string | null;
  }>({ path, data: cached<T>(path), loading: !cached<T>(path), error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const stored = cached<T>(path);
    if (stored !== null) {
      setState({ path, data: stored, loading: false, error: null });
      return;
    }
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => {
      if (!active) return;
      active = false;
      controller.abort();
      setState({
        path,
        data: null,
        loading: false,
        error: "The data request timed out. Please try again.",
      });
    }, 15000);
    setState({ path, data: null, loading: true, error: null });
    fetch(path, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(
            typeof body.detail === "string"
              ? body.detail
              : `Request failed (${response.status}).`,
          );
        }
        return response.json() as Promise<T>;
      })
      .then((data) => {
        if (active) {
          window.clearTimeout(timeout);
          if (path.startsWith("/api/v1/")) {
            // Bound memory while browsing many date/cutoff combinations.
            cache.delete(path);
            if (cache.size >= 48) cache.delete(cache.keys().next().value!);
            cache.set(path, { data, expires: Date.now() + cacheLifetime });
          }
          setState({ path, data, loading: false, error: null });
        }
      })
      .catch((error) => {
        window.clearTimeout(timeout);
        if (active)
          setState({
            path,
            data: null,
            loading: false,
            error:
              error instanceof Error ? error.message : "Unable to load data.",
          });
      });
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [path, attempt, enabled]);
  // Never show a previous date's response while a new selection is loading.
  const current =
    state.path === path
      ? state
      : {
          data: cached<T>(path),
          loading: cached<T>(path) === null,
          error: null,
        };
  return {
    ...current,
    retry: () => {
      cache.delete(path);
      setAttempt((value) => value + 1);
    },
  };
}
