import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * Form-state persisted to localStorage so a dropped mobile connection or an accidental
 * navigation never loses a half-typed entry (CLAUDE.md → UI/UX, draft persistence).
 * Returns [state, setState, clearDraft]; call clearDraft() after a successful save.
 */
export function useDraft<T extends object>(
  key: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>, () => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? ({ ...initial, ...JSON.parse(raw) } as T) : initial;
    } catch {
      return initial;
    }
  });

  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    try {
      localStorage.setItem(keyRef.current, JSON.stringify(state));
    } catch {
      /* storage full / unavailable — drafts are best-effort */
    }
  }, [state]);

  const clear = () => {
    try {
      localStorage.removeItem(keyRef.current);
    } catch {
      /* noop */
    }
  };

  return [state, setState, clear];
}
