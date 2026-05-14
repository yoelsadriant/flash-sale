import { useNavigate } from 'react-router-dom';
import { User } from '@/types';

interface Props {
  user: User | null;
  onSignOut: () => void;
}

export function Header({ user, onSignOut }: Props) {
  const navigate = useNavigate();

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: 'rgba(8,8,8,0.92)', backdropFilter: 'blur(12px)',
      borderBottom: '1px solid #1a1a1a',
    }}>
      <div style={{
        maxWidth: 'var(--max-w)', margin: '0 auto',
        padding: '0 24px', height: '60px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '20px' }}>⚡</span>
          <div>
            <span style={{ fontSize: '15px', fontWeight: 800, letterSpacing: '-0.03em' }}>
              FlashSale
            </span>
            <span style={{
              marginLeft: '8px', fontSize: '10px', fontWeight: 700,
              color: '#ff6b35', letterSpacing: '0.1em', textTransform: 'uppercase',
            }}>
              Limited Drops
            </span>
          </div>
        </div>

        {/* User area */}
        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>{user.email}</div>
              <div style={{ fontSize: '10px', color: '#555', fontFamily: "'JetBrains Mono', monospace" }}>
                {user.id.slice(0, 8)}
              </div>
            </div>
            <button
              onClick={onSignOut}
              style={{
                padding: '7px 14px', borderRadius: '8px',
                background: '#1a1a1a', border: '1px solid #2a2a2a',
                color: '#888', fontSize: '12px', fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#f0f0f0'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#888'; }}
            >
              Sign out
            </button>
          </div>
        ) : (
          <button
            onClick={() => navigate('/login')}
            style={{
              padding: '7px 16px', borderRadius: '8px',
              background: 'linear-gradient(135deg,#ff6b35,#e85d25)',
              border: 'none', color: '#fff',
              fontSize: '12px', fontWeight: 700,
              cursor: 'pointer', transition: 'opacity 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.88'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
          >
            Sign In
          </button>
        )}
      </div>
    </header>
  );
}
