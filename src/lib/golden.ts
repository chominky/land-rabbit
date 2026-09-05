import fs from 'fs';
import path from 'path';
import { isFileDb } from './fileDb';
import type { Verdict } from './types';

/**
 * 골든셋 (P3-D).
 *
 * 관리자 API와 `scripts/test-judge.ts`가 같은 파일을 서로 다른 모양으로
 * 읽고 있었다 — API는 {id, case_id, question, expected_verdict},
 * CLI는 {question, expected}. 한쪽에서 추가하면 다른 쪽이 깨진다.
 * 여기서 정본 모양을 정하고, 예전 모양은 읽을 때 변환한다.
 */

const GOLDEN_DIR = path.join(process.cwd(), 'tests', 'golden');

export type GoldenTest = {
  id: string;
  case_id: string;
  question: string;
  expected_verdict: Verdict;
  created_at: string;
};

export type GoldenRunResult = {
  id: string;
  question: string;
  expected: Verdict;
  actual: Verdict | 'ERROR';
  comment?: string;
  pass: boolean;
};

export type GoldenRunSummary = {
  caseId: string;
  total: number;
  passed: number;
  failed: number;
  /** 0~100 정수. 테스트가 없으면 0. */
  rate: number;
  threshold: number;
  ok: boolean;
  results: GoldenRunResult[];
};

/** README·scripts와 같은 기준. 이 아래로 떨어지면 회귀로 본다. */
export const PASS_THRESHOLD = 90;

const VALID_VERDICTS: Verdict[] = ['YES', 'NO', 'MAYBE', 'IRRELEVANT', 'INVALID'];

/** 예전 {question, expected} 모양도 받아준다. */
function normalize(row: Record<string, unknown>, caseId: string, index: number): GoldenTest {
  const expected = (row.expected_verdict ?? row.expected) as Verdict;
  return {
    id: String(row.id ?? `gt_legacy_${index}`),
    case_id: String(row.case_id ?? caseId),
    question: String(row.question ?? ''),
    expected_verdict: VALID_VERDICTS.includes(expected) ? expected : 'INVALID',
    created_at: String(row.created_at ?? new Date(0).toISOString()),
  };
}

function filePath(caseId: string): string {
  return path.join(GOLDEN_DIR, `${caseId}.json`);
}

function readFile(caseId: string): GoldenTest[] {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath(caseId), 'utf-8'));
    if (!Array.isArray(raw)) return [];
    return raw.map((r, i) => normalize(r as Record<string, unknown>, caseId, i));
  } catch {
    return [];
  }
}

function writeFile(caseId: string, tests: GoldenTest[]): void {
  fs.mkdirSync(GOLDEN_DIR, { recursive: true });
  fs.writeFileSync(filePath(caseId), JSON.stringify(tests, null, 2), 'utf-8');
}

export async function listGolden(caseId: string): Promise<GoldenTest[]> {
  if (isFileDb()) return readFile(caseId);

  const { createServiceClient } = await import('./supabase/server');
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('case_golden_tests')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at');
  return (data ?? []).map((r, i) => normalize(r as Record<string, unknown>, caseId, i));
}

export async function addGolden(
  caseId: string,
  question: string,
  expected: Verdict
): Promise<GoldenTest> {
  const test: GoldenTest = {
    id: `gt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    case_id: caseId,
    question,
    expected_verdict: expected,
    created_at: new Date().toISOString(),
  };

  if (isFileDb()) {
    writeFile(caseId, [...readFile(caseId), test]);
    return test;
  }

  const { createServiceClient } = await import('./supabase/server');
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('case_golden_tests')
    .insert({ case_id: caseId, question, expected_verdict: expected })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return normalize(data as Record<string, unknown>, caseId, 0);
}

export async function updateGolden(
  caseId: string,
  testId: string,
  expected: Verdict
): Promise<boolean> {
  if (isFileDb()) {
    const tests = readFile(caseId);
    const target = tests.find((t) => t.id === testId);
    if (!target) return false;
    target.expected_verdict = expected;
    writeFile(caseId, tests);
    return true;
  }

  const { createServiceClient } = await import('./supabase/server');
  const supabase = createServiceClient();
  const { error } = await supabase
    .from('case_golden_tests')
    .update({ expected_verdict: expected })
    .eq('id', testId);
  return !error;
}

export async function deleteGolden(caseId: string, testId: string): Promise<void> {
  if (isFileDb()) {
    writeFile(caseId, readFile(caseId).filter((t) => t.id !== testId));
    return;
  }
  const { createServiceClient } = await import('./supabase/server');
  const supabase = createServiceClient();
  await supabase.from('case_golden_tests').delete().eq('id', testId);
}

export function summarizeRun(caseId: string, results: GoldenRunResult[]): GoldenRunSummary {
  const passed = results.filter((r) => r.pass).length;
  const rate = results.length ? Math.round((passed / results.length) * 100) : 0;
  return {
    caseId,
    total: results.length,
    passed,
    failed: results.length - passed,
    rate,
    threshold: PASS_THRESHOLD,
    // 테스트가 하나도 없으면 통과로 치지 않는다.
    ok: results.length > 0 && rate >= PASS_THRESHOLD,
    results,
  };
}
