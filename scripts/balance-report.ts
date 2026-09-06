import * as fs from 'fs';
import * as path from 'path';
import { analyzeBalance } from '../src/lib/balance';
import { loadRecords } from '../src/lib/history';
import {
  AUTO_UNLOCK_INTERVAL,
  COST_HINT,
  COST_PREVIEW,
  COST_WRONG_ANSWER,
  INITIAL_TOKENS,
  RANK_THRESHOLDS,
} from '../src/lib/gameConfig';

/**
 * 밸런싱 근거 리포트 (P4-A).
 *
 * `npm run balance` — data/history.json(또는 Supabase game_history)을 읽어
 * 상수 조정에 필요한 수치를 출력한다. 상수를 고칠 때는 이 출력을 커밋
 * 메시지에 붙여 근거를 남긴다.
 */

/** tsx는 .env를 자동으로 읽지 않는다 (scripts/test-judge.ts와 같은 방식). */
function loadEnvFile() {
  for (const name of ['.env.local', '.env']) {
    const file = path.join(__dirname, '..', name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      const [, key, rawValue] = m;
      if (process.env[key]) continue;
      process.env[key] = rawValue.trim().replace(/^["']|["']$/g, '');
    }
  }
}

loadEnvFile();

function pad(value: string | number, width: number, align: 'l' | 'r' = 'l'): string {
  const s = String(value);
  // 한글은 폭이 2칸이라 단순 length로는 어긋난다.
  const visual = [...s].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
  const padding = ' '.repeat(Math.max(0, width - visual));
  return align === 'l' ? s + padding : padding + s;
}

async function main() {
  const records = await loadRecords();
  const report = analyzeBalance(records);

  console.log('\n=== 밸런싱 리포트 ===\n');
  console.log(`표본: ${report.sampleSize}판 (사건별 권장 최소 ${report.minSample}판)`);

  if (report.sampleSize === 0) {
    console.log('\n기록이 없다. 관측치 없이 상수를 조정하지 말 것.\n');
  } else {
    console.log(
      `전체 클리어율 ${report.overall.clearRate}% · ` +
        `클리어 시 평균 남은 토큰 ${report.overall.avgTokensLeftCleared} · ` +
        `평균 질문 ${report.overall.avgQuestionsCleared} · ` +
        `평균 정확도 ${report.overall.avgAccuracy}%`
    );

    console.log('\n--- 사건별 ---');
    console.log(
      pad('사건', 24) +
        pad('판', 5, 'r') +
        pad('클리어%', 9, 'r') +
        pad('남은토큰', 10, 'r') +
        pad('질문(성공)', 12, 'r') +
        pad('질문(실패)', 12, 'r') +
        pad('정확도', 8, 'r') +
        pad('S비율', 7, 'r') +
        '  표본'
    );
    for (const c of report.cases) {
      console.log(
        pad(c.caseTitle.slice(0, 22), 24) +
          pad(c.plays, 5, 'r') +
          pad(c.clearRate, 9, 'r') +
          pad(c.avgTokensLeftCleared, 10, 'r') +
          pad(c.avgQuestionsCleared, 12, 'r') +
          pad(c.avgQuestionsFailed, 12, 'r') +
          pad(c.avgAccuracy, 8, 'r') +
          pad(c.sRate, 7, 'r') +
          (c.sufficient ? '  충분' : '  부족')
      );
    }
  }

  console.log('\n--- 현재 상수의 도달 가능성 (기록과 무관, 수식만으로 결정) ---');
  console.log(
    `초기 토큰 ${INITIAL_TOKENS} · 힌트 ${COST_HINT} · 미리보기 ${COST_PREVIEW} · ` +
      `오답 ${COST_WRONG_ANSWER} · 자동 해금 ${AUTO_UNLOCK_INTERVAL}질문마다`
  );
  console.log(
    pad('랭크', 6) + pad('임계', 7, 'r') + pad('정확도100%', 12, 'r') + pad('정확도70%', 11, 'r')
  );
  for (const r of report.reach) {
    console.log(
      pad(r.rank, 6) +
        pad(r.threshold, 7, 'r') +
        pad(`${r.maxQuestionsAt100}질문`, 12, 'r') +
        pad(`${r.maxQuestionsAt70}질문`, 11, 'r')
    );
  }
  console.log(
    `\n점수 비중: 토큰 ${report.weights.tokenShareOfMaxScore}% / 정확도 ${report.weights.accuracyShareOfMaxScore}%`
  );
  console.log(
    `구매 비용의 점수 환산: 힌트 -${report.weights.hintCostInScore}점 · ` +
      `미리보기 -${report.weights.previewCostInScore}점 · 오답 -${report.weights.wrongAnswerCostInScore}점`
  );

  console.log('\n--- 조정 가이드 ---');
  console.log(
    `· 클리어 시 평균 남은 토큰이 ${Math.round(INITIAL_TOKENS * 0.6)}(초기의 60%)을 넘으면 ` +
      `S 임계(${RANK_THRESHOLDS.S})가 헐겁다 → 임계 상향 또는 INITIAL_TOKENS 하향.`
  );
  console.log('· 클리어율이 30% 아래면 COST_HINT를 낮추거나 자동 해금 간격을 줄인다.');
  console.log('· S 비율이 40%를 넘으면 임계가 낮고, 5% 아래면 사실상 도달 불가다.');
  console.log(
    `· 표본이 사건당 ${report.minSample}판 미만이면 관측치로 상수를 고치지 않는다.\n`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
