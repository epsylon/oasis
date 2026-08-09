const truthy = (v) => v === true || v === 1 || v === '1' || v === 'on' || v === 'true';

const hasAnyInterval = (weekly, monthly, yearly) => truthy(weekly) || truthy(monthly) || truthy(yearly);

const expandRecurrence = (firstDate, until, weekly, monthly, yearly) => {
  const start = new Date(firstDate);
  if (isNaN(start.getTime())) return [];
  const out = [start];
  if (!until || !hasAnyInterval(weekly, monthly, yearly)) return out;
  const end = new Date(until).getTime();
  if (!Number.isFinite(end)) return out;
  const seen = new Set([start.getTime()]);
  const walk = (mutate) => {
    const n = new Date(start);
    mutate(n);
    let guard = 0;
    while (n.getTime() <= end && guard++ < 5000) {
      const t = n.getTime();
      if (!seen.has(t)) { seen.add(t); out.push(new Date(n)); }
      mutate(n);
    }
  };
  if (truthy(weekly)) walk((d) => d.setUTCDate(d.getUTCDate() + 7));
  if (truthy(monthly)) walk((d) => d.setUTCMonth(d.getUTCMonth() + 1));
  if (truthy(yearly)) walk((d) => d.setUTCFullYear(d.getUTCFullYear() + 1));
  return out.sort((a, b) => a.getTime() - b.getTime());
};

const nextOccurrence = (firstDate, until, weekly, monthly, yearly, from = Date.now()) => {
  const list = expandRecurrence(firstDate, until, weekly, monthly, yearly);
  for (const d of list) if (d.getTime() >= from) return d;
  return list.length ? list[list.length - 1] : null;
};

const upcomingOccurrences = (firstDate, until, weekly, monthly, yearly, limit = 12, from = Date.now()) =>
  expandRecurrence(firstDate, until, weekly, monthly, yearly)
    .filter(d => d.getTime() >= from)
    .slice(0, limit);

module.exports = { truthy, hasAnyInterval, expandRecurrence, nextOccurrence, upcomingOccurrences };
