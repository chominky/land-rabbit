import { MAX_IMAGES, MIN_IMAGES } from './gameConfig';
import type { CaseData, KeyFact } from './types';

/**
 * 발행(publish) 조건 (P3-B).
 *
 * 편집 화면과 PUT 라우트가 같은 규칙을 쓴다. 편집 화면만 검사하면 사건 목록의
 * 발행 토글로 그냥 우회할 수 있으므로, 서버에서도 같은 함수로 막는다.
 */

export type CheckId =
  | 'images'
  | 'keyFactCount'
  | 'requiredFact'
  | 'mustConvey'
  | 'acceptExamples'
  | 'hints'
  | 'brief'
  | 'truth';

export type CheckResult = {
  id: CheckId;
  label: string;
  ok: boolean;
  /** 실패했을 때만 채워진다. */
  detail?: string;
};

export const MIN_KEY_FACTS = 3;
export const MIN_ACCEPT_EXAMPLES = 3;

type ValidatableCase = {
  brief?: string;
  truth?: string;
  images?: string[];
  keyFacts?: KeyFact[];
  hints?: string[];
};

export function runPublishChecks(c: ValidatableCase): CheckResult[] {
  const images = (c.images ?? []).filter(Boolean);
  const keyFacts = c.keyFacts ?? [];
  const required = keyFacts.filter((kf) => kf.required);
  const hints = (c.hints ?? []).filter((h) => h?.trim());

  const missingMustConvey = required.filter((kf) => !kf.mustConvey?.trim());
  const thinAccepts = required.filter(
    (kf) => (kf.acceptExamples ?? []).filter(Boolean).length < MIN_ACCEPT_EXAMPLES
  );

  const name = (kf: KeyFact) => kf.label?.trim() || kf.id;

  return [
    {
      id: 'brief',
      label: '사건 개요를 입력했다',
      ok: !!c.brief?.trim(),
    },
    {
      id: 'truth',
      label: '사건 전말을 입력했다',
      ok: !!c.truth?.trim(),
    },
    {
      id: 'images',
      label: `삽화가 ${MIN_IMAGES}~${MAX_IMAGES}장이다`,
      ok: images.length >= MIN_IMAGES && images.length <= MAX_IMAGES,
      detail: `현재 ${images.length}장`,
    },
    {
      id: 'keyFactCount',
      label: `핵심 요소가 ${MIN_KEY_FACTS}개 이상이다`,
      ok: keyFacts.length >= MIN_KEY_FACTS,
      detail: `현재 ${keyFacts.length}개`,
    },
    {
      id: 'requiredFact',
      label: 'required 핵심 요소가 1개 이상이다',
      ok: required.length >= 1,
      detail: `현재 ${required.length}개`,
    },
    {
      id: 'mustConvey',
      label: 'required 요소의 mustConvey가 모두 채워졌다',
      ok: missingMustConvey.length === 0,
      detail: missingMustConvey.map(name).join(', '),
    },
    {
      id: 'acceptExamples',
      label: `required 요소마다 acceptExamples ${MIN_ACCEPT_EXAMPLES}개 이상`,
      ok: thinAccepts.length === 0,
      detail: thinAccepts.map(name).join(', '),
    },
    {
      id: 'hints',
      label: '힌트 3단계를 모두 입력했다',
      ok: hints.length >= 3,
      detail: `현재 ${hints.length}개`,
    },
  ];
}

/** 실패한 조건의 사람이 읽는 사유 목록. 전부 통과했으면 빈 배열. */
export function publishBlockers(c: ValidatableCase): string[] {
  return runPublishChecks(c)
    .filter((r) => !r.ok)
    .map((r) => (r.detail ? `${r.label} (${r.detail})` : r.label));
}

export function canPublish(c: ValidatableCase): boolean {
  return publishBlockers(c).length === 0;
}

/** 저장된 사건(CaseData)에 대한 검사. PUT 라우트에서 쓴다. */
export function publishBlockersForCase(c: CaseData): string[] {
  return publishBlockers({
    brief: c.brief,
    truth: c.truth,
    images: c.images,
    keyFacts: c.keyFacts,
    hints: c.hints,
  });
}
