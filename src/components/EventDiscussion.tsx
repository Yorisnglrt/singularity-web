'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import styles from './EventDiscussion.module.css';

interface Comment {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  profiles?: {
    display_name: string;
    avatar_url?: string;
  };
}

interface EventDiscussionProps {
  eventId: string;
}

export default function EventDiscussion({ eventId }: EventDiscussionProps) {
  const { user, openAuthModal } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fetchComments = async () => {
    try {
      const { data, error } = await supabase
        .from('event_comments')
        .select(`
          id,
          content,
          created_at,
          user_id,
          profiles (
            display_name,
            avatar_url
          )
        `)
        .eq('event_id', eventId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setComments((data as unknown as Comment[]) || []);
    } catch (err: unknown) {
      console.error('Error fetching comments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComments();
  }, [eventId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      openAuthModal();
      return;
    }

    const trimmed = content.trim();
    if (!trimmed) return;
    if (trimmed.length > 500) {
      setError('Comment too long (max 500 characters)');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const { error } = await supabase
        .from('event_comments')
        .insert({
          event_id: eventId,
          user_id: user.id,
          content: trimmed
        });

      if (error) throw error;
      
      setContent('');
      fetchComments();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to post comment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!confirm('Delete this comment?')) return;

    try {
      const { error } = await supabase
        .from('event_comments')
        .delete()
        .eq('id', commentId);

      if (error) throw error;
      
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch (err: unknown) {
      alert('Failed to delete comment: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString('en-GB', { 
      day: 'numeric', 
      month: 'short', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div className={styles.discussion}>
      <h2 className={styles.title}>
        Discussion {comments.length > 0 && <span className={styles.count}>· {comments.length}</span>}
      </h2>

      {user ? (
        <form onSubmit={handleSubmit} className={styles.form}>
          <textarea
            className={styles.textarea}
            placeholder="Write a comment..."
            value={content}
            onChange={e => {
              setContent(e.target.value);
              if (error) setError('');
            }}
            maxLength={500}
            required
            disabled={submitting}
          />
          <div className={styles.formFooter}>
            <span className={styles.charCount}>{content.length}/500</span>
            {error && <span className={styles.error}>{error}</span>}
            <button 
              type="submit" 
              className={styles.submitBtn} 
              disabled={submitting || !content.trim()}
            >
              {submitting ? 'Posting...' : 'Post Comment'}
            </button>
          </div>
        </form>
      ) : (
        <div className={styles.loginPrompt}>
          <p>You must be signed in to join the discussion.</p>
          <button onClick={openAuthModal} className={styles.loginBtn}>
            Sign In
          </button>
        </div>
      )}

      {loading ? (
        <div className={styles.loading}>Loading comments...</div>
      ) : comments.length > 0 ? (
        <div className={styles.commentList}>
          {comments.map(comment => {
            const isOwner = user?.id === comment.user_id;
            const isAdmin = user?.isAdmin;
            const canDelete = isOwner || isAdmin;
            
            return (
              <div key={comment.id} className={styles.comment}>
                <div className={styles.commentHeader}>
                  <Link href={`/profile/${comment.user_id}`} className={styles.authorWrapper}>
                    <div className={styles.authorAvatar}>
                      {comment.profiles?.avatar_url ? (
                        <img src={comment.profiles.avatar_url} alt="" className={styles.avatarImg} />
                      ) : (
                        (comment.profiles?.display_name || '?')[0].toUpperCase()
                      )}
                    </div>
                    <span className={styles.author}>
                      {comment.profiles?.display_name || 'User'}
                    </span>
                  </Link>
                  <span className={styles.timestamp}>
                    {formatDate(comment.created_at)}
                  </span>
                </div>
                <div className={styles.content}>{comment.content}</div>
                {canDelete && (
                  <div className={styles.commentFooter}>
                    <button 
                      onClick={() => handleDelete(comment.id)} 
                      className={styles.deleteBtn}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className={styles.emptyState}>No comments yet. Be the first to start the discussion!</div>
      )}
    </div>
  );
}
