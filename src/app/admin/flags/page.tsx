'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Flag,
  Loader2,
  Plus,
  XCircle,
} from 'lucide-react';
import type { FlagRecord, FlagStatus } from '@/lib/flags';
import { useToast } from '@/components/Toast';

type CaseSummary = {
  id: string;
  title: string;
  keyFacts?: { id: string; label: string }[];
  key_facts?: { id: string; label: string }[];
};

const FILTERS: { key: FlagStatus | 'all'; label: string }[] = [
  { key: 'open', label: '미처리' },
  { key: 'resolved', label: '반영됨' },
  { key: 'dismissed', label: '보류' },
  { key: 'all', label: '전체' },
];

const STATUS_STYLE: Record<FlagStatus, { label: string; color: string }> = {
  open: { label: '미처리', color: 'var(--warning)' },
  resolved: { label: '반영됨', color: 'var(--success)' },
  dismissed: { label: '보류', color: 'var(--dim)' },
};

function verdictColor(v: string): string {
  if (v === 'YES') return 'var(--yes)';
  if (v === 'NO') return 'var(--no)';
  if (v === 'MAYBE' || v === 'partial') return 'var(--maybe)';
  return 'var(--neutral)';
}

export default function FlagsPage() {
  const { toast } = useToast();
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [filter, setFilter] = useState<FlagStatus | 'all'>('open');
  const [busy, setBusy] = useState<string | null>(null);
  /** 신고 id -> 선택한 핵심 요소 id */
  const [factChoice, setFactChoice] = useState<Record<string, string>>({});
  /**
   * 어떤 필터의 결과인지 함께 담는다. 로딩 여부를 파생값으로 얻을 수 있어
   * 효과 안에서 동기적으로 setState하지 않아도 된다.
   */
  const [loaded, setLoaded] = useState<{ filter: FlagStatus | 'all'; rows: FlagRecord[] } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const flags = loaded?.rows ?? [];
  const loading = loaded?.filter !== filter;

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let rows: FlagRecord[] = [];
      try {
        const res = await fetch(`/api/admin/flags?status=${filter}`);
        if (res.ok) rows = await res.json();
      } catch {
        rows = [];
      }
      if (!cancelled) setLoaded({ filter, rows });
    })();
    return () => { cancelled = true; };
  }, [filter, reloadKey]);

  useEffect(() => {
    fetch('/api/admin/cases')
      .then((r) => (r.ok ? r.json() : []))
      .then(setCases)
      .catch(() => setCases([]));
  }, []);

  function factsOf(caseId: string): { id: string; label: string }[] {
    const c = cases.find((x) => x.id === caseId);
    return c?.keyFacts ?? c?.key_facts ?? [];
  }

  async function apply(flag: FlagRecord, target: 'accept' | 'reject') {
    const factId = factChoice[flag.id];
    if (!factId) {
      toast('반영할 핵심 요소를 먼저 고르세요.', { variant: 'error' });
      return;
    }
    setBusy(`${flag.id}-${target}`);
    try {
      const res = await fetch(`/api/admin/flags/${flag.id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factId, target, resolve: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || '반영에 실패했습니다.', { variant: 'error' });
        return;
      }
      toast(
        `"${data.factLabel}"의 ${target === 'accept' ? '인정' : '불인정'} 예시에 추가했습니다.`,
        { variant: 'success' }
      );
      reload();
    } catch {
      toast('반영에 실패했습니다.', { variant: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function addGolden(flag: FlagRecord) {
    if (!flag.question_text) {
      toast('질문이 없는 신고는 골든셋에 넣을 수 없습니다.', { variant: 'error' });
      return;
    }
    setBusy(`${flag.id}-golden`);
    try {
      const res = await fetch(`/api/admin/cases/${flag.case_id}/golden`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: flag.question_text,
          expected_verdict: flag.verdict_or_status,
        }),
      });
      if (!res.ok) throw new Error();
      toast('골든셋에 추가했습니다. 기대 판정은 골든셋 화면에서 조정하세요.', {
        variant: 'success',
      });
    } catch {
      toast('골든셋 추가에 실패했습니다.', { variant: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function changeStatus(flag: FlagRecord, status: FlagStatus) {
    setBusy(`${flag.id}-status`);
    try {
      const res = await fetch(`/api/admin/flags/${flag.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      reload();
    } catch {
      toast('상태 변경에 실패했습니다.', { variant: 'error' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <Link href="/admin" className="p-1 rounded" aria-label="관리자 홈으로">
          <ArrowLeft size={18} style={{ color: 'var(--muted)' }} />
        </Link>
        <Flag size={20} style={{ color: 'var(--accent)' }} />
        <h1 className="text-xl font-bold" style={{ color: 'var(--accent)' }}>
          신고 처리
        </h1>
        <span className="text-sm" style={{ color: 'var(--muted)' }}>({flags.length}건)</span>
      </div>

      {/* 상태 필터 */}
      <div className="flex gap-2 mb-5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className="px-3 py-1.5 rounded text-xs border transition-colors"
            style={{
              borderColor: filter === f.key ? 'var(--accent)' : 'var(--border)',
              color: filter === f.key ? 'var(--accent)' : 'var(--muted)',
              background: filter === f.key ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
            }}
            aria-pressed={filter === f.key}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--muted)' }}>
          <Loader2 size={14} className="animate-spin" /> 불러오는 중…
        </div>
      ) : flags.length === 0 ? (
        <div className="text-center py-12" style={{ color: 'var(--dim)' }}>
          <Flag size={32} className="mx-auto mb-2 opacity-30" />
          <p>{filter === 'open' ? '처리할 신고가 없습니다' : '해당 상태의 신고가 없습니다'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {flags.map((flag) => {
            const facts = factsOf(flag.case_id);
            const caseTitle = cases.find((c) => c.id === flag.case_id)?.title ?? flag.case_id;
            const chosen = factChoice[flag.id] ?? '';
            const isBusy = busy?.startsWith(flag.id);
            return (
              <div
                key={flag.id}
                className="rounded-lg border p-4"
                style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
              >
                {/* 헤더 */}
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span
                    className="text-[10px] px-2 py-0.5 rounded font-bold"
                    style={{
                      background: flag.type === 'judge'
                        ? 'color-mix(in srgb, var(--yes) 20%, transparent)'
                        : 'color-mix(in srgb, var(--maybe) 20%, transparent)',
                      color: flag.type === 'judge' ? 'var(--yes)' : 'var(--maybe)',
                    }}
                  >
                    {flag.type === 'judge' ? '질문 판정' : '최종 채점'}
                  </span>
                  <span
                    className="text-[10px] px-2 py-0.5 rounded border"
                    style={{ color: STATUS_STYLE[flag.status].color, borderColor: 'var(--border)' }}
                  >
                    {STATUS_STYLE[flag.status].label}
                  </span>
                  <Link
                    href={`/admin/cases/${flag.case_id}`}
                    className="text-xs"
                    style={{ color: 'var(--accent)' }}
                  >
                    {caseTitle}
                  </Link>
                  <span className="text-xs" style={{ color: 'var(--dim)' }}>
                    {new Date(flag.created_at).toLocaleString('ko-KR')}
                  </span>
                </div>

                {/* 원문 */}
                {flag.question_text && (
                  <div className="mb-1">
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>질문: </span>
                    <span className="text-sm" style={{ color: 'var(--fg)' }}>{flag.question_text}</span>
                  </div>
                )}
                {flag.answer_text && (
                  <div className="mb-1">
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>추리: </span>
                    <span className="text-sm" style={{ color: 'var(--fg)' }}>{flag.answer_text}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>판정:</span>
                  <span
                    className="stamp text-on-solid"
                    style={{ background: verdictColor(flag.verdict_or_status) }}
                    aria-label={`판정: ${flag.verdict_or_status}`}
                  >
                    {flag.verdict_or_status}
                  </span>
                </div>
                {flag.evidence && (
                  <div className="text-xs mb-1" style={{ color: 'var(--muted)' }}>
                    근거: &quot;{flag.evidence}&quot;
                  </div>
                )}
                {flag.resolution_note && (
                  <div className="text-xs mb-1" style={{ color: 'var(--dim)' }}>
                    처리: {flag.resolution_note}
                  </div>
                )}

                {/* 조치 */}
                <div
                  className="mt-3 pt-3 flex flex-wrap items-center gap-2"
                  style={{ borderTop: '1px solid var(--border)' }}
                >
                  <select
                    value={chosen}
                    onChange={(e) => setFactChoice((prev) => ({ ...prev, [flag.id]: e.target.value }))}
                    className="px-2 py-1.5 rounded text-xs border"
                    style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--fg)' }}
                    aria-label="반영할 핵심 요소"
                  >
                    <option value="">핵심 요소 선택…</option>
                    {facts.map((f) => (
                      <option key={f.id} value={f.id}>{f.label || f.id}</option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => apply(flag, 'accept')}
                    disabled={isBusy || !chosen}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs border disabled:opacity-40"
                    style={{ borderColor: 'color-mix(in srgb, var(--yes) 40%, transparent)', color: 'var(--yes)' }}
                    title="이 표현을 인정 예시(acceptExamples)에 추가"
                  >
                    {busy === `${flag.id}-accept` ? <Loader2 size={11} className="animate-spin" /> : <><Plus size={11} /><CheckCircle size={11} /></>}
                    accept에 추가
                  </button>

                  <button
                    type="button"
                    onClick={() => apply(flag, 'reject')}
                    disabled={isBusy || !chosen}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs border disabled:opacity-40"
                    style={{ borderColor: 'color-mix(in srgb, var(--no) 40%, transparent)', color: 'var(--no)' }}
                    title="이 표현을 불인정 예시(rejectExamples)에 추가"
                  >
                    {busy === `${flag.id}-reject` ? <Loader2 size={11} className="animate-spin" /> : <><Plus size={11} /><XCircle size={11} /></>}
                    reject에 추가
                  </button>

                  <button
                    type="button"
                    onClick={() => addGolden(flag)}
                    disabled={isBusy || !flag.question_text}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs border disabled:opacity-40"
                    style={{ borderColor: 'color-mix(in srgb, var(--accent) 40%, transparent)', color: 'var(--accent)' }}
                    title="이 질문을 골든셋에 추가"
                  >
                    {busy === `${flag.id}-golden` ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                    골든셋에 추가
                  </button>

                  <div className="flex-1" />

                  {flag.status !== 'dismissed' && (
                    <button
                      type="button"
                      onClick={() => changeStatus(flag, 'dismissed')}
                      disabled={isBusy}
                      className="px-2.5 py-1.5 rounded text-xs border disabled:opacity-40"
                      style={{ borderColor: 'var(--border)', color: 'var(--dim)' }}
                    >
                      보류
                    </button>
                  )}
                  {flag.status !== 'open' && (
                    <button
                      type="button"
                      onClick={() => changeStatus(flag, 'open')}
                      disabled={isBusy}
                      className="px-2.5 py-1.5 rounded text-xs border disabled:opacity-40"
                      style={{ borderColor: 'var(--border)', color: 'var(--dim)' }}
                    >
                      되돌리기
                    </button>
                  )}

                  <Link
                    href={`/admin/cases/${flag.case_id}/test`}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs"
                    style={{ background: 'var(--accent)', color: 'var(--bg)' }}
                  >
                    판정 재테스트 <ArrowRight size={11} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
