'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

type GameRecord = {
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

export default function AdminHistoryPage() {
  const [records, setRecords] = useState<GameRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/history')
      .then((r) => r.json())
      .then((data) => { setRecords(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div style={{ padding: 40, color: 'var(--muted)' }}>불러오는 중...</div>;
  }

  return (
    <div style={{ padding: 40, color: 'var(--fg)' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>
        플레이 기록
      </h1>
      <p style={{ color: 'var(--dim)', fontSize: 13, marginBottom: 24 }}>
        총 {records.length}건의 기록
      </p>

      {records.length === 0 ? (
        <p style={{ color: 'var(--dim)' }}>아직 기록이 없습니다.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {records.map((r) => {
            const isExpanded = expandedId === r.id;
            return (
              <div
                key={r.id}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  overflow: 'hidden',
                }}
              >
                {/* Summary row */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : r.id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '14px 16px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--fg)',
                    textAlign: 'left',
                  }}
                >
                  {/* Solved badge */}
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 700,
                      background: r.solved ? 'var(--yes)' : 'var(--no)',
                      color: 'var(--on-solid)',
                      flexShrink: 0,
                    }}
                  >
                    {r.solved ? '해결' : '미해결'}
                  </span>

                  {/* Case title */}
                  <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>
                    {r.caseTitle}
                  </span>

                  {/* Rank */}
                  {r.rank && (
                    <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>
                      {r.rank}랭크
                    </span>
                  )}

                  {/* Score */}
                  {r.score !== undefined && (
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {r.score}점
                    </span>
                  )}

                  {/* Questions count */}
                  <span style={{ fontSize: 11, color: 'var(--dim)' }}>
                    Q{r.totalQuestions}
                  </span>

                  {/* Time */}
                  <span style={{ fontSize: 11, color: 'var(--dim)', flexShrink: 0 }}>
                    {new Date(r.finishedAt).toLocaleString('ko-KR')}
                  </span>

                  {/* IP */}
                  <span style={{ fontSize: 10, color: 'var(--border-strong)', flexShrink: 0 }}>
                    {r.ip.split(',')[0]}
                  </span>

                  {isExpanded ? <ChevronUp size={14} color="var(--dim)" /> : <ChevronDown size={14} color="var(--dim)" />}
                </button>

                {/* Detail */}
                {isExpanded && (
                  <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
                    {/* Stats */}
                    <div style={{ display: 'flex', gap: 16, padding: '12px 0', fontSize: 12, color: 'var(--muted)' }}>
                      <span>정확도: {r.accuracy ?? '-'}%</span>
                      <span>남은 질문: {r.tokensLeft}</span>
                      <span>질문 수: {r.totalQuestions}</span>
                    </div>

                    {/* Questions */}
                    {r.questions.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 6, fontWeight: 600 }}>질문 기록</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {r.questions.map((q, i) => (
                            <div
                              key={i}
                              style={{
                                display: 'flex',
                                gap: 8,
                                fontSize: 12,
                                padding: '4px 8px',
                                borderRadius: 4,
                                background: 'var(--bg)',
                              }}
                            >
                              <span style={{ color: 'var(--dim)', flexShrink: 0 }}>Q{i + 1}.</span>
                              <span style={{ color: 'var(--fg)', flex: 1 }}>{q.text}</span>
                              <span
                                style={{
                                  color: q.verdict === 'YES' ? 'var(--yes)' : q.verdict === 'NO' ? 'var(--no)' : 'var(--maybe)',
                                  fontWeight: 700,
                                  fontSize: 11,
                                  flexShrink: 0,
                                }}
                              >
                                {q.verdict}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Final answer */}
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 6, fontWeight: 600 }}>최종 추리</div>
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--fg)',
                          background: 'var(--bg)',
                          padding: '8px 12px',
                          borderRadius: 4,
                          lineHeight: 1.6,
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {r.finalAnswer}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
