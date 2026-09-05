/**
 * 결과 공유 카드 (P2-D).
 *
 * <canvas>로 사건 제목·랭크·점수·남은 질문·핵심 요소 채점 요약을 그린 뒤
 * 이미지로 저장하거나 공유한다. 텍스트만 복사하던 기존 동작을 대체한다.
 *
 * 색은 CSS 토큰에서 읽어오므로 라이트/다크 테마를 따라간다.
 */

export type FactMark = { label: string; status: 'hit' | 'partial' | 'miss' };

export type ShareCardData = {
  caseTitle: string;
  solved: boolean;
  rank: string;
  score: number;
  tokensLeft: number;
  totalQuestions: number;
  facts: FactMark[];
  url: string;
};

const W = 1080;
const H = 1350;
const FONT = "'Segoe UI', 'Malgun Gothic', system-ui, sans-serif";

function token(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

const STATUS_LABEL: Record<FactMark['status'], string> = {
  hit: '적중',
  partial: '부분',
  miss: '놓침',
};

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 폭에 맞춰 줄바꿈하고, 그린 줄 수를 돌려준다. */
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 3
): number {
  const chars = [...text];
  let line = '';
  let lines = 0;
  for (const ch of chars) {
    const next = line + ch;
    if (ctx.measureText(next).width > maxWidth && line) {
      if (lines === maxLines - 1) {
        ctx.fillText(line.slice(0, -1) + '…', x, y + lines * lineHeight);
        return lines + 1;
      }
      ctx.fillText(line, x, y + lines * lineHeight);
      lines++;
      line = ch;
    } else {
      line = next;
    }
  }
  if (line) {
    ctx.fillText(line, x, y + lines * lineHeight);
    lines++;
  }
  return lines;
}

export function drawShareCard(data: ShareCardData): HTMLCanvasElement {
  const bg = token('--surface', '#12151c');
  const surface = token('--surface-2', '#181c25');
  const fg = token('--fg', '#e8e6e3');
  const muted = token('--muted', '#8b8d93');
  const dim = token('--dim', '#82858d');
  const accent = token('--accent', '#c8a24e');
  const border = token('--border', '#2a2e38');
  const rankColor = data.solved
    ? token(`--rank-${data.rank.toLowerCase()}`, accent)
    : token('--danger', '#c0392b');

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 상단 강조 띠
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, W, 8);

  ctx.textBaseline = 'top';

  // 브랜드
  ctx.fillStyle = accent;
  ctx.font = `600 30px ${FONT}`;
  ctx.fillText('육지토끼고기', 80, 80);
  ctx.fillStyle = dim;
  ctx.font = `26px ${FONT}`;
  ctx.fillText('AI가 판정하는 추리 게임', 80, 124);

  // 사건 제목
  ctx.fillStyle = fg;
  ctx.font = `700 56px ${FONT}`;
  const titleLines = wrap(ctx, data.caseTitle, 80, 210, W - 160, 70, 2);

  let y = 210 + titleLines * 70 + 40;

  // 랭크 블록
  ctx.fillStyle = surface;
  roundRect(ctx, 80, y, W - 160, 260, 24);
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = muted;
  ctx.font = `28px ${FONT}`;
  ctx.fillText(data.solved ? '사건 해결' : '미해결', W / 2, y + 38);

  ctx.fillStyle = rankColor;
  ctx.font = `700 130px ${FONT}`;
  ctx.fillText(data.solved ? `${data.rank} 랭크` : '실패', W / 2, y + 82);

  ctx.fillStyle = fg;
  ctx.font = `40px ${FONT}`;
  ctx.fillText(`${data.score}점`, W / 2, y + 218);
  ctx.textAlign = 'left';

  y += 260 + 36;

  // 기록 두 칸
  const halfW = (W - 160 - 24) / 2;
  const stats: [string, string][] = [
    ['남은 질문', `${data.tokensLeft}`],
    ['던진 질문', `${data.totalQuestions}`],
  ];
  stats.forEach(([label, value], i) => {
    const x = 80 + i * (halfW + 24);
    ctx.fillStyle = surface;
    roundRect(ctx, x, y, halfW, 130, 20);
    ctx.fill();
    ctx.strokeStyle = border;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = muted;
    ctx.font = `26px ${FONT}`;
    ctx.fillText(label, x + halfW / 2, y + 26);
    ctx.fillStyle = accent;
    ctx.font = `700 56px ${FONT}`;
    ctx.fillText(value, x + halfW / 2, y + 60);
    ctx.textAlign = 'left';
  });

  y += 130 + 40;

  // 핵심 요소 채점
  ctx.fillStyle = muted;
  ctx.font = `600 28px ${FONT}`;
  ctx.fillText('핵심 요소 채점', 80, y);
  y += 46;

  const statusColor: Record<FactMark['status'], string> = {
    hit: token('--yes', '#3a7d44'),
    partial: token('--maybe', '#8b7a3a'),
    miss: token('--no', '#8b3a3a'),
  };

  for (const f of data.facts.slice(0, 6)) {
    ctx.fillStyle = statusColor[f.status];
    roundRect(ctx, 80, y, 104, 44, 10);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `600 24px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(STATUS_LABEL[f.status], 132, y + 9);
    ctx.textAlign = 'left';

    ctx.fillStyle = fg;
    ctx.font = `28px ${FONT}`;
    const label = f.label.length > 24 ? f.label.slice(0, 23) + '…' : f.label;
    ctx.fillText(label, 204, y + 8);
    y += 58;
  }

  // 하단 URL
  ctx.fillStyle = dim;
  ctx.font = `24px ${FONT}`;
  ctx.fillText(data.url, 80, H - 70);

  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export type ShareOutcome = 'shared' | 'cancelled' | 'copied' | 'downloaded' | 'failed';

/** blob을 파일로 내려준다. 앵커를 DOM에 붙여야 일부 브라우저에서 동작한다. */
function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // 즉시 revoke하면 다운로드가 시작되기 전에 끊길 수 있다.
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}

/**
 * 이미지 공유. 가능한 순서대로 시도한다:
 * Web Share(파일) → 클립보드 이미지 → 파일 다운로드.
 *
 * Web Share는 "쓸 수 있다"고 보고해도 공유 대상이 없거나 사용자가 취소하면
 * 거부된다. 취소는 실패가 아니므로 조용히 끝내고, 그 밖의 거부는 다음 수단으로
 * 넘어간다.
 */
export async function shareCardImage(
  data: ShareCardData,
  fileName = 'land-rabbit-result.png'
): Promise<ShareOutcome> {
  try {
    const canvas = drawShareCard(data);
    const blob = await canvasToBlob(canvas);
    if (!blob) return 'failed';

    const file = new File([blob], fileName, { type: 'image/png' });

    if (
      typeof navigator !== 'undefined' &&
      navigator.canShare?.({ files: [file] }) &&
      navigator.share
    ) {
      try {
        await navigator.share({
          files: [file],
          title: '육지토끼고기',
          text: `${data.caseTitle} — ${data.solved ? `${data.rank} 랭크 ${data.score}점` : '미해결'}`,
        });
        return 'shared';
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return 'cancelled';
        // 공유 대상이 없는 환경 — 아래로 폴백한다.
      }
    }

    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        return 'copied';
      } catch {
        // 클립보드 권한이 없으면 다운로드로 넘어간다.
      }
    }

    download(blob, fileName);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}

/** 텍스트 공유 — Web Share가 있으면 네이티브, 없으면 클립보드. */
export async function shareResultText(data: ShareCardData): Promise<ShareOutcome> {
  const text = data.solved
    ? `육지토끼고기 · ${data.caseTitle} · ${data.rank} 랭크 ${data.score}점 · 남은 질문 ${data.tokensLeft}\n${data.url}`
    : `육지토끼고기 · ${data.caseTitle} · 미해결 · 던진 질문 ${data.totalQuestions}\n${data.url}`;

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title: '육지토끼고기', text, url: data.url });
      return 'shared';
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return 'cancelled';
      // 공유 대상이 없으면 클립보드로 폴백한다.
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
