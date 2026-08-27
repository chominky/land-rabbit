'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Play, Plus, Trash2, CheckCircle, XCircle, Loader2 } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Verdict = 'YES' | 'NO' | 'MAYBE' | 'IRRELEVANT' | 'INVALID';

type JudgeResult = {
  verdict: Verdict;
  comment: string;
  revealedFacts: string[];
};

type VerdictResult = {
  results: { id: string; status: 'hit' | 'partial' | 'miss'; evidence: string }[];
  solved: boolean;
  accuracy: number;
  feedback: string;
};

type GoldenTest = {
  id: string;
  case_id: string;
  question: string;
  expected_verdict: Verdict;
  created_at: string;
};

type GoldenTestWithResult = GoldenTest & {
  actual?: Verdict;
  comment?: string;
  passed?: boolean;
  running?: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VERDICT_COLORS: Record<string, string> = {
  YES: '#4ade80',
  NO: '#f87171',
  MAYBE: '#fbbf24',
  IRRELEVANT: '#8b92a0',
  INVALID: '#6b7280',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#0b0d11',
  border: '1px solid #2a2e38',
  borderRadius: '4px',
  padding: '9px 12px',
  color: '#e8eaf0',
  fontSize: '13px',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'monospace',
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: 'vertical',
  minHeight: '80px',
};

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: '#12151c',
        border: '1px solid #2a2e38',
        borderRadius: '8px',
        padding: '24px',
        marginBottom: '16px',
      }}
    >
      <div style={{ color: '#c8a24e', fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '18px' }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: '4px',
        fontSize: '12px',
        fontWeight: 700,
        color: VERDICT_COLORS[verdict] || '#8b92a0',
        background: `${VERDICT_COLORS[verdict] || '#8b92a0'}18`,
        border: `1px solid ${VERDICT_COLORS[verdict] || '#8b92a0'}40`,
      }}
    >
      {verdict}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CaseTestPage() {
  const params = useParams();
  const caseId = params.id as string;

  // Judge tester
  const [judgeInput, setJudgeInput] = useState('');
  const [judgeResult, setJudgeResult] = useState<JudgeResult | null>(null);
  const [judgeLoading, setJudgeLoading] = useState(false);
  const [judgeError, setJudgeError] = useState('');

  // Verdict tester
  const [verdictInput, setVerdictInput] = useState('');
  const [verdictResult, setVerdictResult] = useState<VerdictResult | null>(null);
  const [verdictLoading, setVerdictLoading] = useState(false);
  const [verdictError, setVerdictError] = useState('');

  // Golden tests
  const [goldenTests, setGoldenTests] = useState<GoldenTestWithResult[]>([]);
  const [goldenLoading, setGoldenLoading] = useState(true);
  const [newQuestion, setNewQuestion] = useState('');
  const [newExpected, setNewExpected] = useState<Verdict>('YES');
  const [addingGolden, setAddingGolden] = useState(false);
  const [runningAll, setRunningAll] = useState(false);

  useEffect(() => {
    fetchGoldenTests();
  }, []);

  async function fetchGoldenTests() {
    try {
      const res = await fetch(`/api/admin/cases/${caseId}/golden`);
      const data = await res.json();
      setGoldenTests(data);
    } catch {
      // ignore
    } finally {
      setGoldenLoading(false);
    }
  }

  async function runJudge() {
    if (!judgeInput.trim()) return;
    setJudgeLoading(true);
    setJudgeError('');
    setJudgeResult(null);
    try {
      const res = await fetch(`/api/admin/cases/${caseId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'judge', input: judgeInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setJudgeResult(data);
    } catch (err) {
      setJudgeError(String(err));
    } finally {
      setJudgeLoading(false);
    }
  }

  async function runVerdict() {
    if (!verdictInput.trim()) return;
    setVerdictLoading(true);
    setVerdictError('');
    setVerdictResult(null);
    try {
      const res = await fetch(`/api/admin/cases/${caseId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'verdict', input: verdictInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setVerdictResult(data);
    } catch (err) {
      setVerdictError(String(err));
    } finally {
      setVerdictLoading(false);
    }
  }

  async function addGoldenTest() {
    if (!newQuestion.trim()) return;
    setAddingGolden(true);
    try {
      const res = await fetch(`/api/admin/cases/${caseId}/golden`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: newQuestion, expected_verdict: newExpected }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setGoldenTests((prev) => [...prev, data]);
      setNewQuestion('');
      setNewExpected('YES');
    } catch (err) {
      alert(String(err));
    } finally {
      setAddingGolden(false);
    }
  }

  async function deleteGoldenTest(testId: string) {
    if (!confirm('이 Golden Test를 삭제하시겠습니까?')) return;
    try {
      await fetch(`/api/admin/cases/${caseId}/golden?testId=${testId}`, { method: 'DELETE' });
      setGoldenTests((prev) => prev.filter((t) => t.id !== testId));
    } catch {
      alert('삭제 실패');
    }
  }

  async function runSingleGolden(test: GoldenTestWithResult) {
    setGoldenTests((prev) => prev.map((t) => t.id === test.id ? { ...t, running: true } : t));
    try {
      const res = await fetch(`/api/admin/cases/${caseId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'judge', input: test.question }),
      });
      const data = await res.json();
      const actual: Verdict = data.verdict;
      setGoldenTests((prev) =>
        prev.map((t) =>
          t.id === test.id
            ? { ...t, running: false, actual, comment: data.comment, passed: actual === t.expected_verdict }
            : t
        )
      );
    } catch {
      setGoldenTests((prev) => prev.map((t) => t.id === test.id ? { ...t, running: false } : t));
    }
  }

  async function runAllGolden() {
    setRunningAll(true);
    for (const test of goldenTests) {
      await runSingleGolden(test);
    }
    setRunningAll(false);
  }

  const passCount = goldenTests.filter((t) => t.passed === true).length;
  const failCount = goldenTests.filter((t) => t.passed === false).length;

  return (
    <div style={{ padding: '32px', color: '#e8eaf0', fontFamily: 'monospace' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#c8a24e', margin: 0 }}>
          Test: {caseId}
        </h1>
        <p style={{ color: '#5a6070', fontSize: '13px', marginTop: '4px' }}>
          AI 판정기 및 최종 심판 테스트
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        {/* Judge tester */}
        <Panel title="JUDGE TESTER">
          <div style={{ marginBottom: '12px' }}>
            <div style={{ color: '#5a6070', fontSize: '11px', marginBottom: '6px' }}>QUESTION</div>
            <textarea
              style={textareaStyle}
              value={judgeInput}
              onChange={(e) => setJudgeInput(e.target.value)}
              placeholder="플레이어 질문 입력..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) runJudge();
              }}
            />
          </div>
          <button
            onClick={runJudge}
            disabled={judgeLoading || !judgeInput.trim()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: judgeLoading ? '#5a4820' : '#c8a24e',
              color: judgeLoading ? '#8b7040' : '#0b0d11',
              border: 'none',
              padding: '8px 14px',
              borderRadius: '5px',
              cursor: judgeLoading ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              fontWeight: 700,
              marginBottom: '16px',
            }}
          >
            {judgeLoading ? <Loader2 size={14} /> : <Play size={14} />}
            {judgeLoading ? '판정 중...' : '판정 실행'}
          </button>

          {judgeError && (
            <div style={{ color: '#f87171', fontSize: '12px', marginBottom: '10px' }}>{judgeError}</div>
          )}

          {judgeResult && (
            <div style={{ background: '#0b0d11', border: '1px solid #2a2e38', borderRadius: '6px', padding: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <VerdictBadge verdict={judgeResult.verdict} />
              </div>
              <div style={{ color: '#8b92a0', fontSize: '12px', lineHeight: '1.6', marginBottom: '10px' }}>
                {judgeResult.comment}
              </div>
              {judgeResult.revealedFacts?.length > 0 && (
                <div>
                  <div style={{ color: '#5a6070', fontSize: '11px', marginBottom: '5px' }}>REVEALED FACTS</div>
                  {judgeResult.revealedFacts.map((f, i) => (
                    <div key={i} style={{ color: '#4ade80', fontSize: '12px', marginBottom: '3px' }}>• {f}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Panel>

        {/* Verdict tester */}
        <Panel title="VERDICT TESTER">
          <div style={{ marginBottom: '12px' }}>
            <div style={{ color: '#5a6070', fontSize: '11px', marginBottom: '6px' }}>FINAL ANSWER</div>
            <textarea
              style={{ ...textareaStyle, minHeight: '100px' }}
              value={verdictInput}
              onChange={(e) => setVerdictInput(e.target.value)}
              placeholder="플레이어의 최종 추리 입력..."
            />
          </div>
          <button
            onClick={runVerdict}
            disabled={verdictLoading || !verdictInput.trim()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: verdictLoading ? '#1a3050' : 'rgba(99,102,241,0.2)',
              color: verdictLoading ? '#5a7090' : '#818cf8',
              border: '1px solid rgba(99,102,241,0.3)',
              padding: '8px 14px',
              borderRadius: '5px',
              cursor: verdictLoading ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              fontWeight: 700,
              marginBottom: '16px',
            }}
          >
            {verdictLoading ? <Loader2 size={14} /> : <Play size={14} />}
            {verdictLoading ? '심판 중...' : '최종 심판'}
          </button>

          {verdictError && (
            <div style={{ color: '#f87171', fontSize: '12px', marginBottom: '10px' }}>{verdictError}</div>
          )}

          {verdictResult && (
            <div style={{ background: '#0b0d11', border: '1px solid #2a2e38', borderRadius: '6px', padding: '14px' }}>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '10px' }}>
                <span style={{ color: verdictResult.solved ? '#4ade80' : '#f87171', fontWeight: 700, fontSize: '13px' }}>
                  {verdictResult.solved ? 'SOLVED' : 'NOT SOLVED'}
                </span>
                <span style={{ color: '#8b92a0', fontSize: '12px' }}>
                  Accuracy: {Math.round(verdictResult.accuracy * 100)}%
                </span>
              </div>
              <div style={{ color: '#8b92a0', fontSize: '12px', lineHeight: '1.6', marginBottom: '10px' }}>
                {verdictResult.feedback}
              </div>
              {verdictResult.results?.length > 0 && (
                <div>
                  <div style={{ color: '#5a6070', fontSize: '11px', marginBottom: '6px' }}>FACT RESULTS</div>
                  {verdictResult.results.map((r) => (
                    <div key={r.id} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '5px' }}>
                      <span style={{ color: r.status === 'hit' ? '#4ade80' : r.status === 'partial' ? '#fbbf24' : '#f87171', fontSize: '11px', fontWeight: 700, minWidth: '48px', marginTop: '1px' }}>
                        {r.status.toUpperCase()}
                      </span>
                      <span style={{ color: '#8b92a0', fontSize: '12px', flex: 1 }}>{r.id}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Panel>
      </div>

      {/* Golden Tests */}
      <Panel title="GOLDEN TESTS">
        {/* Add new */}
        <div
          style={{
            background: '#0b0d11',
            border: '1px solid #2a2e38',
            borderRadius: '6px',
            padding: '14px',
            marginBottom: '16px',
          }}
        >
          <div style={{ color: '#5a6070', fontSize: '11px', fontWeight: 600, marginBottom: '10px' }}>NEW GOLDEN TEST</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px auto', gap: '8px', alignItems: 'flex-start' }}>
            <textarea
              style={{ ...textareaStyle, minHeight: '60px' }}
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              placeholder="테스트 질문..."
            />
            <select
              style={{ ...inputStyle, height: '60px' }}
              value={newExpected}
              onChange={(e) => setNewExpected(e.target.value as Verdict)}
            >
              {(['YES', 'NO', 'MAYBE', 'IRRELEVANT', 'INVALID'] as const).map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
            <button
              onClick={addGoldenTest}
              disabled={addingGolden || !newQuestion.trim()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                background: 'rgba(200,162,78,0.1)',
                border: '1px solid rgba(200,162,78,0.2)',
                color: '#c8a24e',
                padding: '0 12px',
                height: '60px',
                borderRadius: '4px',
                cursor: addingGolden ? 'not-allowed' : 'pointer',
                fontSize: '12px',
                whiteSpace: 'nowrap',
              }}
            >
              <Plus size={13} /> Add
            </button>
          </div>
        </div>

        {/* Run all */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ fontSize: '13px', color: '#8b92a0' }}>
            총 {goldenTests.length}개
            {(passCount > 0 || failCount > 0) && (
              <>
                &nbsp;&nbsp;
                <span style={{ color: '#4ade80' }}>{passCount} Pass</span>
                &nbsp;&nbsp;
                <span style={{ color: '#f87171' }}>{failCount} Fail</span>
              </>
            )}
          </div>
          <button
            onClick={runAllGolden}
            disabled={runningAll || goldenTests.length === 0}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              background: runningAll ? '#1a1e28' : 'rgba(99,102,241,0.1)',
              border: '1px solid rgba(99,102,241,0.25)',
              color: runningAll ? '#5a6070' : '#818cf8',
              padding: '7px 14px',
              borderRadius: '5px',
              cursor: runningAll ? 'not-allowed' : 'pointer',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            {runningAll ? <Loader2 size={13} /> : <Play size={13} />}
            Run All
          </button>
        </div>

        {/* Test list */}
        {goldenLoading ? (
          <div style={{ color: '#5a6070', textAlign: 'center', padding: '20px', fontSize: '13px' }}>불러오는 중...</div>
        ) : goldenTests.length === 0 ? (
          <div style={{ color: '#5a6070', textAlign: 'center', padding: '20px', fontSize: '13px' }}>
            Golden Test가 없습니다. 위에서 추가하세요.
          </div>
        ) : (
          <div>
            {goldenTests.map((test) => (
              <div
                key={test.id}
                style={{
                  background: '#0b0d11',
                  border: `1px solid ${test.passed === true ? 'rgba(34,197,94,0.2)' : test.passed === false ? 'rgba(220,38,38,0.2)' : '#2a2e38'}`,
                  borderRadius: '6px',
                  padding: '12px 14px',
                  marginBottom: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#e8eaf0', fontSize: '13px', marginBottom: '6px', lineHeight: '1.5' }}>
                      {test.question}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <span style={{ color: '#5a6070', fontSize: '11px' }}>Expected:</span>
                      <VerdictBadge verdict={test.expected_verdict} />
                      {test.actual && (
                        <>
                          <span style={{ color: '#5a6070', fontSize: '11px' }}>Actual:</span>
                          <VerdictBadge verdict={test.actual} />
                          {test.passed === true ? (
                            <CheckCircle size={14} color="#4ade80" />
                          ) : (
                            <XCircle size={14} color="#f87171" />
                          )}
                        </>
                      )}
                      {test.running && <Loader2 size={13} color="#c8a24e" />}
                    </div>
                    {test.comment && (
                      <div style={{ color: '#5a6070', fontSize: '11px', marginTop: '5px', fontStyle: 'italic' }}>
                        {test.comment}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
                    <button
                      onClick={() => runSingleGolden(test)}
                      disabled={test.running}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '5px 8px',
                        background: 'rgba(99,102,241,0.08)',
                        border: 'none',
                        color: '#818cf8',
                        borderRadius: '4px',
                        cursor: test.running ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <Play size={12} />
                    </button>
                    <button
                      onClick={() => deleteGoldenTest(test.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '5px 8px',
                        background: 'rgba(220,38,38,0.08)',
                        border: 'none',
                        color: '#f87171',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
