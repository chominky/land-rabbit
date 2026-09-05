import fs from 'fs';
import path from 'path';
import { isFileDb } from './fileDb';

/**
 * 판정 신고 저장소 (P3-C).
 *
 * 파일 DB 모드에서는 data/flags.json, 그 외에는 Supabase flags 테이블.
 * 기존에는 Supabase 전용이라 파일 DB로 돌리면 신고가 그대로 사라졌다.
 */

const FLAGS_FILE = path.join(process.cwd(), 'data', 'flags.json');

export type FlagStatus = 'open' | 'resolved' | 'dismissed';

export type FlagRecord = {
  id: string;
  case_id: string;
  room_id?: string | null;
  question_text: string | null;
  answer_text: string | null;
  verdict_or_status: string;
  evidence: string | null;
  ai_response: Record<string, unknown> | null;
  type: 'judge' | 'verdict';
  status: FlagStatus;
  resolution_note: string | null;
  created_at: string;
};

export type NewFlag = Omit<FlagRecord, 'id' | 'created_at' | 'status' | 'resolution_note'> &
  Partial<Pick<FlagRecord, 'status' | 'resolution_note'>>;

function readFile(): FlagRecord[] {
  try {
    if (!fs.existsSync(FLAGS_FILE)) return [];
    return JSON.parse(fs.readFileSync(FLAGS_FILE, 'utf-8')) as FlagRecord[];
  } catch {
    return [];
  }
}

function writeFile(rows: FlagRecord[]): void {
  fs.mkdirSync(path.dirname(FLAGS_FILE), { recursive: true });
  fs.writeFileSync(FLAGS_FILE, JSON.stringify(rows, null, 2), 'utf-8');
}

/** 예전 행에는 status가 없다 — 읽을 때 채워 넣는다. */
function normalize(row: Partial<FlagRecord>): FlagRecord {
  return {
    id: String(row.id),
    case_id: row.case_id ?? '',
    room_id: row.room_id ?? null,
    question_text: row.question_text ?? null,
    answer_text: row.answer_text ?? null,
    verdict_or_status: row.verdict_or_status ?? '',
    evidence: row.evidence ?? null,
    ai_response: row.ai_response ?? null,
    type: row.type === 'verdict' ? 'verdict' : 'judge',
    status: (['open', 'resolved', 'dismissed'] as const).includes(row.status as FlagStatus)
      ? (row.status as FlagStatus)
      : 'open',
    resolution_note: row.resolution_note ?? null,
    created_at: row.created_at ?? new Date().toISOString(),
  };
}

export async function addFlag(flag: NewFlag): Promise<void> {
  const record: FlagRecord = normalize({
    ...flag,
    id: `flag_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    created_at: new Date().toISOString(),
    status: 'open',
  });

  if (isFileDb()) {
    writeFile([record, ...readFile()]);
    return;
  }

  const { createServiceClient } = await import('./supabase/server');
  const supabase = createServiceClient();
  await supabase.from('flags').insert({
    case_id: record.case_id,
    room_id: record.room_id,
    question_text: record.question_text,
    answer_text: record.answer_text,
    verdict_or_status: record.verdict_or_status,
    evidence: record.evidence,
    ai_response: record.ai_response,
    type: record.type,
    status: 'open',
  });
}

export async function listFlags(status?: FlagStatus | 'all'): Promise<FlagRecord[]> {
  if (isFileDb()) {
    const rows = readFile().map(normalize);
    return status && status !== 'all' ? rows.filter((r) => r.status === status) : rows;
  }

  const { createServiceClient } = await import('./supabase/server');
  const supabase = createServiceClient();
  let query = supabase.from('flags').select('*').order('created_at', { ascending: false });
  if (status && status !== 'all') query = query.eq('status', status);
  const { data } = await query;
  return (data ?? []).map((r) => normalize(r as Partial<FlagRecord>));
}

export async function getFlag(id: string): Promise<FlagRecord | null> {
  if (isFileDb()) {
    return readFile().map(normalize).find((r) => r.id === id) ?? null;
  }
  const { createServiceClient } = await import('./supabase/server');
  const supabase = createServiceClient();
  const { data } = await supabase.from('flags').select('*').eq('id', id).single();
  return data ? normalize(data as Partial<FlagRecord>) : null;
}

export async function setFlagStatus(
  id: string,
  status: FlagStatus,
  note?: string
): Promise<boolean> {
  if (isFileDb()) {
    const rows = readFile().map(normalize);
    const target = rows.find((r) => r.id === id);
    if (!target) return false;
    target.status = status;
    if (note !== undefined) target.resolution_note = note;
    writeFile(rows);
    return true;
  }

  const { createServiceClient } = await import('./supabase/server');
  const supabase = createServiceClient();
  const patch: Record<string, unknown> = { status, resolved: status === 'resolved' };
  if (note !== undefined) patch.resolution_note = note;
  const { error } = await supabase.from('flags').update(patch).eq('id', id);
  return !error;
}
