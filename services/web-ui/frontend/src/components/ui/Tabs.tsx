/**
 * Tabs Component
 *
 * Production-ready accessible tabs using Radix UI primitives.
 *
 * Features:
 * - Full WAI-ARIA compliance (role, aria-*, keyboard navigation)
 * - Automatic keyboard support (Arrow keys, Home, End)
 * - Screen reader announcements
 * - Roving tabindex for focus management
 *
 * Based on: https://www.radix-ui.com/primitives/docs/components/tabs
 */

import * as RadixTabs from '@radix-ui/react-tabs';
import React from 'react';

interface TabsProps {
  defaultValue: string;
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

export function Tabs({ defaultValue, value, onValueChange, children, className = '' }: TabsProps) {
  return (
    <RadixTabs.Root
      defaultValue={defaultValue}
      value={value}
      onValueChange={onValueChange}
      className={className}
      orientation="horizontal"
    >
      {children}
    </RadixTabs.Root>
  );
}

interface TabsListProps {
  children: React.ReactNode;
  className?: string;
}

export function TabsList({ children, className = '' }: TabsListProps) {
  return (
    <RadixTabs.List
      className={`inline-flex items-center gap-1 p-1 rounded-lg bg-slate-900/60 border border-slate-800 ${className}`}
    >
      {children}
    </RadixTabs.List>
  );
}

interface TabsTriggerProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

export function TabsTrigger({ value, children, className = '' }: TabsTriggerProps) {
  return (
    <RadixTabs.Trigger
      value={value}
      className={`
        px-4 py-2 text-sm font-medium rounded-md transition-colors
        data-[state=active]:bg-slate-800 data-[state=active]:text-white data-[state=active]:shadow-sm
        data-[state=inactive]:text-slate-400 data-[state=inactive]:hover:text-white data-[state=inactive]:hover:bg-slate-800/50
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900
        ${className}
      `.trim().replace(/\s+/g, ' ')}
    >
      {children}
    </RadixTabs.Trigger>
  );
}

interface TabsContentProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

export function TabsContent({ value, children, className = '' }: TabsContentProps) {
  return (
    <RadixTabs.Content
      value={value}
      className={className}
      // Prevent unmounting for better performance
      forceMount={undefined}
    >
      {children}
    </RadixTabs.Content>
  );
}
