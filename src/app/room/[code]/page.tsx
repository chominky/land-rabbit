'use client';

import {
  useState, useEffect, useRef, useCallback,
} from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Copy, Check, Eye, EyeOff, Users, Crown, Send, Flag, Lightbulb,
  FileText, Lock, Trophy, AlertTriangle, ChevronLeft, X, Loader2,
  ArrowRight, MessageSquare, Unlock,
} from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase/client';
import {
  COST_HINT, COST_PREVIEW, COST_WRONG_ANSWER, MAX_QUESTION_LENGTH,
  MAX_FINAL_ATTEMPTS, calculateScore, getRank,
} from '@/lib/gameConfig';
import {
  Room, RoomPlayer, RoomQuestion, RoomEvent, CasePublicDTO, Verdict,
} from '@/lib/types';
import { T, alpha, VERDICT_TOKEN } from '@/lib/theme';

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG     = T.bg;
const CARD   = T.surface;
const CARD2  = T.surface2;
const BORDER = T.border;
const AMBER  = T.accent;
const MUTED  = T.muted;
const DIM    = T.dim;
const TEXT   = T.fg;
const DANGER = T.danger;

// ── Verdict display ────────────────────────────────────────────────────────────
const VERDICT_BG: Record<Verdict, string> = VERDICT_TOKEN;
const VERDICT_LABEL: Record<Verdict, string> = {
  YES: '예', NO: '아니오', MAYBE: '그럴 수도', IRRELEVANT: '무관', INVALID: '무효',
};

// ── Stored identity ───────────────────────────────────────────────────────────
function loadIdentity(code: string): { playerId: string; nickname: string } | null {
  try {
    const raw = localStorage.getItem(`yesno_player_${code}`);
    if (!raw) return null;
    return JSON.parse(raw) as { playerId: string; nickname: string };
  } catch { return null; }
}

// ── API payload types ─────────────────────────────────────────────────────────
type RoomStateResponse = {
  room: Room & { host_player_id: string; turn_deadline?: string };
  players: RoomPlayer[];
  questions: RoomQuestion[];
  casePublic: CasePublicDTO | null;
  revealedKeyFacts: string[];
  events: RoomEvent[];
};

type ChatLine = { id: string; nickname: string; text: string; ts: number };

// ── Small reusable bits ───────────────────────────────────────────────────────
function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return (
    <span
      className="stamp text-white shrink-0"
      style={{ background: VERDICT_BG[verdict] }}
    >
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

function PlayerRow({ p, isMe, isHost, isTurn }: {
  p: RoomPlayer; isMe: boolean; isHost: boolean; isTurn: boolean;
}) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg border"
      style={{
        borderColor: isTurn ? AMBER : BORDER,
        background: isTurn ? alpha(AMBER, 0.05) : CARD2,
      }}
    >
      {isHost && <Crown size={12} style={{ color: AMBER }} />}
      {p.is_spectator && <EyeOff size={12} style={{ color: DIM }} />}
      <span
        className="flex-1 text-sm truncate"
        style={{ color: p.is_spectator ? DIM : TEXT }}
      >
        {p.nickname}
        {isMe && <span className="ml-1 text-[10px]" style={{ color: DIM }}>(나)</span>}
      </span>
      {p.solved_at && <Trophy size={12} style={{ color: AMBER }} />}
      {!p.is_spectator && (
        <span className="text-xs font-mono" style={{ color: DIM }}>
          {p.tokens}Q
        </span>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function RoomPage() {
  const router = useRouter();
  const { code } = useParams<{ code: string }>();
  const upperCode = code?.toUpperCase() ?? '';

  // Identity – load synchronously from localStorage on first render
  const [identity, setIdentity] = useState<{ playerId: string; nickname: string } | null>(() => {
    if (typeof window === 'undefined') return null;
    return loadIdentity(code?.toUpperCase() ?? '');
  });

  // Room state
  const [roomData, setRoomData] = useState<RoomStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Join flow (when no identity yet)
  const [joinNickname, setJoinNickname] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Question input
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  // Final submit
  const [showFinalModal, setShowFinalModal] = useState(false);
  const [finalAnswer, setFinalAnswer] = useState('');
  const [finalLoading, setFinalLoading] = useState(false);
  const [finalError, setFinalError] = useState<string | null>(null);
  const [verdictResult, setVerdictResult] = useState<{
    solved: boolean; score?: number; rank?: string; feedback?: string; truth?: string;
  } | null>(null);

  // Hints
  const [hints, setHints] = useState<string[]>([]);
  const [hintLoading, setHintLoading] = useState(false);

  // Preview
  const [previewLoading, setPreviewLoading] = useState(false);

  // Copy feedback
  const [copied, setCopied] = useState(false);

  // Spectating (versus mode)
  const [spectatingId, setSpectatingId] = useState<string | null>(null);

  // Mobile tab: 'info' (left panel) vs 'questions' (right panel)
  const [mobileTab, setMobileTab] = useState<'questions' | 'info'>('info');

  // Unread dots for mobile tabs
  const [unreadQuestions, setUnreadQuestions] = useState(false);
  const [unreadInfo, setUnreadInfo] = useState(false);

  // Chat (coop)
  const [chatLines, setChatLines] = useState<ChatLine[]>([]);
  const [chatInput, setChatInput] = useState('');
  const chatRef = useRef<HTMLDivElement>(null);

  // Log scroll
  const logRef = useRef<HTMLDivElement>(null);

  // ── Reload identity when code changes ──────────────────────────────────────
  useEffect(() => {
    setIdentity(loadIdentity(upperCode));
  }, [upperCode]);

  // ── Fetch room state ───────────────────────────────────────────────────────
  const fetchRoom = useCallback(async () => {
    try {
      const res = await fetch(`/api/rooms/${upperCode}`);
      if (!res.ok) {
        if (res.status === 404) { setFetchError('존재하지 않는 방입니다.'); return; }
        throw new Error(`서버 오류 (${res.status})`);
      }
      const data = await res.json() as RoomStateResponse;
      setRoomData(data);
      setFetchError(null);
    } catch (e: unknown) {
      setFetchError(e instanceof Error ? e.message : '알 수 없는 오류');
    } finally {
      setLoading(false);
    }
  }, [upperCode]);

  useEffect(() => { fetchRoom(); }, [fetchRoom]);

  // ── Supabase Realtime ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!roomData?.room.id) return;
    const roomId = roomData.room.id;
    const client = getSupabaseClient();

    const channel = client
      .channel(`room-${upperCode}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'rooms',
        filter: `id=eq.${roomId}`,
      }, () => { fetchRoom(); })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'room_players',
        filter: `room_id=eq.${roomId}`,
      }, () => { fetchRoom(); })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'room_questions',
        filter: `room_id=eq.${roomId}`,
      }, () => { fetchRoom(); })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'room_events',
        filter: `room_id=eq.${roomId}`,
      }, (payload) => {
        // Handle hint_purchased events to update hint list
        const ev = payload.new as { type: string; payload: Record<string, unknown> };
        if (ev?.type === 'hint_purchased') {
          const { hint } = ev.payload as { hint: string };
          if (hint) setHints((prev) => prev.includes(hint) ? prev : [...prev, hint]);
        }
        fetchRoom();
      })
      .subscribe();

    return () => { client.removeChannel(channel); };
  }, [roomData?.room.id, upperCode, fetchRoom]);

  // ── Auto-scroll question log ───────────────────────────────────────────────
  const prevQLen = useRef(roomData?.questions.length ?? 0);
  useEffect(() => {
    const curLen = roomData?.questions.length ?? 0;
    if (curLen > prevQLen.current) {
      logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
      if (mobileTab !== 'questions') setUnreadQuestions(true);
    }
    prevQLen.current = curLen;
  }, [roomData?.questions.length, mobileTab]);

  const prevChatLen = useRef(chatLines.length);
  useEffect(() => {
    if (chatLines.length > prevChatLen.current) {
      chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' });
      // Chat is in both tabs: on mobile, questions tab shows chat inline,
      // but info tab has desktop chat hidden. Mark info tab for new chat.
      if (mobileTab !== 'info') setUnreadInfo(true);
    }
    prevChatLen.current = chatLines.length;
  }, [chatLines.length, mobileTab]);

  // ── Join room ──────────────────────────────────────────────────────────────
  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!joinNickname.trim()) return;
    setJoining(true);
    setJoinError(null);
    try {
      const res = await fetch('/api/rooms', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: upperCode, nickname: joinNickname.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setJoinError(data.error || '참가 실패'); return; }
      const id = { playerId: data.playerId as string, nickname: data.nickname as string };
      localStorage.setItem(`yesno_player_${upperCode}`, JSON.stringify(id));
      setIdentity(id);
      await fetchRoom();
    } catch {
      setJoinError('네트워크 오류가 발생했습니다.');
    } finally {
      setJoining(false);
    }
  }

  // ── Start game (host) ──────────────────────────────────────────────────────
  async function handleStart() {
    if (!identity) return;
    await fetch(`/api/rooms/${upperCode}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', playerId: identity.playerId }),
    });
  }

  // ── Leave room ─────────────────────────────────────────────────────────────
  async function handleLeave() {
    if (!identity) return;
    await fetch(`/api/rooms/${upperCode}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'leave', playerId: identity.playerId }),
    });
    localStorage.removeItem(`yesno_player_${upperCode}`);
    router.push('/');
  }

  // ── Ask question ───────────────────────────────────────────────────────────
  const submitQuestion = useCallback(async () => {
    if (!identity || !roomData || asking || !question.trim()) return;
    setAsking(true);
    setAskError(null);
    try {
      const res = await fetch('/api/judge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: roomData.room.case_id,
          question: question.trim(),
          playerId: identity.playerId,
          roomCode: upperCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setAskError(data.error || '질문 실패'); return; }
      if (data.cached) { setAskError('이미 물어본 질문입니다.'); return; }
      setQuestion('');
      await fetchRoom();
    } catch {
      setAskError('네트워크 오류가 발생했습니다.');
    } finally {
      setAsking(false);
    }
  }, [identity, roomData, asking, question, upperCode, fetchRoom]);

  // ── Flag question ──────────────────────────────────────────────────────────
  async function flagQuestion(questionId: string) {
    await fetch(`/api/rooms/${upperCode}/flag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId }),
    });
  }

  // ── Buy hint ───────────────────────────────────────────────────────────────
  async function buyHint() {
    if (!identity || hintLoading || hints.length >= 3) return;
    setHintLoading(true);
    try {
      const res = await fetch(`/api/rooms/${upperCode}/hint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: identity.playerId, hintLevel: hints.length }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || '힌트 구매 실패'); return; }
      if (data.hint) setHints((prev) => [...prev, data.hint as string]);
      await fetchRoom();
    } catch {
      alert('오류가 발생했습니다.');
    } finally {
      setHintLoading(false);
    }
  }

  // ── Buy preview ────────────────────────────────────────────────────────────
  async function buyPreview() {
    if (!identity || previewLoading) return;
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/rooms/${upperCode}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: identity.playerId }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || '미리보기 실패'); return; }
      await fetchRoom();
    } catch {
      alert('오류가 발생했습니다.');
    } finally {
      setPreviewLoading(false);
    }
  }

  // ── Final answer ───────────────────────────────────────────────────────────
  async function submitFinal(e: React.FormEvent) {
    e.preventDefault();
    if (!identity || !roomData || !finalAnswer.trim()) return;
    setFinalLoading(true);
    setFinalError(null);
    try {
      const res = await fetch('/api/verdict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: roomData.room.case_id,
          answer: finalAnswer.trim(),
          playerId: identity.playerId,
          roomCode: upperCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setFinalError(data.error || '제출 실패'); return; }
      setVerdictResult({
        solved: data.solved as boolean,
        score: data.score as number | undefined,
        rank: data.rank as string | undefined,
        feedback: data.feedback as string | undefined,
        truth: data.truth as string | undefined,
      });
      setShowFinalModal(false);
      await fetchRoom();
    } catch {
      setFinalError('네트워크 오류가 발생했습니다.');
    } finally {
      setFinalLoading(false);
    }
  }

  // ── Copy helpers ───────────────────────────────────────────────────────────
  function copyCode() {
    navigator.clipboard.writeText(upperCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  function copyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/room/${upperCode}`);
  }

  // ── Chat (coop only, client-side optimistic) ───────────────────────────────
  function sendChat(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim() || !identity) return;
    const line: ChatLine = {
      id: `${Date.now()}`,
      nickname: identity.nickname,
      text: chatInput.trim(),
      ts: Date.now(),
    };
    setChatLines((prev) => [...prev, line]);
    setChatInput('');
  }

  // ── Derived state ──────────────────────────────────────────────────────────
  const room = roomData?.room ?? null;
  const players = roomData?.players ?? [];
  const questions = roomData?.questions ?? [];
  const casePublic = roomData?.casePublic ?? null;
  const revealedKeyFacts = roomData?.revealedKeyFacts ?? [];

  const me = identity ? players.find((p) => p.id === identity.playerId) : null;
  const isHost = room ? room.host_player_id === identity?.playerId : false;
  const isCoop = room?.mode === 'coop';
  const isVersus = room?.mode === 'versus';
  const myPlayer = me;
  const tokens = isCoop ? (room?.shared_tokens ?? 0) : (myPlayer?.tokens ?? 0);
  const attemptsUsed = myPlayer?.attempts_used ?? 0;
  const isMeSolved = !!myPlayer?.solved_at;
  const isMeFinished = isMeSolved || attemptsUsed >= MAX_FINAL_ATTEMPTS || (isVersus && tokens <= 0);

  const canAsk =
    room?.status === 'playing' &&
    !me?.is_spectator &&
    !isMeSolved &&
    (me?.tokens ?? 0) > 0 &&
    !asking;

  // Versus mode: per-player question filtering + spectating
  const targetPlayerId = isVersus ? (spectatingId || identity?.playerId) : null;
  const displayQuestions = targetPlayerId
    ? questions.filter((q) => q.player_id === targetPlayerId)
    : questions;

  const displayRevealedFacts = isVersus
    ? (() => {
        const facts = new Set<string>();
        displayQuestions.forEach((q) => (q.revealed_facts || []).forEach((f) => facts.add(f)));
        return Array.from(facts);
      })()
    : revealedKeyFacts;

  const displayTokens = isVersus && spectatingId
    ? (players.find((p) => p.id === spectatingId)?.tokens ?? 0)
    : tokens;

  const spectatedPlayer = spectatingId ? players.find((p) => p.id === spectatingId) : null;

  const otherPlayers = isVersus
    ? players.filter((p) => !p.is_spectator && p.id !== identity?.playerId)
    : [];

  const events = roomData?.events ?? [];
  const verdictEvents = isVersus && spectatingId
    ? events.filter((e) =>
        (e.type === 'player_solved' || e.type === 'wrong_answer') &&
        (e.payload as { playerId?: string }).playerId === spectatingId
      )
    : [];

  // ── Loading / error / no-identity screens ─────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: BG }}>
        <div className="flex items-center gap-2" style={{ color: MUTED }}>
          <Loader2 size={20} className="animate-spin" />
          불러오는 중…
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: BG }}>
        <AlertTriangle size={40} style={{ color: DANGER }} />
        <p style={{ color: MUTED }}>{fetchError}</p>
        <button
          onClick={() => router.push('/')}
          className="px-4 py-2 rounded text-sm"
          style={{ background: AMBER, color: BG }}
        >
          홈으로
        </button>
      </div>
    );
  }

  // No identity → join form
  if (!identity) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: BG }}>
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <p className="text-2xl font-bold tracking-widest" style={{ color: AMBER }}>{upperCode}</p>
            <p className="text-sm mt-1" style={{ color: MUTED }}>방에 참가하려면 닉네임을 입력하세요</p>
            {casePublic && (
              <p className="text-xs mt-2" style={{ color: DIM }}>사건: {casePublic.title}</p>
            )}
          </div>
          <form onSubmit={handleJoin} className="space-y-3">
            <input
              type="text"
              value={joinNickname}
              onChange={(e) => setJoinNickname(e.target.value)}
              placeholder="탐정의 이름"
              maxLength={20}
              required
              className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none"
              style={{ background: CARD2, borderColor: BORDER, color: TEXT }}
            />
            {joinError && (
              <p className="text-xs" style={{ color: DANGER }}>{joinError}</p>
            )}
            <button
              type="submit"
              disabled={joining || !joinNickname.trim()}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg font-bold text-sm disabled:opacity-40"
              style={{ background: AMBER, color: BG }}
            >
              {joining ? <Loader2 size={16} className="animate-spin" /> : null}
              참가하기
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════════════════════
  // LOBBY
  // ═════════════════════════════════════════════════════════════════════════
  if (room?.status === 'lobby') {
    const shareUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/room/${upperCode}`
      : '';

    return (
      <div className="min-h-screen flex flex-col" style={{ background: BG }}>
        {/* Header */}
        <header
          className="flex items-center gap-3 px-4 py-3 border-b"
          style={{ background: CARD, borderColor: BORDER }}
        >
          <button onClick={handleLeave} className="flex items-center gap-1 text-sm" style={{ color: MUTED }}>
            <ChevronLeft size={16} /> 나가기
          </button>
          <div className="h-4 w-px" style={{ background: BORDER }} />
          <span className="text-sm font-bold tracking-wider" style={{ color: AMBER }}>대기실</span>
        </header>

        <main className="flex-1 max-w-lg mx-auto w-full px-4 py-8 space-y-6">
          {/* Room code */}
          <div
            className="rounded-xl border p-6 text-center"
            style={{ background: CARD, borderColor: BORDER }}
          >
            <p className="text-xs tracking-widest mb-2" style={{ color: MUTED }}>방 코드</p>
            <p className="text-5xl font-bold tracking-[0.3em] mb-4" style={{ color: AMBER }}>
              {upperCode}
            </p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={copyCode}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs transition-colors"
                style={{ borderColor: BORDER, color: copied ? AMBER : MUTED }}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? '복사됨' : '코드 복사'}
              </button>
              <button
                onClick={copyLink}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs"
                style={{ borderColor: BORDER, color: MUTED }}
              >
                <Copy size={13} /> 링크 복사
              </button>
            </div>
            {shareUrl && (
              <p className="mt-3 text-[10px] break-all" style={{ color: DIM }}>{shareUrl}</p>
            )}
          </div>

          {/* Case info */}
          {casePublic && (
            <div
              className="rounded-xl border p-4"
              style={{ background: CARD, borderColor: BORDER }}
            >
              <p className="text-xs tracking-wider mb-1" style={{ color: MUTED }}>선택된 사건</p>
              <p className="font-bold" style={{ color: TEXT }}>{casePublic.title}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs" style={{ color: DIM }}>
                  {'★'.repeat(casePublic.difficulty)}{'☆'.repeat(5 - casePublic.difficulty)}
                </span>
                <span className="text-xs" style={{ color: DIM }}>
                  {room.mode === 'coop' ? '협동' : '대결'} 모드
                </span>
              </div>
              <p className="text-xs mt-2 leading-relaxed line-clamp-2" style={{ color: MUTED }}>
                {casePublic.brief}
              </p>
            </div>
          )}

          {/* Player list */}
          <div className="rounded-xl border p-4" style={{ background: CARD, borderColor: BORDER }}>
            <p className="text-xs tracking-wider mb-3" style={{ color: MUTED }}>
              참가자 ({players.filter((p) => !p.is_spectator).length}명)
            </p>
            <div className="space-y-2">
              {players.map((p) => (
                <PlayerRow
                  key={p.id}
                  p={p}
                  isMe={p.id === identity.playerId}
                  isHost={p.id === room.host_player_id}
                  isTurn={false}
                />
              ))}
            </div>
          </div>

          {/* Start button (host only) */}
          {isHost ? (
            <button
              onClick={handleStart}
              disabled={players.filter((p) => !p.is_spectator).length < 1}
              className="w-full py-3 rounded-xl font-bold text-sm disabled:opacity-40"
              style={{ background: AMBER, color: BG }}
            >
              게임 시작
            </button>
          ) : (
            <p className="text-center text-sm" style={{ color: DIM }}>
              방장이 시작할 때까지 기다리세요…
            </p>
          )}
        </main>
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════════════════════
  // PLAYING
  // ═════════════════════════════════════════════════════════════════════════
  if (room?.status === 'playing') {
    const revealedCount = room.revealed_image_count ?? 1;
    const totalImages = casePublic?.imageCount ?? 1;
    const canPreview = displayTokens >= COST_PREVIEW && revealedCount < totalImages && !previewLoading && !spectatingId;
    const canHint = displayTokens >= COST_HINT && hints.length < 3 && !hintLoading && !spectatingId;

    return (
      <div className="h-screen flex flex-col" style={{ background: BG }}>
        {/* Top bar */}
        <header
          className="flex items-center justify-between px-4 py-2 border-b shrink-0"
          style={{ background: CARD, borderColor: BORDER }}
        >
          <button onClick={handleLeave} className="flex items-center gap-1 text-xs" style={{ color: MUTED }}>
            <ChevronLeft size={14} /> 나가기
          </button>
          <div className="flex items-center gap-3">
            {casePublic && (
              <span className="text-xs font-bold" style={{ color: AMBER }}>{casePublic.title}</span>
            )}
            <span
              className="text-[10px] px-2 py-0.5 rounded"
              style={{ background: alpha(AMBER, 0.13), color: AMBER }}
            >
              {room.mode === 'coop' ? '협동' : '대결'}
            </span>
            <span className="text-xs font-mono" style={{ color: DIM }}>
              {upperCode}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Versus turn info */}
            {isVersus && spectatedPlayer && (
              <span className="text-xs flex items-center gap-1" style={{ color: AMBER }}>
                <Eye size={12} />
                {spectatedPlayer.nickname} 관전 중
              </span>
            )}
            {/* Token display */}
            <div
              className="text-xs font-bold px-2 py-1 rounded"
              style={{ background: CARD2, color: displayTokens <= 10 ? DANGER : AMBER }}
            >
              {displayTokens}Q
            </div>
          </div>
        </header>

        {/* Mobile tab switcher */}
        <div className="flex md:hidden shrink-0 border-b" style={{ borderColor: BORDER, background: CARD }}>
          <button
            onClick={() => { setMobileTab('info'); setUnreadInfo(false); }}
            className="flex-1 py-2 text-xs font-bold text-center border-b-2 transition-colors relative"
            style={{
              borderColor: mobileTab === 'info' ? AMBER : 'transparent',
              color: mobileTab === 'info' ? AMBER : MUTED,
            }}
          >
            사건 정보
            {unreadInfo && (
              <span className="absolute top-1 right-[30%] w-2 h-2 rounded-full" style={{ background: DANGER }} />
            )}
          </button>
          <button
            onClick={() => { setMobileTab('questions'); setUnreadQuestions(false); }}
            className="flex-1 py-2 text-xs font-bold text-center border-b-2 transition-colors relative"
            style={{
              borderColor: mobileTab === 'questions' ? AMBER : 'transparent',
              color: mobileTab === 'questions' ? AMBER : MUTED,
            }}
          >
            심문 기록
            {unreadQuestions && (
              <span className="absolute top-1 right-[30%] w-2 h-2 rounded-full" style={{ background: DANGER }} />
            )}
          </button>
        </div>

        {/* Body: tab on mobile, side-by-side on desktop */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
          {/* ── Left panel ──────────────────────────────────────────────── */}
          <div
            className={`shrink-0 flex-col overflow-y-auto border-b md:border-b-0 md:border-r md:w-[340px] ${mobileTab === 'info' ? 'flex' : 'hidden'} md:flex`}
            style={{ borderColor: BORDER }}
          >
            <div className="p-3 space-y-3">
              {/* Images */}
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: totalImages }).map((_, i) => {
                  const revealed = i < revealedCount;
                  return (
                    <div
                      key={i}
                      className="aspect-[4/3] rounded-lg border overflow-hidden relative"
                      style={{ borderColor: BORDER, background: CARD2 }}
                    >
                      {revealed ? (
                        casePublic?.images?.[i] ? (
                          <img
                            src={casePublic.images[i]}
                            alt={`삽화 ${i + 1}`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div
                            className="w-full h-full flex flex-col items-center justify-center gap-1 p-2 text-center"
                            style={{ background: 'var(--surface-inset)' }}
                          >
                            <Eye size={18} style={{ color: DIM }} />
                            <span className="text-[10px]" style={{ color: DIM }}>삽화 {i + 1}</span>
                          </div>
                        )
                      ) : (
                        <div className="locked-slot w-full h-full flex items-center justify-center">
                          <Lock size={18} style={{ color: 'var(--neutral)' }} />
                        </div>
                      )}
                      {i === 0 && (
                        <span
                          className="absolute top-1 left-1 text-[9px] px-1.5 py-0.5 rounded"
                          style={{ background: AMBER, color: BG }}
                        >
                          공개
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Brief */}
              {casePublic && (
                <div
                  className="p-3 rounded-lg border text-xs leading-relaxed"
                  style={{ background: CARD2, borderColor: BORDER, color: TEXT }}
                >
                  {casePublic.brief}
                </div>
              )}

              {/* Tokens */}
              <div
                className="p-3 rounded-lg border text-center"
                style={{ background: CARD2, borderColor: BORDER }}
              >
                <p className="text-[10px] mb-1" style={{ color: MUTED }}>
                  {spectatingId ? `${spectatedPlayer?.nickname}의 남은 질문` : isCoop ? '공유 질문' : '남은 질문'}
                </p>
                <p
                  className="text-3xl font-bold"
                  style={{ color: displayTokens <= 10 ? DANGER : AMBER }}
                >
                  {displayTokens}
                </p>
                {displayTokens > 0 && (
                  <p className="text-[10px] mt-1" style={{ color: DIM }}>
                    예상 점수 {calculateScore(displayTokens, 50)} / 등급 {getRank(calculateScore(displayTokens, 50))}
                  </p>
                )}
              </div>

              {/* Hint / Preview buttons */}
              <div className="space-y-2">
                <button
                  onClick={buyHint}
                  disabled={!canHint}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs disabled:opacity-30"
                  style={{ background: CARD2, borderColor: BORDER, color: TEXT }}
                >
                  {hintLoading
                    ? <Loader2 size={12} className="animate-spin" />
                    : <Lightbulb size={12} />
                  }
                  텍스트 힌트 -{COST_HINT}Q ({hints.length}/3)
                </button>
                <button
                  onClick={buyPreview}
                  disabled={!canPreview}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs disabled:opacity-30"
                  style={{ background: CARD2, borderColor: BORDER, color: TEXT }}
                >
                  {previewLoading
                    ? <Loader2 size={12} className="animate-spin" />
                    : <Eye size={12} />
                  }
                  {revealedCount >= totalImages
                    ? '공개할 단서 없음'
                    : `단서 미리보기 -${COST_PREVIEW}Q`}
                </button>
              </div>

              {/* Hint texts */}
              {hints.length > 0 && (
                <div className="space-y-1.5">
                  {hints.map((h, i) => (
                    <div
                      key={i}
                      className="px-3 py-2 rounded border text-xs"
                      style={{ background: alpha(AMBER, 0.04), borderColor: alpha(AMBER, 0.20), color: AMBER }}
                    >
                      <Lightbulb size={11} className="inline mr-1" />
                      힌트 {i + 1}: {h}
                    </div>
                  ))}
                </div>
              )}

              {/* Key facts progress */}
              {casePublic && (
                <div
                  className="p-3 rounded-lg border"
                  style={{ background: CARD2, borderColor: BORDER }}
                >
                  <p className="text-[10px] mb-2" style={{ color: MUTED }}>
                    핵심 요소 {displayRevealedFacts.length} / {casePublic.keyFactLabels.length}
                  </p>
                  <div className="w-full h-1.5 rounded-full mb-2" style={{ background: BORDER }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        background: AMBER,
                        width: `${(displayRevealedFacts.length / (casePublic.keyFactLabels.length || 1)) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {casePublic.keyFactLabels.map((f, idx) => {
                      const found = displayRevealedFacts.includes(f.id);
                      return (
                        <span
                          key={f.id}
                          className="text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5"
                          style={{
                            background: found ? alpha(AMBER, 0.13) : BORDER,
                            color: found ? AMBER : DIM,
                            border: `1px solid ${found ? alpha(AMBER, 0.27) : BORDER}`,
                          }}
                        >
                          {found && <Unlock size={8} />}
                          {found ? `핵심 요소 ${idx + 1}` : '???'}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Players sidebar */}
              <div
                className="p-3 rounded-lg border"
                style={{ background: CARD2, borderColor: BORDER }}
              >
                <p className="text-[10px] mb-2" style={{ color: MUTED }}>
                  <Users size={10} className="inline mr-1" />
                  참가자
                </p>
                <div className="space-y-1.5">
                  {players.map((p) => {
                    const canSpectatePlayer = isVersus && isMeFinished && p.id !== identity.playerId && !p.is_spectator;
                    return (
                      <div
                        key={p.id}
                        onClick={() => canSpectatePlayer && setSpectatingId(p.id === spectatingId ? null : p.id)}
                        style={{ cursor: canSpectatePlayer ? 'pointer' : 'default' }}
                      >
                        <PlayerRow
                          p={p}
                          isMe={p.id === identity.playerId}
                          isHost={p.id === room.host_player_id}
                          isTurn={isVersus && spectatingId === p.id}
                        />
                        {canSpectatePlayer && (
                          <div className="flex items-center gap-1 px-3 -mt-0.5 pb-1" style={{ color: DIM }}>
                            <Eye size={9} />
                            <span className="text-[9px]">
                              {spectatingId === p.id ? '관전 해제' : '클릭하여 관전'}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Coop chat (desktop only – mobile chat is in right panel) */}
              {isCoop && (
                <div
                  className="hidden md:flex rounded-lg border flex-col"
                  style={{ background: CARD2, borderColor: BORDER, height: '180px' }}
                >
                  <div className="px-3 pt-2 pb-1 border-b flex items-center gap-1" style={{ borderColor: BORDER }}>
                    <MessageSquare size={11} style={{ color: DIM }} />
                    <span className="text-[10px]" style={{ color: DIM }}>채팅</span>
                  </div>
                  <div
                    ref={chatRef}
                    className="flex-1 overflow-y-auto px-3 py-2 space-y-1"
                  >
                    {chatLines.map((l) => (
                      <p key={l.id} className="text-[11px]" style={{ color: TEXT }}>
                        <span style={{ color: AMBER }}>{l.nickname}</span>
                        {' '}{l.text}
                      </p>
                    ))}
                  </div>
                  <form onSubmit={sendChat} className="flex gap-1 p-2 border-t" style={{ borderColor: BORDER }}>
                    <input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="메시지…"
                      maxLength={200}
                      className="flex-1 px-2 py-1 rounded text-[11px] outline-none border"
                      style={{ background: CARD, borderColor: BORDER, color: TEXT }}
                    />
                    <button
                      type="submit"
                      className="px-2 py-1 rounded text-[11px]"
                      style={{ background: AMBER, color: BG }}
                    >
                      <Send size={11} />
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>

          {/* ── Right panel: question log ──────────────────────────────── */}
          <div className={`flex-1 flex-col min-w-0 ${mobileTab === 'questions' ? 'flex' : 'hidden'} md:flex`}>
            {/* Sub-header */}
            <div
              className="flex items-center justify-between px-4 py-2 border-b shrink-0"
              style={{ background: CARD, borderColor: BORDER }}
            >
              <span className="text-xs" style={{ color: MUTED }}>
                심문 기록 ({displayQuestions.length}건)
                {spectatedPlayer && (
                  <span className="ml-1" style={{ color: AMBER }}>· {spectatedPlayer.nickname}</span>
                )}
              </span>
              <button
                onClick={() => setShowFinalModal(true)}
                disabled={isMeSolved || attemptsUsed >= MAX_FINAL_ATTEMPTS || me?.is_spectator || !!spectatingId}
                className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-bold disabled:opacity-30"
                style={{ background: AMBER, color: BG }}
              >
                <FileText size={11} />
                최종 추리 ({MAX_FINAL_ATTEMPTS - attemptsUsed}회 남음)
              </button>
            </div>

            {/* Log */}
            <div ref={logRef} className="flex-1 overflow-y-auto p-4 space-y-2">
              {/* Spectating banner */}
              {isVersus && spectatedPlayer && (
                <div
                  className="flex items-center justify-between px-3 py-2 rounded-lg border mb-2"
                  style={{ background: alpha(AMBER, 0.05), borderColor: alpha(AMBER, 0.20) }}
                >
                  <div className="flex items-center gap-2">
                    <Eye size={14} style={{ color: AMBER }} />
                    <span className="text-xs font-bold" style={{ color: AMBER }}>
                      {spectatedPlayer.nickname} 관전 중
                    </span>
                    <span className="text-[10px]" style={{ color: MUTED }}>
                      남은 질문 {spectatedPlayer.tokens}Q · 시도 {spectatedPlayer.attempts_used}/{MAX_FINAL_ATTEMPTS}
                      {spectatedPlayer.solved_at && ' · 해결!'}
                    </span>
                  </div>
                  <button
                    onClick={() => setSpectatingId(null)}
                    className="text-xs px-2 py-1 rounded"
                    style={{ color: MUTED }}
                  >
                    <X size={12} />
                  </button>
                </div>
              )}

              {displayQuestions.length === 0 && !spectatingId && (
                <div className="text-center py-12" style={{ color: DIM }}>
                  <FileText size={28} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">질문을 시작하세요</p>
                </div>
              )}
              {displayQuestions.length === 0 && spectatingId && (
                <div className="text-center py-12" style={{ color: DIM }}>
                  <FileText size={28} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">아직 질문 기록이 없습니다</p>
                </div>
              )}
              {displayQuestions.map((q, i) => (
                <div
                  key={q.id}
                  className="rounded-lg p-3 border"
                  style={{ background: CARD2, borderColor: BORDER }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs mb-0.5" style={{ color: DIM }}>
                        Q{i + 1}
                        {q.nickname && (
                          <span className="ml-1" style={{ color: MUTED }}>· {q.nickname}</span>
                        )}
                      </p>
                      <p className="text-sm" style={{ color: TEXT }}>{q.text}</p>
                      {q.revealed_facts && q.revealed_facts.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {q.revealed_facts.map((fid) => {
                            const idx = casePublic?.keyFactLabels.findIndex((f) => f.id === fid) ?? -1;
                            return (
                              <span
                                key={fid}
                                className="text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5"
                                style={{ background: alpha(AMBER, 0.13), color: AMBER }}
                              >
                                <Unlock size={8} />핵심 요소 {idx + 1}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <VerdictBadge verdict={q.verdict} />
                      <button
                        onClick={() => flagQuestion(q.id)}
                        className="p-1 rounded opacity-25 hover:opacity-80 transition-opacity"
                        title="판정 신고"
                      >
                        <Flag size={11} style={{ color: DANGER }} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {/* Verdict events during spectating */}
              {verdictEvents.map((ev) => {
                const p = ev.payload as { solved?: boolean; accuracy?: number; answer?: string; feedback?: string };
                return (
                  <div
                    key={ev.id}
                    className="rounded-lg p-3 border"
                    style={{
                      background: p.solved ? alpha(AMBER, 0.05) : alpha(DANGER, 0.05),
                      borderColor: p.solved ? alpha(AMBER, 0.27) : alpha(DANGER, 0.27),
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {p.solved ? (
                        <Trophy size={14} style={{ color: AMBER }} />
                      ) : (
                        <AlertTriangle size={14} style={{ color: DANGER }} />
                      )}
                      <span className="text-xs font-bold" style={{ color: p.solved ? AMBER : DANGER }}>
                        최종 추리 {p.solved ? '성공' : '실패'}
                        {p.accuracy !== undefined && ` · 정확도 ${p.accuracy}%`}
                      </span>
                    </div>
                    {p.answer && (
                      <p className="text-xs leading-relaxed mb-1" style={{ color: TEXT }}>
                        {p.answer}
                      </p>
                    )}
                    {p.feedback && (
                      <p className="text-[10px]" style={{ color: MUTED }}>
                        {p.feedback}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Mobile chat (above input) */}
            {isCoop && (
              <div
                className="flex md:hidden flex-col shrink-0 border-t"
                style={{ borderColor: BORDER, background: CARD2, maxHeight: '120px' }}
              >
                <div
                  ref={chatRef}
                  className="flex-1 overflow-y-auto px-3 py-1.5 space-y-0.5"
                >
                  {chatLines.length === 0 && (
                    <p className="text-[10px] py-1" style={{ color: DIM }}>채팅이 없습니다</p>
                  )}
                  {chatLines.map((l) => (
                    <p key={l.id} className="text-[11px]" style={{ color: TEXT }}>
                      <span style={{ color: AMBER }}>{l.nickname}</span>
                      {' '}{l.text}
                    </p>
                  ))}
                </div>
                <form onSubmit={sendChat} className="flex gap-1 px-2 pb-1.5" style={{ borderColor: BORDER }}>
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="메시지…"
                    maxLength={200}
                    className="flex-1 px-2 py-1 rounded text-[11px] outline-none border"
                    style={{ background: CARD, borderColor: BORDER, color: TEXT }}
                  />
                  <button
                    type="submit"
                    className="px-2 py-1 rounded text-[11px]"
                    style={{ background: AMBER, color: BG }}
                  >
                    <Send size={11} />
                  </button>
                </form>
              </div>
            )}

            {/* Input area */}
            <div
              className="shrink-0 p-4 border-t space-y-2"
              style={{ background: CARD, borderColor: BORDER }}
            >
              {/* Versus mode: spectating selector when finished */}
              {isVersus && isMeFinished && !spectatingId && (
                <div className="text-center space-y-2">
                  <p className="text-xs" style={{ color: MUTED }}>
                    {isMeSolved ? '사건을 해결했습니다!' : '게임이 종료되었습니다'}
                  </p>
                  {otherPlayers.length > 0 && (
                    <>
                      <p className="text-[10px]" style={{ color: DIM }}>다른 플레이어를 관전할 수 있습니다</p>
                      <div className="flex flex-wrap gap-2 justify-center">
                        {otherPlayers.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => setSpectatingId(p.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs"
                            style={{ borderColor: BORDER, color: TEXT, background: CARD2 }}
                          >
                            <Eye size={11} />
                            {p.nickname}
                            {p.solved_at && <Trophy size={10} style={{ color: AMBER }} />}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Versus mode: spectating active */}
              {isVersus && spectatingId && (
                <div className="flex items-center justify-center gap-3">
                  <span className="text-xs" style={{ color: MUTED }}>
                    <Eye size={11} className="inline mr-1" />
                    {spectatedPlayer?.nickname} 관전 중
                  </span>
                  <button
                    onClick={() => setSpectatingId(null)}
                    className="text-[10px] px-2 py-1 rounded border"
                    style={{ borderColor: BORDER, color: DIM }}
                  >
                    관전 해제
                  </button>
                  {otherPlayers.filter((p) => p.id !== spectatingId).length > 0 && (
                    <div className="flex gap-1">
                      {otherPlayers.filter((p) => p.id !== spectatingId).map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setSpectatingId(p.id)}
                          className="text-[10px] px-2 py-1 rounded border"
                          style={{ borderColor: BORDER, color: MUTED }}
                        >
                          {p.nickname}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Normal question input (not spectating) */}
              {!spectatingId && !(isVersus && isMeFinished) && (
                <>
                  {askError && (
                    <p className="text-xs" style={{ color: DANGER }}>{askError}</p>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') submitQuestion(); }}
                      placeholder={
                        !canAsk
                          ? (me?.is_spectator ? '관전자는 질문할 수 없습니다' : '질문 불가')
                          : '예/아니오로 답할 수 있는 질문…'
                      }
                      disabled={!canAsk || asking}
                      maxLength={MAX_QUESTION_LENGTH}
                      className="flex-1 px-3 py-2 rounded-lg border text-sm outline-none disabled:opacity-40"
                      style={{ background: CARD2, borderColor: BORDER, color: TEXT }}
                    />
                    <button
                      onClick={submitQuestion}
                      disabled={!canAsk || asking || !question.trim()}
                      className="px-4 py-2 rounded-lg disabled:opacity-40 flex items-center"
                      style={{ background: AMBER, color: BG }}
                    >
                      {asking
                        ? <Loader2 size={16} className="animate-spin" />
                        : <Send size={16} />
                      }
                    </button>
                  </div>
                  <div className="flex justify-between text-[10px]" style={{ color: DIM }}>
                    <span>{question.length}/{MAX_QUESTION_LENGTH}</span>
                    <span>-1Q (INVALID는 무료)</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Final answer modal ─────────────────────────────────────────── */}
        {showFinalModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'var(--scrim)' }}
          >
            <div
              className="w-full max-w-lg rounded-xl border p-6"
              style={{ background: CARD, borderColor: BORDER }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold" style={{ color: AMBER }}>최종 추리 제출</h2>
                <button onClick={() => { setShowFinalModal(false); setFinalError(null); }}>
                  <X size={20} style={{ color: MUTED }} />
                </button>
              </div>
              <div
                className="flex items-center gap-2 px-3 py-2 mb-4 rounded text-xs"
                style={{ background: 'color-mix(in srgb, var(--no) 13%, transparent)', border: '1px solid color-mix(in srgb, var(--no) 27%, transparent)', color: 'var(--danger-soft)' }}
              >
                <AlertTriangle size={12} />
                오답 시 {COST_WRONG_ANSWER}Q 차감 · {MAX_FINAL_ATTEMPTS - attemptsUsed}회 남음
              </div>
              <form onSubmit={submitFinal}>
                <textarea
                  value={finalAnswer}
                  onChange={(e) => setFinalAnswer(e.target.value)}
                  placeholder="사건의 전말을 자유롭게 서술하세요…"
                  rows={6}
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
                  style={{ background: CARD2, borderColor: BORDER, color: TEXT }}
                />
                {finalError && (
                  <p className="text-xs mt-2" style={{ color: DANGER }}>{finalError}</p>
                )}
                <button
                  type="submit"
                  disabled={finalLoading || !finalAnswer.trim()}
                  className="w-full mt-3 py-2.5 rounded-lg font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-2"
                  style={{ background: AMBER, color: BG }}
                >
                  {finalLoading && <Loader2 size={16} className="animate-spin" />}
                  {finalLoading ? '채점 중…' : '제출'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ── Verdict toast ──────────────────────────────────────────────── */}
        {verdictResult && (
          <div
            className="fixed inset-x-0 bottom-6 flex justify-center z-50 px-4"
          >
            <div
              className="rounded-xl border px-6 py-4 max-w-sm w-full text-center shadow-xl"
              style={{ background: CARD, borderColor: verdictResult.solved ? AMBER : DANGER }}
            >
              {verdictResult.solved ? (
                <>
                  <Trophy size={28} className="mx-auto mb-2" style={{ color: AMBER }} />
                  <p className="font-bold" style={{ color: AMBER }}>사건 해결!</p>
                  {verdictResult.rank && (
                    <p className="text-2xl font-bold mt-1" style={{ color: TEXT }}>
                      {verdictResult.rank} 랭크 · {verdictResult.score}점
                    </p>
                  )}
                </>
              ) : (
                <>
                  <AlertTriangle size={28} className="mx-auto mb-2" style={{ color: DANGER }} />
                  <p className="font-bold" style={{ color: DANGER }}>오답</p>
                  {verdictResult.feedback && (
                    <p className="text-xs mt-1" style={{ color: MUTED }}>{verdictResult.feedback}</p>
                  )}
                </>
              )}
              <button
                onClick={() => setVerdictResult(null)}
                className="mt-3 text-xs"
                style={{ color: DIM }}
              >
                닫기
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════════════════════
  // FINISHED
  // ═════════════════════════════════════════════════════════════════════════
  if (room?.status === 'finished') {
    const ranked = [...players]
      .filter((p) => !p.is_spectator && p.rank !== null)
      .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
    const unranked = players.filter((p) => !p.is_spectator && p.rank === null);

    return (
      <div className="min-h-screen flex flex-col" style={{ background: BG }}>
        <header
          className="flex items-center gap-3 px-4 py-3 border-b"
          style={{ background: CARD, borderColor: BORDER }}
        >
          <span className="text-sm font-bold tracking-widest" style={{ color: AMBER }}>결과</span>
        </header>

        <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8 space-y-6">
          {/* Rankings */}
          <div className="rounded-xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
            <h2 className="text-sm font-bold mb-4" style={{ color: MUTED }}>최종 순위</h2>
            <div className="space-y-2">
              {ranked.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg border"
                  style={{
                    background: p.id === identity.playerId ? alpha(AMBER, 0.05) : CARD2,
                    borderColor: p.id === identity.playerId ? AMBER : BORDER,
                  }}
                >
                  <span
                    className="text-sm font-bold w-6 text-center"
                    style={{ color: p.rank === 1 ? AMBER : MUTED }}
                  >
                    {p.rank}
                  </span>
                  <span className="flex-1 text-sm" style={{ color: TEXT }}>
                    {p.nickname}
                    {p.id === identity.playerId && (
                      <span className="ml-1 text-[10px]" style={{ color: DIM }}>(나)</span>
                    )}
                  </span>
                  {p.rank && (
                    <span
                      className="text-xs px-2 py-0.5 rounded"
                      style={{ background: alpha(AMBER, 0.13), color: AMBER }}
                    >
                      {getRank(p.score ?? 0)} · {p.score ?? 0}점
                    </span>
                  )}
                  <Trophy size={14} style={{ color: p.rank === 1 ? AMBER : DIM }} />
                </div>
              ))}
              {unranked.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg border"
                  style={{ background: CARD2, borderColor: BORDER }}
                >
                  <span className="text-sm font-bold w-6 text-center" style={{ color: DIM }}>-</span>
                  <span className="flex-1 text-sm" style={{ color: MUTED }}>{p.nickname}</span>
                  <span className="text-xs" style={{ color: DIM }}>미해결</span>
                </div>
              ))}
            </div>
          </div>

          {/* Truth reveal */}
          {verdictResult?.truth && (
            <div
              className="rounded-xl border p-5"
              style={{ background: alpha(AMBER, 0.03), borderColor: alpha(AMBER, 0.20) }}
            >
              <h2 className="text-sm font-bold mb-2" style={{ color: AMBER }}>사건 전말</h2>
              <p className="text-sm leading-relaxed" style={{ color: TEXT }}>
                {verdictResult.truth}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={() => {
                const text = questions
                  .map((q, i) => `Q${i + 1}. ${q.text} → ${VERDICT_LABEL[q.verdict]}`)
                  .join('\n');
                navigator.clipboard.writeText(
                  `육지토끼고기 · ${casePublic?.title ?? upperCode}\n\n${text}`
                );
              }}
              className="px-4 py-2 rounded border text-sm"
              style={{ borderColor: BORDER, color: TEXT }}
            >
              <Copy size={14} className="inline mr-1" />
              결과 공유 복사
            </button>
            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-1.5 px-4 py-2 rounded text-sm font-bold"
              style={{ background: AMBER, color: BG }}
            >
              홈으로 <ArrowRight size={14} />
            </button>
          </div>
        </main>
      </div>
    );
  }

  // Fallback
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: BG }}>
      <Loader2 size={24} className="animate-spin" style={{ color: AMBER }} />
    </div>
  );
}
