'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Send, Flag, Eye, Lightbulb, FileText, Lock, Unlock,
  AlertTriangle, ChevronLeft, X, Trophy, ArrowRight
} from 'lucide-react';
import {
  INITIAL_TOKENS, COST_HINT, COST_PREVIEW, COST_WRONG_ANSWER,
  MAX_QUESTION_LENGTH, AUTO_UNLOCK_INTERVAL, MAX_FINAL_ATTEMPTS,
  calculateScore, getRank
} from '@/lib/gameConfig';
import { Verdict, CasePublicDTO, SinglePlayerState } from '@/lib/types';

const VERDICT_COLORS: Record<Verdict, string> = {
  YES: 'bg-[#3a7d44]',
  NO: 'bg-[#8b3a3a]',
  MAYBE: 'bg-[#8b7a3a]',
  IRRELEVANT: 'bg-[#4a4c53]',
  INVALID: 'bg-[#4a4c53]',
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

  const submitQuestion = useCallback(async () => {
    if (!state || loading || !question.trim()) return;
    if (state.tokens < 1) return;
    if (state.solved || state.gameOver) return;

    setLoading(true);
    try {
      const res = await fetch('/api/judge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId,
          question: question.trim(),
          tokens: state.tokens,
          totalQuestions: state.totalQuestions,
          revealedImageCount: state.revealedImageCount,
          previousQuestions: state.questions,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || '오류가 발생했습니다.');
        return;
      }

      if (data.cached) {
        alert('이미 물어본 질문입니다.');
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
              text: question.trim(),
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
      alert('판정을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [state, loading, question, caseId]);

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
        alert(data.error || '오류가 발생했습니다.');
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
        alert(data.feedback || '아직 부족합니다. 다시 시도해보세요.');
      }
    } catch {
      alert('채점을 불러오지 못했습니다.');
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
      }
    } catch {
      // Refund
      setState((prev) => {
        if (!prev) return prev;
        return { ...prev, tokens: prev.tokens + COST_HINT, hintsUsed: prev.hintsUsed - 1 };
      });
      setHintsUsed((h) => h - 1);
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0b0d11' }}>
        <div className="text-[#8b8d93]">Loading...</div>
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
    <div className="min-h-screen flex flex-col" style={{ background: '#0b0d11' }}>
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: '#2a2e38', background: '#12151c' }}>
        <button onClick={() => router.push('/cases')} className="flex items-center gap-1 text-sm" style={{ color: '#8b8d93' }}>
          <ChevronLeft size={16} /> 사건 목록
        </button>
        <h1 className="text-sm font-bold tracking-wider" style={{ color: '#c8a24e' }}>
          {caseInfo.title}
        </h1>
        <div className="text-xs" style={{ color: '#8b8d93' }}>
          {'★'.repeat(caseInfo.difficulty)}{'☆'.repeat(5 - caseInfo.difficulty)}
        </div>
      </header>

      {/* Main content - 2 column */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left: Case panel */}
        <div className="lg:w-[420px] flex-shrink-0 overflow-y-auto p-4 border-r" style={{ borderColor: '#2a2e38' }}>
          {/* Image gallery */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            {Array.from({ length: caseInfo.imageCount }).map((_, i) => {
              const isRevealed = i < state.revealedImageCount;
              const imageSrc = caseInfo.images?.[i];
              return (
                <div
                  key={i}
                  className="aspect-[4/3] rounded-lg overflow-hidden relative cursor-pointer border"
                  style={{ borderColor: '#2a2e38', background: '#181c25' }}
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
                      <div className="w-full h-full flex items-center justify-center p-2 text-center text-xs" style={{ color: '#8b8d93', background: '#1a1d24' }}>
                        <div>
                          <Eye size={20} className="mx-auto mb-1 opacity-40" />
                          {`삽화 ${i + 1}`}
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="locked-slot w-full h-full flex items-center justify-center">
                      <Lock size={24} style={{ color: '#4a4c53' }} />
                    </div>
                  )}
                  {i === 0 && (
                    <span className="absolute top-1 left-1 text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#c8a24e', color: '#0b0d11' }}>
                      공개
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Brief */}
          <div className="mb-4 p-3 rounded-lg border" style={{ borderColor: '#2a2e38', background: '#181c25' }}>
            <p className="text-sm leading-relaxed" style={{ color: '#e8e6e3' }}>
              {caseInfo.brief}
            </p>
          </div>

          {/* Tokens */}
          <div className="mb-4 p-3 rounded-lg border text-center" style={{ borderColor: '#2a2e38', background: '#181c25' }}>
            <div className="text-xs mb-1" style={{ color: '#8b8d93' }}>남은 질문</div>
            <div className={`text-3xl font-bold ${isTokensLow ? 'tokens-warning' : ''}`} style={{ color: isTokensLow ? '#c0392b' : '#c8a24e' }}>
              {state.tokens}
            </div>
            <div className="text-xs mt-1" style={{ color: '#5a5c63' }}>
              예상 점수: {expectedScore}
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2 mb-4">
            <button
              onClick={buyHint}
              disabled={state.tokens < COST_HINT || hintsUsed >= 3 || state.solved || state.gameOver}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border text-sm disabled:opacity-30"
              style={{ borderColor: '#2a2e38', background: '#181c25', color: '#e8e6e3' }}
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
              style={{ borderColor: '#2a2e38', background: '#181c25', color: '#e8e6e3' }}
            >
              <Eye size={14} />
              {state.revealedImageCount >= caseInfo.imageCount
                ? '공개할 단서 없음'
                : `단서 미리보기 -${COST_PREVIEW}`}
            </button>
          </div>

          {/* Next auto unlock */}
          <div className="text-xs text-center" style={{ color: '#5a5c63' }}>
            다음 자동 공개까지 {questionsUntilNextUnlock}개 질문
          </div>

          {/* Key facts progress */}
          <div className="mt-4 p-3 rounded-lg border" style={{ borderColor: '#2a2e38', background: '#181c25' }}>
            <div className="text-xs mb-2" style={{ color: '#8b8d93' }}>
              핵심 요소 {state.revealedKeyFacts.length} / {caseInfo.keyFactLabels.length} 밝혀짐
            </div>
            <div className="w-full h-2 rounded-full mb-2" style={{ background: '#2a2e38' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  background: '#c8a24e',
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
                    background: state.revealedKeyFacts.includes(f.id) ? '#c8a24e22' : '#2a2e38',
                    color: state.revealedKeyFacts.includes(f.id) ? '#c8a24e' : '#5a5c63',
                    border: `1px solid ${state.revealedKeyFacts.includes(f.id) ? '#c8a24e44' : '#2a2e38'}`,
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
                <div key={i} className="p-2 rounded border text-xs" style={{ borderColor: '#c8a24e33', background: '#c8a24e0a', color: '#c8a24e' }}>
                  <Lightbulb size={12} className="inline mr-1" /> 힌트 {i + 1}: {h}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Question log */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Final submit button */}
          <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: '#2a2e38', background: '#12151c' }}>
            <div className="text-xs" style={{ color: '#8b8d93' }}>
              심문 기록 ({state.questions.length}건)
            </div>
            <button
              onClick={() => setShowFinalModal(true)}
              disabled={state.solved || state.gameOver || state.attemptsUsed >= MAX_FINAL_ATTEMPTS}
              className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-bold disabled:opacity-30"
              style={{ background: '#c8a24e', color: '#0b0d11' }}
            >
              <FileText size={12} />
              최종 추리 ({MAX_FINAL_ATTEMPTS - state.attemptsUsed}회 남음)
            </button>
          </div>

          {/* Log */}
          <div ref={logRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {state.questions.length === 0 && (
              <div className="text-center py-12" style={{ color: '#5a5c63' }}>
                <FileText size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">질문을 시작하세요</p>
                <p className="text-xs mt-1">예/아니오로 답할 수 있는 질문만 가능합니다</p>
              </div>
            )}
            {state.questions.map((q, i) => (
              <div key={i} className="rounded-lg p-3 border" style={{ borderColor: '#2a2e38', background: '#181c25' }}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm flex-1" style={{ color: '#e8e6e3' }}>
                    <span className="text-xs mr-1" style={{ color: '#5a5c63' }}>Q{i + 1}.</span>
                    {q.text}
                  </p>
                  <div className="flex items-center gap-1">
                    <span className={`stamp ${VERDICT_COLORS[q.verdict]} text-white`}>
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
                    >
                      <Flag size={12} style={{ color: '#c0392b' }} />
                    </button>
                  </div>
                </div>
                {q.revealedFacts.length > 0 && (
                  <div className="flex gap-1 mt-1">
                    {q.revealedFacts.map((fid) => {
                      const factIdx = caseInfo.keyFactLabels.findIndex((f) => f.id === fid);
                      return (
                        <span key={fid} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#c8a24e22', color: '#c8a24e' }}>
                          <Unlock size={8} className="inline mr-0.5" />
                          핵심 요소 {factIdx + 1}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Input */}
          {mustFinalSubmit ? (
            <div className="p-4 border-t" style={{ borderColor: '#2a2e38', background: '#12151c' }}>
              <div className="text-center">
                <AlertTriangle size={24} className="mx-auto mb-2" style={{ color: '#c0392b' }} />
                <p className="text-sm mb-2" style={{ color: '#c0392b' }}>질문이 소진되었습니다</p>
                <button
                  onClick={() => setShowFinalModal(true)}
                  className="px-4 py-2 rounded font-bold text-sm"
                  style={{ background: '#c8a24e', color: '#0b0d11' }}
                >
                  최종 추리 제출
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 border-t" style={{ borderColor: '#2a2e38', background: '#12151c' }}>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitQuestion()}
                  placeholder={canAskQuestion ? '예/아니오로 답할 수 있는 질문을 입력하세요...' : '게임이 종료되었습니다'}
                  disabled={!canAskQuestion || loading}
                  maxLength={MAX_QUESTION_LENGTH}
                  className="flex-1 px-3 py-2 rounded-lg border text-sm outline-none disabled:opacity-30"
                  style={{ borderColor: '#2a2e38', background: '#181c25', color: '#e8e6e3' }}
                />
                <button
                  onClick={submitQuestion}
                  disabled={!canAskQuestion || loading || !question.trim()}
                  className="px-4 py-2 rounded-lg disabled:opacity-30"
                  style={{ background: '#c8a24e', color: '#0b0d11' }}
                >
                  {loading ? '...' : <Send size={16} />}
                </button>
              </div>
              <div className="flex justify-between mt-1 text-[10px]" style={{ color: '#5a5c63' }}>
                <span>{question.length}/{MAX_QUESTION_LENGTH}</span>
                <span>-1Q (INVALID는 무료)</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Final Answer Modal */}
      {showFinalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)' }}>
          <div className="w-full max-w-lg rounded-xl border p-6" style={{ borderColor: '#2a2e38', background: '#12151c' }}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold" style={{ color: '#c8a24e' }}>최종 추리 제출</h2>
              <button onClick={() => setShowFinalModal(false)}>
                <X size={20} style={{ color: '#8b8d93' }} />
              </button>
            </div>
            <div className="mb-3 p-2 rounded text-xs" style={{ background: '#8b3a3a22', color: '#c0392b', border: '1px solid #8b3a3a44' }}>
              <AlertTriangle size={12} className="inline mr-1" />
              오답 시 질문 {COST_WRONG_ANSWER}개가 차감됩니다
            </div>
            <textarea
              value={finalAnswer}
              onChange={(e) => setFinalAnswer(e.target.value)}
              placeholder="사건의 전말을 자유롭게 서술하세요..."
              rows={6}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
              style={{ borderColor: '#2a2e38', background: '#181c25', color: '#e8e6e3' }}
            />
            <button
              onClick={submitFinalAnswer}
              disabled={finalLoading || !finalAnswer.trim()}
              className="w-full mt-3 py-2 rounded-lg font-bold text-sm disabled:opacity-30"
              style={{ background: '#c8a24e', color: '#0b0d11' }}
            >
              {finalLoading ? '채점 중...' : '제출'}
            </button>
          </div>
        </div>
      )}

      {/* Result screen */}
      {showResult && resultData && (
        <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: '#0b0d11' }}>
          <div className="max-w-2xl mx-auto p-6">
            <div className="text-center mb-8">
              {state.solved ? (
                <>
                  <Trophy size={48} className="mx-auto mb-3" style={{ color: '#c8a24e' }} />
                  <h1 className="text-2xl font-bold mb-1" style={{ color: '#c8a24e' }}>사건 해결</h1>
                  <div className="text-4xl font-bold mb-1" style={{ color: '#e8e6e3' }}>
                    {resultData.rank} 랭크
                  </div>
                  <div className="text-lg" style={{ color: '#8b8d93' }}>
                    {resultData.score}점
                  </div>
                </>
              ) : (
                <>
                  <AlertTriangle size={48} className="mx-auto mb-3" style={{ color: '#c0392b' }} />
                  <h1 className="text-2xl font-bold mb-1" style={{ color: '#c0392b' }}>미해결</h1>
                  <p className="text-sm" style={{ color: '#8b8d93' }}>D 랭크</p>
                </>
              )}
            </div>

            {/* Truth reveal */}
            {resultData.truth && (
              <div className="mb-6 p-4 rounded-xl border" style={{ borderColor: '#c8a24e33', background: '#c8a24e08' }}>
                <h2 className="text-sm font-bold mb-2" style={{ color: '#c8a24e' }}>사건 전말</h2>
                <p className="text-sm leading-relaxed" style={{ color: '#e8e6e3' }}>
                  {resultData.truth}
                </p>
              </div>
            )}

            {/* Factor results */}
            {resultData.results && (
              <div className="mb-6 space-y-2">
                <h2 className="text-sm font-bold" style={{ color: '#8b8d93' }}>핵심 요소 채점</h2>
                {resultData.results.map((r) => {
                  const fact = caseInfo.keyFactLabels.find((f) => f.id === r.id);
                  return (
                    <div key={r.id} className="flex items-center gap-2 p-2 rounded border" style={{ borderColor: '#2a2e38', background: '#181c25' }}>
                      <span className={`stamp text-white ${r.status === 'hit' ? 'bg-[#3a7d44]' : r.status === 'partial' ? 'bg-[#8b7a3a]' : 'bg-[#8b3a3a]'}`}>
                        {r.status}
                      </span>
                      <span className="text-sm" style={{ color: '#e8e6e3' }}>
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
                  alert('복사되었습니다!');
                }}
                className="px-4 py-2 rounded text-sm border"
                style={{ borderColor: '#2a2e38', color: '#e8e6e3' }}
              >
                결과 공유 복사
              </button>
              <button
                onClick={() => router.push('/cases')}
                className="flex items-center gap-1 mx-auto px-4 py-2 rounded text-sm"
                style={{ background: '#c8a24e', color: '#0b0d11' }}
              >
                사건 목록으로 <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image overlay */}
      {imageOverlay !== null && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-8"
          style={{ background: 'rgba(0,0,0,0.9)' }}
          onClick={() => setImageOverlay(null)}
        >
          <div className="max-w-2xl w-full rounded-xl overflow-hidden border" style={{ borderColor: '#c8a24e33', background: '#12151c' }}>
            {caseInfo.images?.[imageOverlay] ? (
              <img
                src={caseInfo.images[imageOverlay]}
                alt={`단서 ${imageOverlay + 1}`}
                className="w-full h-auto"
              />
            ) : (
              <div className="p-8 text-center">
                <Eye size={32} className="mx-auto mb-3" style={{ color: '#c8a24e' }} />
                <p className="text-sm" style={{ color: '#8b8d93' }}>
                  {`삽화 ${imageOverlay + 1}`}
                </p>
              </div>
            )}
            <p className="text-xs text-center py-3" style={{ color: '#5a5c63' }}>
              클릭하여 닫기
            </p>
          </div>
        </div>
      )}

      {/* Hint modal */}
      {showHintModal && hints.length > 0 && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.8)' }}
          onClick={() => setShowHintModal(false)}
        >
          <div className="max-w-md w-full rounded-xl p-6 border" style={{ borderColor: '#c8a24e33', background: '#12151c' }}>
            <Lightbulb size={24} className="mx-auto mb-2" style={{ color: '#c8a24e' }} />
            <h3 className="text-center text-sm font-bold mb-3" style={{ color: '#c8a24e' }}>
              힌트 {hints.length}
            </h3>
            <p className="text-sm text-center" style={{ color: '#e8e6e3' }}>
              {hints[hints.length - 1]}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
