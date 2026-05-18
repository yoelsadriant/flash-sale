import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ApiProvider } from '../../api/ApiProvider';
import { HomePage } from '../../pages/HomePage';
import { makeFakeClient, mkProduct } from '../support/factories';

vi.mock('../../api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/auth')>()),
  logout: vi.fn(),
}));

const USER = { id: 'u1', email: 'alice@example.com' };

function renderHome(clientOverrides = {}, onSignOut = vi.fn()) {
  const client = makeFakeClient(clientOverrides);
  render(
    <ApiProvider client={client}>
      <MemoryRouter>
        <HomePage user={USER} onSignOut={onSignOut} />
      </MemoryRouter>
    </ApiProvider>
  );
  return { client, onSignOut };
}

describe('HomePage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  test('shows loading skeletons initially', () => {
    renderHome({ getProducts: vi.fn(() => new Promise(() => {})) });
    // 4 skeleton divs rendered while loading
    const skeletons = document.querySelectorAll('[style*="animation: shimmer"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  test('shows products after load', async () => {
    renderHome({ getProducts: vi.fn(async () => [mkProduct({ name: 'Cool Gadget' })]) });
    await waitFor(() => expect(screen.getByText('Cool Gadget')).toBeInTheDocument());
  });

  test('shows error message when fetch fails', async () => {
    renderHome({ getProducts: vi.fn(async () => { throw new Error('fail'); }) });
    await waitFor(() => expect(screen.getByText('Failed to load sales')).toBeInTheDocument());
  });

  test('shows empty state message when filter matches nothing', async () => {
    const ended = mkProduct({ status: 'ended' });
    renderHome({ getProducts: vi.fn(async () => [ended]) });
    await waitFor(() => expect(screen.getByText('Ended')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Upcoming'));
    await waitFor(() =>
      expect(screen.getByText('No sales in this category right now.')).toBeInTheDocument()
    );
  });

  test('filters products by status', async () => {
    const active = mkProduct({ id: 'A', name: 'Active Item', status: 'active' });
    const ended = mkProduct({ id: 'E', name: 'Ended Item', status: 'ended', saleStart: '2000-01-01T00:00:00Z', saleEnd: '2000-12-31T00:00:00Z' });
    renderHome({ getProducts: vi.fn(async () => [active, ended]) });
    await waitFor(() => expect(screen.getByText('Active Item')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Ended'));
    expect(screen.queryByText('Active Item')).not.toBeInTheDocument();
    expect(screen.getByText('Ended Item')).toBeInTheDocument();
  });

  test('sign out calls logout, onSignOut, and navigates to /login', async () => {
    const { logout } = await import('../../api/auth');
    const onSignOut = vi.fn();
    renderHome({}, onSignOut);
    fireEvent.click(screen.getByText('Sign out'));
    expect(logout).toHaveBeenCalled();
    expect(onSignOut).toHaveBeenCalled();
  });
});
