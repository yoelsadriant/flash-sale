import { useEffect, useState } from 'react';
import type { Product, User } from '../lib/types';
import { useProductPurchase } from '../hooks/useProductPurchase';

const STATUS_CONFIG = {
  upcoming: { label: 'SOON',     dot: '#818cf8', bg: 'rgba(129,140,248,0.12)', color: '#818cf8' },
  active:   { label: 'LIVE',     dot: '#22c55e', bg: 'rgba(34,197,94,0.12)',   color: '#22c55e' },
  ended:    { label: 'ENDED',    dot: '#555',    bg: 'rgba(85,85,85,0.12)',     color: '#666'   },
  sold_out: { label: 'SOLD OUT', dot: '#ef4444', bg: 'rgba(239,68,68,0.12)',   color: '#ef4444' },
};

function discountPct(original: number, sale: number) {
  return Math.round((1 - sale / original) * 100);
}

function useCountdown(target: string) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, new Date(target).getTime() - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);

  const total = remaining;
  const s = Math.floor((total / 1000) % 60);
  const m = Math.floor((total / 60000) % 60);
  const h = Math.floor((total / 3600000) % 24);
  const d = Math.floor(total / 86400000);
  return { d, h, m, s, done: total === 0 };
}

function Countdown({ target, label }: { target: string; label: string }) {
  const { d, h, m, s, done } = useCountdown(target);
  if (done) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '10px', color: '#666', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: '#aaa', fontWeight: 700 }}>
        {d > 0 ? `${d}d ` : ''}{String(h).padStart(2,'0')}:{String(m).padStart(2,'0')}:{String(s).padStart(2,'0')}
      </span>
    </div>
  );
}

function StockBar({ stock, initialStock }: { stock: number; initialStock: number }) {
  const pct = initialStock > 0 ? Math.max(0, stock / initialStock) : 0;
  const critical = pct < 0.15;
  const color = critical ? '#ef4444' : '#22c55e';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
        <span style={{ fontSize: '11px', color: '#666' }}>Stock</span>
        <span style={{
          fontSize: '11px', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
          color: critical ? '#ef4444' : '#888',
        }}>
          {stock} / {initialStock}
        </span>
      </div>
      <div style={{ height: '4px', background: '#1e1e1e', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct * 100}%`,
          background: color, borderRadius: '2px',
          transition: 'width 0.4s ease, background 0.3s',
          boxShadow: critical ? `0 0 6px ${color}` : 'none',
        }} />
      </div>
    </div>
  );
}

function BuyButton({
  status, phase, onBuy, user, onLoginRequired,
}: {
  status: Product['status'];
  phase: string;
  onBuy: () => void;
  user: User | null;
  onLoginRequired: () => void;
}) {
  const disabled = status !== 'active'
    || phase === 'ATTEMPTING'
    || phase === 'PURCHASED'
    || phase === 'ALREADY_PURCHASED';

  if (phase === 'PURCHASED' || phase === 'ALREADY_PURCHASED') {
    return (
      <div style={{
        padding: '12px', textAlign: 'center', borderRadius: '12px',
        background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)',
        color: '#22c55e', fontSize: '13px', fontWeight: 700,
      }}>
        ✓ {phase === 'PURCHASED' ? 'Purchase confirmed!' : 'Already purchased'}
      </div>
    );
  }

  if (phase === 'SOLD_OUT' || status === 'sold_out') {
    return (
      <div style={{
        padding: '12px', textAlign: 'center', borderRadius: '12px',
        background: '#141414', border: '1px solid #222',
        color: '#555', fontSize: '13px', fontWeight: 600,
      }}>
        Sold out
      </div>
    );
  }

  if (status === 'ended') {
    return (
      <div style={{
        padding: '12px', textAlign: 'center', borderRadius: '12px',
        background: '#141414', border: '1px solid #222',
        color: '#555', fontSize: '13px', fontWeight: 600,
      }}>
        Sale ended
      </div>
    );
  }

  if (status === 'upcoming') {
    return (
      <div style={{
        padding: '12px', textAlign: 'center', borderRadius: '12px',
        background: 'rgba(129,140,248,0.08)', border: '1px solid rgba(129,140,248,0.2)',
        color: '#818cf8', fontSize: '13px', fontWeight: 600,
      }}>
        Notify me
      </div>
    );
  }

  if (phase === 'ERROR') {
    return (
      <button onClick={user ? onBuy : onLoginRequired} style={{
        width: '100%', padding: '12px', borderRadius: '12px',
        background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
        color: '#ef4444', fontSize: '13px', fontWeight: 700,
      }}>
        Error — Try again
      </button>
    );
  }

  return (
    <button
      onClick={user ? onBuy : onLoginRequired}
      disabled={disabled}
      style={{
        width: '100%', padding: '13px',
        background: disabled ? '#1a1a1a' : 'linear-gradient(135deg,#ff6b35,#e85d25)',
        color: disabled ? '#555' : '#fff',
        fontWeight: 700, fontSize: '14px', borderRadius: '12px',
        border: `1px solid ${disabled ? '#2a2a2a' : 'transparent'}`,
        transition: 'all 0.15s', letterSpacing: '-0.01em',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      onMouseEnter={(e) => { if (!disabled) (e.currentTarget as HTMLElement).style.opacity = '0.88'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
    >
      {phase === 'ATTEMPTING' ? 'Processing…' : 'Buy Now'}
    </button>
  );
}

interface Props {
  product: Product;
  user: User | null;
  onLoginRequired: () => void;
}

export function SaleCard({ product, user, onLoginRequired }: Props) {
  const { state, attempt } = useProductPurchase(product.id, user?.id ?? null);
  const cfg = STATUS_CONFIG[product.status];
  const discount = discountPct(product.originalPrice, product.price);

  return (
    <article style={{
      background: '#111', border: '1px solid #1e1e1e',
      borderRadius: '18px', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      transition: 'border-color 0.2s, transform 0.2s',
      animation: 'fadeUp 0.3s ease both',
    }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = '#2e2e2e';
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = '#1e1e1e';
        (e.currentTarget as HTMLElement).style.transform = 'none';
      }}
    >
      {/* Status badge */}
      <div style={{ position: 'relative' }}>
        <div style={{
          position: 'absolute', top: '12px', right: '12px', zIndex: 1,
          background: cfg.bg, color: cfg.color,
          fontSize: '9px', fontWeight: 800, letterSpacing: '0.12em',
          padding: '4px 8px', borderRadius: '6px',
          display: 'flex', alignItems: 'center', gap: '5px',
        }}>
          <span style={{
            width: '5px', height: '5px', borderRadius: '50%',
            background: cfg.dot, display: 'inline-block',
            animation: product.status === 'active' ? 'pulse 2s infinite' : 'none',
          }} />
          {cfg.label}
        </div>

        {/* Emoji image area */}
        <div style={{
          height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '64px', background: 'linear-gradient(160deg,#161616,#0d0d0d)',
          borderBottom: '1px solid #1a1a1a',
          filter: product.status === 'ended' || product.status === 'sold_out' ? 'grayscale(0.6) opacity(0.7)' : 'none',
        }}>
          {product.emoji}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
        <div>
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#f0f0f0', letterSpacing: '-0.02em', marginBottom: '4px' }}>
            {product.name}
          </h3>
          <p style={{ fontSize: '12px', color: '#555', lineHeight: 1.5 }}>
            {product.description}
          </p>
        </div>

        {/* Price row */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: '22px', fontWeight: 800, color: '#f0f0f0',
            letterSpacing: '-0.03em', fontFamily: "'JetBrains Mono', monospace",
          }}>
            ${product.price.toFixed(2)}
          </span>
          <span style={{ fontSize: '13px', color: '#444', textDecoration: 'line-through' }}>
            ${product.originalPrice.toFixed(2)}
          </span>
          <span style={{
            fontSize: '10px', fontWeight: 700, background: '#ff6b35',
            color: '#fff', padding: '2px 6px', borderRadius: '4px',
          }}>
            -{discount}%
          </span>
        </div>

        {/* Countdown */}
        {product.status === 'upcoming' && (
          <Countdown target={product.saleStart} label="Starts in" />
        )}
        {product.status === 'active' && (
          <Countdown target={product.saleEnd} label="Ends in" />
        )}

        {/* Stock bar — only when relevant */}
        {(product.status === 'active' || product.status === 'sold_out') && (
          <StockBar stock={product.stock} initialStock={product.initialStock} />
        )}

        <BuyButton
          status={product.status}
          phase={state.phase}
          onBuy={attempt}
          user={user}
          onLoginRequired={onLoginRequired}
        />

        {state.phase === 'ERROR' && state.errorMessage && (
          <p style={{ fontSize: '11px', color: '#ef4444', textAlign: 'center' }}>
            {state.errorMessage}
          </p>
        )}
      </div>
    </article>
  );
}
