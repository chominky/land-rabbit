import type { GameRecord } from './fileDb';
import {
  COST_HINT,
  COST_PREVIEW,
  COST_QUESTION,
  COST_WRONG_ANSWER,
  INITIAL_TOKENS,
  MAX_SCORE,
  RANK_THRESHOLDS,
  SCORE_ACCURACY_MULTIPLIER,
  SCORE_TOKEN_MULTIPLIER,
} from './gameConfig';

/**
 * 밸런싱 근거 산출 (P4-A).
 *
 * 상수를 감으로 고치지 않기 위한 도구다. 두 가지를 계산한다:
 *  1) 실제 플레이 기록에서 나온 관측치 (사건별 클리어율·남은 토큰·질문 수)
 *  2) 현재 상수만으로 결정되는 도달 가능성 (랭크별 허용 질문 수) — 기록이 없어도 나온다
 *
 * `npm run balance`가 이 결과를 표로 출력한다.
 */

/** 이보다 적은 표본으로 상수를 건드리지 않는다. 사건 하나가 우연히 쉬웠는지 알 수 없다. */
export const MIN_SAMPLE = 30;

export type CaseBalance = {
  caseId: string;
  caseTitle: string;
  plays: number;
  clearRate: number;
  /** 클리어한 판의 평균 남은 토큰. 상향/하향 판단의 핵심 지표다. */
  avgTokensLeftCleared: number;
  avgQuestionsCleared: number;
  avgQuestionsFailed: number;
  avgAccuracy: number;
  avgScoreCleared: number;
  sRate: number;
  sufficient: boolean;
};

export type RankReach = {
  rank: 'S' | 'A' | 'B' | 'C';
  threshold: number;
  /** 정확도 100%일 때 그 랭크를 유지하며 쓸 수 있는 최대 질문 수(힌트·미리보기 없음). */
  maxQuestionsAt100: number;
  /** 정확도 70%일 때의 같은 값. */
  maxQuestionsAt70: number;
};

export type BalanceReport = {
  sampleSize: number;
  minSample: number;
  overall: {
    clearRate: number;
    avgTokensLeftCleared: number;
    avgQuestionsCleared: number;
    avgAccuracy: number;
  };
  cases: CaseBalance[];
  reach: RankReach[];
  /** 상수 하나가 점수에서 차지하는 비중 — 어느 레버가 실제로 세게 먹는지. */
  weights: {
    tokenShareOfMaxScore: number;
    accuracyShareOfMaxScore: number;
    hintCostInScore: number;
    previewCostInScore: number;
    wrongAnswerCostInScore: number;
  };
};

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

/**
 * 점수 `target`을 받으려면 토큰이 몇 개 남아야 하는지 → 질문을 몇 개까지 쓸 수 있는지.
 * 힌트·미리보기를 하나도 사지 않은 최선의 경우다(실제로는 이보다 적다).
 */
function maxQuestionsFor(target: number, accuracy: number): number {
  const fromAccuracy = accuracy * SCORE_ACCURACY_MULTIPLIER;
  const tokensNeeded = Math.ceil((target - fromAccuracy) / SCORE_TOKEN_MULTIPLIER);
  return Math.floor((INITIAL_TOKENS - Math.max(0, tokensNeeded)) / COST_QUESTION);
}

export function analyzeBalance(records: GameRecord[]): BalanceReport {
  const byCase = new Map<string, GameRecord[]>();
  for (const r of records) {
    const list = byCase.get(r.caseId);
    if (list) list.push(r);
    else byCase.set(r.caseId, [r]);
  }

  const cases: CaseBalance[] = [...byCase.entries()]
    .map(([caseId, rs]) => {
      const cleared = rs.filter((r) => r.solved);
      const failed = rs.filter((r) => !r.solved);
      return {
        caseId,
        caseTitle: rs[0].caseTitle,
        plays: rs.length,
        clearRate: Math.round((cleared.length / rs.length) * 100),
        avgTokensLeftCleared: mean(cleared.map((r) => r.tokensLeft)),
        avgQuestionsCleared: mean(cleared.map((r) => r.totalQuestions)),
        avgQuestionsFailed: mean(failed.map((r) => r.totalQuestions)),
        avgAccuracy: mean(rs.map((r) => r.accuracy ?? 0)),
        avgScoreCleared: mean(cleared.map((r) => r.score ?? 0)),
        sRate: cleared.length
          ? Math.round((cleared.filter((r) => r.rank === 'S').length / cleared.length) * 100)
          : 0,
        sufficient: rs.length >= MIN_SAMPLE,
      };
    })
    .sort((a, b) => b.plays - a.plays);

  const clearedAll = records.filter((r) => r.solved);

  const reach: RankReach[] = (['S', 'A', 'B', 'C'] as const).map((rank) => ({
    rank,
    threshold: RANK_THRESHOLDS[rank],
    maxQuestionsAt100: maxQuestionsFor(RANK_THRESHOLDS[rank], 100),
    maxQuestionsAt70: maxQuestionsFor(RANK_THRESHOLDS[rank], 70),
  }));

  return {
    sampleSize: records.length,
    minSample: MIN_SAMPLE,
    overall: {
      clearRate: records.length
        ? Math.round((clearedAll.length / records.length) * 100)
        : 0,
      avgTokensLeftCleared: mean(clearedAll.map((r) => r.tokensLeft)),
      avgQuestionsCleared: mean(clearedAll.map((r) => r.totalQuestions)),
      avgAccuracy: mean(records.map((r) => r.accuracy ?? 0)),
    },
    cases,
    reach,
    weights: {
      tokenShareOfMaxScore: Math.round(
        ((INITIAL_TOKENS * SCORE_TOKEN_MULTIPLIER) / MAX_SCORE) * 100
      ),
      accuracyShareOfMaxScore: Math.round(
        ((100 * SCORE_ACCURACY_MULTIPLIER) / MAX_SCORE) * 100
      ),
      hintCostInScore: COST_HINT * SCORE_TOKEN_MULTIPLIER,
      previewCostInScore: COST_PREVIEW * SCORE_TOKEN_MULTIPLIER,
      wrongAnswerCostInScore: COST_WRONG_ANSWER * SCORE_TOKEN_MULTIPLIER,
    },
  };
}
