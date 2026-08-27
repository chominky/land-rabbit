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
    return <div style={{ padding: 40, color: '#8b8d93' }}>불러오는 중...</div>;
  }

  return (
    <div style={{ padding: 40, color: '#e8eaf0' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#c8a24e', marginBottom: 8 }}>
        플레이 기록
      </h1>
      <p style={{ color: '#5a6070', fontSize: 13, marginBottom: 24 }}>
        총 {records.length}건의 기록
      </p>

      {records.length === 0 ? (
        <p style={{ color: '#5a6070' }}>아직 기록이 없습니다.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {records.map((r) => {
            const isExpanded = expandedId === r.id;
            return (
              <div
                key={r.id}
                style={{
                  background: '#12151c',
                  border: '1px solid #2a2e38',
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
                    color: '#e8eaf0',
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
                      background: r.solved ? '#3a7d44' : '#8b3a3a',
                      color: '#fff',
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
                    <span style={{ fontSize: 12, color: '#c8a24e', fontWeight: 700 }}>
                      {r.rank}랭크
                    </span>
                  )}

                  {/* Score */}
                  {r.score !== undefined && (
                    <span style={{ fontSize: 12, color: '#8b8d93' }}>
                      {r.score}점
                    </span>
                  )}

                  {/* Questions count */}
                  <span style={{ fontSize: 11, color: '#5a6070' }}>
                    Q{r.totalQuestions}
                  </span>

                  {/* Time */}
                  <span style={{ fontSize: 11, color: '#5a6070', flexShrink: 0 }}>
                    {new Date(r.finishedAt).toLocaleString('ko-KR')}
                  </span>

                  {/* IP */}
                  <span style={{ fontSize: 10, color: '#3a3d45', flexShrink: 0 }}>
                    {r.ip.split(',')[0]}
                  </span>

                  {isExpanded ? <ChevronUp size={14} color="#5a6070" /> : <ChevronDown size={14} color="#5a6070" />}
                </button>

                {/* Detail */}
                {isExpanded && (
                  <div style={{ padding: '0 16px 16px', borderTop: '1px solid #2a2e38' }}>
                    {/* Stats */}
                    <div style={{ display: 'flex', gap: 16, padding: '12px 0', fontSize: 12, color: '#8b8d93' }}>
                      <span>정확도: {r.accuracy ?? '-'}%</span>
                      <span>남은 토큰: {r.tokensLeft}</span>
                      <span>질문 수: {r.totalQuestions}</span>
                    </div>

                    {/* Questions */}
                    {r.questions.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: '#5a6070', marginBottom: 6, fontWeight: 600 }}>질문 기록</div>
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
                                background: '#0b0d11',
                              }}
                            >
                              <span style={{ color: '#5a6070', flexShrink: 0 }}>Q{i + 1}.</span>
                              <span style={{ color: '#e8eaf0', flex: 1 }}>{q.text}</span>
                              <span
                                style={{
                                  color: q.verdict === 'YES' ? '#3a7d44' : q.verdict === 'NO' ? '#8b3a3a' : '#8b7a3a',
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
                      <div style={{ fontSize: 11, color: '#5a6070', marginBottom: 6, fontWeight: 600 }}>최종 추리</div>
                      <div
                        style={{
                          fontSize: 12,
                          color: '#e8eaf0',
                          background: '#0b0d11',
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
