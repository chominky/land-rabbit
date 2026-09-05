'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Sun,
  Moon,
  Volume2,
  Smartphone,
  Trash2,
  GraduationCap,
  Check,
} from 'lucide-react';
import {
  AppSettings,
  DEFAULT_SETTINGS,
  ONBOARDED_KEY,
  SAVES_KEY,
  Theme,
  applyTheme,
  loadSettings,
  saveSettings,
} from '@/lib/settings';


function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
      style={{ background: on ? 'var(--accent)' : 'var(--border)' }}
    >
      <span
        className="inline-block h-4 w-4 transform rounded-full bg-on-solid transition-transform"
        style={{ transform: on ? 'translateX(22px)' : 'translateX(4px)' }}
      />
    </button>
  );
}

function Row({
  icon,
  title,
  desc,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 p-4 border-b border-border last:border-b-0">
      <div className="text-accent shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-fg">{title}</div>
        <div className="text-xs text-muted mt-0.5">{desc}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [mounted, setMounted] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setSettings(loadSettings());
    setMounted(true);
  }, []);

  // React가 개발 모드 재마운트 때 <html>의 data-theme을 지우므로 다시 적용한다.
  // (프로덕션에서는 인라인 스크립트가 이미 맞춰둔 값이라 no-op)
  useLayoutEffect(() => {
    applyTheme(loadSettings().theme);
  }, []);

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2000);
  }

  function update(patch: Partial<AppSettings>) {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      applyTheme(next.theme);
      // TODO(P4-C): sound/haptic 설정을 사운드·햅틱 재생 유틸에서 참조.
      return next;
    });
  }

  function resetSaves() {
    localStorage.removeItem(SAVES_KEY);
    setShowResetConfirm(false);
    flash('저장 데이터를 초기화했습니다.');
  }

  function replayTutorial() {
    localStorage.removeItem(ONBOARDED_KEY);
    flash('튜토리얼이 다시 표시됩니다.');
  }

  if (!mounted) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center text-muted text-sm">
        불러오는 중…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-20 bg-bg/90 backdrop-blur border-b border-border">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="flex items-center gap-1.5 text-muted hover:text-fg transition-colors text-sm"
            aria-label="홈으로 돌아가기"
          >
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">홈</span>
          </button>
          <div className="h-4 w-px bg-border" />
          <h1 className="text-sm font-semibold tracking-widest text-accent uppercase">
            설정
          </h1>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 sm:px-6 py-8 space-y-6">
        {/* Display */}
        <section>
          <h2 className="text-xs font-semibold tracking-wider uppercase text-muted mb-2 px-1">
            화면
          </h2>
          <div className="rounded-lg border border-border bg-surface-2 overflow-hidden">
            <Row
              icon={settings.theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
              title="테마"
              desc={settings.theme === 'dark' ? '다크 모드' : '라이트 모드'}
            >
              <div className="flex gap-1">
                {(['dark', 'light'] as Theme[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => update({ theme: t })}
                    className="px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5"
                    style={{
                      background: settings.theme === t ? 'var(--accent)' : 'var(--surface)',
                      color: settings.theme === t ? 'var(--bg)' : 'var(--muted)',
                      border: `1px solid ${settings.theme === t ? 'var(--accent)' : 'var(--border)'}`,
                    }}
                    aria-pressed={settings.theme === t}
                  >
                    {t === 'dark' ? <Moon size={12} /> : <Sun size={12} />}
                    {t === 'dark' ? '다크' : '라이트'}
                  </button>
                ))}
              </div>
            </Row>
          </div>
          <p className="text-[11px] text-dim mt-1.5 px-1">
            선택한 테마는 즉시 적용되고 다음 방문에도 유지됩니다.
          </p>
        </section>

        {/* Feedback */}
        <section>
          <h2 className="text-xs font-semibold tracking-wider uppercase text-muted mb-2 px-1">
            피드백
          </h2>
          <div className="rounded-lg border border-border bg-surface-2 overflow-hidden">
            <Row icon={<Volume2 size={18} />} title="효과음" desc="판정·클리어 등 사운드 재생">
              <Toggle on={settings.sound} onChange={(v) => update({ sound: v })} label="효과음" />
            </Row>
            <Row icon={<Smartphone size={18} />} title="진동" desc="모바일에서 햅틱 피드백">
              <Toggle on={settings.haptic} onChange={(v) => update({ haptic: v })} label="진동" />
            </Row>
          </div>
        </section>

        {/* Data */}
        <section>
          <h2 className="text-xs font-semibold tracking-wider uppercase text-muted mb-2 px-1">
            데이터
          </h2>
          <div className="rounded-lg border border-border bg-surface-2 overflow-hidden">
            <Row icon={<GraduationCap size={18} />} title="튜토리얼 다시 보기" desc="다음 플레이 때 규칙 안내를 다시 표시">
              <button
                type="button"
                onClick={replayTutorial}
                className="px-3 py-1.5 rounded text-xs font-medium border border-border text-muted hover:border-accent/50 hover:text-accent transition-colors"
              >
                다시 보기
              </button>
            </Row>
            <Row icon={<Trash2 size={18} />} title="저장 데이터 초기화" desc="모든 단일 플레이 진행·기록을 삭제">
              <button
                type="button"
                onClick={() => setShowResetConfirm(true)}
                className="px-3 py-1.5 rounded text-xs font-medium border border-danger/40 text-danger hover:bg-danger/10 transition-colors"
              >
                초기화
              </button>
            </Row>
          </div>
        </section>
      </main>

      {/* Reset confirm modal */}
      {showResetConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'var(--scrim)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowResetConfirm(false);
          }}
        >
          <div className="w-full max-w-xs rounded-lg p-6 flex flex-col gap-4 border border-border bg-surface">
            <div>
              <h3 className="text-base font-semibold text-fg mb-1">저장 데이터 초기화</h3>
              <p className="text-xs text-muted leading-relaxed">
                모든 단일 플레이 진행 상황과 기록이 영구적으로 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-2 rounded text-sm border border-border text-muted hover:text-fg transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={resetSaves}
                className="flex-1 py-2 rounded text-sm font-semibold"
                style={{ background: 'var(--danger)', color: 'var(--on-solid)' }}
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg border border-accent/30 bg-surface text-sm text-fg shadow-lg">
          <Check size={14} className="text-accent" />
          {toast}
        </div>
      )}
    </div>
  );
}
