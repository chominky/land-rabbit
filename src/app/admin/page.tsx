'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ChevronRight,
  Flag,
  FolderOpen,
  History,
  Loader2,
} from 'lucide-react';
import type { StatsSummary } from '@/lib/history';
import { rankToken } from '@/lib/theme';

const cards = [
  {
    href: '/admin/cases',
    icon: FolderOpen,
    title: 'Cases',
    description: '사건 목록 조회 및 관리. 새 사건 추가, 게시/비게시 전환, 삭제.',
  },
  {
    href: '/admin/history',
    icon: History,
    title: 'History',
    description: '플레이어들의 게임 기록 조회. 질문 내역, 최종 추리, 점수 확인.',
  },
  {
    href: '/admin/flags',
    icon: Flag,
    title: 'Flags',
    description: '플레이어가 신고한 판정 로그 확인. 정답 예시 보완에 활용.',
  },
];

const RANKS = ['S', 'A', 'B', 'C', 'D'] as const;

type SortKey = 'plays' | 'clearRate' | 'avgScore' | 'avgTokensLeft' | 'avgAccuracy' | 'flagCount';

function StatCard({ label, value, suffix }: { label: string; value: number | string; suffix?: string }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '18px 20px',
      }}
    >
      <div style={{ color: 'var(--dim)', fontSize: 12 }}>{label}</div>
      <div style={{ color: 'var(--accent)', fontSize: 30, fontWeight: 700, marginTop: 4 }}>
        {value}
        {suffix && <span style={{ fontSize: 15, color: 'var(--muted)', marginLeft: 3 }}>{suffix}</span>}
      </div>
    </div>
  );
}

const TH: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  fontSize: 11,
  color: 'var(--dim)',
  fontWeight: 600,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  userSelect: 'none',
};

const TD: React.CSSProperties = {
  padding: '10px',
  fontSize: 13,
  color: 'var(--fg)',
  borderTop: '1px solid var(--border)',
  whiteSpace: 'nowrap',
};

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<(StatsSummary & { source?: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('plays');

  useEffect(() => {
    fetch('/api/admin/stats')
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 401 ? '로그인이 필요합니다.' : '통계를 불러오지 못했습니다.');
        return r.json();
      })
      .then(setStats)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const rankMax = stats
    ? Math.max(1, ...RANKS.map((r) => stats.rankDistribution[r] ?? 0))
    : 1;

  const sortedCases = stats
    ? [...stats.cases].sort((a, b) => b[sortKey] - a[sortKey])
    : [];

  return (
    <div style={{ padding: 40, color: 'var(--fg)' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)', margin: 0 }}>Dashboard</h1>
        <p style={{ color: 'var(--dim)', fontSize: 13, marginTop: 6 }}>
          육지토끼고기 관리자 패널
          {stats?.source && (
            <span style={{ marginLeft: 8, color: 'var(--muted)' }}>
              · 데이터 출처: {stats.source === 'file' ? '파일 DB' : 'Supabase'}
            </span>
          )}
        </p>
      </div>

      {/* ── 요약 ─────────────────────────────────────────────────────────── */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--dim)', fontSize: 13, marginBottom: 28 }}>
          <Loader2 size={14} className="animate-spin" /> 통계를 불러오는 중…
        </div>
      )}

      {error && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--danger-surface)', border: '1px solid var(--no)',
            color: 'var(--danger-fg)', borderRadius: 6, padding: '12px 16px',
            fontSize: 13, marginBottom: 28,
          }}
        >
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {stats && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 14,
              marginBottom: 28,
            }}
          >
            <StatCard label="총 플레이" value={stats.totalPlays} suffix="판" />
            <StatCard label="전체 클리어율" value={stats.clearRate} suffix="%" />
            <StatCard label="평균 점수 (클리어)" value={stats.avgScore} suffix="점" />
            <StatCard label="평균 질문 수" value={stats.avgQuestions} suffix="개" />
          </div>

          {/* ── 랭크 분포 ──────────────────────────────────────────────── */}
          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 12 }}>
              랭크 분포 (클리어한 판)
            </h2>
            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 18,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {RANKS.map((r) => {
                const n = stats.rankDistribution[r] ?? 0;
                return (
                  <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ width: 18, fontWeight: 700, color: rankToken(r), fontSize: 14 }}>{r}</span>
                    <div style={{ flex: 1, height: 10, background: 'var(--surface-2)', borderRadius: 5, overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${(n / rankMax) * 100}%`,
                          background: rankToken(r),
                          borderRadius: 5,
                          transition: 'width 0.3s',
                        }}
                      />
                    </div>
                    <span style={{ width: 34, textAlign: 'right', fontSize: 12, color: 'var(--muted)' }}>{n}</span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── 사건별 지표 ────────────────────────────────────────────── */}
          <section style={{ marginBottom: 36 }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 12 }}>
              사건별 지표
              <span style={{ fontWeight: 400, color: 'var(--dim)', marginLeft: 8 }}>
                (열 제목을 눌러 정렬)
              </span>
            </h2>
            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                overflowX: 'auto',
              }}
            >
              {sortedCases.length === 0 ? (
                <p style={{ padding: 20, fontSize: 13, color: 'var(--dim)', margin: 0 }}>
                  아직 플레이 기록이 없습니다.
                </p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                  <thead>
                    <tr>
                      <th style={{ ...TH, cursor: 'default' }}>사건</th>
                      {([
                        ['plays', '플레이'],
                        ['clearRate', '클리어율'],
                        ['avgScore', '평균 점수'],
                        ['avgTokensLeft', '평균 남은 질문'],
                        ['avgAccuracy', '평균 정확도'],
                        ['flagCount', '신고'],
                      ] as [SortKey, string][]).map(([key, label]) => (
                        <th
                          key={key}
                          style={{ ...TH, color: sortKey === key ? 'var(--accent)' : 'var(--dim)' }}
                          onClick={() => setSortKey(key)}
                        >
                          {label} {sortKey === key ? '▼' : ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCases.map((c) => (
                      <tr key={c.caseId}>
                        <td style={TD}>
                          <Link
                            href={`/admin/cases/${c.caseId}`}
                            style={{ color: 'var(--accent)', textDecoration: 'none' }}
                          >
                            {c.caseTitle}
                          </Link>
                          <div style={{ fontSize: 11, color: 'var(--dim)' }}>{c.caseId}</div>
                        </td>
                        <td style={TD}>{c.plays}</td>
                        <td style={TD}>
                          <span style={{ color: c.clearRate >= 50 ? 'var(--success)' : 'var(--warning)' }}>
                            {c.clearRate}%
                          </span>
                          <span style={{ color: 'var(--dim)', fontSize: 11, marginLeft: 4 }}>
                            ({c.solvedCount}/{c.plays})
                          </span>
                        </td>
                        <td style={TD}>{c.avgScore || '—'}</td>
                        <td style={TD}>{c.avgTokensLeft}</td>
                        <td style={TD}>{c.avgAccuracy}%</td>
                        <td style={{ ...TD, color: c.flagCount > 0 ? 'var(--warning)' : 'var(--dim)' }}>
                          {c.flagCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {stats.source === 'file' && (
              <p style={{ fontSize: 11, color: 'var(--dim)', marginTop: 8 }}>
                파일 DB 모드에서는 신고가 저장되지 않아 신고 수가 항상 0입니다.
              </p>
            )}
          </section>
        </>
      )}

      {/* ── 바로가기 ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {cards.map(({ href, icon: Icon, title, description }) => (
          <Link key={href} href={href} style={{ textDecoration: 'none' }}>
            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 24,
                cursor: 'pointer',
                transition: 'border-color 0.15s',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Icon size={20} color="var(--accent)" />
                <ChevronRight size={16} color="var(--dim)" />
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)' }}>{title}</div>
              <div style={{ fontSize: 12, color: 'var(--dim)', lineHeight: 1.6 }}>{description}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
