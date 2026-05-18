import { FilterKey } from '../interfaces';

const TABS: { key: FilterKey; label: string }[] = [
  { key: 'ALL',      label: 'All' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'active',   label: '🔴 Live' },
  { key: 'ended',    label: 'Ended' },
  { key: 'sold_out', label: 'Sold Out' },
];

interface Props {
  active: FilterKey;
  onChange: (key: FilterKey) => void;
}

export function FilterBar({ active, onChange }: Props) {
  return (
    <div style={{
      display: 'flex', gap: '8px', flexWrap: 'wrap',
      padding: '0 0 4px',
    }}>
      {TABS.map(({ key, label }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            style={{
              padding: '8px 16px',
              borderRadius: '999px',
              fontSize: '13px',
              fontWeight: isActive ? 700 : 500,
              background: isActive ? '#ff6b35' : '#1a1a1a',
              color: isActive ? '#fff' : '#888',
              border: `1px solid ${isActive ? '#ff6b35' : '#2a2a2a'}`,
              transition: 'all 0.15s',
              letterSpacing: isActive ? '-0.01em' : '0',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
