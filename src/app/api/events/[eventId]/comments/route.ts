import { createClient } from '@supabase/supabase-js';
import { createPostCommentHandler } from '@/lib/comments';

function clientForToken(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await context.params;
  const authorization = request.headers.get('authorization');
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : '';
  const supabase = clientForToken(token);

  const handler = createPostCommentHandler({
    async authenticate(accessToken) {
      const { data, error } = await supabase.auth.getUser(accessToken);
      return error || !data.user ? null : { id: data.user.id };
    },
    async eventExists(id) {
      const { data, error } = await supabase.from('events').select('id').eq('id', id).maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
    async insertComment({ eventId: id, userId, content }) {
      const { data, error } = await supabase
        .from('event_comments')
        .insert({ event_id: id, user_id: userId, content })
        .select('id, event_id, user_id, content, created_at')
        .single();
      if (error) throw error;
      return data;
    },
    async getPublicProfile(userId) {
      const { data } = await supabase
        .from('public_profiles')
        .select('display_name, avatar_url')
        .eq('id', userId)
        .maybeSingle();
      return data;
    },
  });

  try {
    return await handler(request, eventId);
  } catch (error: unknown) {
    const diagnostic = error as { code?: string; message?: string };
    console.error('[event-comments] request failed', {
      eventId,
      code: diagnostic?.code,
      message: diagnostic?.message,
    });
    return Response.json(
      { error: 'The comment could not be posted. Please try again.', code: 'COMMENT_REQUEST_FAILED' },
      { status: 500 },
    );
  }
}
