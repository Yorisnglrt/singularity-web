'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarInitial: string;
  points: number;
  createdAt: string;
}

export interface EventInteraction {
  eventId: string;
  action: 'like' | 'interested' | 'attending';
}

interface AuthContextType {
  user: User | null;
  interactions: EventInteraction[];
  login: (email: string, password: string) => Promise<{ error?: string }>;
  register: (email: string, password: string, displayName: string) => Promise<{ error?: string }>;
  logout: () => void;
  toggleInteraction: (eventId: string, action: EventInteraction['action']) => void;
  hasInteraction: (eventId: string, action: EventInteraction['action']) => boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const STORAGE_USERS_KEY = 'sc_users';
const STORAGE_SESSION_KEY = 'sc_session';
const STORAGE_INTERACTIONS_KEY = 'sc_interactions';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [interactions, setInteractions] = useState<EventInteraction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load session on mount
  useEffect(() => {
    try {
      const session = localStorage.getItem(STORAGE_SESSION_KEY);
      if (session) {
        const parsed = JSON.parse(session) as User;
        setUser(parsed);
        // Load that user's interactions
        const allInteractions = JSON.parse(localStorage.getItem(STORAGE_INTERACTIONS_KEY) || '{}');
        setInteractions(allInteractions[parsed.id] || []);
      }
    } catch (e) {
      // Corrupt storage, clear it
      localStorage.removeItem(STORAGE_SESSION_KEY);
    }
    setIsLoading(false);
  }, []);

  const getUsers = (): Record<string, { passwordHash: string; user: User }> => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_USERS_KEY) || '{}');
    } catch { return {}; }
  };

  const saveUsers = (users: Record<string, { passwordHash: string; user: User }>) => {
    localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(users));
  };

  // Very simple hash for mock purposes only (NOT for production)
  const mockHash = (str: string) => btoa(str + '_sc_salt');

  const register = async (email: string, password: string, displayName: string): Promise<{ error?: string }> => {
    const users = getUsers();
    const key = email.toLowerCase();
    if (users[key]) return { error: 'An account with this email already exists.' };
    if (password.length < 6) return { error: 'Password must be at least 6 characters.' };

    const newUser: User = {
      id: `user_${Date.now()}`,
      email: key,
      displayName: displayName || email.split('@')[0],
      avatarInitial: (displayName || email)[0].toUpperCase(),
      points: 0,
      createdAt: new Date().toISOString(),
    };
    users[key] = { passwordHash: mockHash(password), user: newUser };
    saveUsers(users);
    localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(newUser));
    setUser(newUser);
    setInteractions([]);
    return {};
  };

  const login = async (email: string, password: string): Promise<{ error?: string }> => {
    const users = getUsers();
    const key = email.toLowerCase();
    const record = users[key];
    if (!record) return { error: 'No account found with this email.' };
    if (record.passwordHash !== mockHash(password)) return { error: 'Incorrect password.' };

    localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(record.user));
    setUser(record.user);
    const allInteractions = JSON.parse(localStorage.getItem(STORAGE_INTERACTIONS_KEY) || '{}');
    setInteractions(allInteractions[record.user.id] || []);
    return {};
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_SESSION_KEY);
    setUser(null);
    setInteractions([]);
  };

  const toggleInteraction = (eventId: string, action: EventInteraction['action']) => {
    if (!user) return;
    const exists = interactions.find(i => i.eventId === eventId && i.action === action);
    const updated = exists
      ? interactions.filter(i => !(i.eventId === eventId && i.action === action))
      : [...interactions, { eventId, action }];

    setInteractions(updated);
    const allInteractions = JSON.parse(localStorage.getItem(STORAGE_INTERACTIONS_KEY) || '{}');
    allInteractions[user.id] = updated;
    localStorage.setItem(STORAGE_INTERACTIONS_KEY, JSON.stringify(allInteractions));
  };

  const hasInteraction = (eventId: string, action: EventInteraction['action']) => {
    return interactions.some(i => i.eventId === eventId && i.action === action);
  };

  return (
    <AuthContext.Provider value={{ user, interactions, login, register, logout, toggleInteraction, hasInteraction, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
