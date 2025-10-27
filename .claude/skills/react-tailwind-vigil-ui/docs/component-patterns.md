# React Component Patterns for Vigil Guard

## Component Architecture Patterns

### 1. Form Component with Validation
```typescript
import { useState, FormEvent } from 'react';

interface FormData {
  threshold: number;
  enabled: boolean;
}

export default function ConfigForm() {
  const [data, setData] = useState<FormData>({
    threshold: 50,
    enabled: true
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (data.threshold < 0 || data.threshold > 100) {
      newErrors.threshold = 'Threshold must be between 0-100';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    setLoading(true);
    try {
      await api.post('/api/save', data);
      alert('Saved successfully');
    } catch (error) {
      alert('Save failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-text-secondary mb-2">
          Threshold (0-100)
        </label>
        <input
          type="number"
          value={data.threshold}
          onChange={(e) => setData({ ...data, threshold: Number(e.target.value) })}
          className="bg-surface-darker border border-border-subtle rounded-md px-3 py-2 w-full"
        />
        {errors.threshold && (
          <p className="text-red-500 text-sm mt-1">{errors.threshold}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-md"
      >
        {loading ? 'Saving...' : 'Save'}
      </button>
    </form>
  );
}
```

### 2. Data Table with Sorting
```typescript
import { useState } from 'react';

interface TableRow {
  id: number;
  name: string;
  score: number;
  status: string;
}

export default function DataTable({ data }: { data: TableRow[] }) {
  const [sortBy, setSortBy] = useState<keyof TableRow>('score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = [...data].sort((a, b) => {
    const aVal = a[sortBy];
    const bVal = b[sortBy];

    if (typeof aVal === 'string') {
      return sortDir === 'asc'
        ? aVal.localeCompare(bVal as string)
        : (bVal as string).localeCompare(aVal);
    }

    return sortDir === 'asc'
      ? (aVal as number) - (bVal as number)
      : (bVal as number) - (aVal as number);
  });

  return (
    <table className="w-full">
      <thead className="bg-surface-dark border-b border-border-subtle">
        <tr>
          <th
            onClick={() => setSortBy('name')}
            className="px-4 py-3 text-left cursor-pointer hover:bg-surface-darker"
          >
            Name {sortBy === 'name' && (sortDir === 'asc' ? '↑' : '↓')}
          </th>
          <th
            onClick={() => setSortBy('score')}
            className="px-4 py-3 text-left cursor-pointer hover:bg-surface-darker"
          >
            Score {sortBy === 'score' && (sortDir === 'asc' ? '↑' : '↓')}
          </th>
        </tr>
      </thead>
      <tbody>
        {sorted.map(row => (
          <tr key={row.id} className="border-b border-border-muted hover:bg-surface-dark">
            <td className="px-4 py-3">{row.name}</td>
            <td className="px-4 py-3">{row.score}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

### 3. Modal Dialog
```typescript
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export default function Modal({ isOpen, onClose, title, children }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-surface-base border border-border-subtle rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-text-primary">{title}</h2>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
```

### 4. Loading Spinner
```typescript
export function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-4'
  };

  return (
    <div className={`${sizeClasses[size]} border-blue-600 border-t-transparent rounded-full animate-spin`} />
  );
}
```

### 5. Protected Component with Permission
```typescript
import { useAuth } from '../contexts/AuthContext';

interface ProtectedProps {
  permission: 'can_view_monitoring' | 'can_view_configuration' | 'can_manage_users';
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export default function Protected({ permission, children, fallback }: ProtectedProps) {
  const { user } = useAuth();

  if (!user?.permissions[permission]) {
    return fallback || <div className="text-text-secondary">No permission</div>;
  }

  return <>{children}</>;
}

// Usage:
<Protected permission="can_manage_users">
  <UserManagement />
</Protected>
```

## Design System Components

### Button Variants
```typescript
type ButtonVariant = 'primary' | 'secondary' | 'danger';

interface ButtonProps {
  variant?: ButtonVariant;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}

export function Button({ variant = 'primary', onClick, disabled, children }: ButtonProps) {
  const variants = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    secondary: 'bg-surface-dark hover:bg-surface-darker text-text-primary border border-border-subtle',
    danger: 'bg-red-600 hover:bg-red-700 text-white'
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${variants[variant]} px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}
```

### Card Container
```typescript
interface CardProps {
  title?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

export function Card({ title, children, actions }: CardProps) {
  return (
    <div className="bg-surface-dark border border-border-subtle rounded-lg p-6">
      {(title || actions) && (
        <div className="flex justify-between items-center mb-4">
          {title && <h3 className="text-lg font-semibold text-text-primary">{title}</h3>}
          {actions && <div className="flex gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
```

## Custom Hooks

### useLocalStorage
```typescript
import { useState, useEffect } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : initialValue;
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue] as const;
}
```

### useDebounce
```typescript
import { useState, useEffect } from 'react';

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
```

## References
- React docs: https://react.dev
- Tailwind CSS: https://tailwindcss.com
- TypeScript: https://www.typescriptlang.org
- Vigil Guard Design System: `services/web-ui/frontend/tailwind.config.ts`
