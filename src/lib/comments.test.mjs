import assert from 'node:assert/strict';
import test from 'node:test';
import { createPostCommentHandler } from './comments.ts';

const EVENT_ID = '2f86db88-452d-47ab-bf56-4bda23747b31';
const USER_ID = '73b02c13-12f2-4ae5-985c-da586967d636';

function dependencies(overrides = {}) {
  return {
    authenticate: async () => ({ id: USER_ID }),
    eventExists: async () => true,
    insertComment: async ({ eventId, userId, content }) => ({
      id: 'comment-1', event_id: eventId, user_id: userId, content, created_at: '2026-09-02T10:00:00Z',
    }),
    getPublicProfile: async () => ({ display_name: 'Tester', avatar_url: null }),
    ...overrides,
  };
}

function request(content, authenticated = true) {
  return new Request('http://localhost/api/comments', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(authenticated ? { authorization: 'Bearer safe-test-token' } : {}),
    },
    body: JSON.stringify({ content }),
  });
}

test('adds and returns a comment', async () => {
  const response = await createPostCommentHandler(dependencies())(request(' Hello '), EVENT_ID);
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.equal(body.comment.content, 'Hello');
  assert.equal(body.comment.profiles.display_name, 'Tester');
});

test('rejects an unauthenticated user', async () => {
  const response = await createPostCommentHandler(dependencies())(request('Hello', false), EVENT_ID);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'UNAUTHENTICATED');
});

test('rejects a missing event', async () => {
  const response = await createPostCommentHandler(dependencies({ eventExists: async () => false }))(request('Hello'), EVENT_ID);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).code, 'EVENT_NOT_FOUND');
});

test('rejects empty and overlong comments', async () => {
  const handler = createPostCommentHandler(dependencies());
  const empty = await handler(request('   '), EVENT_ID);
  const overlong = await handler(request('x'.repeat(501)), EVENT_ID);
  assert.equal(empty.status, 400);
  assert.equal((await empty.json()).code, 'EMPTY_COMMENT');
  assert.equal(overlong.status, 400);
  assert.equal((await overlong.json()).code, 'COMMENT_TOO_LONG');
});

test('reports a database permission denial without leaking details', async () => {
  const response = await createPostCommentHandler(dependencies({
    insertComment: async () => { throw { code: '42501', message: 'row-level security policy violation' }; },
  }))(request('Hello'), EVENT_ID);
  const body = await response.json();
  assert.equal(response.status, 403);
  assert.equal(body.code, 'COMMENT_INSERT_DENIED');
  assert.equal(JSON.stringify(body).includes('row-level security'), false);
});
