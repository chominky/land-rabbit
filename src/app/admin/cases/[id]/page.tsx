'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Plus, Trash2, GripVertical, AlertTriangle, Download, Upload, ChevronUp, ChevronDown, Save } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type KeyFact = {
  id: string;
  label: string;
  detail: string;
  mustConvey: string;
  acceptExamples: string[];
  rejectExamples: string[];
  required: boolean;
};

type CaseForm = {
  id: string;
  title: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  brief: string;
  truth: string;
  keyFacts: KeyFact[];
  hints: [string, string, string];
  redHerrings: string;
  images: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BRIEF_MAX = 500;

function newKeyFact(): KeyFact {
  return {
    id: crypto.randomUUID(),
    label: '',
    detail: '',
    mustConvey: '',
    acceptExamples: [''],
    rejectExamples: [''],
    required: false,
  };
}

function validatePublish(form: CaseForm): string[] {
  const errors: string[] = [];
  const imageList = form.images.split('\n').map((s) => s.trim()).filter(Boolean);
  if (imageList.length < 2 || imageList.length > 4) errors.push('이미지는 2~4개여야 합니다.');
  if (form.keyFacts.length < 3) errors.push('keyFacts가 3개 이상이어야 합니다.');
  const required = form.keyFacts.filter((kf) => kf.required);
  if (required.length < 1) errors.push('required keyFact가 최소 1개 필요합니다.');
  for (const kf of required) {
    if (!kf.mustConvey.trim()) errors.push(`"${kf.label || kf.id}" — mustConvey 필드를 채워주세요.`);
    const accepts = kf.acceptExamples.filter(Boolean);
    if (accepts.length < 3) errors.push(`"${kf.label || kf.id}" — acceptExamples 3개 이상 필요합니다.`);
  }
  const hints = form.hints.filter((h) => h.trim());
  if (hints.length < 3) errors.push('힌트 3개를 모두 입력해야 합니다.');
  return errors;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        color: 'var(--dim)',
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        marginBottom: '8px',
      }}
    >
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '18px' }}>
      <SectionLabel>{label}</SectionLabel>
      {children}
    </div>
  );
}

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
  minHeight: '72px',
};

// ─── KeyFact Row ──────────────────────────────────────────────────────────────

function KeyFactRow({
  kf,
  index,
  total,
  onChange,
  onRemove,
  onMove,
}: {
  kf: KeyFact;
  index: number;
  total: number;
  onChange: (updated: KeyFact) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  function set<K extends keyof KeyFact>(key: K, value: KeyFact[K]) {
    onChange({ ...kf, [key]: value });
  }

  function setAccept(i: number, val: string) {
    const next = [...kf.acceptExamples];
    next[i] = val;
    set('acceptExamples', next);
  }

  function addAccept() {
    set('acceptExamples', [...kf.acceptExamples, '']);
  }

  function removeAccept(i: number) {
    set('acceptExamples', kf.acceptExamples.filter((_, idx) => idx !== i));
  }

  function setReject(i: number, val: string) {
    const next = [...kf.rejectExamples];
    next[i] = val;
    set('rejectExamples', next);
  }

  function addReject() {
    set('rejectExamples', [...kf.rejectExamples, '']);
  }

  function removeReject(i: number) {
    set('rejectExamples', kf.rejectExamples.filter((_, idx) => idx !== i));
  }

  return (
    <div
      style={{
        background: 'var(--bg-deep)',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        padding: '16px',
        marginBottom: '12px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <GripVertical size={14} color="var(--border-strong)" style={{ cursor: 'grab' }} />
        <span
          style={{
            background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
            color: 'var(--accent)',
            fontSize: '11px',
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: '3px',
          }}
        >
          #{index + 1}
        </span>
        <div style={{ flex: 1 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', color: 'var(--muted)', fontSize: '12px' }}>
          <input
            type="checkbox"
            checked={kf.required}
            onChange={(e) => set('required', e.target.checked)}
            style={{ accentColor: 'var(--accent)' }}
          />
          Required
        </label>
        <button
          onClick={() => onMove(-1)}
          disabled={index === 0}
          style={{ background: 'none', border: 'none', cursor: index === 0 ? 'not-allowed' : 'pointer', color: 'var(--dim)', padding: '2px' }}
        >
          <ChevronUp size={14} />
        </button>
        <button
          onClick={() => onMove(1)}
          disabled={index === total - 1}
          style={{ background: 'none', border: 'none', cursor: index === total - 1 ? 'not-allowed' : 'pointer', color: 'var(--dim)', padding: '2px' }}
        >
          <ChevronDown size={14} />
        </button>
        <button
          onClick={onRemove}
          style={{ background: 'rgba(220,38,38,0.08)', border: 'none', cursor: 'pointer', color: 'var(--danger-fg)', padding: '4px 6px', borderRadius: '4px' }}
        >
          <Trash2 size={12} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
        <div>
          <SectionLabel>Label</SectionLabel>
          <input style={inputStyle} value={kf.label} onChange={(e) => set('label', e.target.value)} placeholder="사실 레이블" />
        </div>
        <div>
          <SectionLabel>Detail</SectionLabel>
          <input style={inputStyle} value={kf.detail} onChange={(e) => set('detail', e.target.value)} placeholder="내부 세부사항" />
        </div>
      </div>

      <div style={{ marginBottom: '10px' }}>
        <SectionLabel>mustConvey</SectionLabel>
        <textarea style={textareaStyle} value={kf.mustConvey} onChange={(e) => set('mustConvey', e.target.value)} placeholder="판정 시 반드시 언급해야 하는 핵심 내용" />
      </div>

      {/* acceptExamples */}
      <div style={{ marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <SectionLabel>acceptExamples</SectionLabel>
          <button
            onClick={addAccept}
            style={{ background: 'rgba(34,197,94,0.08)', border: 'none', cursor: 'pointer', color: 'var(--success)', padding: '3px 7px', borderRadius: '3px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '3px' }}
          >
            <Plus size={11} /> Add
          </button>
        </div>
        {kf.acceptExamples.map((ex, i) => (
          <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '5px' }}>
            <input style={{ ...inputStyle, flex: 1 }} value={ex} onChange={(e) => setAccept(i, e.target.value)} placeholder={`Accept example ${i + 1}`} />
            <button
              onClick={() => removeAccept(i)}
              style={{ background: 'rgba(220,38,38,0.08)', border: 'none', cursor: 'pointer', color: 'var(--danger-fg)', padding: '4px 6px', borderRadius: '4px' }}
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}
      </div>

      {/* rejectExamples */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <SectionLabel>rejectExamples</SectionLabel>
          <button
            onClick={addReject}
            style={{ background: 'rgba(220,38,38,0.08)', border: 'none', cursor: 'pointer', color: 'var(--danger-fg)', padding: '3px 7px', borderRadius: '3px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '3px' }}
          >
            <Plus size={11} /> Add
          </button>
        </div>
        {kf.rejectExamples.map((ex, i) => (
          <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '5px' }}>
            <input style={{ ...inputStyle, flex: 1 }} value={ex} onChange={(e) => setReject(i, e.target.value)} placeholder={`Reject example ${i + 1}`} />
            <button
              onClick={() => removeReject(i)}
              style={{ background: 'rgba(220,38,38,0.08)', border: 'none', cursor: 'pointer', color: 'var(--danger-fg)', padding: '4px 6px', borderRadius: '4px' }}
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Preview Panel ─────────────────────────────────────────────────────────────

function PreviewPanel({ form }: { form: CaseForm }) {
  const stars = '★'.repeat(form.difficulty) + '☆'.repeat(5 - form.difficulty);
  return (
    <div
      style={{
        background: 'var(--bg-deep)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '24px',
        position: 'sticky',
        top: '24px',
      }}
    >
      <div style={{ color: 'var(--accent)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', marginBottom: '16px' }}>
        PLAYER PREVIEW
      </div>

      <div style={{ color: 'var(--accent)', fontSize: '16px', fontWeight: 700, marginBottom: '6px' }}>
        {form.title || '제목 없음'}
      </div>
      <div style={{ color: 'var(--muted)', fontSize: '13px', marginBottom: '12px' }}>
        {stars} &nbsp; Difficulty {form.difficulty}
      </div>

      <div style={{ color: 'var(--muted)', fontSize: '13px', lineHeight: '1.6', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
        {form.brief || '브리핑 없음'}
      </div>

      {form.keyFacts.length > 0 && (
        <div>
          <div style={{ color: 'var(--dim)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em', marginBottom: '8px' }}>
            KEY FACTS ({form.keyFacts.length})
          </div>
          {form.keyFacts.map((kf, i) => (
            <div
              key={kf.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 0',
                borderBottom: i < form.keyFacts.length - 1 ? '1px solid var(--surface-3)' : 'none',
              }}
            >
              <span style={{ color: 'var(--border)', fontSize: '12px' }}>○</span>
              <span style={{ color: 'var(--muted)', fontSize: '12px', flex: 1 }}>{kf.label || `Fact #${i + 1}`}</span>
              {kf.required && (
                <span style={{ color: 'var(--accent)', fontSize: '10px', fontWeight: 700 }}>REQ</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CaseEditorPage() {
  const params = useParams();
  const router = useRouter();
  const rawId = params.id as string;
  const isNew = rawId === 'new';

  const [form, setForm] = useState<CaseForm>({
    id: '',
    title: '',
    difficulty: 3,
    brief: '',
    truth: '',
    keyFacts: [],
    hints: ['', '', ''],
    redHerrings: '',
    images: '',
  });
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [publishErrors, setPublishErrors] = useState<string[]>([]);

  const importRef = useRef<HTMLInputElement>(null);

  // Load existing case
  useEffect(() => {
    if (isNew) return;
    fetch(`/api/admin/cases/${rawId}`)
      .then((r) => r.json())
      .then((data) => {
        setForm({
          id: data.id ?? '',
          title: data.title ?? '',
          difficulty: data.difficulty ?? 3,
          brief: data.brief ?? '',
          truth: data.truth ?? '',
          keyFacts: (data.keyFacts ?? data.key_facts ?? []).map((kf: KeyFact) => ({
            ...kf,
            acceptExamples: kf.acceptExamples?.length ? kf.acceptExamples : [''],
            rejectExamples: kf.rejectExamples?.length ? kf.rejectExamples : [''],
          })),
          hints: [data.hints?.[0] ?? '', data.hints?.[1] ?? '', data.hints?.[2] ?? ''],
          redHerrings: (data.redHerrings ?? data.red_herrings ?? []).join('\n'),
          images: (data.images ?? []).join('\n'),
        });
      })
      .finally(() => setLoading(false));
  }, [isNew, rawId]);

  function set<K extends keyof CaseForm>(key: K, value: CaseForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setHint(i: 0 | 1 | 2, val: string) {
    const next: [string, string, string] = [...form.hints] as [string, string, string];
    next[i] = val;
    set('hints', next);
  }

  function addKeyFact() {
    set('keyFacts', [...form.keyFacts, newKeyFact()]);
  }

  function updateKeyFact(i: number, updated: KeyFact) {
    const next = [...form.keyFacts];
    next[i] = updated;
    set('keyFacts', next);
  }

  function removeKeyFact(i: number) {
    set('keyFacts', form.keyFacts.filter((_, idx) => idx !== i));
  }

  function moveKeyFact(i: number, dir: -1 | 1) {
    const next = [...form.keyFacts];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    set('keyFacts', next);
  }

  function buildPayload() {
    return {
      id: form.id,
      title: form.title,
      difficulty: form.difficulty,
      brief: form.brief,
      truth: form.truth,
      key_facts: form.keyFacts.map((kf) => ({
        ...kf,
        acceptExamples: kf.acceptExamples.filter(Boolean),
        rejectExamples: kf.rejectExamples.filter(Boolean),
      })),
      hints: form.hints,
      red_herrings: form.redHerrings.split('\n').map((s) => s.trim()).filter(Boolean),
      images: form.images.split('\n').map((s) => s.trim()).filter(Boolean),
    };
  }

  async function save() {
    setSaving(true);
    setSaveError('');
    try {
      const payload = buildPayload();
      let res: Response;
      if (isNew) {
        res = await fetch('/api/admin/cases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`/api/admin/cases/${rawId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '저장 실패');

      if (isNew) {
        router.push(`/admin/cases/${data.id}`);
      }
    } catch (err) {
      setSaveError(String(err));
    } finally {
      setSaving(false);
    }
  }

  function checkPublish() {
    const errors = validatePublish(form);
    setPublishErrors(errors);
    if (errors.length === 0) {
      alert('Publish 조건 충족! Status를 published로 변경하고 저장하세요.');
    }
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(buildPayload(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `case-${form.id || 'new'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJSON(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        setForm({
          id: data.id ?? '',
          title: data.title ?? '',
          difficulty: data.difficulty ?? 3,
          brief: data.brief ?? '',
          truth: data.truth ?? '',
          keyFacts: (data.keyFacts ?? data.key_facts ?? []).map((kf: KeyFact) => ({
            ...kf,
            acceptExamples: kf.acceptExamples?.length ? kf.acceptExamples : [''],
            rejectExamples: kf.rejectExamples?.length ? kf.rejectExamples : [''],
          })),
          hints: [data.hints?.[0] ?? '', data.hints?.[1] ?? '', data.hints?.[2] ?? ''],
          redHerrings: (data.redHerrings ?? data.red_herrings ?? []).join('\n'),
          images: (data.images ?? []).join('\n'),
        });
      } catch {
        alert('JSON 파싱 실패');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', color: 'var(--dim)', fontFamily: 'monospace' }}>
        불러오는 중...
      </div>
    );
  }

  return (
    <div style={{ padding: '32px', color: 'var(--fg)', fontFamily: 'monospace' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent)', margin: 0 }}>
            {isNew ? 'New Case' : `Edit: ${form.id}`}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input ref={importRef} type="file" accept=".json" onChange={importJSON} style={{ display: 'none' }} />
          <button
            onClick={() => importRef.current?.click()}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'var(--surface-3)', border: '1px solid var(--border)', color: 'var(--muted)', padding: '8px 12px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}
          >
            <Upload size={13} /> Import JSON
          </button>
          <button
            onClick={exportJSON}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'var(--surface-3)', border: '1px solid var(--border)', color: 'var(--muted)', padding: '8px 12px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}
          >
            <Download size={13} /> Export JSON
          </button>
          <button
            onClick={checkPublish}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: 'var(--success)', padding: '8px 12px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}
          >
            Check Publish
          </button>
          <button
            onClick={save}
            disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', background: saving ? 'var(--accent-deep)' : 'var(--accent)', color: saving ? 'var(--accent-mid)' : 'var(--bg)', border: 'none', padding: '8px 16px', borderRadius: '5px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 700 }}
          >
            <Save size={13} /> {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>

      {/* Errors */}
      {saveError && (
        <div style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: '6px', padding: '12px 16px', color: 'var(--danger-fg)', fontSize: '13px', marginBottom: '20px' }}>
          {saveError}
        </div>
      )}

      {publishErrors.length > 0 && (
        <div style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: '6px', padding: '12px 16px', marginBottom: '20px' }}>
          <div style={{ color: 'var(--warning)', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>Publish 조건 미충족:</div>
          {publishErrors.map((e) => (
            <div key={e} style={{ color: 'var(--warning)', fontSize: '12px', marginBottom: '3px' }}>• {e}</div>
          ))}
        </div>
      )}

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px', alignItems: 'start' }}>
        {/* LEFT: Form */}
        <div>
          {/* Basic */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '24px', marginBottom: '16px' }}>
            <div style={{ color: 'var(--accent)', fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '18px' }}>BASIC INFO</div>

            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '12px', marginBottom: '18px' }}>
              <Field label="ID (slug)">
                <input
                  style={{ ...inputStyle, opacity: isNew ? 1 : 0.6 }}
                  value={form.id}
                  onChange={(e) => set('id', e.target.value)}
                  readOnly={!isNew}
                  placeholder="my-case-slug"
                />
              </Field>
              <Field label="Title">
                <input style={inputStyle} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="사건 제목" />
              </Field>
            </div>

            <div style={{ marginBottom: '18px' }}>
              <Field label="Difficulty (1-5)">
                <select
                  style={{ ...inputStyle, width: '160px', cursor: 'pointer' }}
                  value={form.difficulty}
                  onChange={(e) => set('difficulty', Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>{n} — {'★'.repeat(n)}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label={`Brief (${form.brief.length}/${BRIEF_MAX})`}>
              <textarea
                style={{ ...textareaStyle, minHeight: '90px', borderColor: form.brief.length > BRIEF_MAX ? 'var(--danger-fg)' : 'var(--border)' }}
                value={form.brief}
                onChange={(e) => set('brief', e.target.value)}
                placeholder="플레이어에게 공개되는 사건 브리핑..."
              />
              {form.brief.length > BRIEF_MAX && (
                <div style={{ color: 'var(--danger-fg)', fontSize: '11px', marginTop: '4px' }}>글자 수 초과</div>
              )}
            </Field>
          </div>

          {/* Truth */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '24px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{ color: 'var(--accent)', fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em' }}>TRUTH</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: '4px', padding: '3px 8px' }}>
                <AlertTriangle size={11} color="var(--danger-fg)" />
                <span style={{ color: 'var(--danger-fg)', fontSize: '11px', fontWeight: 600 }}>이 내용은 플레이어에게 절대 노출되지 않습니다</span>
              </div>
            </div>
            <textarea
              style={{ ...textareaStyle, minHeight: '120px' }}
              value={form.truth}
              onChange={(e) => set('truth', e.target.value)}
              placeholder="사건의 실제 진실. AI 판정의 기준이 됩니다."
            />
          </div>

          {/* Key Facts */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '24px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ color: 'var(--accent)', fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em' }}>
                KEY FACTS ({form.keyFacts.length})
              </div>
              <button
                onClick={addKeyFact}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'color-mix(in srgb, var(--accent) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', color: 'var(--accent)', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
              >
                <Plus size={12} /> Add Fact
              </button>
            </div>

            {form.keyFacts.length === 0 && (
              <div style={{ color: 'var(--dim)', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
                키 팩트가 없습니다. Add Fact를 눌러 추가하세요.
              </div>
            )}

            {form.keyFacts.map((kf, i) => (
              <KeyFactRow
                key={kf.id}
                kf={kf}
                index={i}
                total={form.keyFacts.length}
                onChange={(updated) => updateKeyFact(i, updated)}
                onRemove={() => removeKeyFact(i)}
                onMove={(dir) => moveKeyFact(i, dir)}
              />
            ))}
          </div>

          {/* Hints */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '24px', marginBottom: '16px' }}>
            <div style={{ color: 'var(--accent)', fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '16px' }}>HINTS</div>
            {([0, 1, 2] as const).map((i) => (
              <Field key={i} label={`Hint ${i + 1}`}>
                <input
                  style={inputStyle}
                  value={form.hints[i]}
                  onChange={(e) => setHint(i, e.target.value)}
                  placeholder={`힌트 ${i + 1}`}
                />
              </Field>
            ))}
          </div>

          {/* Red Herrings + Images */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '24px' }}>
            <div style={{ color: 'var(--accent)', fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '16px' }}>RED HERRINGS & IMAGES</div>

            <Field label="Red Herrings (one per line)">
              <textarea
                style={{ ...textareaStyle, minHeight: '80px' }}
                value={form.redHerrings}
                onChange={(e) => set('redHerrings', e.target.value)}
                placeholder="단서처럼 보이지만 실제로는 무관한 요소들..."
              />
            </Field>

            <Field label="Image Paths (one per line, 2–4 required for publish)">
              <textarea
                style={{ ...textareaStyle, minHeight: '80px' }}
                value={form.images}
                onChange={(e) => set('images', e.target.value)}
                placeholder={`cases/my-case/image1.jpg\ncases/my-case/image2.jpg`}
              />
              <div style={{ color: 'var(--dim)', fontSize: '11px', marginTop: '4px' }}>
                현재 {form.images.split('\n').filter((s) => s.trim()).length}개
              </div>
            </Field>
          </div>
        </div>

        {/* RIGHT: Preview */}
        <PreviewPanel form={form} />
      </div>
    </div>
  );
}
