'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FileText, Users, FolderOpen, Settings, ArrowUp, ArrowDown } from 'lucide-react';

interface MenuItem {
  label: string;
  icon: React.ReactNode;
  action: () => void;
  disabled?: boolean;
}

export default function HomePage() {
  const router = useRouter();
  const [activeIndex, setActiveIndex] = useState(0);
  const [hasSaves, setHasSaves] = useState(false);
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    try {
      const saves = localStorage.getItem('yesno_saves');
      if (saves) {
        const parsed = JSON.parse(saves);
        setHasSaves(Array.isArray(parsed) ? parsed.length > 0 : Object.keys(parsed).length > 0);
      }
    } catch {
      setHasSaves(false);
    }
  }, []);

  const handleJoinRoom = useCallback(async () => {
    const code = roomCode.trim().toUpperCase();
    const nick = nickname.trim();
    if (!code) {
      setJoinError('방 코드를 입력해 주세요.');
      return;
    }
    if (!nick) {
      setJoinError('닉네임을 입력해 주세요.');
      return;
    }
    setJoining(true);
    setJoinError('');
    try {
      const res = await fetch('/api/rooms', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: code, nickname: nick }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setJoinError(data.error ?? '방을 찾을 수 없습니다.');
        return;
      }
      localStorage.setItem(
        `yesno_player_${code}`,
        JSON.stringify({ playerId: data.playerId, nickname: data.nickname ?? nick }),
      );
      router.push(`/room/${code}`);
    } catch {
      setJoinError('네트워크 오류가 발생했습니다.');
    } finally {
      setJoining(false);
    }
  }, [roomCode, nickname, router]);

  const menuItems: MenuItem[] = [
    {
      label: '새 게임',
      icon: <FileText size={18} />,
      action: () => router.push('/cases'),
    },
    {
      label: '이어하기',
      icon: <FolderOpen size={18} />,
      action: () => {
        if (hasSaves) router.push('/cases?continue=1');
      },
      disabled: !hasSaves,
    },
    {
      label: '방 만들기',
      icon: <Users size={18} />,
      action: () => router.push('/room/create'),
    },
    {
      label: '방 참가',
      icon: <Users size={18} />,
      action: () => setShowRoomModal(true),
    },
    {
      label: '기록',
      icon: <FileText size={18} />,
      action: () => router.push('/history'),
    },
    {
      label: '설정',
      icon: <Settings size={18} />,
      action: () => router.push('/settings'),
    },
  ];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showRoomModal) return;
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex((prev) => (prev - 1 + menuItems.length) % menuItems.length);
          break;
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex((prev) => (prev + 1) % menuItems.length);
          break;
        case 'Enter':
          e.preventDefault();
          menuItems[activeIndex]?.action();
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, showRoomModal, hasSaves]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12 relative"
      style={{ background: 'var(--bg)' }}
    >
      {/* Subtle noise/grid overlay */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent, transparent 39px, color-mix(in srgb, var(--border) 25%, transparent) 39px, color-mix(in srgb, var(--border) 25%, transparent) 40px)',
          opacity: 0.4,
        }}
      />

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-8">
        {/* Title block */}
        <div className="text-center">
          <h1
            className="text-4xl sm:text-5xl font-bold tracking-tight leading-none mb-3"
            style={{ color: 'var(--fg)', letterSpacing: '0.05em' }}
          >
            육지토끼고기
          </h1>
          <p className="text-base" style={{ color: 'var(--muted)' }}>
            삼류 바다거북스프게임
          </p>
        </div>

        {/* Divider */}
        <div className="w-full border-t" style={{ borderColor: 'var(--border)' }} />

        {/* Menu */}
        <nav className="w-full flex flex-col gap-1" aria-label="메인 메뉴">
          {menuItems.map((item, idx) => {
            const isActive = activeIndex === idx;
            const isDisabled = item.disabled;
            return (
              <button
                key={item.label}
                onClick={() => {
                  if (!isDisabled) {
                    setActiveIndex(idx);
                    item.action();
                  }
                }}
                onMouseEnter={() => !isDisabled && setActiveIndex(idx)}
                disabled={isDisabled}
                className={[
                  'w-full flex items-center gap-3 px-4 py-3 rounded text-left transition-all duration-100',
                  isActive && !isDisabled ? 'menu-item-active' : '',
                  isDisabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer',
                ].join(' ')}
                style={{
                  color: isActive && !isDisabled ? 'var(--accent)' : 'var(--fg)',
                  borderLeft: isActive && !isDisabled ? '3px solid var(--accent)' : '3px solid transparent',
                  background: isActive && !isDisabled ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'transparent',
                }}
                aria-current={isActive ? 'true' : undefined}
              >
                <span style={{ color: isActive && !isDisabled ? 'var(--accent)' : 'var(--dim)' }}>
                  {item.icon}
                </span>
                <span className="text-base font-medium">{item.label}</span>
                {item.label === '이어하기' && !hasSaves && (
                  <span className="ml-auto text-xs" style={{ color: 'var(--dim)' }}>
                    저장 없음
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Divider */}
        <div className="w-full border-t" style={{ borderColor: 'var(--border)' }} />

        {/* Keyboard hint */}
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--dim)' }}>
          <ArrowUp size={12} />
          <ArrowDown size={12} />
          <span>이동 · Enter 선택</span>
        </div>

        {/* Footer notice */}
        <p
          className="text-center text-xs leading-relaxed"
          style={{ color: 'var(--dim)', maxWidth: '280px' }}
        >
          이 게임의 판정·힌트·삽화·스토리는 AI로 생성됩니다.
        </p>
      </div>

      {/* Room Join Modal */}
      {showRoomModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'var(--scrim)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowRoomModal(false);
              setRoomCode('');
              setNickname('');
              setJoinError('');
            }
          }}
        >
          <div
            className="w-full max-w-xs rounded-lg p-6 flex flex-col gap-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-base" style={{ color: 'var(--fg)' }}>
                방 참가
              </h2>
              <button
                onClick={() => {
                  setShowRoomModal(false);
                  setRoomCode('');
                  setNickname('');
                  setJoinError('');
                }}
                className="text-lg leading-none"
                style={{ color: 'var(--dim)' }}
                aria-label="닫기"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs tracking-wider uppercase" style={{ color: 'var(--muted)' }}>
                  방 코드
                </span>
                <input
                  type="text"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
                  placeholder="예: ABCD12"
                  maxLength={8}
                  autoFocus
                  className="rounded px-3 py-2 text-sm font-mono outline-none focus:ring-1"
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    color: 'var(--fg)',
                    letterSpacing: '0.15em',
                  }}
                  onFocus={(e) =>
                    (e.currentTarget.style.borderColor = 'var(--accent)')
                  }
                  onBlur={(e) =>
                    (e.currentTarget.style.borderColor = 'var(--border)')
                  }
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs tracking-wider uppercase" style={{ color: 'var(--muted)' }}>
                  닉네임
                </span>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
                  placeholder="탐정 이름"
                  maxLength={20}
                  className="rounded px-3 py-2 text-sm outline-none focus:ring-1"
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    color: 'var(--fg)',
                  }}
                  onFocus={(e) =>
                    (e.currentTarget.style.borderColor = 'var(--accent)')
                  }
                  onBlur={(e) =>
                    (e.currentTarget.style.borderColor = 'var(--border)')
                  }
                />
              </label>
            </div>

            {joinError && (
              <p className="text-xs" style={{ color: 'var(--danger)' }}>
                {joinError}
              </p>
            )}

            <button
              onClick={handleJoinRoom}
              disabled={joining}
              className="w-full py-2.5 rounded text-sm font-semibold tracking-wide transition-opacity"
              style={{
                background: 'var(--accent)',
                color: 'var(--bg)',
                opacity: joining ? 0.6 : 1,
                cursor: joining ? 'not-allowed' : 'pointer',
              }}
            >
              {joining ? '연결 중…' : '입장하기'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
