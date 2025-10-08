import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';

interface User {
  id: number;
  username: string;
  email: string;
  role: 'admin' | 'user';
  can_view_monitoring: boolean;
  can_view_configuration: boolean;
  can_manage_users: boolean;
  force_password_change: boolean;
  timezone: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Get API URL from environment or use proxy path
const API_URL = import.meta.env.VITE_API_URL || '/ui';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load token from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      setToken(storedToken);
      checkAuth();
    } else {
      setLoading(false);
    }
  }, []);

  // Check if current token is valid
  const checkAuth = async () => {
    const currentToken = localStorage.getItem('token');
    if (!currentToken) {
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/auth/verify`, {
        headers: {
          'Authorization': `Bearer ${currentToken}`
        },
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        setToken(currentToken);
      } else {
        // Token is invalid
        localStorage.removeItem('token');
        setUser(null);
        setToken(null);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      localStorage.removeItem('token');
      setUser(null);
      setToken(null);
    } finally {
      setLoading(false);
    }
  };

  // Login function
  const login = async (username: string, password: string) => {
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password }),
        credentials: 'include'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Login failed');
      }

      const data = await response.json();

      // Store token and user
      localStorage.setItem('token', data.token);
      setToken(data.token);
      setUser(data.user);

      return data;
    } catch (error: any) {
      console.error('Login error:', error);
      throw error;
    }
  };

  // Logout function
  const logout = async () => {
    try {
      if (token) {
        await fetch(`${API_URL}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          credentials: 'include'
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear local state regardless
      localStorage.removeItem('token');
      setToken(null);
      setUser(null);
    }
  };

  // Update user function
  const updateUser = (updates: Partial<User>) => {
    if (user) {
      setUser({ ...user, ...updates });
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, checkAuth, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook to use auth context
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Protected route component
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  if (!user) {
    // Redirect to login
    window.location.href = '/ui/login';
    return null;
  }

  return <>{children}</>;
}