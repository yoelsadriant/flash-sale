import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Header } from '../../components/Header';

const USER = { id: 'abc-1234-def', email: 'test@example.com' };

describe('Header', () => {
  test('displays the user email', () => {
    render(<Header user={USER} onSignOut={() => {}} />);
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
  });

  test('displays truncated user id', () => {
    render(<Header user={USER} onSignOut={() => {}} />);
    expect(screen.getByText('abc-1234')).toBeInTheDocument();
  });

  test('calls onSignOut when sign out button is clicked', () => {
    const onSignOut = vi.fn();
    render(<Header user={USER} onSignOut={onSignOut} />);
    fireEvent.click(screen.getByText('Sign out'));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  test('renders FlashSale brand name', () => {
    render(<Header user={USER} onSignOut={() => {}} />);
    expect(screen.getByText('FlashSale')).toBeInTheDocument();
  });
});
