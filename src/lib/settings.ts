/**
 * 사용자 설정 (localStorage `yesno_settings`).
 *
 * 테마 적용의 단일 소스. 초기 테마는 `src/app/layout.tsx`의 인라인 스크립트가
 * 첫 페인트 전에 <html data-theme>로 지정하고(FOUC 방지), 이후 변경은
 * `applyTheme()`가 같은 속성을 갱신한다.
 */

export const SETTINGS_KEY = 'yesno_settings';
export const SAVES_KEY = 'yesno_saves';
export const ONBOARDED_KEY = 'yesno_onboarded';

export type Theme = 'dark' | 'light';

export type AppSettings = {
  theme: Theme;
  sound: boolean;
  haptic: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  sound: true,
  haptic: true,
};

export function loadSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<AppSettings>;
    return {
      theme: raw.theme === 'light' || raw.theme === 'dark' ? raw.theme : resolveSystemTheme(),
      sound: typeof raw.sound === 'boolean' ? raw.sound : DEFAULT_SETTINGS.sound,
      haptic: typeof raw.haptic === 'boolean' ? raw.haptic : DEFAULT_SETTINGS.haptic,
    };
  } catch {
    return { ...DEFAULT_SETTINGS, theme: resolveSystemTheme() };
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // 프라이빗 모드 등 저장 불가 — 이번 세션에만 적용된다.
  }
}

/** 저장된 선택이 없을 때 OS 설정을 따른다. */
export function resolveSystemTheme(): Theme {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS.theme;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
}

/**
 * <head>에서 동기 실행되는 초기화 스크립트.
 * 저장값 → 없으면 prefers-color-scheme → 실패 시 dark.
 * 위 로직과 같은 규칙을 쓰되, 번들을 기다리지 않도록 손으로 인라인해 둔다.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=(JSON.parse(localStorage.getItem(${JSON.stringify(
  SETTINGS_KEY
)})||"{}")||{}).theme;if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}document.documentElement.setAttribute("data-theme",t)}catch(e){document.documentElement.setAttribute("data-theme","dark")}})()`;
