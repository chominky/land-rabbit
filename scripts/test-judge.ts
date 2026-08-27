import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

type GoldenTest = {
  question: string;
  expected: string;
};

async function runGoldenTests() {
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
        headers: { 'Content-Type': 'application/json' },
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
