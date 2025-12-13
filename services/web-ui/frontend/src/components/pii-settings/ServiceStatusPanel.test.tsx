/**
 * ServiceStatusPanel Component Tests
 * Sprint 4.2: Frontend testing for PII settings components
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ServiceStatusPanel from './ServiceStatusPanel';

describe('ServiceStatusPanel', () => {
  it('renders unknown status when serviceStatus is null', () => {
    render(<ServiceStatusPanel serviceStatus={null} />);

    expect(screen.getByText('Service Status')).toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('renders online status with recognizer count', () => {
    const status = {
      status: 'online' as const,
      version: '1.0.0',
      recognizers_loaded: 15,
      spacy_models: ['en_core_web_lg', 'pl_core_news_lg']
    };

    render(<ServiceStatusPanel serviceStatus={status} />);

    expect(screen.getByText('Online')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('2 loaded')).toBeInTheDocument();
  });

  it('renders offline status with fallback mode', () => {
    const status = {
      status: 'offline' as const,
      error: 'Connection refused'
    };

    render(<ServiceStatusPanel serviceStatus={status} />);

    expect(screen.getByText('Offline')).toBeInTheDocument();
    expect(screen.getByText('Fallback Mode')).toBeInTheDocument();
    expect(screen.getByText('Using regex rules (13 patterns)')).toBeInTheDocument();
  });

  it('displays green indicator for online status', () => {
    const status = {
      status: 'online' as const,
      recognizers_loaded: 10
    };

    render(<ServiceStatusPanel serviceStatus={status} />);

    // Check for green background class
    const container = document.querySelector('.bg-green-500');
    expect(container).toBeInTheDocument();
  });

  it('displays red indicator for offline status', () => {
    const status = {
      status: 'offline' as const
    };

    render(<ServiceStatusPanel serviceStatus={status} />);

    // Check for red background class
    const container = document.querySelector('.bg-red-500');
    expect(container).toBeInTheDocument();
  });

  it('displays gray indicator for null status', () => {
    render(<ServiceStatusPanel serviceStatus={null} />);

    // Check for gray background class
    const container = document.querySelector('.bg-slate-600');
    expect(container).toBeInTheDocument();
  });

  it('handles zero recognizers loaded', () => {
    const status = {
      status: 'online' as const,
      recognizers_loaded: 0,
      spacy_models: []
    };

    render(<ServiceStatusPanel serviceStatus={status} />);

    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('0 loaded')).toBeInTheDocument();
  });
});
