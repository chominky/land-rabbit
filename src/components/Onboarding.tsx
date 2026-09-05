'use client';

import { useState } from 'react';
import {
  Eye,
  FileText,
  HelpCircle,
  Image as ImageIcon,
  Lightbulb,
} from 'lucide-react';
import { Modal } from './Modal';
import { ONBOARDED_KEY } from '@/lib/settings';
import {
  AUTO_UNLOCK_INTERVAL,
  COST_HINT,
  COST_PREVIEW,
  COST_WRONG_ANSWER,
  INITIAL_TOKENS,
  MAX_FINAL_ATTEMPTS,
} from '@/lib/gameConfig';

/**
 * 첫 플레이 규칙 안내 (P2-C).
 *
 * localStorage의 `yesno_onboarded`로 1회만 노출한다.
 * 설정 화면의 "튜토리얼 다시 보기"가 이 플래그를 지운다.
 */

const STEPS = [
  {
    icon: HelpCircle,
    title: '예 / 아니오로 답할 수 있는 질문만',
    body: '"왜 그랬나요?" 같은 열린 질문은 무효 처리됩니다. 무효 판정은 질문을 소모하지 않으니 부담 없이 다시 물어보세요.',
  },
  {
    icon: FileText,
    title: `질문 ${INITIAL_TOKENS}개로 시작합니다`,
    body: '질문 하나에 1개씩 줄어듭니다. 남은 질문이 많을수록 점수가 높아지니, 넓게 좁혀 들어가는 순서가 중요합니다.',
  },
  {
    icon: Lightbulb,
    title: `힌트 ${COST_HINT}개 · 단서 미리보기 ${COST_PREVIEW}개`,
    body: `힌트는 약한 것부터 3단계까지 살 수 있습니다. 삽화는 질문 ${AUTO_UNLOCK_INTERVAL}개마다 한 장씩 저절로 열리기도 합니다.`,
  },
  {
    icon: ImageIcon,
    title: `최종 추리는 ${MAX_FINAL_ATTEMPTS}번`,
    body: `사건의 전말을 자유롭게 서술하면 AI가 핵심 요소별로 채점합니다. 필수 요소를 모두 맞혀야 해결이고, 틀리면 질문 ${COST_WRONG_ANSWER}개가 차감됩니다.`,
  },
] as const;

export function Onboarding({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];
  const Icon = current.icon;

  function finish() {
    try {
      localStorage.setItem(ONBOARDED_KEY, '1');
    } catch {
      // 저장 불가 — 이번 세션에만 닫힌다.
    }
    // 다음에 열릴 때(설정의 "다시 보기") 처음부터 보이도록 여기서 되돌린다.
    setStep(0);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={finish}
      labelledBy="onboarding-title"
      className="w-full max-w-sm rounded-xl border p-6"
      style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
    >
      <div className="flex flex-col items-center text-center gap-3">
        <Icon size={28} style={{ color: 'var(--accent)' }} />
        <h2 id="onboarding-title" className="text-base font-bold" style={{ color: 'var(--fg)' }}>
          {current.title}
        </h2>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
          {current.body}
        </p>
      </div>

      {/* 진행 표시 */}
      <div
        className="flex justify-center gap-1.5 mt-5"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
        aria-valuenow={step + 1}
        aria-label="규칙 안내 진행도"
      >
        {STEPS.map((s, i) => (
          <span
            key={s.title}
            className="h-1.5 rounded-full transition-all"
            style={{
              width: i === step ? 18 : 6,
              background: i === step ? 'var(--accent)' : 'var(--border)',
            }}
          />
        ))}
      </div>

      <div className="flex gap-2 mt-5">
        <button
          type="button"
          onClick={finish}
          className="px-3 py-2 rounded-lg text-sm"
          style={{ color: 'var(--dim)' }}
        >
          {isLast ? '' : '건너뛰기'}
        </button>
        <button
          type="button"
          data-autofocus
          onClick={() => (isLast ? finish() : setStep((s) => s + 1))}
          className="flex-1 py-2 rounded-lg text-sm font-bold"
          style={{ background: 'var(--accent)', color: 'var(--bg)' }}
        >
          {isLast ? '시작하기' : '다음'}
        </button>
      </div>

      <p className="text-[11px] text-center mt-3" style={{ color: 'var(--dim)' }}>
        <Eye size={11} className="inline mr-1" />
        설정에서 언제든 다시 볼 수 있습니다.
      </p>
    </Modal>
  );
}

/** 첫 방문 여부. 서버에서는 항상 false를 돌려준다. */
export function shouldShowOnboarding(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(ONBOARDED_KEY) !== '1';
  } catch {
    return false;
  }
}
