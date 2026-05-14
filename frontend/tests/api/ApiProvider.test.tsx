import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ApiProvider, useApi } from '../../src/api/ApiProvider';
import { makeFakeClient } from '../support/factories';

function ClientConsumer() {
  const client = useApi();
  return <div data-testid="has-client">{typeof client.getProducts}</div>;
}

describe('ApiProvider', () => {
  test('renders children', () => {
    render(
      <ApiProvider client={makeFakeClient()}>
        <span>hello</span>
      </ApiProvider>
    );
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  test('useApi returns the provided client', () => {
    render(
      <ApiProvider client={makeFakeClient()}>
        <ClientConsumer />
      </ApiProvider>
    );
    expect(screen.getByTestId('has-client')).toHaveTextContent('function');
  });

  test('useApi uses default client when no provider prop given', () => {
    render(
      <ApiProvider>
        <ClientConsumer />
      </ApiProvider>
    );
    expect(screen.getByTestId('has-client')).toHaveTextContent('function');
  });
});
