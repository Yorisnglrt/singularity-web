export const MAX_COMMENT_LENGTH = 500;

export interface CommentRecord {
  id: string;
  event_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

export interface CommentDependencies {
  authenticate(token: string): Promise<{ id: string } | null>;
  eventExists(eventId: string): Promise<boolean>;
  insertComment(input: {
    eventId: string;
    userId: string;
    content: string;
  }): Promise<CommentRecord>;
  getPublicProfile(userId: string): Promise<{
    display_name: string;
    avatar_url?: string | null;
  } | null>;
}

type ApiError = { error: string; code: string };

function jsonError(status: number, code: string, error: string): Response {
  return Response.json({ error, code } satisfies ApiError, { status });
}

export function createPostCommentHandler(dependencies: CommentDependencies) {
  return async function postComment(request: Request, eventId: string): Promise<Response> {
    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return jsonError(401, 'UNAUTHENTICATED', 'You must be signed in to post a comment.');
    }

    const token = authorization.slice('Bearer '.length).trim();
    const user = token ? await dependencies.authenticate(token) : null;
    if (!user) {
      return jsonError(401, 'UNAUTHENTICATED', 'Your session has expired. Please sign in again.');
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError(400, 'INVALID_JSON', 'The comment request is invalid.');
    }

    const content = typeof body === 'object' && body !== null && 'content' in body
      ? (body as { content?: unknown }).content
      : undefined;
    const trimmed = typeof content === 'string' ? content.trim() : '';

    if (!trimmed) {
      return jsonError(400, 'EMPTY_COMMENT', 'Comment cannot be empty.');
    }
    if (trimmed.length > MAX_COMMENT_LENGTH) {
      return jsonError(400, 'COMMENT_TOO_LONG', `Comment is too long (maximum ${MAX_COMMENT_LENGTH} characters).`);
    }
    if (!eventId || !(await dependencies.eventExists(eventId))) {
      return jsonError(404, 'EVENT_NOT_FOUND', 'This event no longer exists.');
    }

    try {
      const comment = await dependencies.insertComment({ eventId, userId: user.id, content: trimmed });
      const profile = await dependencies.getPublicProfile(user.id);
      return Response.json({ comment: { ...comment, profiles: profile ?? undefined } }, { status: 201 });
    } catch (error: unknown) {
      const dbError = error as { code?: string; message?: string; details?: string; hint?: string };
      console.error('[event-comments] insert failed', {
        eventId,
        userId: user.id,
        code: dbError?.code,
        message: dbError?.message,
        details: dbError?.details,
        hint: dbError?.hint,
      });
      return jsonError(403, 'COMMENT_INSERT_DENIED', 'The comment could not be posted. Please try again.');
    }
  };
}
