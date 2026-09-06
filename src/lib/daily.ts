/**
 * 데일리 챌린지 (P4-B).
 *
 * 오늘의 사건은 **날짜만으로 결정**된다 — 저장소를 두지 않으므로 서버가
 * 여러 대여도, 파일 DB든 Supabase든 같은 날 같은 사건이 나온다.
 * 리셋은 KST 자정 기준이다.
 *
 * 주의: 후보 목록(발행된 사건)이 바뀌면 같은 날이라도 선택이 바뀔 수 있다.
 * 그래서 리더보드는 (날짜, 사건 id) 두 개를 함께 키로 쓴다 — 목록이 바뀌어도
 * 이전 사건의 기록과 섞이지 않는다.
 */

/** KST = UTC+9. 서머타임이 없어 고정 오프셋으로 충분하다. */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 'YYYY-MM-DD' (KST 기준). 하루의 식별자이자 시드다. */
export function kstDateKey(at: Date = new Date()): string {
  return new Date(at.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 다음 KST 자정의 UTC 시각. 클라이언트가 남은 시간을 세는 데 쓴다. */
export function nextResetAt(at: Date = new Date()): Date {
  const shifted = new Date(at.getTime() + KST_OFFSET_MS);
  const midnight = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() + 1
  );
  return new Date(midnight - KST_OFFSET_MS);
}

/** FNV-1a 32bit. 날짜 문자열 하나를 고르게 퍼진 정수로 바꾸기만 하면 된다. */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * 날짜 시드로 사건 하나를 고른다. 후보는 정렬해서 쓰므로 입력 순서에
 * 흔들리지 않는다. 후보가 없으면 null.
 */
export function pickDailyCaseId(caseIds: string[], dateKey: string): string | null {
  const pool = [...caseIds].filter(Boolean).sort();
  if (pool.length === 0) return null;
  return pool[hash(dateKey) % pool.length];
}

/** 데일리 후보에서 뺄 사건인지. 밑줄로 시작하는 건 테스트용이다. */
export function isDailyCandidate(caseId: string): boolean {
  return !caseId.startsWith('_');
}
