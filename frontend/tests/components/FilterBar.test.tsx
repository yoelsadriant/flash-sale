import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterBar } from '../../src/components/FilterBar';

describe('FilterBar', () => {
  test('renders all five filter tabs', () => {
    render(<FilterBar active="ALL" onChange={() => {}} />);
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
    expect(screen.getByText('🔴 Live')).toBeInTheDocument();
    expect(screen.getByText('Ended')).toBeInTheDocument();
    expect(screen.getByText('Sold Out')).toBeInTheDocument();
  });

  test('calls onChange with correct key when a tab is clicked', () => {
    const onChange = vi.fn();
    render(<FilterBar active="ALL" onChange={onChange} />);
    fireEvent.click(screen.getByText('Upcoming'));
    expect(onChange).toHaveBeenCalledWith('upcoming');
  });

  test('calls onChange with ALL when All tab is clicked', () => {
    const onChange = vi.fn();
    render(<FilterBar active="upcoming" onChange={onChange} />);
    fireEvent.click(screen.getByText('All'));
    expect(onChange).toHaveBeenCalledWith('ALL');
  });

  test('active tab has orange background style', () => {
    render(<FilterBar active="active" onChange={() => {}} />);
    const liveBtn = screen.getByText('🔴 Live');
    expect(liveBtn.style.background).toBe('rgb(255, 107, 53)');
  });

  test('inactive tab has dark background style', () => {
    render(<FilterBar active="ALL" onChange={() => {}} />);
    const upcomingBtn = screen.getByText('Upcoming');
    expect(upcomingBtn.style.background).toBe('rgb(26, 26, 26)');
  });
});
