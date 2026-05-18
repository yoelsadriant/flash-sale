import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../api/ApiProvider';
import { storeSession } from '../api/auth';
import { User } from '../interfaces';

type Mode = 'login' | 'signup';

interface Props {
  onAuth: (user: User) => void;
}

export function LoginPage({ onAuth }: Props) {
  const api = useApi();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      let result: { token?: string; user?: User; error?: string } = {};
      if (mode === 'signup') {
        result = await api.signup(email.trim(), password);
        if (!result.token) {
          setError(result.error ?? 'Sign up failed. That email may already be in use.');
          return;
        }
      } else {
        result = await api.login(email.trim(), password);
        if (!result.token) {
          setError(result.error ?? 'Invalid email or password.');
          return;
        }
      }
      storeSession(result.token!, result.user!);
      onAuth(result.user!);
      navigate('/');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setLoading(true);
    try {
      const result = await api.loginWithGoogle();
      storeSession(result.token, result.user);
      onAuth(result.user);
      navigate('/');
    } catch {
      setError('Google sign-in unavailable in offline mode.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      {/* Logo */}
      <div style={{ marginBottom: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>⚡</div>
        <div style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.03em' }}>
          FlashSale
        </div>
        <div style={{ fontSize: '11px', color: '#ff6b35', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '4px' }}>
          Limited Drops
        </div>
      </div>

      {/* Card */}
      <div style={{
        width: '100%',
        maxWidth: '400px',
        background: '#111',
        border: '1px solid #1e1e1e',
        borderRadius: '16px',
        padding: '32px',
      }}>
        {/* Tab toggle */}
        <div style={{
          display: 'flex',
          background: '#0a0a0a',
          borderRadius: '10px',
          padding: '4px',
          marginBottom: '28px',
          border: '1px solid #1a1a1a',
        }}>
          {(['login', 'signup'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(null); }}
              style={{
                flex: 1,
                padding: '8px',
                borderRadius: '8px',
                border: 'none',
                background: mode === m ? 'linear-gradient(135deg,#ff6b35,#e85d25)' : 'transparent',
                color: mode === m ? '#fff' : '#555',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {m === 'login' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>

        {/* Google button */}
        <button
          onClick={handleGoogle}
          disabled={loading}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            padding: '11px 16px',
            borderRadius: '10px',
            border: '1px solid #2a2a2a',
            background: '#161616',
            color: '#e0e0e0',
            fontSize: '14px',
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            marginBottom: '20px',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLElement).style.background = '#1e1e1e'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '#161616'; }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
            <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <div style={{ flex: 1, height: '1px', background: '#1e1e1e' }} />
          <span style={{ fontSize: '11px', color: '#444', fontWeight: 600 }}>OR</span>
          <div style={{ flex: 1, height: '1px', background: '#1e1e1e' }} />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#888', marginBottom: '6px' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid #2a2a2a',
                background: '#0a0a0a',
                color: '#f0f0f0',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s',
              }}
              onFocus={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#ff6b35'; }}
              onBlur={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#2a2a2a'; }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#888', marginBottom: '6px' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
              required
              minLength={mode === 'signup' ? 8 : 1}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid #2a2a2a',
                background: '#0a0a0a',
                color: '#f0f0f0',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s',
              }}
              onFocus={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#ff6b35'; }}
              onBlur={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#2a2a2a'; }}
            />
          </div>

          {error && (
            <div style={{
              marginBottom: '16px',
              padding: '10px 12px',
              borderRadius: '8px',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.25)',
              color: '#f87171',
              fontSize: '13px',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '10px',
              border: 'none',
              background: loading ? '#333' : 'linear-gradient(135deg,#ff6b35,#e85d25)',
              color: '#fff',
              fontWeight: 700,
              fontSize: '14px',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLElement).style.opacity = '0.88'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
          >
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>
      </div>

      <p style={{ marginTop: '24px', fontSize: '12px', color: '#333' }}>
        Flash sales. One item. One shot.
      </p>
    </div>
  );
}
