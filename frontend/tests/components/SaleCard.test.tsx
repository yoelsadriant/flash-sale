import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SaleCard } from '../../src/components/SaleCard';
import { ApiProvider } from '../../src/api/ApiProvider';
import { makeFakeClient, mkProduct, mkAttempt, mkRecord } from '../support/factories';

function renderCard(productOverrides = {}, clientOverrides = {}, userId: string | null = 'u1') {
  const product = mkProduct(productOverrides);
  const client = makeFakeClient(clientOverrides);
  render(
    <ApiProvider client={client}>
      <MemoryRouter>
        <SaleCard product={product} userId={userId} />
      </MemoryRouter>
    </ApiProvider>
  );
  return { product, client };
}

describe('SaleCard — rendering', () => {
  test('shows product name and description', () => {
    renderCard();
    expect(screen.getByText('Test Product')).toBeInTheDocument();
    expect(screen.getByText('A test product')).toBeInTheDocument();
  });

  test('shows sale price and original price', () => {
    renderCard();
    expect(screen.getByText('$10.00')).toBeInTheDocument();
    expect(screen.getByText('$20.00')).toBeInTheDocument();
  });

  test('shows discount percentage', () => {
    renderCard();
    expect(screen.getByText('-50%')).toBeInTheDocument();
  });

  test('shows LIVE badge for active product', () => {
    renderCard({ status: 'active' });
    expect(screen.getByText('LIVE')).toBeInTheDocument();
  });

  test('shows SOON badge for upcoming product', () => {
    renderCard({ status: 'upcoming', saleStart: '2099-01-01T00:00:00Z' });
    expect(screen.getByText('SOON')).toBeInTheDocument();
  });

  test('shows SOLD OUT badge for sold_out product', () => {
    renderCard({ status: 'sold_out' });
    expect(screen.getByText('SOLD OUT')).toBeInTheDocument();
  });

  test('shows ENDED badge for ended product', () => {
    renderCard({ status: 'ended' });
    expect(screen.getByText('ENDED')).toBeInTheDocument();
  });

  test('shows stock bar for active product', () => {
    renderCard({ status: 'active', stock: 7, initialStock: 10 });
    expect(screen.getByText('7 / 10')).toBeInTheDocument();
  });

  test('shows "Sold out" text for sold_out product', () => {
    renderCard({ status: 'sold_out', stock: 0, initialStock: 10 });
    expect(screen.getByText('Sold out')).toBeInTheDocument();
  });

  test('shows "Sale ended" text for ended product', () => {
    renderCard({ status: 'ended' });
    expect(screen.getByText('Sale ended')).toBeInTheDocument();
  });

  test('shows "Notify me" for upcoming product', () => {
    renderCard({ status: 'upcoming', saleStart: '2099-01-01T00:00:00Z' });
    expect(screen.getByText('Notify me')).toBeInTheDocument();
  });

  test('shows Buy Now button for active product', () => {
    renderCard({ status: 'active' });
    expect(screen.getByText('Buy Now')).toBeInTheDocument();
  });
});

describe('SaleCard — guest redirect', () => {
  test('clicking Buy Now without userId does not call attemptProductPurchase', async () => {
    const attemptMock = vi.fn(async () => mkAttempt());
    renderCard({ status: 'active' }, { attemptProductPurchase: attemptMock }, null);
    fireEvent.click(screen.getByText('Buy Now'));
    await new Promise(r => setTimeout(r, 50));
    expect(attemptMock).not.toHaveBeenCalled();
  });
});

describe('SaleCard — purchase flow', () => {
  test('shows "Purchase confirmed!" after successful purchase', async () => {
    renderCard({ status: 'active' }, {
      attemptProductPurchase: vi.fn(async () => mkAttempt({ status: 'PURCHASED' })),
    });
    fireEvent.click(screen.getByText('Buy Now'));
    await waitFor(() => expect(screen.getByText('✓ Purchase confirmed!')).toBeInTheDocument());
  });

  test('shows "Already purchased" after ALREADY_PURCHASED', async () => {
    renderCard({ status: 'active' }, {
      attemptProductPurchase: vi.fn(async () => mkAttempt({ status: 'ALREADY_PURCHASED' })),
    });
    fireEvent.click(screen.getByText('Buy Now'));
    await waitFor(() => expect(screen.getByText('✓ Already purchased')).toBeInTheDocument());
  });

  test('shows "Sold out" after SOLD_OUT result', async () => {
    renderCard({ status: 'active' }, {
      attemptProductPurchase: vi.fn(async () => mkAttempt({ status: 'SOLD_OUT' })),
    });
    fireEvent.click(screen.getByText('Buy Now'));
    await waitFor(() => expect(screen.getByText('Sold out')).toBeInTheDocument());
  });

  test('shows "Error — Try again" button on API error', async () => {
    renderCard({ status: 'active' }, {
      attemptProductPurchase: vi.fn(async () => { throw new Error('Network error'); }),
    });
    fireEvent.click(screen.getByText('Buy Now'));
    await waitFor(() => expect(screen.getByText('Error — Try again')).toBeInTheDocument());
  });

  test('shows error message text on API error', async () => {
    renderCard({ status: 'active' }, {
      attemptProductPurchase: vi.fn(async () => { throw new Error('timeout'); }),
    });
    fireEvent.click(screen.getByText('Buy Now'));
    await waitFor(() => expect(screen.getByText('timeout')).toBeInTheDocument());
  });

  test('shows confirmed state from existing purchase on mount', async () => {
    renderCard({ status: 'active' }, {
      getProductPurchase: vi.fn(async () => mkRecord({ status: 'CONFIRMED' })),
    });
    await waitFor(() => expect(screen.getByText('✓ Purchase confirmed!')).toBeInTheDocument());
  });
});
