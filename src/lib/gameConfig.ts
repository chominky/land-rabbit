// === AI Model ===
export const MODEL = 'claude-sonnet-4-6' as const;
export const AI_TEMPERATURE = 0;

// === Token Economy ===
export const INITIAL_TOKENS = 50;
export const COST_QUESTION = 1;
export const COST_HINT = 5;
export const COST_PREVIEW = 10;
export const COST_WRONG_ANSWER = 5;

// === Scoring ===
export const SCORE_TOKEN_MULTIPLIER = 16;
export const SCORE_ACCURACY_MULTIPLIER = 2;
export const MAX_SCORE = 1000;

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
