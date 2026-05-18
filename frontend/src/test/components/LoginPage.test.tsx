import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ApiProvider } from '../../api/ApiProvider';
import { LoginPage } from '../../pages/LoginPage';
import { makeFakeClient } from '../support/factories';

vi.mock('../../api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/auth')>()),
  storeSession: vi.fn(),
}));

function renderLogin(clientOverrides = {}, onAuth = vi.fn()) {
  const client = makeFakeClient(clientOverrides);
  render(
    <ApiProvider client={client}>
      <MemoryRouter>
        <LoginPage onAuth={onAuth} />
      </MemoryRouter>
    </ApiProvider>
  );
  return { client, onAuth };
}

describe('LoginPage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  test('renders Sign In tab active by default', () => {
    renderLogin();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
  });

  test('switches to Sign Up mode when tab clicked', () => {
    renderLogin();
    fireEvent.click(screen.getByText('Sign Up'));
    expect(screen.getByPlaceholderText('At least 8 characters')).toBeInTheDocument();
  });

  test('submits login form and calls onAuth', async () => {
    const onAuth = vi.fn();
    renderLogin({}, onAuth);
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'a@a.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'password123' } });
    fireEvent.submit(document.querySelector('form')!);
    await waitFor(() => expect(onAuth).toHaveBeenCalledWith({ id: 'u1', email: 'demo@example.com' }));
  });

  test('submits signup form and calls onAuth', async () => {
    const onAuth = vi.fn();
    renderLogin({}, onAuth);
    fireEvent.click(screen.getByText('Sign Up'));
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'new@a.com' } });
    fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByText('Create Account'));
    await waitFor(() => expect(onAuth).toHaveBeenCalled());
  });

  test('shows error when login returns no token', async () => {
    renderLogin({ login: vi.fn(async () => ({})) });
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'a@a.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'wrongpass' } });
    fireEvent.submit(document.querySelector('form')!);
    await waitFor(() => expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument());
  });

  test('shows error on unexpected exception', async () => {
    renderLogin({ login: vi.fn(async () => { throw new Error('network'); }) });
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'a@a.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'password123' } });
    fireEvent.submit(document.querySelector('form')!);
    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeInTheDocument());
  });

  test('Google button calls loginWithGoogle and onAuth', async () => {
    const onAuth = vi.fn();
    renderLogin({}, onAuth);
    fireEvent.click(screen.getByText('Continue with Google'));
    await waitFor(() => expect(onAuth).toHaveBeenCalledWith({ id: 'u1', email: 'demo@example.com' }));
  });

  test('shows error when Google sign-in throws', async () => {
    renderLogin({ loginWithGoogle: vi.fn(async () => { throw new Error('offline'); }) });
    fireEvent.click(screen.getByText('Continue with Google'));
    await waitFor(() => expect(screen.getByText(/google sign-in unavailable/i)).toBeInTheDocument());
  });

  test('clears error when switching tabs', async () => {
    renderLogin({ login: vi.fn(async () => ({})) });
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'a@a.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'wrongpass' } });
    fireEvent.submit(document.querySelector('form')!);
    await waitFor(() => expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument());
    fireEvent.click(screen.getByText('Sign Up'));
    expect(screen.queryByText(/invalid email or password/i)).not.toBeInTheDocument();
  });
});
