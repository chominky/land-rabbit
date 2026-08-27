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
    <div style={{ padding: '40px', color: '#e8eaf0' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#c8a24e', margin: 0 }}>
          Dashboard
        </h1>
        <p style={{ color: '#5a6070', fontSize: '13px', marginTop: '6px' }}>
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
                background: '#12151c',
                border: '1px solid #2a2e38',
                borderRadius: '8px',
                padding: '24px',
                cursor: 'pointer',
                transition: 'border-color 0.15s',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = '#c8a24e';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = '#2a2e38';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div
                  style={{
                    background: 'rgba(200, 162, 78, 0.12)',
                    borderRadius: '8px',
                    padding: '10px',
                    display: 'inline-flex',
                  }}
                >
                  <Icon size={20} color="#c8a24e" />
                </div>
                <ChevronRight size={16} color="#5a6070" />
              </div>
              <div>
                <div style={{ color: '#e8eaf0', fontWeight: 600, fontSize: '15px', marginBottom: '6px' }}>
                  {title}
                </div>
                <div style={{ color: '#5a6070', fontSize: '12px', lineHeight: '1.6' }}>
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
