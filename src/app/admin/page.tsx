'use client';

import Link from 'next/link';
import { FolderOpen, Flag, History, ChevronRight } from 'lucide-react';

const cards = [
  {
    href: '/admin/cases',
    icon: FolderOpen,
    title: 'Cases',
    description: '사건 목록 조회 및 관리. 새 사건 추가, 게시/비게시 전환, 삭제.',
  },
  {
    href: '/admin/history',
    icon: History,
    title: 'History',
    description: '플레이어들의 게임 기록 조회. 질문 내역, 최종 추리, 점수 확인.',
  },
  {
    href: '/admin/flags',
    icon: Flag,
    title: 'Flags',
    description: '플레이어가 신고한 판정 로그 확인. 정답 예시 보완에 활용.',
  },
];

export default function AdminDashboardPage() {
  return (
    <div style={{ padding: '40px', color: 'var(--fg)' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--accent)', margin: 0 }}>
          Dashboard
        </h1>
        <p style={{ color: 'var(--dim)', fontSize: '13px', marginTop: '6px' }}>
          육지토끼고기 관리자 패널에 오신 것을 환영합니다.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
        {cards.map(({ href, icon: Icon, title, description }) => (
          <Link
            key={href}
            href={href}
            style={{ textDecoration: 'none' }}
          >
            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '24px',
                cursor: 'pointer',
                transition: 'border-color 0.15s',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div
                  style={{
                    background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                    borderRadius: '8px',
                    padding: '10px',
                    display: 'inline-flex',
                  }}
                >
                  <Icon size={20} color="var(--accent)" />
                </div>
                <ChevronRight size={16} color="var(--dim)" />
              </div>
              <div>
                <div style={{ color: 'var(--fg)', fontWeight: 600, fontSize: '15px', marginBottom: '6px' }}>
                  {title}
                </div>
                <div style={{ color: 'var(--dim)', fontSize: '12px', lineHeight: '1.6' }}>
                  {description}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
