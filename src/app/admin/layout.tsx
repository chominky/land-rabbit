'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FolderOpen, Flag, History, LogOut, Shield } from 'lucide-react';

const navItems = [
  { href: '/admin/cases', label: 'Cases', icon: FolderOpen },
  { href: '/admin/history', label: 'History', icon: History },
  { href: '/admin/flags', label: 'Flags', icon: Flag },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    try {
      await fetch('/api/admin/login', { method: 'DELETE' });
    } catch {
      // ignore
    }
    router.push('/admin/login');
  }

  // Don't show sidebar on login page
  if (pathname === '/admin/login') {
    return <div data-scope="admin">{children}</div>;
  }

  return (
    <div
      data-scope="admin"
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: 'var(--bg)',
        fontFamily: 'monospace',
      }}
    >
      {/* Sidebar */}
      <aside
        style={{
          width: '220px',
          background: 'var(--surface)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}
      >
        {/* Logo */}
        <div
          style={{
            padding: '24px 20px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Shield size={18} color="var(--accent)" />
            <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '14px', letterSpacing: '0.05em' }}>
              ADMIN
            </span>
          </div>
          <div style={{ color: 'var(--dim)', fontSize: '11px', marginTop: '4px', paddingLeft: '28px' }}>
            육지토끼고기
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '12px 0' }}>
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 20px',
                  color: active ? 'var(--accent)' : 'var(--muted)',
                  background: active ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'transparent',
                  borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
                  textDecoration: 'none',
                  fontSize: '13px',
                  fontWeight: active ? 600 : 400,
                  transition: 'all 0.15s',
                }}
              >
                <Icon size={15} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div style={{ padding: '12px 0', borderTop: '1px solid var(--border)' }}>
          <button
            onClick={handleLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 20px',
              color: 'var(--dim)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '13px',
              width: '100%',
              textAlign: 'left',
            }}
          >
            <LogOut size={15} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, overflow: 'auto' }}>
        {children}
      </main>
    </div>
  );
}
