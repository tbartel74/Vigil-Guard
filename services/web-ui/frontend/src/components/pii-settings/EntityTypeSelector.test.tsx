/**
 * EntityTypeSelector Component Tests
 * Sprint 4.2: Frontend testing for PII settings components
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EntityTypeSelector from './EntityTypeSelector';

const mockEntityTypes = [
  {
    id: 'EMAIL_ADDRESS',
    name: 'Email Address',
    category: 'contact',
    description: 'Detects email addresses'
  },
  {
    id: 'PHONE_NUMBER',
    name: 'Phone Number',
    category: 'contact',
    description: 'Detects phone numbers'
  },
  {
    id: 'PESEL',
    name: 'PESEL',
    category: 'polish_id',
    description: 'Polish national identification number'
  }
];

describe('EntityTypeSelector', () => {
  it('renders all entity types', () => {
    render(
      <EntityTypeSelector
        entityTypes={mockEntityTypes}
        selectedEntities={[]}
        onToggle={() => {}}
      />
    );

    expect(screen.getByText('Email Address')).toBeInTheDocument();
    expect(screen.getByText('Phone Number')).toBeInTheDocument();
    expect(screen.getByText('PESEL')).toBeInTheDocument();
  });

  it('displays selected count in header', () => {
    render(
      <EntityTypeSelector
        entityTypes={mockEntityTypes}
        selectedEntities={['EMAIL_ADDRESS', 'PESEL']}
        onToggle={() => {}}
      />
    );

    expect(screen.getByText(/2 selected/)).toBeInTheDocument();
  });

  it('shows category for each entity', () => {
    render(
      <EntityTypeSelector
        entityTypes={mockEntityTypes}
        selectedEntities={[]}
        onToggle={() => {}}
      />
    );

    expect(screen.getAllByText('contact')).toHaveLength(2);
    expect(screen.getByText('polish_id')).toBeInTheDocument();
  });

  it('shows description for each entity', () => {
    render(
      <EntityTypeSelector
        entityTypes={mockEntityTypes}
        selectedEntities={[]}
        onToggle={() => {}}
      />
    );

    expect(screen.getByText('Detects email addresses')).toBeInTheDocument();
    expect(screen.getByText('Detects phone numbers')).toBeInTheDocument();
    expect(screen.getByText('Polish national identification number')).toBeInTheDocument();
  });

  it('checks selected entities', () => {
    render(
      <EntityTypeSelector
        entityTypes={mockEntityTypes}
        selectedEntities={['EMAIL_ADDRESS']}
        onToggle={() => {}}
      />
    );

    const checkboxes = screen.getAllByRole('checkbox');
    const emailCheckbox = checkboxes.find(
      (cb) => cb.closest('label')?.textContent?.includes('Email Address')
    );

    expect(emailCheckbox).toBeChecked();
  });

  it('calls onToggle when checkbox is clicked', () => {
    const onToggle = vi.fn();

    render(
      <EntityTypeSelector
        entityTypes={mockEntityTypes}
        selectedEntities={[]}
        onToggle={onToggle}
      />
    );

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);

    expect(onToggle).toHaveBeenCalledWith('EMAIL_ADDRESS');
  });

  it('renders empty state with zero entities', () => {
    render(
      <EntityTypeSelector
        entityTypes={[]}
        selectedEntities={[]}
        onToggle={() => {}}
      />
    );

    expect(screen.getByText(/0 selected/)).toBeInTheDocument();
  });

  it('handles all entities selected', () => {
    render(
      <EntityTypeSelector
        entityTypes={mockEntityTypes}
        selectedEntities={['EMAIL_ADDRESS', 'PHONE_NUMBER', 'PESEL']}
        onToggle={() => {}}
      />
    );

    expect(screen.getByText(/3 selected/)).toBeInTheDocument();

    const checkboxes = screen.getAllByRole('checkbox');
    checkboxes.forEach((checkbox) => {
      expect(checkbox).toBeChecked();
    });
  });
});
