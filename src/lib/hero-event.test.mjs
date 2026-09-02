import assert from 'node:assert/strict';
import test from 'node:test';
import { formatHeroEventDate, getEventCalendarDate, getEventTargetDate, isFutureTarget } from './hero-event.ts';

const event = { date: '2026-10-10T23:00:00Z', time: '21:00 - 03:00' };

test('formats a calendar date without timezone drift', () => {
  assert.equal(getEventCalendarDate(event), '2026-10-10');
  assert.equal(formatHeroEventDate(event), '10 OCT 2026');
});

test('builds countdown target from the same event date and start time', () => {
  assert.equal(getEventTargetDate(event), '2026-10-10T21:00:00');
});

test('recognizes future, past, and invalid countdown targets', () => {
  const now = new Date('2026-10-10T20:00:00').getTime();
  assert.equal(isFutureTarget('2026-10-10T21:00:00', now), true);
  assert.equal(isFutureTarget('2026-10-10T19:00:00', now), false);
  assert.equal(isFutureTarget('', now), false);
});
