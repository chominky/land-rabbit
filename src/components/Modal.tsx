'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * 공용 모달 (P2-B).
 *
 * 접근성 요건을 한 곳에 모은다:
 * - 열릴 때 첫 포커스 가능한 요소로 포커스 이동
 * - Tab / Shift+Tab이 모달 밖으로 새지 않음 (포커스 트랩)
 * - Esc로 닫기, 배경 클릭으로 닫기
 * - 닫힐 때 열기 전 요소로 포커스 복귀
 * - role="dialog" aria-modal + aria-labelledby
 * - 열려 있는 동안 배경 스크롤 잠금
 */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  /** 스크린리더가 읽을 모달 제목. labelledBy를 주면 그쪽이 우선한다. */
  label?: string;
  labelledBy?: string;
  children: React.ReactNode;
  /** 다이얼로그 박스에 붙일 클래스. 배경 레이어는 항상 전체 화면이다. */
  className?: string;
  /** 배경 클릭으로 닫히지 않게 한다. */
  disableBackdropClose?: boolean;
  /** 배경 레이어에 추가 스타일 (예: 결과 화면의 불투명 배경). */
  backdropStyle?: React.CSSProperties;
  /** 다이얼로그 박스 인라인 스타일. */
  style?: React.CSSProperties;
};

export function Modal({
  open,
  onClose,
  label,
  labelledBy,
  children,
  className = '',
  disableBackdropClose = false,
  backdropStyle,
  style,
}: ModalProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  const focusables = useCallback(() => {
    const box = boxRef.current;
    if (!box) return [] as HTMLElement[];
    return Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement
    );
  }, []);

  // 열릴 때 포커스를 안으로, 닫힐 때 원래 자리로 돌려준다.
  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;

    const box = boxRef.current;
    // autoFocus가 걸린 요소가 있으면 그것을 존중한다.
    const preferred = box?.querySelector<HTMLElement>('[data-autofocus]');
    (preferred ?? focusables()[0] ?? box)?.focus();

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = prevOverflow;
      restoreTo.current?.focus?.();
    };
  }, [open, focusables]);

  // Esc 닫기 + Tab 트랩
  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey && (active === first || !boxRef.current?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose, focusables]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'var(--scrim)', ...backdropStyle }}
      onMouseDown={(e) => {
        if (!disableBackdropClose && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ? undefined : label}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={className}
        style={style}
      >
        {children}
      </div>
    </div>
  );
}
