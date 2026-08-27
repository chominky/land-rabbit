'use client';

import { useState, useEffect } from 'react';
import { Flag, CheckCircle, XCircle, Plus, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

type FlagItem = {
  id: string;
  case_id: string;
  question_text: string | null;
  answer_text: string | null;
  verdict_or_status: string;
  evidence: string | null;
  ai_response: Record<string, unknown> | null;
  type: 'judge' | 'verdict';
  resolved: boolean;
  created_at: string;
};

export default function FlagsPage() {
  const [flags, setFlags] = useState<FlagItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/flags')
      .then((r) => r.json())
      .then((data) => setFlags(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm" style={{ color: '#8b8d93' }}>로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin" className="p-1 rounded hover:bg-[#2a2e38]">
          <ArrowLeft size={18} style={{ color: '#8b8d93' }} />
        </Link>
        <Flag size={20} style={{ color: '#c8a24e' }} />
        <h1 className="text-xl font-bold" style={{ color: '#c8a24e' }}>
          신고 조회
        </h1>
        <span className="text-sm" style={{ color: '#8b8d93' }}>
          ({flags.length}건)
        </span>
      </div>

      {flags.length === 0 ? (
        <div className="text-center py-12" style={{ color: '#5a5c63' }}>
          <Flag size={32} className="mx-auto mb-2 opacity-30" />
          <p>신고된 판정이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-3">
          {flags.map((flag) => (
            <div
              key={flag.id}
              className="rounded-lg border p-4"
              style={{ borderColor: '#2a2e38', background: '#181c25' }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="text-[10px] px-2 py-0.5 rounded font-bold"
                      style={{
                        background: flag.type === 'judge' ? '#3a7d4433' : '#8b7a3a33',
                        color: flag.type === 'judge' ? '#3a7d44' : '#8b7a3a',
                      }}
                    >
                      {flag.type === 'judge' ? '질문 판정' : '최종 채점'}
                    </span>
                    <span className="text-xs" style={{ color: '#5a5c63' }}>
                      {flag.case_id}
                    </span>
                    <span className="text-xs" style={{ color: '#5a5c63' }}>
                      {new Date(flag.created_at).toLocaleString('ko-KR')}
                    </span>
                  </div>

                  {flag.question_text && (
                    <div className="mb-1">
                      <span className="text-xs" style={{ color: '#8b8d93' }}>질문: </span>
                      <span className="text-sm" style={{ color: '#e8e6e3' }}>
                        {flag.question_text}
                      </span>
                    </div>
                  )}

                  {flag.answer_text && (
                    <div className="mb-1">
                      <span className="text-xs" style={{ color: '#8b8d93' }}>추리: </span>
                      <span className="text-sm" style={{ color: '#e8e6e3' }}>
                        {flag.answer_text}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: '#8b8d93' }}>판정:</span>
                    <span
                      className="stamp text-white"
                      style={{
                        background:
                          flag.verdict_or_status === 'YES' ? '#3a7d44' :
                          flag.verdict_or_status === 'NO' ? '#8b3a3a' :
                          flag.verdict_or_status === 'MAYBE' ? '#8b7a3a' :
                          flag.verdict_or_status === 'partial' ? '#8b7a3a' :
                          '#4a4c53',
                      }}
                    >
                      {flag.verdict_or_status}
                    </span>
                  </div>

                  {flag.evidence && (
                    <div className="mt-1 text-xs" style={{ color: '#8b8d93' }}>
                      근거: &quot;{flag.evidence}&quot;
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <button
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] border"
                    style={{ borderColor: '#3a7d4444', color: '#3a7d44' }}
                    title="이 표현을 인정 기준에 추가"
                  >
                    <Plus size={10} />
                    <CheckCircle size={10} />
                    accept
                  </button>
                  <button
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] border"
                    style={{ borderColor: '#8b3a3a44', color: '#8b3a3a' }}
                    title="이 표현을 불인정 기준에 추가"
                  >
                    <Plus size={10} />
                    <XCircle size={10} />
                    reject
                  </button>
                  <button
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] border"
                    style={{ borderColor: '#c8a24e44', color: '#c8a24e' }}
                    title="골든셋에 추가"
                  >
                    <Plus size={10} />
                    golden
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
