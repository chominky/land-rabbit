import * as fs from 'fs';
import * as path from 'path';

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

type GoldenTest = {
  question: string;
  expected: string;
};

/**
 * /api/admin/* 는 관리자 세션을 요구한다. 스크립트도 사람과 똑같이
 * 로그인해서 쿠키를 받아 쓴다.
 */
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

  const setCookie = res.headers.get('set-cookie');
  const token = setCookie?.match(/admin_session=([^;]+)/)?.[1];
  if (!token) {
    console.error('세션 쿠키를 받지 못했습니다.');
    process.exit(1);
  }
  return `admin_session=${token}`;
}

async function runGoldenTests() {
  const cookie = await login();

  const testFile = path.join(
    __dirname,
    '..',
    'tests',
    'golden',
    '_test-turtle-soup.json'
  );
  const tests: GoldenTest[] = JSON.parse(fs.readFileSync(testFile, 'utf-8'));

  let passed = 0;
  let failed = 0;
  const results: { question: string; expected: string; actual: string; pass: boolean }[] = [];

  for (const test of tests) {
    try {
      const res = await fetch(`${BASE_URL}/api/admin/cases/_test-turtle-soup/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ type: 'judge', input: test.question }),
      });
      const data = await res.json();
      const actual = data.verdict || 'ERROR';

      // MAYBE matches: MAYBE is also acceptable for items expected as MAYBE
      let pass: boolean;
      if (test.expected === 'MAYBE') {
        pass = ['MAYBE', 'YES', 'NO'].includes(actual);
        // Actually, MAYBE items: YES/NO is failure, only MAYBE-like is pass
        pass = actual === 'MAYBE';
      } else {
        pass = actual === test.expected;
      }

      results.push({ question: test.question, expected: test.expected, actual, pass });

      if (pass) {
        passed++;
        console.log(`  PASS: "${test.question}" -> ${actual}`);
      } else {
        failed++;
        console.log(`  FAIL: "${test.question}" -> ${actual} (expected: ${test.expected})`);
      }
    } catch (err) {
      failed++;
      results.push({
        question: test.question,
        expected: test.expected,
        actual: 'ERROR',
        pass: false,
      });
      console.log(`  ERROR: "${test.question}" -> ${err}`);
    }
  }

  const total = passed + failed;
  const rate = Math.round((passed / total) * 100);
  console.log(`\n=== Results: ${passed}/${total} passed (${rate}%) ===`);

  if (rate < 90) {
    console.error('FAILED: Pass rate below 90%');
    console.table(results.filter((r) => !r.pass));
    process.exit(1);
  } else {
    console.log('PASSED: All golden tests within threshold');
  }
}

runGoldenTests().catch(console.error);
