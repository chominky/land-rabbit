import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { isFileDb } from './fileDb';
import {
  COST_QUESTION,
  COST_WRONG_ANSWER,
  INITIAL_TOKENS,
  LEADERBOARD_TOP_N,
  MAX_NICKNAME_LENGTH,
  calculateScore,
  getRank,
} from './gameConfig';

/**
 * 데일리 리더보드 (P4-B).
 *
 * 파일 DB 모드에서는 data/leaderboard.json, 그 외에는 Supabase
 * daily_leaderboard 테이블. (날짜, 사건, 플레이어) 한 조합당 최고 기록 하나만 남는다.
 *
 * ## 신뢰 모델
 * 단일 플레이는 진행 상황이 localStorage에 있고 서버에 세션이 없다. 그래서
 * **점수는 클라이언트가 제출할 수 없다** — /api/verdict가 채점하면서 직접 기록한다.
 * 그 위에 두 겹을 더 둔다:
 *  1. `plausibleTokens()`가 "질문 수·오답 수로 가능한 최대 토큰"을 넘는 값을 잘라낸다.
 *     (힌트·미리보기는 토큰을 더 깎기만 하므로 상한으로 안전하다.)
 *  2. 점수는 잘라낸 토큰과 서버가 계산한 정확도로 다시 계산한다.
 * 남는 위험: 질문 수 자체를 줄여 보내는 조작. 이걸 막으려면 서버가 판마다
 * 세션을 들고 있어야 해서 여기서는 다루지 않는다 — 랭킹은 "가벼운 경쟁"으로만 본다.
 */

const LEADERBOARD_FILE = path.join(process.cwd(), 'data', 'leaderboard.json');

export type LeaderboardEntry = {
  id: string;
  date_key: string;
  case_id: string;
  nickname: string;
  score: number;
  rank: string;
  tokens_left: number;
  total_questions: number;
  accuracy: number;
  /** 같은 사람의 재제출을 묶는 키. IP 해시라 원본 IP는 저장하지 않는다. */
  player_key: string;
  created_at: string;
};

export type SubmitInput = {
  dateKey: string;
  caseId: string;
  nickname: string;
  /** 클라이언트가 보고한 남은 토큰. 아래에서 상한으로 잘린다. */
  reportedTokensLeft: number;
  totalQuestions: number;
  attemptsUsed: number;
  /** 서버가 채점하며 계산한 값. */
  accuracy: number;
  ip: string;
};

export type SubmitResult = {
  entry: LeaderboardEntry;
  /** 1-based. 같은 날·같은 사건 안에서의 순위. */
  position: number;
  total: number;
  /** 이전 기록이 더 좋아 갱신하지 않은 경우 false. */
  improved: boolean;
};

/** 닉네임 정리 — 제어문자 제거, 길이 제한, 빈 값은 '익명'. */
export function sanitizeNickname(raw: unknown): string {
  const text = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NICKNAME_LENGTH);
  return text || '익명';
}

/**
 * 질문 수와 오답 횟수로 가능한 최대 토큰. 클라이언트 값이 이보다 크면
 * 조작이거나 버그이므로 잘라낸다.
 */
export function plausibleTokens(
  reported: number,
  totalQuestions: number,
  attemptsUsed: number
): number {
  const ceiling = Math.max(
    0,
    INITIAL_TOKENS -
      Math.max(0, totalQuestions) * COST_QUESTION -
      Math.max(0, attemptsUsed) * COST_WRONG_ANSWER
  );
  if (!Number.isFinite(reported)) return 0;
  return Math.max(0, Math.min(Math.floor(reported), ceiling));
}

/** IP를 그대로 저장하지 않기 위한 단방향 키. */
function playerKey(ip: string, dateKey: string): string {
  const salt = process.env.ADMIN_SESSION_SECRET ?? 'land-rabbit';
  return crypto.createHash('sha256').update(`${salt}:${dateKey}:${ip}`).digest('hex').slice(0, 32);
}

function readFile(): LeaderboardEntry[] {
  try {
    if (!fs.existsSync(LEADERBOARD_FILE)) return [];
    const raw = JSON.parse(fs.readFileSync(LEADERBOARD_FILE, 'utf-8'));
    return Array.isArray(raw) ? (raw as LeaderboardEntry[]) : [];
  } catch {
    return [];
  }
}

function writeFile(rows: LeaderboardEntry[]): void {
  fs.mkdirSync(path.dirname(LEADERBOARD_FILE), { recursive: true });
  fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(rows, null, 2), 'utf-8');
}

/** 점수 내림차순, 동점이면 질문이 적은 쪽, 그다음 먼저 제출한 쪽. */
function compare(a: LeaderboardEntry, b: LeaderboardEntry): number {
  if (b.score !== a.score) return b.score - a.score;
  if (a.total_questions !== b.total_questions) return a.total_questions - b.total_questions;
  return a.created_at.localeCompare(b.created_at);
}

export async function listTop(
  dateKey: string,
  caseId: string,
  limit = LEADERBOARD_TOP_N
): Promise<LeaderboardEntry[]> {
  if (isFileDb()) {
    return readFile()
      .filter((e) => e.date_key === dateKey && e.case_id === caseId)
      .sort(compare)
      .slice(0, limit);
  }

  const { createServiceClient } = await import('./supabase/server');
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('daily_leaderboard')
    .select('*')
    .eq('date_key', dateKey)
    .eq('case_id', caseId)
    .order('score', { ascending: false })
    .order('total_questions', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(limit);
  return (data ?? []) as LeaderboardEntry[];
}

async function listAllForDay(dateKey: string, caseId: string): Promise<LeaderboardEntry[]> {
  return listTop(dateKey, caseId, 1000);
}

/**
 * 클리어 결과를 리더보드에 반영한다. 서버(=/api/verdict)만 호출한다.
 * 이미 오늘 기록이 있고 새 점수가 낮으면 갱신하지 않는다.
 */
export async function submitResult(input: SubmitInput): Promise<SubmitResult> {
  const tokensLeft = plausibleTokens(
    input.reportedTokensLeft,
    input.totalQuestions,
    input.attemptsUsed
  );
  const accuracy = Math.max(0, Math.min(100, Math.round(input.accuracy)));
  const score = calculateScore(tokensLeft, accuracy);

  const entry: LeaderboardEntry = {
    id: `lb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    date_key: input.dateKey,
    case_id: input.caseId,
    nickname: sanitizeNickname(input.nickname),
    score,
    rank: getRank(score),
    tokens_left: tokensLeft,
    total_questions: Math.max(0, Math.floor(input.totalQuestions)),
    accuracy,
    player_key: playerKey(input.ip, input.dateKey),
    created_at: new Date().toISOString(),
  };

  const stored = await upsertBest(entry);
  const all = await listAllForDay(input.dateKey, input.caseId);
  const position = all.findIndex((e) => e.player_key === entry.player_key) + 1;

  return {
    entry: stored.entry,
    position: position > 0 ? position : all.length + 1,
    total: all.length,
    improved: stored.improved,
  };
}

/** 같은 (날짜, 사건, 플레이어)에서 더 높은 점수만 남긴다. */
async function upsertBest(
  entry: LeaderboardEntry
): Promise<{ entry: LeaderboardEntry; improved: boolean }> {
  if (isFileDb()) {
    const rows = readFile();
    const idx = rows.findIndex(
      (e) =>
        e.date_key === entry.date_key &&
        e.case_id === entry.case_id &&
        e.player_key === entry.player_key
    );
    if (idx === -1) {
      writeFile([...rows, entry]);
      return { entry, improved: true };
    }
    if (rows[idx].score >= entry.score) {
      return { entry: rows[idx], improved: false };
    }
    // id와 최초 제출 시각은 유지한다 — 같은 사람의 같은 자리다.
    const merged = { ...entry, id: rows[idx].id, created_at: rows[idx].created_at };
    rows[idx] = merged;
    writeFile(rows);
    return { entry: merged, improved: true };
  }

  const { createServiceClient } = await import('./supabase/server');
  const supabase = createServiceClient();
  const { data: existing } = await supabase
    .from('daily_leaderboard')
    .select('*')
    .eq('date_key', entry.date_key)
    .eq('case_id', entry.case_id)
    .eq('player_key', entry.player_key)
    .maybeSingle();

  if (!existing) {
    await supabase.from('daily_leaderboard').insert(entry);
    return { entry, improved: true };
  }

  const prev = existing as LeaderboardEntry;
  if (prev.score >= entry.score) return { entry: prev, improved: false };

  const merged = { ...entry, id: prev.id, created_at: prev.created_at };
  await supabase.from('daily_leaderboard').update(merged).eq('id', prev.id);
  return { entry: merged, improved: true };
}
