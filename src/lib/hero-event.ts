import type { Event as AppEvent } from '@/data/events';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function getEventCalendarDate(event?: AppEvent): string {
  const match = event?.date?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}

export function formatHeroEventDate(event?: AppEvent): string {
  const date = getEventCalendarDate(event);
  if (!date) return '';
  const [year, month, day] = date.split('-').map(Number);
  return month >= 1 && month <= 12 ? `${day} ${MONTHS[month - 1]} ${year}` : '';
}

export function getEventTargetDate(event?: AppEvent): string {
  const datePart = getEventCalendarDate(event);
  if (!datePart) return '';

  const timeMatch = event?.time?.match(/([0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?)/);
  if (!timeMatch?.[1]) return event?.date || '';

  let time = timeMatch[1];
  if (time.indexOf(':') === 1) time = `0${time}`;
  if (time.length === 5) time += ':00';
  return `${datePart}T${time}`;
}

export function isFutureTarget(targetDate: string, now = Date.now()): boolean {
  if (!targetDate) return false;
  const target = new Date(targetDate).getTime();
  return Number.isFinite(target) && target > now;
}
