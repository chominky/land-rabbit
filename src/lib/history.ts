import { GameRecord, isFileDb, loadHistory as loadFileHistory, saveGameRecord as saveFileRecord } from './fileDb';

/**
 * 단일 플레이 기록 (P3-A).
 *
 * 파일 DB 모드에서는 data/history.json, 그 외에는 Supabase game_history 테이블.
 * 두 경로가 같은 GameRecord 모양을 주고받는다.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
function fromRow(row: any): GameRecord {
  return {
    id: row.id,
    caseId: row.case_id,
    caseTitle: row.case_title,
    ip: row.ip ?? '',
    solved: !!row.solved,
    score: row.score ?? undefined,
    rank: row.rank ?? undefined,
    accuracy: row.accuracy ?? undefined,
    tokensLeft: row.tokens_left ?? 0,
    totalQuestions: row.total_questions ?? 0,
    questions: row.questions ?? [],
    finalAnswer: row.final_answer ?? '',
    finishedAt: row.finished_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function toRow(record: GameRecord) {
  return {
    id: record.id,
    case_id: record.caseId,
    case_title: record.caseTitle,
    ip: record.ip,
    solved: record.solved,
    score: record.score ?? null,
    rank: record.rank ?? null,
    accuracy: record.accuracy ?? null,
    tokens_left: record.tokensLeft,
    total_questions: record.totalQuestions,
    questions: record.questions,
    final_answer: record.finalAnswer,
    finished_at: record.finishedAt,
  };
}

export async function saveRecord(record: GameRecord): Promise<void> {
  if (isFileDb()) {
    saveFileRecord(record);
    return;
  }
  const { createServiceClient } = await import('./supabase/server');
  const supabase = createServiceClient();
  await supabase.from('game_history').insert(toRow(record));
}

export async function loadRecords(limit = 1000): Promise<GameRecord[]> {
  if (isFileDb()) {
    return loadFileHistory().slice(0, limit);
  }
  const { createServiceClient } = await import('./supabase/server');
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('game_history')
    .select('*')
    .order('finished_at', { ascending: false })
    .limit(limit);
  return (data ?? []).map(fromRow);
}

// ── 집계 ─────────────────────────────────────────────────────────────────────

export type RankKey = 'S' | 'A' | 'B' | 'C' | 'D';

export type CaseStats = {
  caseId: string;
  caseTitle: string;
  plays: number;
  solvedCount: number;
  clearRate: number;
  avgScore: number;
  avgQuestions: number;
  avgTokensLeft: number;
  avgAccuracy: number;
  flagCount: number;
};

export type StatsSummary = {
  totalPlays: number;
  clearRate: number;
  avgScore: number;
  avgQuestions: number;
  rankDistribution: Record<RankKey, number>;
  cases: CaseStats[];
};

const RANK_KEYS: RankKey[] = ['S', 'A', 'B', 'C', 'D'];

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

/**
 * 기록이 없으면 0으로 채운 요약을 돌려준다 — 화면이 빈 배열에 걸려 깨지지 않게.
 *
 * `flagCounts`는 사건별 신고 수. 파일 DB 모드에서는 신고가 저장되지 않아
 * 비어 있을 수 있다.
 */
export function summarize(
  records: GameRecord[],
  flagCounts: Record<string, number> = {}
): StatsSummary {
  const rankDistribution = Object.fromEntries(
    RANK_KEYS.map((k) => [k, 0])
  ) as Record<RankKey, number>;

  for (const r of records) {
    if (!r.solved) continue;
    const key = (r.rank ?? 'D') as RankKey;
    if (RANK_KEYS.includes(key)) rankDistribution[key] += 1;
  }

  const byCase = new Map<string, GameRecord[]>();
  for (const r of records) {
    const list = byCase.get(r.caseId);
    if (list) list.push(r);
    else byCase.set(r.caseId, [r]);
  }

  const cases: CaseStats[] = [...byCase.entries()]
    .map(([caseId, rs]) => {
      const solved = rs.filter((r) => r.solved);
      return {
        caseId,
        caseTitle: rs[0].caseTitle,
        plays: rs.length,
        solvedCount: solved.length,
        clearRate: Math.round((solved.length / rs.length) * 100),
        // 점수는 클리어한 판에만 의미가 있다.
        avgScore: mean(solved.map((r) => r.score ?? 0)),
        avgQuestions: mean(rs.map((r) => r.totalQuestions)),
        avgTokensLeft: mean(rs.map((r) => r.tokensLeft)),
        avgAccuracy: mean(rs.map((r) => r.accuracy ?? 0)),
        flagCount: flagCounts[caseId] ?? 0,
      };
    })
    .sort((a, b) => b.plays - a.plays);

  const solvedAll = records.filter((r) => r.solved);

  return {
    totalPlays: records.length,
    clearRate: records.length ? Math.round((solvedAll.length / records.length) * 100) : 0,
    avgScore: mean(solvedAll.map((r) => r.score ?? 0)),
    avgQuestions: mean(records.map((r) => r.totalQuestions)),
    rankDistribution,
    cases,
  };
}
