'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Play, Plus, Trash2, CheckCircle, XCircle, Loader2, AlertTriangle } from 'lucide-react';

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

type RunSummary = {
  total: number;
  passed: number;
  failed: number;
  rate: number;
  threshold: number;
  ok: boolean;
  results: { id: string; question: string; expected: Verdict; actual: string; comment?: string; pass: boolean }[];
};

type GoldenTestWithResult = GoldenTest & {
  actual?: Verdict;
  comment?: string;
  passed?: boolean;
  running?: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VERDICT_COLORS: Record<string, string> = {
  YES: 'var(--success)',
  NO: 'var(--danger-fg)',
  MAYBE: 'var(--warning)',
  IRRELEVANT: 'var(--muted)',
  INVALID: 'var(--gray)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  padding: '9px 12px',
  color: 'var(--fg)',
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
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '24px',
        marginBottom: '16px',
      }}
    >
      <div style={{ color: 'var(--accent)', fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '18px' }}>
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
        color: VERDICT_COLORS[verdict] || 'var(--muted)',
        background: `${VERDICT_COLORS[verdict] || 'var(--muted)'}18`,
        border: `1px solid ${VERDICT_COLORS[verdict] || 'var(--muted)'}40`,
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
  const [goldenError, setGoldenError] = useState('');
  const [runningAll, setRunningAll] = useState(false);
  const [runSummary, setRunSummary] = useState<RunSummary | null>(null);

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
      setGoldenError(String(err));
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
      setGoldenError('골든 케이스를 삭제하지 못했습니다.');
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

  /**
   * 전체 실행은 서버의 golden/run을 부른다.
   * `npm run test:judge`도 같은 엔드포인트를 쓰므로 CLI와 결과가 일치한다.
   */
  async function runAllGolden() {
    setRunningAll(true);
    setRunSummary(null);
    try {
      const res = await fetch(`/api/admin/cases/${caseId}/golden/run`, { method: 'POST' });
      if (!res.ok) throw new Error();
      const summary: RunSummary = await res.json();
      setRunSummary(summary);
      const byId = new Map(summary.results.map((r) => [r.id, r]));
      setGoldenTests((prev) =>
        prev.map((t) => {
          const r = byId.get(t.id);
          if (!r) return t;
          return { ...t, running: false, actual: r.actual as Verdict, comment: r.comment, passed: r.pass };
        })
      );
    } catch {
      setRunSummary(null);
    } finally {
      setRunningAll(false);
    }
  }

  async function changeExpected(testId: string, expected: Verdict) {
    setGoldenTests((prev) =>
      prev.map((t) => (t.id === testId ? { ...t, expected_verdict: expected, passed: undefined, actual: undefined } : t))
    );
    await fetch(`/api/admin/cases/${caseId}/golden`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testId, expected_verdict: expected }),
    });
  }

  const passCount = goldenTests.filter((t) => t.passed === true).length;
  const failCount = goldenTests.filter((t) => t.passed === false).length;

  return (
    <div style={{ padding: '32px', color: 'var(--fg)', fontFamily: 'monospace' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent)', margin: 0 }}>
          Test: {caseId}
        </h1>
        <p style={{ color: 'var(--dim)', fontSize: '13px', marginTop: '4px' }}>
          AI 판정기 및 최종 심판 테스트
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        {/* Judge tester */}
        <Panel title="JUDGE TESTER">
          <div style={{ marginBottom: '12px' }}>
            <div style={{ color: 'var(--dim)', fontSize: '11px', marginBottom: '6px' }}>QUESTION</div>
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
              background: judgeLoading ? 'var(--accent-deep)' : 'var(--accent)',
              color: judgeLoading ? 'var(--accent-mid)' : 'var(--bg)',
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
            <div style={{ color: 'var(--danger-fg)', fontSize: '12px', marginBottom: '10px' }}>{judgeError}</div>
          )}

          {judgeResult && (
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', padding: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <VerdictBadge verdict={judgeResult.verdict} />
              </div>
              <div style={{ color: 'var(--muted)', fontSize: '12px', lineHeight: '1.6', marginBottom: '10px' }}>
                {judgeResult.comment}
              </div>
              {judgeResult.revealedFacts?.length > 0 && (
                <div>
                  <div style={{ color: 'var(--dim)', fontSize: '11px', marginBottom: '5px' }}>REVEALED FACTS</div>
                  {judgeResult.revealedFacts.map((f, i) => (
                    <div key={i} style={{ color: 'var(--success)', fontSize: '12px', marginBottom: '3px' }}>• {f}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Panel>

        {/* Verdict tester */}
        <Panel title="VERDICT TESTER">
          <div style={{ marginBottom: '12px' }}>
            <div style={{ color: 'var(--dim)', fontSize: '11px', marginBottom: '6px' }}>FINAL ANSWER</div>
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
              background: verdictLoading ? 'var(--info-surface)' : 'rgba(99,102,241,0.2)',
              color: verdictLoading ? 'var(--info-border)' : 'var(--info)',
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
            <div style={{ color: 'var(--danger-fg)', fontSize: '12px', marginBottom: '10px' }}>{verdictError}</div>
          )}

          {verdictResult && (
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', padding: '14px' }}>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '10px' }}>
                <span style={{ color: verdictResult.solved ? 'var(--success)' : 'var(--danger-fg)', fontWeight: 700, fontSize: '13px' }}>
                  {verdictResult.solved ? 'SOLVED' : 'NOT SOLVED'}
                </span>
                <span style={{ color: 'var(--muted)', fontSize: '12px' }}>
                  Accuracy: {Math.round(verdictResult.accuracy * 100)}%
                </span>
              </div>
              <div style={{ color: 'var(--muted)', fontSize: '12px', lineHeight: '1.6', marginBottom: '10px' }}>
                {verdictResult.feedback}
              </div>
              {verdictResult.results?.length > 0 && (
                <div>
                  <div style={{ color: 'var(--dim)', fontSize: '11px', marginBottom: '6px' }}>FACT RESULTS</div>
                  {verdictResult.results.map((r) => (
                    <div key={r.id} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '5px' }}>
                      <span style={{ color: r.status === 'hit' ? 'var(--success)' : r.status === 'partial' ? 'var(--warning)' : 'var(--danger-fg)', fontSize: '11px', fontWeight: 700, minWidth: '48px', marginTop: '1px' }}>
                        {r.status.toUpperCase()}
                      </span>
                      <span style={{ color: 'var(--muted)', fontSize: '12px', flex: 1 }}>{r.id}</span>
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
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '14px',
            marginBottom: '16px',
          }}
        >
          <div style={{ color: 'var(--dim)', fontSize: '11px', fontWeight: 600, marginBottom: '10px' }}>NEW GOLDEN TEST</div>
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
                background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
                color: 'var(--accent)',
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

        {goldenError && (
          <div
            style={{
              background: 'var(--danger-surface)', border: '1px solid var(--no)',
              color: 'var(--danger-fg)', borderRadius: '5px',
              padding: '8px 12px', fontSize: '12px', marginBottom: '12px',
            }}
          >
            {goldenError}
          </div>
        )}

        {/* Run all */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', fontSize: '13px', color: 'var(--muted)' }}>
            <span>총 {goldenTests.length}개</span>
            {(passCount > 0 || failCount > 0) && (
              <>
                <span style={{ color: 'var(--success)' }}>{passCount} Pass</span>
                <span style={{ color: 'var(--danger-fg)' }}>{failCount} Fail</span>
              </>
            )}
            {runSummary && (
              <span
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  padding: '3px 10px', borderRadius: '999px', fontWeight: 700, fontSize: '12px',
                  background: runSummary.ok
                    ? 'color-mix(in srgb, var(--success) 14%, transparent)'
                    : 'color-mix(in srgb, var(--danger) 16%, transparent)',
                  border: `1px solid ${runSummary.ok ? 'color-mix(in srgb, var(--success) 35%, transparent)' : 'color-mix(in srgb, var(--danger) 40%, transparent)'}`,
                  color: runSummary.ok ? 'var(--success)' : 'var(--danger-fg)',
                }}
                title={`기준 ${runSummary.threshold}% 이상`}
              >
                {runSummary.ok ? <CheckCircle size={12} /> : <AlertTriangle size={12} />}
                통과율 {runSummary.rate}%
                {!runSummary.ok && ` · 기준 ${runSummary.threshold}% 미달`}
              </span>
            )}
          </div>
          <button
            onClick={runAllGolden}
            disabled={runningAll || goldenTests.length === 0}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              background: runningAll ? 'var(--surface-3)' : 'rgba(99,102,241,0.1)',
              border: '1px solid rgba(99,102,241,0.25)',
              color: runningAll ? 'var(--dim)' : 'var(--info)',
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
          <div style={{ color: 'var(--dim)', textAlign: 'center', padding: '20px', fontSize: '13px' }}>불러오는 중...</div>
        ) : goldenTests.length === 0 ? (
          <div style={{ color: 'var(--dim)', textAlign: 'center', padding: '20px', fontSize: '13px' }}>
            Golden Test가 없습니다. 위에서 추가하세요.
          </div>
        ) : (
          <div>
            {goldenTests.map((test) => (
              <div
                key={test.id}
                style={{
                  background: 'var(--bg)',
                  border: `1px solid ${test.passed === true ? 'rgba(34,197,94,0.2)' : test.passed === false ? 'rgba(220,38,38,0.2)' : 'var(--border)'}`,
                  borderRadius: '6px',
                  padding: '12px 14px',
                  marginBottom: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: 'var(--fg)', fontSize: '13px', marginBottom: '6px', lineHeight: '1.5' }}>
                      {test.question}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <span style={{ color: 'var(--dim)', fontSize: '11px' }}>Expected:</span>
                      <select
                        value={test.expected_verdict}
                        onChange={(e) => changeExpected(test.id, e.target.value as Verdict)}
                        aria-label="기대 판정"
                        style={{
                          background: 'var(--surface)', border: '1px solid var(--border)',
                          color: VERDICT_COLORS[test.expected_verdict] ?? 'var(--fg)',
                          borderRadius: '4px', padding: '2px 6px', fontSize: '11px',
                          fontFamily: 'monospace', cursor: 'pointer',
                        }}
                      >
                        {(['YES', 'NO', 'MAYBE', 'IRRELEVANT', 'INVALID'] as Verdict[]).map((v) => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                      {test.actual && (
                        <>
                          <span style={{ color: 'var(--dim)', fontSize: '11px' }}>Actual:</span>
                          <VerdictBadge verdict={test.actual} />
                          {test.passed === true ? (
                            <CheckCircle size={14} color="var(--success)" />
                          ) : (
                            <XCircle size={14} color="var(--danger-fg)" />
                          )}
                        </>
                      )}
                      {test.running && <Loader2 size={13} color="var(--accent)" />}
                    </div>
                    {test.comment && (
                      <div style={{ color: 'var(--dim)', fontSize: '11px', marginTop: '5px', fontStyle: 'italic' }}>
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
                        color: 'var(--info)',
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
                        color: 'var(--danger-fg)',
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
