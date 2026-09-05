import type { Verdict } from './types';

/**
 * 디자인 토큰 접근자 (P1-A).
 *
 * 색상 원시값은 `src/app/globals.css`의 `:root`에만 존재한다.
 * - Tailwind 클래스로 쓸 때: `bg-surface`, `text-muted`, `border-border` …
 * - 인라인 style로 쓸 때: 아래 `T`의 `var(...)` 문자열을 사용한다.
 *
 * 하드코딩된 hex를 컴포넌트에 다시 넣지 말 것 — 라이트 테마(P1-C)가 깨진다.
 */
export const T = {
  bg: 'var(--bg)',
  surface: 'var(--surface)',
  surface2: 'var(--surface-2)',
  surface3: 'var(--surface-3)',
  bgDeep: 'var(--bg-deep)',
  surfaceInset: 'var(--surface-inset)',

  border: 'var(--border)',
  borderStrong: 'var(--border-strong)',

  fg: 'var(--fg)',
  muted: 'var(--muted)',
  dim: 'var(--dim)',

  accent: 'var(--accent)',
  accentMid: 'var(--accent-mid)',
  accentDim: 'var(--accent-dim)',
  accentDeep: 'var(--accent-deep)',

  yes: 'var(--yes)',
  no: 'var(--no)',
  maybe: 'var(--maybe)',
  neutral: 'var(--neutral)',

  danger: 'var(--danger)',
  dangerFg: 'var(--danger-fg)',
  dangerSoft: 'var(--danger-soft)',
  dangerSurface: 'var(--danger-surface)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  info: 'var(--info)',
  infoSurface: 'var(--info-surface)',
  infoBorder: 'var(--info-border)',
  gray: 'var(--gray)',
  onSolid: 'var(--on-solid)',

  scrim: 'var(--scrim)',
  scrimStrong: 'var(--scrim-strong)',
} as const;

/**
 * 토큰 색을 알파와 함께 쓴다. `alpha(T.accent, 0.08)` → 8% 강조색.
 * hex + 알파 접미사(`${AMBER}14`) 패턴을 대체한다.
 */
export function alpha(token: string, ratio: number): string {
  const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  return `color-mix(in srgb, ${token} ${pct}%, transparent)`;
}

/** 판정 배지 배경색. */
export const VERDICT_TOKEN: Record<Verdict, string> = {
  YES: T.yes,
  NO: T.no,
  MAYBE: T.maybe,
  IRRELEVANT: T.neutral,
  INVALID: T.neutral,
};

export type Rank = 'S' | 'A' | 'B' | 'C' | 'D';

/** 랭크 색. */
export const RANK_TOKEN: Record<Rank, string> = {
  S: 'var(--rank-s)',
  A: 'var(--rank-a)',
  B: 'var(--rank-b)',
  C: 'var(--rank-c)',
  D: 'var(--rank-d)',
};

export function rankToken(rank: string | null | undefined): string {
  return RANK_TOKEN[(rank as Rank) ?? 'D'] ?? RANK_TOKEN.D;
}
