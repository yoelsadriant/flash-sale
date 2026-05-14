import { useState, type FormEvent } from 'react';
import type { User } from '../lib/types';

interface Props {
  onLogin: (user: User) => void;
  onClose: () => void;
}

export function LoginModal({ onLogin, onClose }: Props) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { setError('Please enter a name'); return; }
    if (trimmed.length < 2) { setError('Name must be at least 2 characters'); return; }

    // Import lazily to avoid circular deps at module level
    import('../api/auth').then(({ registerUser }) => {
      const user = registerUser(trimmed);
      onLogin(user);
    });
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
    }} onClick={onClose}>
      <div style={{
        background: '#141414', border: '1px solid #2a2a2a',
        borderRadius: '20px', padding: '40px', width: '100%', maxWidth: '420px',
        animation: 'fadeUp 0.2s ease',
      }} onClick={(e) => e.stopPropagation()}>
        {/* Icon */}
        <div style={{ fontSize: '40px', textAlign: 'center', marginBottom: '20px' }}>⚡</div>

        <h2 style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '8px', textAlign: 'center' }}>
          Join the Flash Sale
        </h2>
        <p style={{ color: '#666', fontSize: '14px', textAlign: 'center', marginBottom: '32px', lineHeight: 1.5 }}>
          Enter your name to start shopping.<br />One purchase per item, per person.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <input
              autoFocus
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              style={{
                width: '100%', padding: '14px 16px',
                background: '#1a1a1a', border: `1px solid ${error ? '#ef4444' : '#2a2a2a'}`,
                borderRadius: '12px', fontSize: '15px', color: '#f0f0f0',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = '#ff6b35'; }}
              onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = error ? '#ef4444' : '#2a2a2a'; }}
            />
            {error && (
              <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '6px' }}>{error}</p>
            )}
          </div>

          <button type="submit" style={{
            width: '100%', padding: '14px',
            background: 'linear-gradient(135deg, #ff6b35, #e85d25)',
            color: '#fff', fontWeight: 700, fontSize: '15px',
            borderRadius: '12px', letterSpacing: '-0.01em',
            transition: 'opacity 0.2s',
          }}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = '0.9'; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = '1'; }}
          >
            Start Shopping →
          </button>
        </form>

        <p style={{ color: '#444', fontSize: '11px', textAlign: 'center', marginTop: '20px' }}>
          No account required · No email · No password
        </p>
      </div>
    </div>
  );
}
