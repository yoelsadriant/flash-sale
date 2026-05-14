import { useState } from 'react';
import type { User, SaleStatusName } from '../lib/types';
import { useSales } from '../hooks/useSales';
import { Header } from '../components/Header';
import { FilterBar, type FilterKey } from '../components/FilterBar';
import { SaleCard } from '../components/SaleCard';
import { LoginModal } from '../components/LoginModal';
import { logout } from '../api/auth';

interface Props {
  initialUser: User | null;
}

export function HomePage({ initialUser }: Props) {
  const [user, setUser] = useState<User | null>(initialUser);
  const [showLogin, setShowLogin] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('ALL');
  const { sales, loading, error } = useSales();

  const filtered = filter === 'ALL'
    ? sales
    : sales.filter((s) => s.status === (filter as SaleStatusName));

  function handleLogin(u: User) {
    setUser(u);
    setShowLogin(false);
  }

  function handleSignOut() {
    logout();
    setUser(null);
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Header user={user} onSignIn={() => setShowLogin(true)} onSignOut={handleSignOut} />

      {/* Hero */}
      <div style={{ padding: '48px 24px 28px', maxWidth: 'var(--max-w)', margin: '0 auto' }}>
        <span style={{
          fontSize: '10px', fontWeight: 700, letterSpacing: '0.14em',
          color: '#ff6b35', textTransform: 'uppercase', display: 'block', marginBottom: '10px',
        }}>
          ⚡ Limited Time Deals
        </span>
        <h1 style={{
          fontSize: 'clamp(28px,5vw,44px)', fontWeight: 800,
          letterSpacing: '-0.04em', lineHeight: 1.05, marginBottom: '12px',
        }}>
          Flash Sales.
          <br />
          <span style={{ color: '#333' }}>One item. One shot.</span>
        </h1>
        <p style={{ fontSize: '14px', color: '#555', maxWidth: '380px', lineHeight: 1.6 }}>
          Exclusive deals with limited stock. One purchase per item, per person — no bots, no bulk.
        </p>
      </div>

      {/* Filters */}
      <div style={{ padding: '0 24px 20px', maxWidth: 'var(--max-w)', margin: '0 auto' }}>
        <FilterBar active={filter} onChange={setFilter} />
      </div>

      {/* Grid */}
      <main style={{
        padding: '0 24px 80px', maxWidth: 'var(--max-w)', margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))',
        gap: '16px',
      }}>
        {loading && (
          <>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{
                height: '380px', background: '#111', borderRadius: '18px',
                border: '1px solid #1a1a1a',
                backgroundImage: 'linear-gradient(90deg,#111 0%,#1a1a1a 50%,#111 100%)',
                backgroundSize: '800px 100%',
                animation: 'shimmer 1.5s infinite',
              }} />
            ))}
          </>
        )}

        {!loading && error && (
          <p style={{ color: '#ef4444', gridColumn: '1/-1', textAlign: 'center', padding: '40px' }}>
            {error}
          </p>
        )}

        {!loading && !error && filtered.map((product) => (
          <SaleCard
            key={product.id}
            product={product}
            user={user}
            onLoginRequired={() => setShowLogin(true)}
          />
        ))}

        {!loading && !error && filtered.length === 0 && (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '80px 0', color: '#333' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔍</div>
            <p style={{ fontSize: '14px' }}>No sales in this category right now.</p>
          </div>
        )}
      </main>

      {showLogin && (
        <LoginModal onLogin={handleLogin} onClose={() => setShowLogin(false)} />
      )}
    </div>
  );
}
