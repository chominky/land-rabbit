import * as fs from 'fs';
import * as path from 'path';

/**
 * 골든셋 회귀 테스트.
 *
 * 실행 로직은 서버의 /api/admin/cases/[id]/golden/run 하나뿐이다.
 * 이 스크립트는 그 결과를 사람이 읽게 출력할 뿐이라, 관리자 화면과
 * 항상 같은 결과를 본다.
 */

/**
 * tsx 스크립트는 Next와 달리 .env를 자동으로 읽지 않는다.
 * 의존성을 늘리지 않으려고 필요한 키만 직접 읽는다.
 */
function loadEnvFile() {
  for (const name of ['.env.local', '.env']) {
    const file = path.join(__dirname, '..', name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      const [, key, rawValue] = m;
      if (process.env[key]) continue; // 실제 환경변수가 우선
      process.env[key] = rawValue.trim().replace(/^["']|["']$/g, '');
    }
  }
}

loadEnvFile();

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const CASE_ID = process.env.GOLDEN_CASE_ID || '_test-turtle-soup';

type RunResult = {
  question: string;
  expected: string;
  actual: string;
  pass: boolean;
};

type RunSummary = {
  total: number;
  passed: number;
  failed: number;
  rate: number;
  threshold: number;
  ok: boolean;
  results: RunResult[];
};

/** /api/admin/* 는 관리자 세션을 요구한다. 사람과 똑같이 로그인해서 쿠키를 쓴다. */
async function login(): Promise<string> {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    console.error('ADMIN_PASSWORD가 설정돼 있지 않습니다. .env를 확인하세요.');
    process.exit(1);
  }

  const res = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });

  if (!res.ok) {
    console.error(`관리자 로그인 실패 (${res.status}). ADMIN_PASSWORD를 확인하세요.`);
    process.exit(1);
  }

  const token = res.headers.get('set-cookie')?.match(/admin_session=([^;]+)/)?.[1];
  if (!token) {
    console.error('세션 쿠키를 받지 못했습니다.');
    process.exit(1);
  }
  return `admin_session=${token}`;
}

async function runGoldenTests() {
  const cookie = await login();

  const res = await fetch(`${BASE_URL}/api/admin/cases/${CASE_ID}/golden/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`골든셋 실행 실패 (${res.status}): ${body.slice(0, 200)}`);
    process.exit(1);
  }

  const summary: RunSummary = await res.json();

  for (const r of summary.results) {
    const mark = r.pass ? 'PASS' : 'FAIL';
    const detail = r.pass ? r.actual : `${r.actual} (expected: ${r.expected})`;
    console.log(`  ${mark}: "${r.question}" -> ${detail}`);
  }

  console.log(`\n=== Results: ${summary.passed}/${summary.total} passed (${summary.rate}%) ===`);

  if (!summary.ok) {
    console.error(`FAILED: Pass rate below ${summary.threshold}%`);
    console.table(summary.results.filter((r) => !r.pass));
    process.exit(1);
  }

  console.log('PASSED: All golden tests within threshold');
}

runGoldenTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
