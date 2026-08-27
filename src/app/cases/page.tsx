'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Star,
  Image as ImageIcon,
  Trophy,
  ChevronRight,
  LoaderCircle,
  FolderOpen,
} from 'lucide-react';
import { CasePublicDTO, SinglePlayerState } from '@/lib/types';
import { INITIAL_TOKENS } from '@/lib/gameConfig';

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

function initSinglePlayerState(caseId: string): SinglePlayerState {
  return {
    caseId,
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
}

function DifficultyStars({ level }: { level: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`난이도 ${level}성`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={12}
          className={
            i < level
              ? 'fill-[#c8a24e] text-[#c8a24e]'
              : 'fill-transparent text-[#2a2e38]'
          }
        />
      ))}
    </div>
  );
}

function RankBadge({ rank, score }: { rank: string; score: number }) {
  const rankColors: Record<string, string> = {
    S: 'text-[#c8a24e] border-[#c8a24e] bg-[#c8a24e]/10',
    A: 'text-emerald-400 border-emerald-400 bg-emerald-400/10',
    B: 'text-sky-400 border-sky-400 bg-sky-400/10',
    C: 'text-violet-400 border-violet-400 bg-violet-400/10',
    D: 'text-[#8b8d93] border-[#2a2e38] bg-[#2a2e38]/40',
  };
  const colorClass = rankColors[rank] ?? rankColors['D'];

  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded border text-xs font-bold ${colorClass}`}>
      <Trophy size={11} />
      <span>랭크 {rank}</span>
      <span className="opacity-70 font-normal">· {score}점</span>
    </div>
  );
}

function CaseCard({
  caseData,
  save,
  onResume,
  onNewGame,
}: {
  caseData: CasePublicDTO;
  save: SinglePlayerState | undefined;
  onResume: () => void;
  onNewGame: () => void;
}) {
  const cleared = save?.solved === true;
  const inProgress = save && !save.gameOver && !save.solved && save.totalQuestions > 0;

  return (
    <div
      className="group relative flex flex-col w-full text-left rounded-lg border border-[#2a2e38] bg-[#181c25] hover:border-[#c8a24e]/50 hover:bg-[#1e2230] transition-all duration-200 overflow-hidden"
    >
      {/* Cleared overlay strip */}
      {cleared && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#c8a24e]/0 via-[#c8a24e] to-[#c8a24e]/0" />
      )}

      {/* Thumbnail */}
      {caseData.images?.[0] && (
        <div className="w-full aspect-[16/9] overflow-hidden bg-[#12151c]">
          <img
            src={caseData.images[0]}
            alt={caseData.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </div>
      )}

      <div className="flex flex-col gap-3 p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-sm font-semibold text-[#e8e6e3] leading-snug group-hover:text-[#c8a24e] transition-colors line-clamp-2">
            {caseData.title}
          </h2>
          {/* Status */}
          {cleared && save?.rank && save?.score !== undefined ? (
            <RankBadge rank={save.rank} score={save.score} />
          ) : inProgress ? (
            <span className="text-[10px] text-[#c8a24e]/80 border border-[#c8a24e]/30 bg-[#c8a24e]/5 px-2 py-0.5 rounded shrink-0">
              진행 중
            </span>
          ) : (
            <span className="text-[10px] text-[#5a5c63] shrink-0">미도전</span>
          )}
        </div>

        {/* Difficulty */}
        <DifficultyStars level={caseData.difficulty} />

        {/* Brief */}
        <p className="text-xs text-[#8b8d93] leading-relaxed line-clamp-3">
          {caseData.brief}
        </p>

        {/* Action buttons */}
        <div className="flex gap-2 pt-1 mt-auto">
          {inProgress ? (
            <>
              <button
                type="button"
                onClick={onResume}
                className="flex-1 py-2 rounded text-xs font-semibold"
                style={{ background: '#c8a24e', color: '#0b0d11' }}
              >
                이어하기
              </button>
              <button
                type="button"
                onClick={onNewGame}
                className="py-2 px-3 rounded text-xs border"
                style={{ borderColor: '#2a2e38', color: '#8b8d93' }}
              >
                새로 시작
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onNewGame}
              className="flex-1 py-2 rounded text-xs font-semibold"
              style={{ background: '#c8a24e', color: '#0b0d11' }}
            >
              시작하기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-lg border border-[#2a2e38] bg-[#181c25] p-5 flex flex-col gap-3 animate-pulse">
      <div className="h-4 w-3/4 bg-[#2a2e38] rounded" />
      <div className="h-3 w-20 bg-[#2a2e38] rounded" />
      <div className="space-y-1.5">
        <div className="h-3 w-full bg-[#2a2e38] rounded" />
        <div className="h-3 w-5/6 bg-[#2a2e38] rounded" />
        <div className="h-3 w-2/3 bg-[#2a2e38] rounded" />
      </div>
      <div className="flex gap-1.5">
        <div className="h-4 w-12 bg-[#2a2e38] rounded" />
        <div className="h-4 w-16 bg-[#2a2e38] rounded" />
      </div>
    </div>
  );
}

export default function CasesPage() {
  const router = useRouter();
  const [cases, setCases] = useState<CasePublicDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saves, setSaves] = useState<SaveMap>({});

  useEffect(() => {
    setSaves(loadSaves());

    fetch('/api/cases')
      .then((res) => {
        if (!res.ok) throw new Error(`서버 오류 (${res.status})`);
        return res.json() as Promise<CasePublicDTO[]>;
      })
      .then((data) => {
        setCases(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : '알 수 없는 오류');
        setLoading(false);
      });
  }, []);

  function handleResume(caseId: string) {
    router.push(`/play/${caseId}`);
  }

  function handleNewGame(caseId: string) {
    const freshState = initSinglePlayerState(caseId);
    const allSaves: SaveMap = { ...saves, [caseId]: freshState };
    localStorage.setItem(SAVES_KEY, JSON.stringify(allSaves));
    setSaves(allSaves);
    router.push(`/play/${caseId}`);
  }

  return (
    <div className="min-h-screen bg-[#0b0d11] flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-20 bg-[#0b0d11]/90 backdrop-blur border-b border-[#2a2e38]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="flex items-center gap-1.5 text-[#8b8d93] hover:text-[#e8e6e3] transition-colors text-sm"
            aria-label="홈으로 돌아가기"
          >
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">홈</span>
          </button>

          <div className="h-4 w-px bg-[#2a2e38]" />

          <h1 className="text-sm font-semibold tracking-widest text-[#c8a24e] uppercase">
            사건 기록실
          </h1>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-8">
        {/* Section heading */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-[#5a5c63] text-xs mt-1">
              {loading
                ? '불러오는 중...'
                : error
                ? '사건 목록을 불러오지 못했습니다.'
                : `총 ${cases.length}건의 사건`}
            </p>
          </div>
        </div>

        {/* Error state */}
        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <FolderOpen size={40} className="text-[#2a2e38]" />
            <p className="text-[#8b8d93] text-sm">{error}</p>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setError(null);
                fetch('/api/cases')
                  .then((r) => r.json() as Promise<CasePublicDTO[]>)
                  .then((d) => { setCases(d); setLoading(false); })
                  .catch((e: unknown) => {
                    setError(e instanceof Error ? e.message : '알 수 없는 오류');
                    setLoading(false);
                  });
              }}
              className="mt-1 px-4 py-2 text-sm rounded border border-[#2a2e38] text-[#8b8d93] hover:border-[#c8a24e]/50 hover:text-[#c8a24e] transition-colors"
            >
              다시 시도
            </button>
          </div>
        )}

        {/* Loading skeleton grid */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && cases.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <FolderOpen size={40} className="text-[#2a2e38]" />
            <p className="text-[#8b8d93] text-sm">등록된 사건이 없습니다.</p>
          </div>
        )}

        {/* Cases grid */}
        {!loading && !error && cases.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cases.map((c) => (
              <CaseCard
                key={c.id}
                caseData={c}
                save={saves[c.id]}
                onResume={() => handleResume(c.id)}
                onNewGame={() => handleNewGame(c.id)}
              />
            ))}
          </div>
        )}

        {/* Loading spinner fallback for very slow fetches */}
        {loading && (
          <div className="sr-only" aria-live="polite" aria-busy="true">
            <LoaderCircle className="animate-spin" />
            사건 목록을 불러오는 중입니다.
          </div>
        )}
      </main>
    </div>
  );
}
