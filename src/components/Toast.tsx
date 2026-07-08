import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

type Tone = 'success' | 'error';
interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
}

const ToastCtx = createContext<(message: string, tone?: Tone) => void>(() => {});

// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((message: string, tone: Tone = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`flex items-center gap-2 rounded-lg px-4 py-3 text-body-md shadow-lg ${
              t.tone === 'success' ? 'bg-positive text-on-positive' : 'bg-negative text-on-negative'
            }`}
          >
            {t.tone === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
