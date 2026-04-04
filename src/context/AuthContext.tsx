'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarInitial: string;
  points: number;
  isAdmin: boolean;
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
  showAuthModal: boolean;
  setShowAuthModal: (show: boolean) => void;
  openAuthModal: () => void;
  forgotPassword: (email: string) => Promise<{ error?: string }>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const STORAGE_INTERACTIONS_KEY = 'sc_interactions';

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [interactions, setInteractions] = useState<EventInteraction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const openAuthModal = () => setShowAuthModal(true);

  // Load session and listen for auth changes
  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await fetchProfile(session.user.id, session.user.email || '');
      }
      setIsLoading(false);
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string, session: any) => {
      if (session?.user) {
        // Fetch profile asynchronously to not block the main auth loop
        fetchProfile(session.user.id, session.user.email || '').finally(() => {
          setIsLoading(false);
        });
      } else {
        setUser(null);
        setInteractions([]);
        setIsLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchProfile = async (id: string, email: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error('Error fetching profile:', error);
        // If profile doesn't exist, we might want to handle it (but signup should create it)
        return;
      }

      if (data) {
        const userData: User = {
          id: data.id,
          email: data.email || email,
          displayName: data.display_name || email.split('@')[0],
          avatarInitial: (data.display_name || email)[0].toUpperCase(),
          points: data.points || 0,
          isAdmin: data.is_admin || false,
          createdAt: data.created_at || new Date().toISOString(),
        };
        setUser(userData);

        // Load interactions from localStorage for now (can be moved to Supabase later)
        const allInteractions = JSON.parse(localStorage.getItem(STORAGE_INTERACTIONS_KEY) || '{}');
        setInteractions(allInteractions[data.id] || []);
      }
    } catch (e) {
      console.error('Failed to fetch profile:', e);
    }
  };

  const register = async (email: string, password: string, displayName: string): Promise<{ error?: string }> => {
    try {
      console.log('REGISTER START', { email, displayName });

      // 1. Sign up user in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName,
          },
        },
      });

      console.log('SIGNUP RESULT', authData);
      console.log('SIGNUP ERROR', authError);

      if (authError) return { error: authError.message };
      if (!authData.user) return { error: 'Registration failed - no user returned.' };

      // 2. Explicitly create or upsert a profile row in the profiles table
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: authData.user.id,
          email: authData.user.email,
          display_name: displayName || '',
          points: 0,
          created_at: new Date().toISOString(),
        });

      if (profileError) {
        console.error('Profile creation error:', profileError);
        // We log the error but the auth user was still created.
        return { error: 'Auth successful, but profile creation failed: ' + profileError.message };
      }

      return {};
    } catch (err: any) {
      console.error('Signup exception:', err);
      return { error: err.message || 'An unexpected error occurred during signup.' };
    }
  };

  const login = async (email: string, password: string): Promise<{ error?: string }> => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) return { error: error.message };
      return {};
    } catch (err: any) {
      console.error('Login exception:', err);
      return { error: err.message || 'An unexpected error occurred during login.' };
    }
  };

  const forgotPassword = async (email: string): Promise<{ error?: string }> => {
    try {
      const siteUrl = typeof window !== 'undefined' ? window.location.origin : 'https://www.singularity-oslo.no';
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${siteUrl}/reset-password`,
      });
      if (error) return { error: error.message };
      return {};
    } catch (err: any) {
      console.error('Forgot password exception:', err);
      return { error: err.message || 'An unexpected error occurred.' };
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setInteractions([]);
    router.push('/');
    router.refresh();
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
    <AuthContext.Provider value={{ 
      user, 
      interactions, 
      login, 
      register, 
      logout, 
      toggleInteraction, 
      hasInteraction, 
      isLoading,
      showAuthModal,
      setShowAuthModal,
      openAuthModal,
      forgotPassword
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
