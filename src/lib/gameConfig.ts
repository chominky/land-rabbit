// === AI Model ===
export const MODEL = 'claude-sonnet-4-6' as const;
export const AI_TEMPERATURE = 0;

/**
 * === 밸런싱 상수 (P4-A) ===
 *
 * 아래 값은 감이 아니라 기록으로 조정한다. `npm run balance`가
 * data/history.json(또는 Supabase game_history)에서 사건별 클리어율·
 * 클리어 시 평균 남은 토큰·질문 수와, 현재 상수만으로 정해지는 랭크
 * 도달 가능성을 뽑아준다. 값을 바꿀 때는 그 출력을 커밋 메시지에 남긴다.
 * 표본이 사건당 30판(`MIN_SAMPLE`) 미만이면 관측치로 고치지 않는다.
 */

// === Token Economy ===
/** 한 판에서 쓸 수 있는 질문 수. 점수의 80%를 지배하는 값이라 손대면 랭크 분포가 통째로 움직인다. */
export const INITIAL_TOKENS = 50;
export const COST_QUESTION = 1;
/** 점수로는 -80점. 클리어율이 낮을 때 가장 먼저 낮춰볼 레버. */
export const COST_HINT = 5;
/** 점수로는 -160점. 삽화가 3장 이상인 사건에서 실질 난이도를 좌우한다. */
export const COST_PREVIEW = 10;
/** 오답 1회의 점수 환산 -80점. 두 번 틀리면 시도도 끝난다(MAX_FINAL_ATTEMPTS). */
export const COST_WRONG_ANSWER = 5;

// === Scoring ===
/**
 * 점수 = 남은토큰 × 16 + 정확도 × 2 (상한 MAX_SCORE).
 * 만점 기준 토큰이 800점(80%), 정확도가 200점(20%)을 차지한다.
 * 즉 "적게 묻는 것"이 "정확히 맞히는 것"보다 4배 세게 반영된다.
 */
export const SCORE_TOKEN_MULTIPLIER = 16;
export const SCORE_ACCURACY_MULTIPLIER = 2;
export const MAX_SCORE = 1000;

/**
 * 정확도 100%를 기준으로 각 랭크가 허용하는 질문 수(힌트·미리보기 미구매):
 * S 9질문 / A 18 / B 31 / C 43. 정확도 70%면 각각 5 / 15 / 27 / 40.
 * `npm run balance`의 "도달 가능성" 표가 같은 값을 출력한다.
 */
export const RANK_THRESHOLDS = {
  S: 850,
  A: 700,
  B: 500,
  C: 300,
} as const;

export function getRank(score: number): 'S' | 'A' | 'B' | 'C' | 'D' {
  if (score >= RANK_THRESHOLDS.S) return 'S';
  if (score >= RANK_THRESHOLDS.A) return 'A';
  if (score >= RANK_THRESHOLDS.B) return 'B';
  if (score >= RANK_THRESHOLDS.C) return 'C';
  return 'D';
}

export function calculateScore(tokensLeft: number, accuracy: number): number {
  return Math.min(MAX_SCORE, tokensLeft * SCORE_TOKEN_MULTIPLIER + accuracy * SCORE_ACCURACY_MULTIPLIER);
}

// === Image Unlock ===
/** 질문 N개마다 삽화가 자동 해금된다. 줄이면 미리보기(-160점)를 살 이유가 줄어 클리어율이 오른다. */
export const AUTO_UNLOCK_INTERVAL = 15; // questions per auto-unlock
export const MIN_IMAGES = 2;
export const MAX_IMAGES = 4;

// === Multiplayer ===
export const MAX_PLAYERS = 8;
export const MAX_FINAL_ATTEMPTS = 2;
export const VOTE_TIMEOUT_SECONDS = 20;
export const WRONG_ANSWER_COOLDOWN_TURNS = 2;
export const WRONG_ANSWER_COOLDOWN_SECONDS = 60;

// === Room ===
export const ROOM_CODE_LENGTH = 6;
export const ROOM_TTL_HOURS = 24;

// === Rate Limiting ===
export const RATE_LIMIT_QUESTIONS_PER_MINUTE = 20;
export const RATE_LIMIT_ADMIN_LOGIN_PER_MINUTE = 5;

// === Input Validation ===
export const MAX_QUESTION_LENGTH = 500;
export const MAX_ANSWER_LENGTH = 2000;
