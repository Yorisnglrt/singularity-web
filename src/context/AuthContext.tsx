'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarInitial: string;
  avatarUrl?: string;
  bio?: string;
  favoriteProducer?: string;
  favoriteTrack?: string;
  favoriteVenue?: string;
  favoriteFestival?: string;
  city?: string;
  favoriteSubgenre?: string;
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
  updateProfile: (data: Partial<User>) => Promise<{ error?: string }>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Supabase handles interactions and counting.

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
          avatarUrl: data.avatar_url,
          bio: data.bio,
          favoriteProducer: data.favorite_producer,
          favoriteTrack: data.favorite_track,
          favoriteVenue: data.favorite_venue,
          favoriteFestival: data.favorite_festival,
          city: data.city,
          favoriteSubgenre: data.favorite_subgenre,
          points: data.points || 0,
          isAdmin: data.is_admin || false,
          createdAt: data.created_at || new Date().toISOString(),
        };
        setUser(userData);

        // Load interactions from Supabase
        const { data: interactionsData } = await supabase
          .from('event_reactions')
          .select('event_id, action')
          .eq('user_id', data.id);
        
        if (interactionsData) {
          setInteractions(interactionsData.map(i => ({
            eventId: i.event_id,
            action: i.action as EventInteraction['action']
          })));
        }
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

  const toggleInteraction = async (eventId: string, action: EventInteraction['action']) => {
    if (!user) return;
    
    // Check if it exists in local state
    const exists = interactions.some(i => i.eventId === eventId && i.action === action);
    
    // Optimistic UI update
    const previous = interactions;
    const updated = exists
      ? interactions.filter(i => !(i.eventId === eventId && i.action === action))
      : [...interactions, { eventId, action }];
    
    setInteractions(updated);

    try {
      if (exists) {
        await supabase
          .from('event_reactions')
          .delete()
          .match({ event_id: eventId, user_id: user.id, action: action });
      } else {
        await supabase
          .from('event_reactions')
          .insert({ event_id: eventId, user_id: user.id, action: action });
      }
    } catch (e) {
      console.error('Failed to toggle interaction in Supabase:', e);
      // Rollback on failure
      setInteractions(previous);
    }
  };

  const updateProfile = async (data: Partial<User>): Promise<{ error?: string }> => {
    if (!user) return { error: 'Not authenticated' };

    try {
      // Map camelCase TS fields back to underscore DB fields
      const dbUpdate: any = {};
      if (data.displayName !== undefined) dbUpdate.display_name = data.displayName;
      if (data.avatarUrl !== undefined) dbUpdate.avatar_url = data.avatarUrl;
      if (data.bio !== undefined) dbUpdate.bio = data.bio;
      if (data.favoriteProducer !== undefined) dbUpdate.favorite_producer = data.favoriteProducer;
      if (data.favoriteTrack !== undefined) dbUpdate.favorite_track = data.favoriteTrack;
      if (data.favoriteVenue !== undefined) dbUpdate.favorite_venue = data.favoriteVenue;
      if (data.favoriteFestival !== undefined) dbUpdate.favorite_festival = data.favoriteFestival;
      if (data.city !== undefined) dbUpdate.city = data.city;
      if (data.favoriteSubgenre !== undefined) dbUpdate.favorite_subgenre = data.favoriteSubgenre;

      const { error } = await supabase
        .from('profiles')
        .update(dbUpdate)
        .eq('id', user.id);

      if (error) return { error: error.message };

      // Update local state
      setUser(prev => prev ? { ...prev, ...data } : null);
      return {};
    } catch (err: any) {
      console.error('Update profile exception:', err);
      return { error: err.message || 'An unexpected error occurred.' };
    }
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
      forgotPassword,
      updateProfile
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
