async function request(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || `${method} ${path} failed (${res.status})`);
  return json;
}

export const api = {
  get: path => request('GET', path),
  post: (path, body) => request('POST', path, body),
  patch: (path, body) => request('PATCH', path, body),
  put: (path, body) => request('PUT', path, body),
  del: path => request('DELETE', path),
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Today as YYYY-MM-DD (local). Plans now start on any day, not just Monday. */
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Add n days to a YYYY-MM-DD string, returning YYYY-MM-DD (UTC-safe, no TZ drift). */
export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/** Weekday name for a YYYY-MM-DD string. */
export function weekdayOf(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** The 7 days of a plan window: [{ date, weekday }, …] starting at startISO. */
export function planWindow(startISO) {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(startISO, i);
    return { date, weekday: weekdayOf(date) };
  });
}

/** Back-compat alias — start a plan from today rather than the Monday. */
export const currentWeekStart = todayISO;
