'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import styles from './CommunityChatBubble.module.css';

interface ChatProfile {
  display_name: string;
  avatar_url?: string;
  is_admin?: boolean;
}

interface ChatMessage {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles?: ChatProfile;
}

const MAX_MESSAGES = 80;
const MAX_CONTENT_LENGTH = 500;

export default function CommunityChatBubble() {
  const { user, openAuthModal } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    });
  }, []);

  // Normalize raw message data into ChatMessage
  const normalizeMessages = useCallback((data: Record<string, unknown>[]): ChatMessage[] => {
    return data.map((msg) => ({
      id: msg.id as string,
      user_id: msg.user_id as string,
      content: msg.content as string,
      created_at: msg.created_at as string,
      profiles: msg.profiles
        ? Array.isArray(msg.profiles)
          ? (msg.profiles[0] as ChatProfile | undefined)
          : (msg.profiles as ChatProfile | undefined)
        : undefined,
    }));
  }, []);

  // Fetch initial messages
  const fetchMessages = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Try with profile join first
      const { data, error: fetchError } = await supabase
        .from('community_chat_messages')
        .select(`
          id,
          user_id,
          content,
          created_at,
          profiles:user_id (
            display_name,
            avatar_url,
            is_admin
          )
        `)
        .order('created_at', { ascending: false })
        .limit(MAX_MESSAGES);

      if (!fetchError && data) {
        setMessages(normalizeMessages(data as Record<string, unknown>[]).reverse());
        return;
      }

      // Fallback: fetch without profile join (e.g. if profiles RLS blocks anon)
      console.warn('Chat: profile join failed, falling back to messages only:', fetchError);
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('community_chat_messages')
        .select('id, user_id, content, created_at')
        .order('created_at', { ascending: false })
        .limit(MAX_MESSAGES);

      if (fallbackError) {
        console.error('Chat fallback fetch error:', fallbackError);
        setError('Unable to load messages.');
        return;
      }

      setMessages(normalizeMessages((fallbackData || []) as Record<string, unknown>[]).reverse());
    } catch (err) {
      console.error('Chat fetch exception:', err);
      setError('Unable to load messages.');
    } finally {
      setLoading(false);
    }
  }, [normalizeMessages]);

  // Fetch a single message by ID (for realtime inserts)
  const fetchSingleMessage = useCallback(async (messageId: string): Promise<ChatMessage | null> => {
    try {
      // Try with profile join
      const { data, error: fetchError } = await supabase
        .from('community_chat_messages')
        .select(`
          id,
          user_id,
          content,
          created_at,
          profiles:user_id (
            display_name,
            avatar_url,
            is_admin
          )
        `)
        .eq('id', messageId)
        .single();

      if (!fetchError && data) {
        return normalizeMessages([data as Record<string, unknown>])[0] ?? null;
      }

      // Fallback: fetch without profile join
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('community_chat_messages')
        .select('id, user_id, content, created_at')
        .eq('id', messageId)
        .single();

      if (fallbackError || !fallbackData) return null;
      return normalizeMessages([fallbackData as Record<string, unknown>])[0] ?? null;
    } catch {
      return null;
    }
  }, [normalizeMessages]);

  // Subscribe to realtime inserts
  useEffect(() => {
    if (!isOpen) return;

    fetchMessages();

    const channel = supabase
      .channel('community-chat')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'community_chat_messages',
        },
        async (payload) => {
          const newId = payload.new?.id as string | undefined;
          if (!newId) return;

          // Fetch full message with profile join
          const fullMessage = await fetchSingleMessage(newId);
          if (!fullMessage) return;

          setMessages((prev) => {
            // Deduplicate
            if (prev.some((m) => m.id === fullMessage.id)) return prev;
            const updated = [...prev, fullMessage];
            // Keep only the latest MAX_MESSAGES
            if (updated.length > MAX_MESSAGES) {
              return updated.slice(updated.length - MAX_MESSAGES);
            }
            return updated;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, fetchMessages, fetchSingleMessage]);

  // Scroll to bottom when messages change or panel opens
  useEffect(() => {
    if (isOpen && messages.length > 0) {
      scrollToBottom();
    }
  }, [isOpen, messages.length, scrollToBottom]);

  // Send message
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const trimmed = content.trim();
    if (!trimmed) return;
    if (trimmed.length > MAX_CONTENT_LENGTH) {
      setError(`Message too long (max ${MAX_CONTENT_LENGTH} characters)`);
      return;
    }

    setSending(true);
    setError('');

    try {
      const { error: insertError } = await supabase
        .from('community_chat_messages')
        .insert({
          user_id: user.id,
          content: trimmed,
        });

      if (insertError) {
        console.error('Chat send error:', insertError);
        setError('Failed to send message.');
        return;
      }

      setContent('');
    } catch (err) {
      console.error('Chat send exception:', err);
      setError('Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const toggleOpen = () => setIsOpen((prev) => !prev);

  return (
    <div className={styles.container}>
      {/* Chat panel */}
      {isOpen && (
        <div className={styles.panel} ref={panelRef}>
          <div className={styles.header}>
            <div className={styles.headerLeft}>
              <span className={styles.headerDot} />
              <span className={styles.headerTitle}>Live Community Chat</span>
            </div>
            <button
              className={styles.closeBtn}
              onClick={() => setIsOpen(false)}
              aria-label="Close chat"
            >
              ✕
            </button>
          </div>

          <div className={styles.messageList}>
            {loading ? (
              <div className={styles.statusMessage}>Loading messages…</div>
            ) : error && messages.length === 0 ? (
              <div className={styles.statusMessage}>{error}</div>
            ) : messages.length === 0 ? (
              <div className={styles.statusMessage}>
                No messages yet. Start the conversation!
              </div>
            ) : (
              messages.map((msg) => {
                const isOwn = user?.id === msg.user_id;
                const displayName = msg.profiles?.display_name || 'Member';
                const isAdmin = msg.profiles?.is_admin;

                return (
                  <div
                    key={msg.id}
                    className={`${styles.messageBubble} ${isOwn ? styles.own : styles.other}`}
                  >
                    {!isOwn && (
                      <div className={styles.messageAuthor}>
                        <span className={styles.authorName}>{displayName}</span>
                        {isAdmin && <span className={styles.adminBadge}>🔶</span>}
                      </div>
                    )}
                    <div className={styles.messageContent}>{msg.content}</div>
                    <div className={styles.messageTime}>{formatTime(msg.created_at)}</div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {error && messages.length > 0 && (
            <div className={styles.inlineError}>{error}</div>
          )}

          {user ? (
            <form onSubmit={handleSend} className={styles.inputArea}>
              <input
                type="text"
                className={styles.input}
                placeholder="Type a message…"
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  if (error) setError('');
                }}
                maxLength={MAX_CONTENT_LENGTH}
                disabled={sending}
                autoComplete="off"
              />
              <button
                type="submit"
                className={styles.sendBtn}
                disabled={sending || !content.trim()}
                aria-label="Send message"
              >
                {sending ? '…' : '↑'}
              </button>
            </form>
          ) : (
            <div className={styles.loginPrompt}>
              <button onClick={openAuthModal} className={styles.loginBtn}>
                Log in to join the chat
              </button>
            </div>
          )}
        </div>
      )}

      {/* Floating bubble */}
      <button
        className={`${styles.bubble} ${isOpen ? styles.bubbleActive : ''}`}
        onClick={toggleOpen}
        aria-label={isOpen ? 'Close community chat' : 'Open community chat'}
      >
        <span className={styles.bubbleIcon}>{isOpen ? '✕' : '💬'}</span>
      </button>
    </div>
  );
}
