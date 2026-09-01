export type Verdict = 'YES' | 'NO' | 'MAYBE' | 'IRRELEVANT' | 'INVALID';

export type KeyFact = {
  id: string;
  label: string;
  detail: string;
  mustConvey: string;
  acceptExamples: string[];
  rejectExamples: string[];
  required: boolean;
};

export type ImageMeta = {
  index: number;
  hintsFacts: string[];
  description?: string;
};

export type CaseData = {
  id: string;
  title: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  status: 'draft' | 'published';
  images: string[];
  imageMeta: ImageMeta[];
  brief: string;
  truth: string;
  keyFacts: KeyFact[];
  redHerrings: string[];
  hints: [string, string, string];
};

// Safe DTO that goes to client - no secrets
export type CasePublicDTO = {
  id: string;
  title: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  brief: string;
  keyFactLabels: { id: string; label: string; required: boolean }[];
  imageCount: number;
  images: string[];
};

export type JudgeRequest = {
  roomCode?: string;
  caseId: string;
  playerId: string;
  question: string;
};

export type JudgeResponse = {
  verdict: Verdict;
  comment: string;
  revealedFacts: string[];
  tokensLeft: number;
  imageUnlocked?: boolean;
  cached?: boolean;
};

export type VerdictRequest = {
  roomCode?: string;
  caseId: string;
  playerId: string;
  answer: string;
};

export type FactResult = {
  id: string;
  status: 'hit' | 'partial' | 'miss';
  evidence: string;
};

export type VerdictResponse = {
  results: FactResult[];
  solved: boolean;
  accuracy: number;
  feedback: string;
  tokensLeft: number;
  score?: number;
  rank?: string;
};

export type RoomMode = 'coop' | 'versus';
export type RoomStatus = 'lobby' | 'playing' | 'finished';

export type Room = {
  id: string;
  code: string;
  case_id: string;
  host_player_id: string;
  mode: RoomMode;
  status: RoomStatus;
  shared_tokens: number;
  revealed_image_count: number;
  total_questions: number;
  turn_player_id: string | null;
  created_at: string;
  last_activity_at: string;
};

export type RoomPlayer = {
  id: string;
  room_id: string;
  nickname: string;
  is_host: boolean;
  is_spectator: boolean;
  tokens: number;
  attempts_used: number;
  solved_at: string | null;
  rank: number | null;
  score: number | null;
  joined_at: string;
  cooldown_until: string | null;
};

export type RoomQuestion = {
  id: string;
  room_id: string;
  player_id: string;
  text: string;
  verdict: Verdict;
  comment: string;
  revealed_facts: string[];
  flagged: boolean;
  created_at: string;
  nickname?: string;
};

export type RoomEvent = {
  id: string;
  room_id: string;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

// Single player game state (localStorage)
export type SinglePlayerState = {
  caseId: string;
  tokens: number;
  questions: {
    text: string;
    verdict: Verdict;
    comment: string;
    revealedFacts: string[];
    timestamp: number;
  }[];
  revealedImageCount: number;
  totalQuestions: number;
  revealedKeyFacts: string[];
  hintsUsed: number;
  attemptsUsed: number;
  solved: boolean;
  gameOver: boolean;
  score?: number;
  rank?: string;
};
