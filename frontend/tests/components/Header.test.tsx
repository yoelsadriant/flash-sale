import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Header } from '../../src/components/Header';

const USER = { id: 'abc-1234-def', email: 'test@example.com' };

function renderHeader(user: typeof USER | null, onSignOut = vi.fn()) {
  render(
    <MemoryRouter>
      <Header user={user} onSignOut={onSignOut} />
    </MemoryRouter>
  );
}

describe('Header', () => {
  test('displays the user email', () => {
    renderHeader(USER);
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
  });

  test('displays truncated user id', () => {
    renderHeader(USER);
    expect(screen.getByText('abc-1234')).toBeInTheDocument();
  });

  test('calls onSignOut when sign out button is clicked', () => {
    const onSignOut = vi.fn();
    renderHeader(USER, onSignOut);
    fireEvent.click(screen.getByText('Sign out'));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  test('renders FlashSale brand name', () => {
    renderHeader(USER);
    expect(screen.getByText('FlashSale')).toBeInTheDocument();
  });

  test('shows Sign In button when user is null', () => {
    renderHeader(null);
    expect(screen.getByText('Sign In')).toBeInTheDocument();
    expect(screen.queryByText('Sign out')).not.toBeInTheDocument();
  });
});
