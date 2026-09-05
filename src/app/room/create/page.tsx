'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft, Users, Swords, Star, Loader2, AlertCircle,
} from 'lucide-react';
import { CasePublicDTO, RoomMode } from '@/lib/types';
import { MAX_QUESTION_LENGTH } from '@/lib/gameConfig';
import { T, alpha } from '@/lib/theme';

void MAX_QUESTION_LENGTH; // imported for potential future use

const BG = T.bg;
const CARD = T.surface;
const CARD2 = T.surface2;
const BORDER = T.border;
const AMBER = T.accent;
const MUTED = T.muted;
const DIM = T.dim;
const TEXT = T.fg;

function DifficultyStars({ level }: { level: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`난이도 ${level}`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={11}
          style={{
            fill: i < level ? AMBER : 'transparent',
            color: i < level ? AMBER : BORDER,
          }}
        />
      ))}
    </span>
  );
}

export default function RoomCreatePage() {
  const router = useRouter();

  const [cases, setCases] = useState<CasePublicDTO[]>([]);
  const [casesLoading, setCasesLoading] = useState(true);
  const [casesError, setCasesError] = useState<string | null>(null);

  const [caseId, setCaseId] = useState('');
  const [nickname, setNickname] = useState('');
  const [mode, setMode] = useState<RoomMode>('coop');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/cases')
      .then((r) => {
        if (!r.ok) throw new Error(`서버 오류 (${r.status})`);
        return r.json() as Promise<CasePublicDTO[]>;
      })
      .then((data) => {
        setCases(data);
        if (data.length > 0) setCaseId(data[0].id);
        setCasesLoading(false);
      })
      .catch((e: unknown) => {
        setCasesError(e instanceof Error ? e.message : '알 수 없는 오류');
        setCasesLoading(false);
      });
  }, []);

  const selectedCase = cases.find((c) => c.id === caseId) ?? null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!caseId || !nickname.trim()) return;

    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId, nickname: nickname.trim(), mode }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '방 생성에 실패했습니다.');
        return;
      }

      const { roomCode, playerId } = data as { roomCode: string; roomId: string; playerId: string };

      // Persist player identity for this room
      localStorage.setItem(
        `yesno_player_${roomCode}`,
        JSON.stringify({ playerId, nickname: nickname.trim() }),
      );

      router.push(`/room/${roomCode}`);
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: BG }}>
      {/* Header */}
      <header
        className="flex items-center gap-3 px-4 py-3 border-b"
        style={{ background: CARD, borderColor: BORDER }}
      >
        <button
          type="button"
          onClick={() => router.push('/')}
          className="flex items-center gap-1 text-sm transition-colors"
          style={{ color: MUTED }}
          aria-label="홈으로"
        >
          <ChevronLeft size={16} />
          홈
        </button>
        <div className="h-4 w-px" style={{ background: BORDER }} />
        <h1 className="text-sm font-bold tracking-widest uppercase" style={{ color: AMBER }}>
          방 만들기
        </h1>
      </header>

      <main className="flex-1 flex items-start justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Case selector */}
            <div>
              <label
                htmlFor="caseSelect"
                className="block text-xs font-semibold mb-2 tracking-wider uppercase"
                style={{ color: MUTED }}
              >
                사건 선택
              </label>

              {casesLoading && (
                <div
                  className="flex items-center gap-2 px-3 py-3 rounded-lg border text-sm"
                  style={{ background: CARD2, borderColor: BORDER, color: MUTED }}
                >
                  <Loader2 size={14} className="animate-spin" />
                  사건 목록 불러오는 중…
                </div>
              )}

              {casesError && (
                <div
                  className="flex items-center gap-2 px-3 py-3 rounded-lg border text-sm"
                  style={{ background: 'var(--danger-surface)', borderColor: 'var(--no)', color: 'var(--danger-soft)' }}
                >
                  <AlertCircle size={14} />
                  {casesError}
                </div>
              )}

              {!casesLoading && !casesError && (
                <select
                  id="caseSelect"
                  value={caseId}
                  onChange={(e) => setCaseId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none appearance-none cursor-pointer"
                  style={{ background: CARD2, borderColor: BORDER, color: TEXT }}
                  required
                >
                  {cases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              )}

              {/* Selected case preview */}
              {selectedCase && (
                <div
                  className="mt-2 px-3 py-2.5 rounded-lg border text-xs space-y-1"
                  style={{ background: CARD2, borderColor: BORDER }}
                >
                  <div className="flex items-center justify-between">
                    <DifficultyStars level={selectedCase.difficulty} />
                    <span style={{ color: DIM }}>{selectedCase.imageCount}장</span>
                  </div>
                  <p className="leading-relaxed line-clamp-2" style={{ color: MUTED }}>
                    {selectedCase.brief}
                  </p>
                </div>
              )}
            </div>

            {/* Nickname */}
            <div>
              <label
                htmlFor="nickname"
                className="block text-xs font-semibold mb-2 tracking-wider uppercase"
                style={{ color: MUTED }}
              >
                닉네임
              </label>
              <input
                id="nickname"
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="탐정의 이름을 입력하세요"
                maxLength={20}
                required
                className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none"
                style={{ background: CARD2, borderColor: BORDER, color: TEXT }}
              />
              <p className="mt-1 text-[10px]" style={{ color: DIM }}>
                {nickname.length} / 20
              </p>
            </div>

            {/* Mode */}
            <div>
              <span
                className="block text-xs font-semibold mb-2 tracking-wider uppercase"
                style={{ color: MUTED }}
              >
                게임 모드
              </span>
              <div className="grid grid-cols-2 gap-3">
                {/* Coop */}
                <button
                  type="button"
                  onClick={() => setMode('coop')}
                  className="flex flex-col items-center gap-2 px-4 py-4 rounded-lg border transition-all"
                  style={{
                    background: mode === 'coop' ? alpha(AMBER, 0.08) : CARD2,
                    borderColor: mode === 'coop' ? AMBER : BORDER,
                    color: mode === 'coop' ? AMBER : MUTED,
                  }}
                >
                  <Users size={22} />
                  <div className="text-center">
                    <div className="text-sm font-bold">협동</div>
                    <div className="text-[10px] mt-0.5" style={{ color: mode === 'coop' ? alpha(AMBER, 0.67) : DIM }}>
                      함께 추리하기
                    </div>
                  </div>
                  {mode === 'coop' && (
                    <span
                      className="text-[10px] px-2 py-0.5 rounded"
                      style={{ background: AMBER, color: BG }}
                    >
                      선택됨
                    </span>
                  )}
                </button>

                {/* Versus */}
                <button
                  type="button"
                  onClick={() => setMode('versus')}
                  className="flex flex-col items-center gap-2 px-4 py-4 rounded-lg border transition-all"
                  style={{
                    background: mode === 'versus' ? alpha(AMBER, 0.08) : CARD2,
                    borderColor: mode === 'versus' ? AMBER : BORDER,
                    color: mode === 'versus' ? AMBER : MUTED,
                  }}
                >
                  <Swords size={22} />
                  <div className="text-center">
                    <div className="text-sm font-bold">대결</div>
                    <div className="text-[10px] mt-0.5" style={{ color: mode === 'versus' ? alpha(AMBER, 0.67) : DIM }}>
                      각자 추리 경쟁
                    </div>
                  </div>
                  {mode === 'versus' && (
                    <span
                      className="text-[10px] px-2 py-0.5 rounded"
                      style={{ background: AMBER, color: BG }}
                    >
                      선택됨
                    </span>
                  )}
                </button>
              </div>

              {mode === 'coop' && (
                <p className="mt-2 text-[11px] leading-relaxed" style={{ color: DIM }}>
                  모든 플레이어가 공유 질문 수로 함께 질문합니다. 채팅으로 소통하며 협력하세요.
                </p>
              )}
              {mode === 'versus' && (
                <p className="mt-2 text-[11px] leading-relaxed" style={{ color: DIM }}>
                  각자 자유롭게 질문하며 동시에 추리합니다. 질문 수 관리와 빠른 판단이 관건입니다.
                </p>
              )}
            </div>

            {/* Error */}
            {error && (
              <div
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm"
                style={{ background: 'var(--danger-surface)', borderColor: 'var(--no)', color: 'var(--danger-soft)' }}
              >
                <AlertCircle size={14} className="shrink-0" />
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting || casesLoading || !caseId || !nickname.trim()}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold transition-opacity disabled:opacity-40"
              style={{ background: AMBER, color: BG }}
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  방 생성 중…
                </>
              ) : (
                '방 만들기'
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
