'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CalendarDays,
  Star,
  Timer,
  Trophy,
  Users,
} from 'lucide-react';
import type { CasePublicDTO, SinglePlayerState } from '@/lib/types';
import type { LeaderboardEntry } from '@/lib/leaderboard';
import { INITIAL_TOKENS, MAX_NICKNAME_LENGTH } from '@/lib/gameConfig';
import { NICKNAME_KEY, SAVES_KEY, loadNickname, saveNickname } from '@/lib/settings';
import { rankBadgeClass } from '@/lib/theme';

/**
 * 오늘의 사건 (P4-B).
 *
 * 사건 선택은 서버가 날짜만으로 결정하므로 같은 날 모두 같은 사건을 본다.
 * 리더보드 기록은 클리어 시 서버가 직접 남긴다 — 이 화면은 조회만 한다.
 */

type DailyResponse = {
  dateKey: string;
  resetAt: string;
  case: CasePublicDTO | null;
  entries: LeaderboardEntry[];
};

type SaveMap = Record<string, SinglePlayerState>;

/** useSyncExternalStore용 — 구독할 외부 저장소가 없다 (play 페이지와 같은 패턴). */
const noopSubscribe = () => () => {};

function loadSave(caseId: string): SinglePlayerState | undefined {
  try {
    return (JSON.parse(localStorage.getItem(SAVES_KEY) ?? '{}') as SaveMap)[caseId];
  } catch {
    return undefined;
  }
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return '곧 갱신';
  const total = Math.floor(ms / 1000);
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function Countdown({ resetAt }: { resetAt: string }) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setRemaining(new Date(resetAt).getTime() - Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [resetAt]);

  // 서버·클라이언트 시각이 달라 하이드레이션이 어긋나지 않게 첫 프레임은 비운다.
  return (
    <span className="tabular-nums" aria-live="off">
      {remaining === null ? '--:--:--' : formatRemaining(remaining)}
    </span>
  );
}

export default function DailyPage() {
  const router = useRouter();
  const [data, setData] = useState<DailyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 저장된 닉네임은 외부 저장소(localStorage)에서 읽고, 편집 중인 값만 상태로 둔다.
  // 서버 스냅샷이 ''이라 하이드레이션이 어긋나지 않는다.
  const savedNickname = useSyncExternalStore(noopSubscribe, loadNickname, () => '');
  const [draftNickname, setDraftNickname] = useState<string | null>(null);
  const nickname = draftNickname ?? savedNickname;
  const [save, setSave] = useState<SinglePlayerState | undefined>();

  /**
   * 상태 초기화(setLoading/setError)는 재시도 버튼에서만 한다.
   * 이펙트 본문에서 동기적으로 setState하지 않기 위한 분리다 — 첫 로딩은
   * loading 초기값 true가 이미 담당한다.
   */
  const load = useCallback(() => {
    fetch('/api/daily')
      .then((res) => {
        if (!res.ok) throw new Error(`서버 오류 (${res.status})`);
        return res.json() as Promise<DailyResponse>;
      })
      .then((res) => {
        setData(res);
        if (res.case) setSave(loadSave(res.case.id));
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : '알 수 없는 오류');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function retry() {
    setLoading(true);
    setError(null);
    load();
  }

  function start() {
    if (!data?.case) return;
    saveNickname(nickname);
    router.push(`/play/${data.case.id}`);
  }

  const cleared = save?.solved === true;
  const inProgress = !!save && !save.solved && !save.gameOver && save.totalQuestions > 0;
  const myEntries = (data?.entries ?? []).filter(
    (e) => nickname.trim() && e.nickname === nickname.trim()
  );

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <header className="sticky top-0 z-20 bg-bg/90 backdrop-blur border-b border-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
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
            오늘의 사건
          </h1>
          {data && (
            <span className="ml-auto flex items-center gap-1.5 text-xs text-dim">
              <Timer size={12} />
              <Countdown resetAt={data.resetAt} />
            </span>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-8 space-y-6">
        {loading && (
          <div className="rounded-lg border border-border bg-surface-2 p-6 animate-pulse space-y-3">
            <div className="h-4 w-1/2 bg-border rounded" />
            <div className="h-3 w-full bg-border rounded" />
            <div className="h-3 w-2/3 bg-border rounded" />
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <CalendarDays size={40} className="text-border" />
            <p className="text-sm text-muted">{error}</p>
            <button
              type="button"
              onClick={retry}
              className="px-4 py-2 text-sm rounded border border-border text-muted hover:border-accent/50 hover:text-accent transition-colors"
            >
              다시 시도
            </button>
          </div>
        )}

        {!loading && !error && data && !data.case && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <CalendarDays size={40} className="text-border" />
            <p className="text-sm text-muted">발행된 사건이 없어 오늘의 사건을 고를 수 없습니다.</p>
          </div>
        )}

        {!loading && !error && data?.case && (
          <>
            {/* 오늘의 사건 카드 */}
            <section className="rounded-lg border border-accent/30 bg-surface-2 overflow-hidden">
              {data.case.images?.[0] && (
                <div className="w-full aspect-[16/9] overflow-hidden bg-surface">
                  <img
                    src={data.case.images[0]}
                    alt={data.case.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] tracking-widest uppercase text-accent">
                      {data.dateKey} · KST 자정 갱신
                    </p>
                    <h2 className="text-base font-semibold text-fg mt-1">{data.case.title}</h2>
                  </div>
                  <div
                    className="flex items-center gap-0.5 shrink-0"
                    aria-label={`난이도 ${data.case.difficulty}성`}
                  >
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        size={12}
                        className={
                          i < data.case!.difficulty
                            ? 'fill-accent text-accent'
                            : 'fill-transparent text-border'
                        }
                      />
                    ))}
                  </div>
                </div>

                <p className="text-sm leading-relaxed text-muted line-clamp-4">
                  {data.case.brief}
                </p>

                <label className="flex flex-col gap-1">
                  <span className="text-[11px] tracking-wider uppercase text-muted">
                    리더보드 닉네임
                  </span>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setDraftNickname(e.target.value)}
                    onBlur={() => saveNickname(nickname)}
                    placeholder="탐정 이름"
                    maxLength={MAX_NICKNAME_LENGTH}
                    className="rounded px-3 py-2 text-sm bg-bg border border-border text-fg outline-none focus:border-accent"
                  />
                  <span className="text-[11px] text-dim">
                    비워두면 &apos;익명&apos;으로 기록됩니다. 클리어하면 자동으로 등록돼요.
                  </span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={start}
                    className="flex-1 py-2.5 rounded text-sm font-semibold"
                    style={{ background: 'var(--accent)', color: 'var(--bg)' }}
                  >
                    {cleared ? '결과 다시 보기' : inProgress ? '이어하기' : '도전하기'}
                  </button>
                </div>

                {(cleared || inProgress) && (
                  <p className="text-xs text-dim">
                    {cleared
                      ? `클리어 · ${save?.score ?? 0}점 (랭크 ${save?.rank ?? '-'})`
                      : `진행 중 · 질문 ${save?.totalQuestions ?? 0}개 · 남은 ${save?.tokens ?? INITIAL_TOKENS}Q`}
                  </p>
                )}
              </div>
            </section>

            {/* 리더보드 */}
            <section>
              <div className="flex items-center gap-2 mb-2 px-1">
                <Trophy size={14} className="text-accent" />
                <h2 className="text-xs font-semibold tracking-wider uppercase text-muted">
                  오늘의 순위
                </h2>
                <span className="ml-auto flex items-center gap-1 text-[11px] text-dim">
                  <Users size={11} />
                  {data.entries.length}명
                </span>
              </div>

              {data.entries.length === 0 ? (
                <div className="rounded-lg border border-border bg-surface-2 py-10 text-center text-sm text-muted">
                  아직 오늘의 기록이 없습니다. 첫 번째가 되어보세요.
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-surface-2 overflow-hidden">
                  <table className="w-full text-sm">
                    <caption className="sr-only">오늘의 사건 리더보드</caption>
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wider text-dim">
                        <th scope="col" className="text-left font-medium px-4 py-2 w-12">
                          #
                        </th>
                        <th scope="col" className="text-left font-medium px-2 py-2">
                          닉네임
                        </th>
                        <th scope="col" className="text-right font-medium px-2 py-2">
                          점수
                        </th>
                        <th scope="col" className="text-right font-medium px-2 py-2 hidden sm:table-cell">
                          질문
                        </th>
                        <th scope="col" className="text-right font-medium px-4 py-2">
                          랭크
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.entries.map((e, i) => {
                        const mine = myEntries.some((m) => m.id === e.id);
                        return (
                          <tr
                            key={e.id}
                            className={`border-t border-border ${mine ? 'bg-accent/10' : ''}`}
                          >
                            <td className="px-4 py-2 tabular-nums text-dim">{i + 1}</td>
                            <td className="px-2 py-2 text-fg truncate max-w-[10rem]">
                              {e.nickname}
                              {mine && <span className="ml-1 text-[10px] text-accent">나</span>}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums text-fg">{e.score}</td>
                            <td className="px-2 py-2 text-right tabular-nums text-muted hidden sm:table-cell">
                              {e.total_questions}
                            </td>
                            <td className="px-4 py-2 text-right">
                              <span
                                className={`inline-block px-1.5 py-0.5 rounded border text-[11px] font-bold ${rankBadgeClass(e.rank)}`}
                              >
                                {e.rank}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="text-[11px] text-dim mt-2 px-1">
                순위는 클리어 시 서버가 계산한 점수로만 기록됩니다. 같은 날 재도전하면 더 높은 점수만
                남습니다. 닉네임은 <code>{NICKNAME_KEY}</code>에 저장됩니다.
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
