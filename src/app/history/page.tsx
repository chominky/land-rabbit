'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Star,
  Trophy,
  FileText,
  Clock,
  History as HistoryIcon,
} from 'lucide-react';
import { CasePublicDTO, SinglePlayerState } from '@/lib/types';
import { rankBadgeClass } from '@/lib/theme';

const SAVES_KEY = 'yesno_saves';

type SaveMap = Record<string, SinglePlayerState>;

function loadSaves(): SaveMap {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(SAVES_KEY) ?? '{}') as SaveMap;
  } catch {
    return {};
  }
}

function lastPlayedAt(save: SinglePlayerState): number {
  const qs = save.questions;
  if (qs.length > 0) return qs[qs.length - 1].timestamp;
  return 0;
}

function formatRelative(ts: number): string {
  if (!ts) return '기록 없음';
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}일 전`;
  return new Date(ts).toLocaleDateString('ko-KR');
}

function DifficultyStars({ level }: { level: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`난이도 ${level}성`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={11}
          className={
            i < level
              ? 'fill-accent text-accent'
              : 'fill-transparent text-border'
          }
        />
      ))}
    </div>
  );
}

type StatusKind = 'cleared' | 'in-progress' | 'game-over' | 'untouched';

function statusOf(save: SinglePlayerState): StatusKind {
  if (save.solved) return 'cleared';
  if (save.gameOver) return 'game-over';
  if (save.totalQuestions > 0) return 'in-progress';
  return 'untouched';
}

export default function HistoryPage() {
  const router = useRouter();
  const [cases, setCases] = useState<CasePublicDTO[]>([]);
  const [saves, setSaves] = useState<SaveMap>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSaves(loadSaves());
    fetch('/api/cases')
      .then((r) => (r.ok ? (r.json() as Promise<CasePublicDTO[]>) : []))
      .then((data) => setCases(Array.isArray(data) ? data : []))
      .catch(() => setCases([]))
      .finally(() => setLoading(false));
  }, []);

  const caseById = new Map(cases.map((c) => [c.id, c]));

  // Only records that have been touched (played at all)
  const records = Object.values(saves)
    .filter((s) => statusOf(s) !== 'untouched')
    .sort((a, b) => lastPlayedAt(b) - lastPlayedAt(a));

  const clearedCount = records.filter((r) => r.solved).length;

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-20 bg-bg/90 backdrop-blur border-b border-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="flex items-center gap-1.5 text-muted hover:text-fg transition-colors text-sm"
            aria-label="홈으로 돌아가기"
          >
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">홈</span>
          </button>
          <div className="h-4 w-px bg-border" />
          <h1 className="text-sm font-semibold tracking-widest text-accent uppercase">
            플레이 기록
          </h1>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-8">
        {/* Summary */}
        {!loading && records.length > 0 && (
          <div className="mb-6 flex items-center gap-4 text-xs text-muted">
            <span>플레이한 사건 {records.length}건</span>
            <span className="text-border">·</span>
            <span className="text-accent">해결 {clearedCount}건</span>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-20 rounded-lg border border-border bg-surface-2 animate-pulse"
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && records.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <HistoryIcon size={40} className="text-border" />
            <p className="text-muted text-sm">아직 플레이한 사건이 없습니다.</p>
            <button
              type="button"
              onClick={() => router.push('/cases')}
              className="mt-1 px-4 py-2 text-sm rounded border border-border text-muted hover:border-accent/50 hover:text-accent transition-colors"
            >
              사건 보러 가기
            </button>
          </div>
        )}

        {/* Records */}
        {!loading && records.length > 0 && (
          <ul className="space-y-3">
            {records.map((save) => {
              const c = caseById.get(save.caseId);
              const kind = statusOf(save);
              const title = c?.title ?? save.caseId;
              return (
                <li key={save.caseId}>
                  <button
                    type="button"
                    onClick={() => router.push(`/play/${save.caseId}`)}
                    className="group w-full text-left rounded-lg border border-border bg-surface-2 hover:border-accent/50 hover:bg-surface-3 transition-all p-4 flex items-center gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <h2 className="text-sm font-semibold text-fg group-hover:text-accent transition-colors truncate">
                          {title}
                        </h2>
                        {kind === 'cleared' && (
                          <span className="shrink-0 text-[10px] text-accent border border-accent/30 bg-accent/5 px-1.5 py-0.5 rounded">
                            해결
                          </span>
                        )}
                        {kind === 'in-progress' && (
                          <span className="shrink-0 text-[10px] text-accent/80 border border-accent/30 bg-accent/5 px-1.5 py-0.5 rounded">
                            진행 중
                          </span>
                        )}
                        {kind === 'game-over' && (
                          <span className="shrink-0 text-[10px] text-danger border border-danger/30 bg-danger/5 px-1.5 py-0.5 rounded">
                            미해결
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted">
                        {c && <DifficultyStars level={c.difficulty} />}
                        <span className="flex items-center gap-1">
                          <FileText size={11} /> 질문 {save.totalQuestions}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock size={11} /> {formatRelative(lastPlayedAt(save))}
                        </span>
                      </div>
                    </div>

                    {/* Right: rank / tokens */}
                    <div className="shrink-0 text-right">
                      {kind === 'cleared' && save.rank ? (
                        <div
                          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border text-xs font-bold ${rankBadgeClass(save.rank)}`}
                        >
                          <Trophy size={11} />
                          <span>랭크 {save.rank}</span>
                          {save.score !== undefined && (
                            <span className="opacity-70 font-normal">· {save.score}점</span>
                          )}
                        </div>
                      ) : (
                        <div className="text-[11px] text-dim">
                          남은 질문 {save.tokens}
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
