'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AlertTriangle, Check, Info, X } from 'lucide-react';

/**
 * 경량 토스트 (P2-A).
 *
 * alert()는 판정 흐름을 멈추고 모바일에서 특히 거칠다. 같은 메시지를
 * 화면 상단에 비차단으로 띄우고, 필요하면 "다시 시도" 같은 액션을 함께 준다.
 */

export type ToastVariant = 'info' | 'error' | 'success';

export type ToastAction = {
  label: string;
  onClick: () => void;
};

export type ToastOptions = {
  variant?: ToastVariant;
  /** ms. 액션이 있으면 기본값이 길어진다. 0이면 자동으로 닫히지 않는다. */
  duration?: number;
  action?: ToastAction;
};

type Toast = ToastOptions & { id: number; message: string };

type ToastContextValue = {
  toast: (message: string, options?: ToastOptions) => void;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast는 <ToastProvider> 안에서만 쓸 수 있습니다.');
  }
  return ctx;
}

const VARIANT_STYLE: Record<ToastVariant, { border: string; icon: string }> = {
  info: { border: 'var(--border)', icon: 'var(--accent)' },
  error: { border: 'color-mix(in srgb, var(--danger) 45%, transparent)', icon: 'var(--danger)' },
  success: { border: 'color-mix(in srgb, var(--accent) 45%, transparent)', icon: 'var(--accent)' },
};

const ICON = {
  info: Info,
  error: AlertTriangle,
  success: Check,
} as const;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const id = nextId.current++;
      const duration = options.duration ?? (options.action ? 8000 : 3500);
      setToasts((prev) => [...prev.slice(-2), { ...options, id, message }]);
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration)
        );
      }
    },
    [dismiss]
  );

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/*
        하단이 아니라 상단에 띄운다 — 플레이·방 화면은 입력창이 화면 바닥에
        고정돼 있고, 모바일 키보드까지 올라오면 하단 토스트가 가려진다.
      */}
      <div
        className="fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 px-4 pointer-events-none"
        style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}
      >
        {toasts.map((t) => {
          const variant = t.variant ?? 'info';
          const Icon = ICON[variant];
          return (
            <div
              key={t.id}
              role="status"
              aria-live={variant === 'error' ? 'assertive' : 'polite'}
              className="toast-item pointer-events-auto w-full max-w-sm flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg border shadow-lg text-sm"
              style={{
                background: 'var(--surface)',
                borderColor: VARIANT_STYLE[variant].border,
                color: 'var(--fg)',
              }}
            >
              <Icon size={15} className="mt-0.5 shrink-0" style={{ color: VARIANT_STYLE[variant].icon }} />
              <span className="flex-1 leading-relaxed break-words">{t.message}</span>
              {t.action && (
                <button
                  type="button"
                  onClick={() => {
                    dismiss(t.id);
                    t.action?.onClick();
                  }}
                  className="shrink-0 px-2 py-0.5 rounded text-xs font-semibold"
                  style={{ background: 'var(--accent)', color: 'var(--bg)' }}
                >
                  {t.action.label}
                </button>
              )}
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="알림 닫기"
                className="shrink-0 opacity-50 hover:opacity-100 transition-opacity"
                style={{ color: 'var(--muted)' }}
              >
                <X size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
