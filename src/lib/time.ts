function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatClock(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

export function formatInTimezone(input: Date | string, timeZone: string): string {
  const date = input instanceof Date ? input : new Date(input);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
    timeZoneName: "short",
  }).format(date);
}

export function displayTimestamp(input: Date | string, now: Date = new Date(), timeZone?: string): string {
  const date = input instanceof Date ? input : new Date(input);
  const diffMs = now.getTime() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;

  if (diffMs < minute) return "just now";
  if (diffMs < hour) {
    const mins = Math.max(1, Math.floor(diffMs / minute));
    return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  }
  if (isSameDay(now, date)) {
    const hrs = Math.max(1, Math.floor(diffMs / hour));
    return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(yesterday, date)) {
    return `Yesterday at ${formatClock(date, timeZone)}`;
  }

  const sameWeek = diffMs < 7 * 24 * hour;
  if (sameWeek) {
    const weekday = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      ...(timeZone ? { timeZone } : {}),
    }).format(date);
    return `${weekday} at ${formatClock(date, timeZone)}`;
  }

  const fullDate = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
  return `${fullDate} at ${formatClock(date, timeZone)}`;
}
