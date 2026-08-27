import fs from 'fs';
import path from 'path';
import { CaseData } from './types';

const CASES_DIR = path.join(process.cwd(), 'data', 'cases');
const HISTORY_FILE = path.join(process.cwd(), 'data', 'history.json');

export type GameRecord = {
  id: string;
  caseId: string;
  caseTitle: string;
  ip: string;
  solved: boolean;
  score?: number;
  rank?: string;
  accuracy?: number;
  tokensLeft: number;
  totalQuestions: number;
  questions: { text: string; verdict: string }[];
  finalAnswer: string;
  finishedAt: string;
};

export function loadHistory(): GameRecord[] {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return [];
    const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
    return JSON.parse(raw) as GameRecord[];
  } catch {
    return [];
  }
}

export function saveGameRecord(record: GameRecord): void {
  const history = loadHistory();
  history.unshift(record);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
}

export function useFileDb(): boolean {
  return process.env.USE_FILE_DB === 'true' || !process.env.NEXT_PUBLIC_SUPABASE_URL;
}

export function loadAllCases(): CaseData[] {
  try {
    const files = fs.readdirSync(CASES_DIR).filter((f) => f.endsWith('.json'));
    return files.map((f) => {
      const raw = fs.readFileSync(path.join(CASES_DIR, f), 'utf-8');
      const data = JSON.parse(raw);
      return {
        ...data,
        imageMeta: data.imageMeta || data.image_meta || [],
        keyFacts: data.keyFacts || data.key_facts || [],
        redHerrings: data.redHerrings || data.red_herrings || [],
      } as CaseData;
    });
  } catch {
    return [];
  }
}

export function loadCase(id: string): CaseData | null {
  const all = loadAllCases();
  return all.find((c) => c.id === id) || null;
}

export function loadPublishedCases(): CaseData[] {
  const isProduction = process.env.NODE_ENV === 'production';
  return loadAllCases().filter((c) => {
    if (c.status !== 'published') return false;
    if (isProduction && c.id.startsWith('_')) return false;
    return true;
  });
}

export function saveCase(c: CaseData): void {
  if (!fs.existsSync(CASES_DIR)) {
    fs.mkdirSync(CASES_DIR, { recursive: true });
  }
  const filePath = path.join(CASES_DIR, `${c.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(c, null, 2), 'utf-8');
}

export function deleteCase(id: string): boolean {
  const filePath = path.join(CASES_DIR, `${id}.json`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}
