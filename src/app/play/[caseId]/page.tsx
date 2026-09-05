'use client';

import { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Send, Flag, Eye, Lightbulb, FileText, Lock, Unlock,
  AlertTriangle, ChevronLeft, X, Trophy, ArrowRight, ChevronDown, ChevronUp
} from 'lucide-react';
import {
  INITIAL_TOKENS, COST_HINT, COST_PREVIEW, COST_WRONG_ANSWER,
  MAX_QUESTION_LENGTH, AUTO_UNLOCK_INTERVAL, MAX_FINAL_ATTEMPTS,
  calculateScore, getRank
} from '@/lib/gameConfig';
import { Verdict, CasePublicDTO, SinglePlayerState } from '@/lib/types';
import { useToast } from '@/components/Toast';
import { Modal } from '@/components/Modal';
import { Onboarding, shouldShowOnboarding } from '@/components/Onboarding';

/** useSyncExternalStore용 — 구독할 외부 저장소가 없다. */
const noopSubscribe = () => () => {};

/** 스포일러 없는 일반형 예시. 첫 질문의 문턱을 낮추는 용도다. */
const STARTER_QUESTIONS = [
  '피해자는 남성인가요?',
  '사건 현장에 다른 사람이 있었나요?',
  '사고가 아니라 의도된 일인가요?',
];

const VERDICT_COLORS: Record<Verdict, string> = {
  YES: 'bg-yes',
  NO: 'bg-no',
  MAYBE: 'bg-maybe',
  IRRELEVANT: 'bg-neutral',
  INVALID: 'bg-neutral',
};

const VERDICT_LABELS: Record<Verdict, string> = {
  YES: '예',
  NO: '아니오',
  MAYBE: '그럴 수도',
  IRRELEVANT: '무관',
  INVALID: '무효',
};


export default function PlayPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { caseId } = useParams<{ caseId: string }>();
  const [caseInfo, setCaseInfo] = useState<CasePublicDTO | null>(null);
  const [state, setState] = useState<SinglePlayerState | null>(null);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [showFinalModal, setShowFinalModal] = useState(false);
  const [finalAnswer, setFinalAnswer] = useState('');
  const [finalLoading, setFinalLoading] = useState(false);
  const [resultData, setResultData] = useState<{
    truth?: string;
    score?: number;
    rank?: string;
    results?: { id: string; status: string; evidence: string }[];
    feedback?: string;
  } | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hints, setHints] = useState<string[]>([]);
  const [showHintModal, setShowHintModal] = useState(false);
  const [imageOverlay, setImageOverlay] = useState<number | null>(null);
  // 모바일에서만 의미가 있다 — lg 이상에서는 케이스 패널이 항상 보인다.
  const [panelOpen, setPanelOpen] = useState(false);
  // 서버 스냅샷은 항상 false라 하이드레이션이 어긋나지 않는다.
  const isFirstVisit = useSyncExternalStore(noopSubscribe, shouldShowOnboarding, () => false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const showOnboarding = isFirstVisit && !onboardingDismissed;
  const logRef = useRef<HTMLDivElement>(null);

  // Load case and saved state
  useEffect(() => {
    fetch(`/api/cases/${caseId}`)
      .then((r) => r.json())
      .then((data) => setCaseInfo(data))
      .catch(() => {});

    const saves = JSON.parse(localStorage.getItem('yesno_saves') || '{}');
    if (saves[caseId as string]) {
      setState(saves[caseId as string]);
    } else {
      const initial: SinglePlayerState = {
        caseId: caseId as string,
        tokens: INITIAL_TOKENS,
        questions: [],
        revealedImageCount: 1,
        totalQuestions: 0,
        revealedKeyFacts: [],
        hintsUsed: 0,
        attemptsUsed: 0,
        solved: false,
        gameOver: false,
      };
      setState(initial);
      saves[caseId as string] = initial;
      localStorage.setItem('yesno_saves', JSON.stringify(saves));
    }
  }, [caseId]);

  // Save state on change
  useEffect(() => {
    if (!state) return;
    const saves = JSON.parse(localStorage.getItem('yesno_saves') || '{}');
    saves[caseId as string] = state;
    localStorage.setItem('yesno_saves', JSON.stringify(saves));
  }, [state, caseId]);

  // Auto-scroll log
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [state?.questions]);

  async function submitQuestion(override?: string) {
    const text = (override ?? question).trim();
    if (!state || loading || !text) return;
    if (state.tokens < 1) return;
    if (state.solved || state.gameOver) return;

    setLoading(true);
    try {
      const res = await fetch('/api/judge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId,
          question: text,
          tokens: state.tokens,
          totalQuestions: state.totalQuestions,
          revealedImageCount: state.revealedImageCount,
          previousQuestions: state.questions,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast(data.error || '판정을 불러오지 못했습니다.', {
          variant: 'error',
          action: { label: '다시 시도', onClick: () => submitQuestion(text) },
        });
        return;
      }

      if (data.cached) {
        toast('이미 물어본 질문입니다. 질문은 차감되지 않았습니다.');
        return;
      }

      setState((prev) => {
        if (!prev) return prev;
        const newFacts = [...prev.revealedKeyFacts];
        (data.revealedFacts || []).forEach((f: string) => {
          if (!newFacts.includes(f)) newFacts.push(f);
        });

        const updated: SinglePlayerState = {
          ...prev,
          tokens: data.tokensLeft ?? prev.tokens,
          questions: [
            ...prev.questions,
            {
              text,
              verdict: data.verdict,
              comment: data.comment,
              revealedFacts: data.revealedFacts || [],
              timestamp: Date.now(),
            },
          ],
          totalQuestions: data.totalQuestions ?? prev.totalQuestions + 1,
          revealedImageCount: data.revealedImageCount ?? prev.revealedImageCount,
          revealedKeyFacts: newFacts,
        };

        // Check if tokens depleted
        if (updated.tokens <= 0) {
          // Force final attempt
        }

        return updated;
      });

      setQuestion('');

      if (data.imageUnlocked) {
        setImageOverlay(data.revealedImageCount - 1);
        setTimeout(() => setImageOverlay(null), 3000);
      }
    } catch {
      toast('판정을 불러오지 못했습니다. 네트워크를 확인해주세요.', {
        variant: 'error',
        action: { label: '다시 시도', onClick: () => submitQuestion(text) },
      });
    } finally {
      setLoading(false);
    }
  }

  const submitFinalAnswer = async () => {
    if (!state || finalLoading || !finalAnswer.trim()) return;
    setFinalLoading(true);
    try {
      const res = await fetch('/api/verdict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId,
          answer: finalAnswer.trim(),
          tokens: state.tokens,
          attemptsUsed: state.attemptsUsed,
          questions: state.questions.map((q) => ({ text: q.text, verdict: q.verdict })),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast(data.error || '채점을 불러오지 못했습니다.', { variant: 'error' });
        setFinalLoading(false);
        return;
      }

      setState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          tokens: data.tokensLeft ?? prev.tokens,
          attemptsUsed: prev.attemptsUsed + 1,
          solved: data.solved,
          gameOver: data.gameOver || data.solved,
          score: data.score,
          rank: data.rank,
        };
      });

      setResultData(data);
      setShowFinalModal(false);

      if (data.solved || data.gameOver) {
        setShowResult(true);
      } else {
        toast(data.feedback || '아직 부족합니다. 다시 시도해보세요.', {
          variant: 'error',
          duration: 7000,
        });
      }
    } catch {
      toast('채점을 불러오지 못했습니다. 네트워크를 확인해주세요.', {
        variant: 'error',
        action: { label: '다시 시도', onClick: submitFinalAnswer },
      });
    } finally {
      setFinalLoading(false);
    }
  };

  const buyHint = async () => {
    if (!state || state.tokens < COST_HINT) return;
    if (hintsUsed >= 3) return;

    // For single player, fetch hint from a separate API or use local
    setState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        tokens: prev.tokens - COST_HINT,
        hintsUsed: prev.hintsUsed + 1,
      };
    });
    setHintsUsed((h) => h + 1);

    // Fetch hint text
    try {
      const res = await fetch(`/api/cases/${caseId}/hint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hintLevel: hintsUsed }),
      });
      const data = await res.json();
      if (data.hint) {
        setHints((prev) => [...prev, data.hint]);
        setShowHintModal(true);
      } else {
        throw new Error('no hint');
      }
    } catch {
      // Refund
      setState((prev) => {
        if (!prev) return prev;
        return { ...prev, tokens: prev.tokens + COST_HINT, hintsUsed: prev.hintsUsed - 1 };
      });
      setHintsUsed((h) => h - 1);
      toast(`힌트를 불러오지 못했습니다. ${COST_HINT}Q를 돌려드렸습니다.`, {
        variant: 'error',
        action: { label: '다시 시도', onClick: buyHint },
      });
    }
  };

  const buyPreview = async () => {
    if (!state || state.tokens < COST_PREVIEW) return;
    if (!caseInfo || state.revealedImageCount >= caseInfo.imageCount) return;

    setState((prev) => {
      if (!prev) return prev;
      const newCount = prev.revealedImageCount + 1;
      return {
        ...prev,
        tokens: prev.tokens - COST_PREVIEW,
        revealedImageCount: newCount,
      };
    });
    setImageOverlay((state.revealedImageCount));
    setTimeout(() => setImageOverlay(null), 3000);
  };

  if (!caseInfo || !state) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="text-muted">Loading...</div>
      </div>
    );
  }

  const questionsUntilNextUnlock = state.totalQuestions > 0
    ? AUTO_UNLOCK_INTERVAL - (state.totalQuestions % AUTO_UNLOCK_INTERVAL)
    : AUTO_UNLOCK_INTERVAL;

  const expectedScore = calculateScore(state.tokens, 50);
  const isTokensLow = state.tokens <= 10;
  const canAskQuestion = state.tokens >= 1 && !state.solved && !state.gameOver;
  const mustFinalSubmit = state.tokens <= 0 && !state.solved && !state.gameOver && state.attemptsUsed < MAX_FINAL_ATTEMPTS;

  return (
    <div className="h-dvh flex flex-col overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <header className="flex items-center justify-between gap-2 px-4 py-3 border-b shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <button onClick={() => router.push('/cases')} className="flex items-center gap-1 text-sm shrink-0" style={{ color: 'var(--muted)' }}>
          <ChevronLeft size={16} /> <span className="hidden sm:inline">사건 목록</span>
        </button>
        <h1 className="text-sm font-bold tracking-wider truncate" style={{ color: 'var(--accent)' }}>
          {caseInfo.title}
        </h1>
        <div className="text-xs shrink-0" style={{ color: 'var(--muted)' }}>
          {'★'.repeat(caseInfo.difficulty)}{'☆'.repeat(5 - caseInfo.difficulty)}
        </div>
      </header>

      {/* Mobile summary bar — 케이스 패널을 접어두고 로그·입력에 화면을 내준다 */}
      <div
        className="lg:hidden flex items-center justify-between gap-3 px-4 py-2 border-b shrink-0 text-xs"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
      >
        <button
          type="button"
          onClick={() => setPanelOpen((v) => !v)}
          aria-expanded={panelOpen}
          aria-controls="case-panel"
          className="flex items-center gap-1 px-2 py-1 rounded border"
          style={{ borderColor: 'var(--border)', color: 'var(--fg)', background: 'var(--surface-2)' }}
        >
          <FileText size={12} />
          사건 정보
          {panelOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        <div className="flex items-center gap-3 min-w-0">
          <span style={{ color: 'var(--muted)' }}>
            핵심 {state.revealedKeyFacts.length}/{caseInfo.keyFactLabels.length}
          </span>
          <span aria-live="polite">
            <span style={{ color: 'var(--muted)' }}>남은 </span>
            <b className={isTokensLow ? 'tokens-warning' : ''} style={{ color: isTokensLow ? 'var(--danger)' : 'var(--accent)' }}>
              {state.tokens}Q
            </b>
          </span>
        </div>
      </div>

      {/* Main content - 2 column (모바일에서는 패널이 로그 위에 겹친다) */}
      <div className="flex-1 relative flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* Left: Case panel */}
        <div
          id="case-panel"
          className={`${panelOpen ? 'block' : 'hidden'} lg:block absolute inset-0 z-30 lg:static lg:z-auto lg:w-[420px] flex-shrink-0 overflow-y-auto p-4 border-r`}
          style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
        >
          {/* Image gallery */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            {Array.from({ length: caseInfo.imageCount }).map((_, i) => {
              const isRevealed = i < state.revealedImageCount;
              const imageSrc = caseInfo.images?.[i];
              return (
                <button
                  key={i}
                  type="button"
                  disabled={!isRevealed}
                  aria-label={isRevealed ? `단서 ${i + 1} 크게 보기` : `단서 ${i + 1} 잠김`}
                  className="aspect-[4/3] rounded-lg overflow-hidden relative border disabled:cursor-default"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
                  onClick={() => isRevealed && setImageOverlay(i)}
                >
                  {isRevealed ? (
                    imageSrc ? (
                      <img
                        src={imageSrc}
                        alt={`단서 ${i + 1}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center p-2 text-center text-xs" style={{ color: 'var(--muted)', background: 'var(--surface-inset)' }}>
                        <div>
                          <Eye size={20} className="mx-auto mb-1 opacity-40" />
                          {`삽화 ${i + 1}`}
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="locked-slot w-full h-full flex items-center justify-center">
                      <Lock size={24} style={{ color: 'var(--neutral)' }} />
                    </div>
                  )}
                  {i === 0 && (
                    <span className="absolute top-1 left-1 text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>
                      공개
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Brief */}
          <div className="mb-4 p-3 rounded-lg border" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--fg)' }}>
              {caseInfo.brief}
            </p>
          </div>

          {/* Tokens */}
          <div className="mb-4 p-3 rounded-lg border text-center" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
            <div className="text-xs mb-1" style={{ color: 'var(--muted)' }}>남은 질문</div>
            <div
              className={`text-3xl font-bold ${isTokensLow ? 'tokens-warning' : ''}`}
              style={{ color: isTokensLow ? 'var(--danger)' : 'var(--accent)' }}
              aria-live="polite"
              aria-label={`남은 질문 ${state.tokens}개`}
            >
              {state.tokens}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--dim)' }}>
              예상 점수: {expectedScore}
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2 mb-4">
            <button
              onClick={buyHint}
              disabled={state.tokens < COST_HINT || hintsUsed >= 3 || state.solved || state.gameOver}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border text-sm disabled:opacity-30"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--fg)' }}
            >
              <Lightbulb size={14} /> 텍스트 힌트 -{COST_HINT} ({hintsUsed}/3)
            </button>
            <button
              onClick={buyPreview}
              disabled={
                state.tokens < COST_PREVIEW ||
                state.revealedImageCount >= caseInfo.imageCount ||
                state.solved || state.gameOver
              }
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border text-sm disabled:opacity-30"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--fg)' }}
            >
              <Eye size={14} />
              {state.revealedImageCount >= caseInfo.imageCount
                ? '공개할 단서 없음'
                : `단서 미리보기 -${COST_PREVIEW}`}
            </button>
          </div>

          {/* Next auto unlock */}
          <div className="text-xs text-center" style={{ color: 'var(--dim)' }}>
            다음 자동 공개까지 {questionsUntilNextUnlock}개 질문
          </div>

          {/* Key facts progress */}
          <div className="mt-4 p-3 rounded-lg border" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
            <div className="text-xs mb-2" style={{ color: 'var(--muted)' }}>
              핵심 요소 {state.revealedKeyFacts.length} / {caseInfo.keyFactLabels.length} 밝혀짐
            </div>
            <div
              className="w-full h-2 rounded-full mb-2"
              style={{ background: 'var(--border)' }}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={caseInfo.keyFactLabels.length}
              aria-valuenow={state.revealedKeyFacts.length}
              aria-label="핵심 요소 진행도"
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  background: 'var(--accent)',
                  width: `${(state.revealedKeyFacts.length / caseInfo.keyFactLabels.length) * 100}%`,
                }}
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {caseInfo.keyFactLabels.map((f, idx) => (
                <span
                  key={f.id}
                  className="text-[10px] px-2 py-0.5 rounded"
                  style={{
                    background: state.revealedKeyFacts.includes(f.id) ? 'color-mix(in srgb, var(--accent) 13%, transparent)' : 'var(--border)',
                    color: state.revealedKeyFacts.includes(f.id) ? 'var(--accent)' : 'var(--dim)',
                    border: `1px solid ${state.revealedKeyFacts.includes(f.id) ? 'color-mix(in srgb, var(--accent) 27%, transparent)' : 'var(--border)'}`,
                  }}
                >
                  핵심 요소 {idx + 1}
                </span>
              ))}
            </div>
          </div>

          {/* Revealed hints */}
          {hints.length > 0 && (
            <div className="mt-4 space-y-2">
              {hints.map((h, i) => (
                <div key={i} className="p-2 rounded border text-xs" style={{ borderColor: 'color-mix(in srgb, var(--accent) 20%, transparent)', background: 'color-mix(in srgb, var(--accent) 4%, transparent)', color: 'var(--accent)' }}>
                  <Lightbulb size={12} className="inline mr-1" /> 힌트 {i + 1}: {h}
                </div>
              ))}
            </div>
          )}

          {/* Mobile: 패널 닫기 */}
          <button
            type="button"
            onClick={() => setPanelOpen(false)}
            className="lg:hidden mt-4 w-full py-2 rounded-lg border text-sm"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--muted)' }}
          >
            닫고 심문으로 돌아가기
          </button>
        </div>

        {/* Right: Question log */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Final submit button */}
          <div className="flex items-center justify-between gap-2 px-4 py-2 border-b shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
            <div className="text-xs" style={{ color: 'var(--muted)' }}>
              심문 기록 ({state.questions.length}건)
            </div>
            <button
              onClick={() => setShowFinalModal(true)}
              disabled={state.solved || state.gameOver || state.attemptsUsed >= MAX_FINAL_ATTEMPTS}
              className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-bold disabled:opacity-30"
              style={{ background: 'var(--accent)', color: 'var(--bg)' }}
            >
              <FileText size={12} />
              최종 추리 ({MAX_FINAL_ATTEMPTS - state.attemptsUsed}회 남음)
            </button>
          </div>

          {/* Log */}
          <div ref={logRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {state.questions.length === 0 && !loading && (
              <div className="text-center py-12" style={{ color: 'var(--dim)' }}>
                <FileText size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">질문을 시작하세요</p>
                <p className="text-xs mt-1">예/아니오로 답할 수 있는 질문만 가능합니다</p>
                {canAskQuestion && (
                  <div className="mt-5 flex flex-wrap gap-2 justify-center">
                    {STARTER_QUESTIONS.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setQuestion(q)}
                        className="px-2.5 py-1 rounded-full border text-xs transition-colors"
                        style={{ borderColor: 'var(--border)', color: 'var(--muted)', background: 'var(--surface-2)' }}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {state.questions.map((q, i) => (
              <div key={i} className="rounded-lg p-3 border" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm flex-1" style={{ color: 'var(--fg)' }}>
                    <span className="text-xs mr-1" style={{ color: 'var(--dim)' }}>Q{i + 1}.</span>
                    {q.text}
                  </p>
                  <div className="flex items-center gap-1">
                    <span
                      className={`stamp ${VERDICT_COLORS[q.verdict]} text-on-solid`}
                      aria-label={`판정: ${VERDICT_LABELS[q.verdict]}`}
                    >
                      {VERDICT_LABELS[q.verdict]}
                    </span>
                    <button
                      onClick={() => {
                        // Flag this question
                        fetch('/api/flag', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ caseId, questionText: q.text, verdict: q.verdict }),
                        });
                      }}
                      className="p-1 rounded opacity-30 hover:opacity-100"
                      title="판정 신고"
                      aria-label={`Q${i + 1} 판정 신고`}
                    >
                      <Flag size={12} style={{ color: 'var(--danger)' }} />
                    </button>
                  </div>
                </div>
                {q.revealedFacts.length > 0 && (
                  <div className="flex gap-1 mt-1">
                    {q.revealedFacts.map((fid) => {
                      const factIdx = caseInfo.keyFactLabels.findIndex((f) => f.id === fid);
                      return (
                        <span key={fid} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'color-mix(in srgb, var(--accent) 13%, transparent)', color: 'var(--accent)' }}>
                          <Unlock size={8} className="inline mr-0.5" />
                          핵심 요소 {factIdx + 1}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}

            {/* 판정 대기 — 도장이 찍히기 전 자리표시자 */}
            {loading && (
              <div
                className="rounded-lg p-3 border flex items-center gap-2"
                style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
                aria-live="polite"
              >
                <span className="text-xs" style={{ color: 'var(--dim)' }}>판정 중</span>
                <span className="flex items-center gap-1">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </span>
              </div>
            )}
          </div>

          {/* Input */}
          {mustFinalSubmit ? (
            <div
              className="p-4 border-t shrink-0"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--surface)',
                paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))',
              }}
            >
              <div className="text-center">
                <AlertTriangle size={24} className="mx-auto mb-2" style={{ color: 'var(--danger)' }} />
                <p className="text-sm mb-2" style={{ color: 'var(--danger)' }}>질문이 소진되었습니다</p>
                <button
                  onClick={() => setShowFinalModal(true)}
                  className="px-4 py-2 rounded font-bold text-sm"
                  style={{ background: 'var(--accent)', color: 'var(--bg)' }}
                >
                  최종 추리 제출
                </button>
              </div>
            </div>
          ) : (
            <div
              className="p-4 border-t shrink-0"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--surface)',
                paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))',
              }}
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitQuestion(); }}
                  placeholder={canAskQuestion ? '예/아니오로 답할 수 있는 질문을 입력하세요...' : '게임이 종료되었습니다'}
                  disabled={!canAskQuestion || loading}
                  maxLength={MAX_QUESTION_LENGTH}
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg border text-base sm:text-sm outline-none disabled:opacity-30"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--fg)' }}
                />
                <button
                  onClick={() => submitQuestion()}
                  disabled={!canAskQuestion || loading || !question.trim()}
                  className="px-4 py-2 rounded-lg disabled:opacity-30"
                  style={{ background: 'var(--accent)', color: 'var(--bg)' }}
                >
                  {loading ? '...' : <Send size={16} />}
                </button>
              </div>
              <div className="flex justify-between mt-1 text-[10px]" style={{ color: 'var(--dim)' }}>
                <span>{question.length}/{MAX_QUESTION_LENGTH}</span>
                <span>-1Q (INVALID는 무료)</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Final Answer Modal */}
      <Modal
        open={showFinalModal}
        onClose={() => setShowFinalModal(false)}
        labelledBy="final-modal-title"
        className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-xl border p-6"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
      >
        {showFinalModal && (
          <>
            <div className="flex justify-between items-center mb-4">
              <h2 id="final-modal-title" className="text-lg font-bold" style={{ color: 'var(--accent)' }}>최종 추리 제출</h2>
              <button onClick={() => setShowFinalModal(false)} aria-label="최종 추리 창 닫기">
                <X size={20} style={{ color: 'var(--muted)' }} />
              </button>
            </div>
            <div className="mb-3 p-2 rounded text-xs" style={{ background: 'color-mix(in srgb, var(--no) 13%, transparent)', color: 'var(--danger)', border: '1px solid color-mix(in srgb, var(--no) 27%, transparent)' }}>
              <AlertTriangle size={12} className="inline mr-1" />
              오답 시 질문 {COST_WRONG_ANSWER}개가 차감됩니다
            </div>
            <textarea
              value={finalAnswer}
              onChange={(e) => setFinalAnswer(e.target.value)}
              placeholder="사건의 전말을 자유롭게 서술하세요..."
              rows={6}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--fg)' }}
            />
            <button
              onClick={submitFinalAnswer}
              disabled={finalLoading || !finalAnswer.trim()}
              className="w-full mt-3 py-2 rounded-lg font-bold text-sm disabled:opacity-30"
              style={{ background: 'var(--accent)', color: 'var(--bg)' }}
            >
              {finalLoading ? '채점 중...' : '제출'}
            </button>
          </>
        )}
      </Modal>

      {/* Result screen */}
      {showResult && resultData && (
        <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: 'var(--bg)' }}>
          <div className="max-w-2xl mx-auto p-6">
            <div className="text-center mb-8">
              {state.solved ? (
                <>
                  <Trophy size={48} className="mx-auto mb-3" style={{ color: 'var(--accent)' }} />
                  <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--accent)' }}>사건 해결</h1>
                  <div className="text-4xl font-bold mb-1" style={{ color: 'var(--fg)' }}>
                    {resultData.rank} 랭크
                  </div>
                  <div className="text-lg" style={{ color: 'var(--muted)' }}>
                    {resultData.score}점
                  </div>
                </>
              ) : (
                <>
                  <AlertTriangle size={48} className="mx-auto mb-3" style={{ color: 'var(--danger)' }} />
                  <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--danger)' }}>미해결</h1>
                  <p className="text-sm" style={{ color: 'var(--muted)' }}>D 랭크</p>
                </>
              )}
            </div>

            {/* Truth reveal */}
            {resultData.truth && (
              <div className="mb-6 p-4 rounded-xl border" style={{ borderColor: 'color-mix(in srgb, var(--accent) 20%, transparent)', background: 'color-mix(in srgb, var(--accent) 3%, transparent)' }}>
                <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--accent)' }}>사건 전말</h2>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--fg)' }}>
                  {resultData.truth}
                </p>
              </div>
            )}

            {/* Factor results */}
            {resultData.results && (
              <div className="mb-6 space-y-2">
                <h2 className="text-sm font-bold" style={{ color: 'var(--muted)' }}>핵심 요소 채점</h2>
                {resultData.results.map((r) => {
                  const fact = caseInfo.keyFactLabels.find((f) => f.id === r.id);
                  return (
                    <div key={r.id} className="flex items-center gap-2 p-2 rounded border" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
                      <span className={`stamp text-on-solid ${r.status === 'hit' ? 'bg-yes' : r.status === 'partial' ? 'bg-maybe' : 'bg-no'}`}>
                        {r.status}
                      </span>
                      <span className="text-sm" style={{ color: 'var(--fg)' }}>
                        {fact?.label || r.id}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Share */}
            <div className="text-center space-y-3">
              <button
                onClick={() => {
                  const text = `육지토끼고기 · ${caseInfo.title} · 남은질문 ${state.tokens} · ${state.rank || 'D'}랭크`;
                  navigator.clipboard.writeText(text);
                  toast('결과를 클립보드에 복사했습니다.', { variant: 'success' });
                }}
                className="px-4 py-2 rounded text-sm border"
                style={{ borderColor: 'var(--border)', color: 'var(--fg)' }}
              >
                결과 공유 복사
              </button>
              <button
                onClick={() => router.push('/cases')}
                className="flex items-center gap-1 mx-auto px-4 py-2 rounded text-sm"
                style={{ background: 'var(--accent)', color: 'var(--bg)' }}
              >
                사건 목록으로 <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image overlay */}
      <Modal
        open={imageOverlay !== null}
        onClose={() => setImageOverlay(null)}
        label={imageOverlay !== null ? `단서 ${imageOverlay + 1} 크게 보기` : undefined}
        backdropStyle={{ background: 'var(--scrim-strong)' }}
        className="max-w-2xl w-full max-h-[90dvh] overflow-auto rounded-xl border"
        style={{ borderColor: 'color-mix(in srgb, var(--accent) 20%, transparent)', background: 'var(--surface)' }}
      >
        {imageOverlay !== null && (
          <>
            {caseInfo.images?.[imageOverlay] ? (
              <img
                src={caseInfo.images[imageOverlay]}
                alt={`단서 ${imageOverlay + 1}`}
                className="w-full h-auto"
              />
            ) : (
              <div className="p-8 text-center">
                <Eye size={32} className="mx-auto mb-3" style={{ color: 'var(--accent)' }} />
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  {`삽화 ${imageOverlay + 1}`}
                </p>
              </div>
            )}
            <button
              type="button"
              onClick={() => setImageOverlay(null)}
              className="w-full text-xs text-center py-3"
              style={{ color: 'var(--dim)' }}
            >
              닫기 (Esc)
            </button>
          </>
        )}
      </Modal>

      {/* 첫 플레이 규칙 안내 */}
      <Onboarding open={showOnboarding} onClose={() => setOnboardingDismissed(true)} />

      {/* Hint modal */}
      <Modal
        open={showHintModal && hints.length > 0}
        onClose={() => setShowHintModal(false)}
        labelledBy="hint-modal-title"
        className="max-w-md w-full max-h-[90dvh] overflow-y-auto rounded-xl p-6 border"
        style={{ borderColor: 'color-mix(in srgb, var(--accent) 20%, transparent)', background: 'var(--surface)' }}
      >
        {hints.length > 0 && (
          <>
            <Lightbulb size={24} className="mx-auto mb-2" style={{ color: 'var(--accent)' }} />
            <h3 id="hint-modal-title" className="text-center text-sm font-bold mb-3" style={{ color: 'var(--accent)' }}>
              힌트 {hints.length}
            </h3>
            <p className="text-sm text-center" style={{ color: 'var(--fg)' }}>
              {hints[hints.length - 1]}
            </p>
            <button
              type="button"
              onClick={() => setShowHintModal(false)}
              className="mt-4 w-full py-2 rounded-lg border text-sm"
              style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
            >
              닫기 (Esc)
            </button>
          </>
        )}
      </Modal>
    </div>
  );
}
