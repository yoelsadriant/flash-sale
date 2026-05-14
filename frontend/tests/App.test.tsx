import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from '../src/App';

vi.mock('../src/api/auth', () => ({
  getUser: vi.fn(() => null),
  getAuthHeaders: vi.fn(() => ({})),
  storeSession: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('../src/pages/LoginPage', () => ({
  LoginPage: ({ onAuth }: { onAuth: (u: unknown) => void }) => (
    <button onClick={() => onAuth({ id: 'u1', email: 'a@a.com' })}>MockLogin</button>
  ),
}));

vi.mock('../src/pages/HomePage', () => ({
  HomePage: ({ user }: { user: { email: string } | null }) => (
    <div>MockHome:{user ? user.email : 'guest'}</div>
  ),
}));

import { getUser } from '../src/api/auth';
const mockGetUser = getUser as ReturnType<typeof vi.fn>;

describe('App routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, '', '/');
  });

  test('renders HomePage at / when no user (guest)', () => {
    mockGetUser.mockReturnValue(null);
    render(<App />);
    expect(screen.getByText('MockHome:guest')).toBeInTheDocument();
  });

  test('renders HomePage at / when user is authenticated', () => {
    mockGetUser.mockReturnValue({ id: 'u1', email: 'alice@example.com' });
    render(<App />);
    expect(screen.getByText('MockHome:alice@example.com')).toBeInTheDocument();
  });

  test('redirects /login to / when user is already authenticated', () => {
    mockGetUser.mockReturnValue({ id: 'u1', email: 'alice@example.com' });
    window.history.pushState({}, '', '/login');
    render(<App />);
    expect(screen.getByText('MockHome:alice@example.com')).toBeInTheDocument();
  });

  test('shows LoginPage at /login when not authenticated', () => {
    mockGetUser.mockReturnValue(null);
    window.history.pushState({}, '', '/login');
    render(<App />);
    expect(screen.getByText('MockLogin')).toBeInTheDocument();
  });

  test('wildcard route redirects to / (shows home as guest when not authenticated)', () => {
    mockGetUser.mockReturnValue(null);
    window.history.pushState({}, '', '/some/unknown/path');
    render(<App />);
    expect(screen.getByText('MockHome:guest')).toBeInTheDocument();
  });
});
