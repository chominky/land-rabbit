import { loadSettings } from './settings';

/**
 * 효과음 · 햅틱 (P4-C).
 *
 * 음원 파일을 두지 않고 WebAudio로 직접 합성한다. 이유:
 *  - 판정 도장·오답 같은 100~600ms짜리 소리에 바이너리 에셋과 라이선스를 끌어올 필요가 없다.
 *  - 네트워크 왕복이 없어 판정이 뜨는 순간과 소리가 어긋나지 않는다.
 *
 * 자동재생 정책: AudioContext는 **첫 재생 요청(=사용자 조작에서 시작된 호출)** 때
 * 만들고, suspended면 resume한다. 실패해도 조용히 넘어간다 — 소리 때문에
 * 콘솔이 더러워지거나 게임이 멈추면 안 된다.
 */

export type SfxName =
  | 'verdict-yes'
  | 'verdict-no'
  | 'verdict-neutral'
  | 'unlock'
  | 'clear'
  | 'fail'
  | 'token-low';

type Tone = {
  /** 주파수(Hz). 배열이면 순서대로 이어 붙인 아르페지오. */
  freq: number | number[];
  /** 한 음의 길이(초). */
  duration: number;
  type: OscillatorType;
  gain: number;
  /** 시작 주파수에서 끝 주파수로 미끄러뜨릴 때의 목표(Hz). */
  slideTo?: number;
};

const TONES: Record<SfxName, Tone> = {
  // 판정 도장 — 짧고 단단하게. YES는 위로, NO는 아래로.
  'verdict-yes': { freq: 660, slideTo: 880, duration: 0.12, type: 'triangle', gain: 0.16 },
  'verdict-no': { freq: 320, slideTo: 220, duration: 0.16, type: 'triangle', gain: 0.16 },
  'verdict-neutral': { freq: 440, duration: 0.09, type: 'sine', gain: 0.12 },
  unlock: { freq: [740, 988], duration: 0.1, type: 'sine', gain: 0.14 },
  clear: { freq: [523, 659, 784, 1047], duration: 0.14, type: 'triangle', gain: 0.18 },
  fail: { freq: 196, slideTo: 130, duration: 0.4, type: 'sawtooth', gain: 0.12 },
  'token-low': { freq: [880, 660], duration: 0.08, type: 'square', gain: 0.08 },
};

/** 진동 패턴(ms). 없는 이벤트는 진동하지 않는다. */
const VIBRATION: Partial<Record<SfxName, number | number[]>> = {
  'verdict-yes': 12,
  'verdict-no': [12, 40, 12],
  unlock: 15,
  clear: [30, 60, 30, 60, 90],
  fail: 120,
  'token-low': [8, 30, 8],
};

/** 같은 소리가 겹쳐 터지는 걸 막는다. */
const DEBOUNCE_MS = 60;
const lastPlayedAt = new Map<SfxName, number>();

let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx) return ctx;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * 사용자 조작 시점에 오디오를 깨워둔다. 재생 경로에서도 호출하므로
 * 별도로 부르지 않아도 동작하지만, 첫 소리의 지연을 줄이려면
 * 게임 시작 같은 확실한 제스처에서 한 번 불러주면 좋다.
 */
export function primeAudio(): void {
  const context = audioContext();
  if (context && context.state === 'suspended') {
    void context.resume().catch(() => {});
  }
}

function playTone(context: AudioContext, tone: Tone, startAt: number, freq: number): void {
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = tone.type;
  osc.frequency.setValueAtTime(freq, startAt);
  if (tone.slideTo) {
    osc.frequency.exponentialRampToValueAtTime(tone.slideTo, startAt + tone.duration);
  }
  // 딸깍 소리를 막는 짧은 어택 + 지수 감쇠.
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(tone.gain, startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + tone.duration);
  osc.connect(gain).connect(context.destination);
  osc.start(startAt);
  osc.stop(startAt + tone.duration + 0.02);
}

/** 설정에서 켜져 있을 때만 소리를 낸다. */
export function playSfx(name: SfxName): void {
  if (typeof window === 'undefined') return;
  if (!loadSettings().sound) return;

  const now = Date.now();
  const last = lastPlayedAt.get(name) ?? 0;
  if (now - last < DEBOUNCE_MS) return;
  lastPlayedAt.set(name, now);

  const context = audioContext();
  if (!context) return;
  if (context.state === 'suspended') void context.resume().catch(() => {});

  try {
    const tone = TONES[name];
    const freqs = Array.isArray(tone.freq) ? tone.freq : [tone.freq];
    freqs.forEach((f, i) => {
      playTone(context, tone, context.currentTime + i * tone.duration * 0.8, f);
    });
  } catch {
    // 오디오가 막힌 환경 — 게임은 그대로 진행한다.
  }
}

/** 설정에서 켜져 있고 지원하는 기기일 때만 진동한다. */
export function vibrate(pattern: number | number[]): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  if (!loadSettings().haptic) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // 지원하지 않는 브라우저 — 무시한다.
  }
}

/** 소리와 진동을 한 번에. 게임 코드는 보통 이것만 부른다. */
export function feedback(name: SfxName): void {
  playSfx(name);
  const pattern = VIBRATION[name];
  if (pattern !== undefined) vibrate(pattern);
}

/** 판정 결과를 소리 하나로 매핑한다. */
export function verdictSfx(verdict: string): SfxName {
  if (verdict === 'YES') return 'verdict-yes';
  if (verdict === 'NO') return 'verdict-no';
  return 'verdict-neutral';
}
