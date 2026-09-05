'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, FlaskConical } from 'lucide-react';

type CaseRow = {
  id: string;
  title: string;
  status: 'draft' | 'published';
  difficulty: number;
  images: string[];
  play_count: number;
  flag_count: number;
};

const DIFFICULTY_LABELS: Record<number, string> = {
  1: '★',
  2: '★★',
  3: '★★★',
  4: '★★★★',
  5: '★★★★★',
};

export default function AdminCasesPage() {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  async function fetchCases() {
    try {
      const res = await fetch('/api/admin/cases');
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setCases(data);
    } catch {
      setError('사건 목록 불러오기 실패');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCases();
  }, []);

  async function toggleStatus(c: CaseRow) {
    const newStatus = c.status === 'published' ? 'draft' : 'published';
    setActionLoading(c.id + '-toggle');
    try {
      const res = await fetch(`/api/admin/cases/${c.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 서버가 발행 조건 미달 사유를 돌려준다 (P3-B).
        const blockers: string[] = data.blockers ?? [];
        setError(
          blockers.length
            ? `"${c.title}" 발행 불가 — ${blockers.join(' / ')}`
            : data.error || '상태 변경에 실패했습니다.'
        );
        return;
      }
      setError('');
      setCases((prev) => prev.map((x) => x.id === c.id ? { ...x, status: newStatus } : x));
    } catch {
      setError('상태 변경에 실패했습니다.');
    } finally {
      setActionLoading(null);
    }
  }

  async function deleteCase(c: CaseRow) {
    if (!confirm(`"${c.title}" 사건을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return;
    setActionLoading(c.id + '-delete');
    try {
      const res = await fetch(`/api/admin/cases/${c.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      setCases((prev) => prev.filter((x) => x.id !== c.id));
    } catch {
      alert('삭제 실패');
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div style={{ padding: '40px', color: 'var(--fg)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--accent)', margin: 0 }}>Cases</h1>
          <p style={{ color: 'var(--dim)', fontSize: '13px', marginTop: '4px' }}>
            총 {cases.length}개 사건
          </p>
        </div>
        <Link
          href="/admin/cases/new"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'var(--accent)',
            color: 'var(--bg)',
            padding: '9px 16px',
            borderRadius: '6px',
            textDecoration: 'none',
            fontSize: '13px',
            fontWeight: 700,
          }}
        >
          <Plus size={15} />
          New Case
        </Link>
      </div>

      {/* Error */}
      {error && (
        <div style={{ color: 'var(--danger-fg)', background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: '6px', padding: '12px 16px', marginBottom: '20px' }}>
          {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ color: 'var(--dim)', textAlign: 'center', padding: '60px' }}>불러오는 중...</div>
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Title', 'Status', 'Difficulty', 'Images', 'Plays', 'Flags', 'Actions'].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      color: 'var(--dim)',
                      fontSize: '11px',
                      fontWeight: 600,
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cases.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--dim)', fontSize: '13px' }}>
                    사건이 없습니다. New Case를 눌러 추가하세요.
                  </td>
                </tr>
              ) : (
                cases.map((c) => (
                  <tr
                    key={c.id}
                    style={{ borderBottom: '1px solid var(--surface-3)' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--surface-3)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'; }}
                  >
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ color: 'var(--fg)', fontSize: '13px', fontWeight: 500 }}>{c.title}</div>
                      <div style={{ color: 'var(--dim)', fontSize: '11px', marginTop: '2px' }}>{c.id}</div>
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          background: c.status === 'published' ? 'rgba(34,197,94,0.12)' : 'rgba(107,114,128,0.15)',
                          color: c.status === 'published' ? 'var(--success)' : 'var(--gray)',
                          border: `1px solid ${c.status === 'published' ? 'rgba(34,197,94,0.25)' : 'rgba(107,114,128,0.25)'}`,
                        }}
                      >
                        {c.status === 'published' ? 'PUBLISHED' : 'DRAFT'}
                      </span>
                    </td>
                    <td style={{ padding: '13px 16px', color: 'var(--accent)', fontSize: '13px' }}>
                      {DIFFICULTY_LABELS[c.difficulty] || c.difficulty}
                    </td>
                    <td style={{ padding: '13px 16px', color: 'var(--muted)', fontSize: '13px' }}>
                      {(c.images || []).length}
                    </td>
                    <td style={{ padding: '13px 16px', color: 'var(--muted)', fontSize: '13px' }}>
                      {c.play_count ?? 0}
                    </td>
                    <td style={{ padding: '13px 16px', color: 'var(--muted)', fontSize: '13px' }}>
                      {c.flag_count ?? 0}
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <Link
                          href={`/admin/cases/${c.id}`}
                          title="Edit"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '6px',
                            borderRadius: '4px',
                            background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
                            color: 'var(--accent)',
                            textDecoration: 'none',
                          }}
                        >
                          <Pencil size={13} />
                        </Link>
                        <Link
                          href={`/admin/cases/${c.id}/test`}
                          title="Test"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '6px',
                            borderRadius: '4px',
                            background: 'rgba(99,102,241,0.08)',
                            color: 'var(--info)',
                            textDecoration: 'none',
                          }}
                        >
                          <FlaskConical size={13} />
                        </Link>
                        <button
                          onClick={() => toggleStatus(c)}
                          disabled={actionLoading === c.id + '-toggle'}
                          title={c.status === 'published' ? 'Unpublish' : 'Publish'}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '6px',
                            borderRadius: '4px',
                            background: c.status === 'published' ? 'rgba(34,197,94,0.08)' : 'rgba(107,114,128,0.1)',
                            color: c.status === 'published' ? 'var(--success)' : 'var(--gray)',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          {c.status === 'published' ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                        </button>
                        <button
                          onClick={() => deleteCase(c)}
                          disabled={actionLoading === c.id + '-delete'}
                          title="Delete"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '6px',
                            borderRadius: '4px',
                            background: 'rgba(220,38,38,0.08)',
                            color: 'var(--danger-fg)',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
