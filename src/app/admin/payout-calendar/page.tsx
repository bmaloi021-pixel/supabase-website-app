
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/client';
import AdminLayout from '@/components/admin/AdminLayout';

type Role = 'admin' | 'user' | 'merchant' | 'accounting';

type DailyStats = {
  date: string;
  totalSales: number;
  totalPayout: number;
  totalRevenue: number;
};

type ChartMetric = 'totalPayout' | 'totalSales' | 'totalRevenue';

type ChartRange = '7d' | '30d' | 'month' | 'all';

const toDateKey = (d: Date) => {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDaysUTC = (d: Date, delta: number) => {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + delta);
  return out;
};

const startOfMonthUTC = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

const addMonthsUTC = (d: Date, delta: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1));

const daysInMonthUTC = (d: Date) => {
  const nextMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  nextMonth.setUTCDate(0);
  return nextMonth.getUTCDate();
};

const formatMonthLabel = (d: Date) =>
  new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);

export default function AdminPayoutCalendarPage() {
  const router = useRouter();
  const supabase = useMemo(() => createAdminClient(), []);
  const authRecoveryStartedRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);

  const [month, setMonth] = useState(() => startOfMonthUTC(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));

  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [stats, setStats] = useState<DailyStats | null>(null);

  const [chartRange, setChartRange] = useState<ChartRange>('7d');
  const [chartMetric, setChartMetric] = useState<ChartMetric>('totalPayout');
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [seriesError, setSeriesError] = useState<string | null>(null);
  const [series, setSeries] = useState<DailyStats[]>([]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
    }).format(value);

  const formatPercent = (value: number) =>
    new Intl.NumberFormat('en-PH', {
      style: 'percent',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number.isFinite(value) ? value : 0);

  const rangeInsights = useMemo(() => {
    const rows = (series ?? []).filter((r) => r && typeof (r as any)?.date === 'string');
    const count = rows.length;
    const totalSales = rows.reduce((sum, r) => sum + Number((r as any)?.totalSales ?? 0), 0);
    const totalPayout = rows.reduce((sum, r) => sum + Number((r as any)?.totalPayout ?? 0), 0);
    const totalRevenue = rows.reduce((sum, r) => sum + Number((r as any)?.totalRevenue ?? 0), 0);

    const byMetric = (metric: ChartMetric) => {
      let min = { date: '', value: Number.POSITIVE_INFINITY };
      let max = { date: '', value: Number.NEGATIVE_INFINITY };
      for (const r of rows) {
        const v = Number((r as any)?.[metric] ?? 0);
        if (v < min.value) min = { date: String((r as any)?.date ?? ''), value: v };
        if (v > max.value) max = { date: String((r as any)?.date ?? ''), value: v };
      }
      if (!Number.isFinite(min.value)) min = { date: '', value: 0 };
      if (!Number.isFinite(max.value)) max = { date: '', value: 0 };
      return { min, max };
    };

    const { min, max } = byMetric(chartMetric);

    const avgSales = count ? totalSales / count : 0;
    const avgPayout = count ? totalPayout / count : 0;
    const avgRevenue = count ? totalRevenue / count : 0;
    const payoutRate = totalSales > 0 ? totalPayout / totalSales : 0;

    return {
      count,
      totalSales,
      totalPayout,
      totalRevenue,
      avgSales,
      avgPayout,
      avgRevenue,
      payoutRate,
      min,
      max,
    };
  }, [series, chartMetric]);

  const chartMeta = useMemo(() => {
    const metricLabel =
      chartMetric === 'totalPayout' ? 'Payout' : chartMetric === 'totalSales' ? 'Sales' : 'Revenue';
    const bucketLabel = chartRange === 'all' ? 'Monthly buckets' : 'Daily buckets';
    const unitLabel = 'PHP';
    const color =
      chartMetric === 'totalPayout'
        ? '#f3cc84'
        : chartMetric === 'totalSales'
          ? '#16a7a1'
          : '#7eb3b0';
    return { metricLabel, bucketLabel, unitLabel, color };
  }, [chartMetric, chartRange]);

  const formatBucketDateLabel = (dateKey: string) => {
    const d = new Date(`${dateKey}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) return dateKey;
    if (chartRange === 'all') {
      return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
    }
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', timeZone: 'UTC' }).format(d);
  };

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
          router.replace('/login');
          return;
        }

        const { data: profileData } = (await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle()) as { data: { role: Role } & Record<string, any> | null };

        const role = String((profileData as any)?.role ?? '').trim().toLowerCase();
        if (!profileData || role !== 'admin') {
          router.replace('/dashboard');
          return;
        }

        setProfile(profileData);
        setLoading(false);
      } catch {
        router.replace('/login');
      }
    };

    checkAuth();
  }, [supabase, router]);

  useEffect(() => {
    const loadSeries = async () => {
      if (!profile) return;
      if (!selectedDate) return;

      setSeriesLoading(true);
      setSeriesError(null);

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        if (chartRange === 'all') {
          const params = new URLSearchParams();
          params.set('mode', 'series');
          params.set('bucket', 'month');

          const res = await fetch(`/api/admin/payout-calendar?${params.toString()}`, {
            headers: {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          });

          const json = await res.json().catch(() => ({} as any));
          if (!res.ok) {
            throw new Error((json as any)?.error ?? 'Failed to fetch payout series');
          }

          setSeries(((json as any)?.series ?? []) as DailyStats[]);
        } else {
          const selected = new Date(`${selectedDate}T00:00:00.000Z`);
          let dateKeys: string[] = [];

          if (chartRange === 'month') {
            const first = startOfMonthUTC(month);
            const dim = daysInMonthUTC(month);
            dateKeys = Array.from({ length: dim }).map((_, i) => toDateKey(addDaysUTC(first, i)));
          } else {
            const daysBack = chartRange === '30d' ? 29 : 6;
            const start = addDaysUTC(selected, -daysBack);
            dateKeys = Array.from({ length: daysBack + 1 }).map((_, i) => toDateKey(addDaysUTC(start, i)));
          }

          const results = await Promise.all(
            dateKeys.map(async (dk) => {
              const params = new URLSearchParams();
              params.set('date', dk);

              const res = await fetch(`/api/admin/payout-calendar?${params.toString()}`, {
                headers: {
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
              });

              const json = await res.json().catch(() => ({} as any));
              if (!res.ok) {
                throw new Error((json as any)?.error ?? `Failed to fetch stats for ${dk}`);
              }

              return ((json as any)?.stats ?? { date: dk, totalSales: 0, totalPayout: 0, totalRevenue: 0 }) as DailyStats;
            })
          );

          setSeries(results);
        }
      } catch (e) {
        setSeries([]);
        setSeriesError((e as any)?.message ?? 'Failed to load chart');
      } finally {
        setSeriesLoading(false);
      }
    };

    loadSeries();
  }, [profile, selectedDate, chartRange, month, supabase]);

  useEffect(() => {
    const loadStats = async () => {
      if (!profile || !selectedDate) return;
      if (authRecoveryStartedRef.current) return;

      setStatsLoading(true);
      setStatsError(null);

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        const params = new URLSearchParams();
        params.set('date', selectedDate);

        const res = await fetch(`/api/admin/payout-calendar?${params.toString()}`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        const json = await res.json().catch(() => ({} as any));
        if (!res.ok) {
          throw new Error((json as any)?.error ?? 'Failed to fetch payout stats');
        }

        setStats((json as any)?.stats ?? null);
      } catch (e) {
        setStats(null);
        const message = (e as any)?.message ?? 'Failed to fetch payout stats';
        setStatsError(message);

        const normalized = String(message).toLowerCase();
        const isAuthIssue =
          normalized.includes('auth session missing') ||
          normalized.includes('session from session_id claim') ||
          normalized.includes('jwt expired') ||
          normalized.includes('invalid jwt') ||
          normalized.includes('unauthorized');

        if (isAuthIssue && !authRecoveryStartedRef.current) {
          authRecoveryStartedRef.current = true;
          router.replace('/login');
        }
      } finally {
        setStatsLoading(false);
      }
    };

    loadStats();
  }, [profile, selectedDate, supabase]);

  if (loading) {
    return (
      <AdminLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-white">Loading...</div>
        </div>
      </AdminLayout>
    );
  }

  const firstDow = month.getUTCDay(); // 0=Sun
  const days = daysInMonthUTC(month);
  const totalCells = Math.ceil((firstDow + days) / 7) * 7;

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const cells = Array.from({ length: totalCells }).map((_, idx) => {
    const dayNum = idx - firstDow + 1;
    if (dayNum < 1 || dayNum > days) {
      return { kind: 'empty' as const, key: `e-${idx}` };
    }
    const date = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), dayNum));
    return { kind: 'day' as const, key: toDateKey(date), dateKey: toDateKey(date), dayNum };
  });

  return (
    <AdminLayout>
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="rounded-[32px] border border-[#1f4e5a]/60 bg-gradient-to-br from-[#0c2735] via-[#0f3445] to-[#071720] p-8 shadow-[0_25px_45px_rgba(0,0,0,0.45)] mb-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-[#f3cc84]"></span>
                  <p className="text-xs uppercase tracking-[0.3em] text-[#7eb3b0]">Payout Calendar</p>
                </div>
                <h1 className="text-3xl font-semibold text-white">Payout Calendar</h1>
                <p className="text-[#9fc3c1] mt-2">Click a date to view payout, sales, and revenue.</p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setMonth((m) => addMonthsUTC(m, -1))}
                  className="rounded-xl border border-[#1c3f4c] bg-[#08131b] px-4 py-2 text-sm text-white hover:bg-white/5 transition"
                >
                  Prev
                </button>
                <div className="text-white font-semibold">{formatMonthLabel(month)}</div>
                <button
                  type="button"
                  onClick={() => setMonth((m) => addMonthsUTC(m, 1))}
                  className="rounded-xl border border-[#1c3f4c] bg-[#08131b] px-4 py-2 text-sm text-white hover:bg-white/5 transition"
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-[#1c3f4c]/60 bg-gradient-to-br from-[#0c2735] to-[#0a1f2c] p-6 shadow-lg">
              <div className="grid grid-cols-7 gap-2 mb-3">
                {dayLabels.map((d) => (
                  <div key={d} className="text-center text-xs uppercase tracking-[0.2em] text-[#7eb3b0]/80">
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-2">
                {cells.map((cell) => {
                  if (cell.kind === 'empty') {
                    return <div key={cell.key} className="h-14 rounded-xl bg-transparent" />;
                  }

                  const isSelected = cell.dateKey === selectedDate;

                  return (
                    <button
                      key={cell.key}
                      type="button"
                      onClick={() => setSelectedDate(cell.dateKey)}
                      className={`h-14 rounded-xl border text-sm font-semibold transition ${
                        isSelected
                          ? 'border-[#16a7a1] bg-[#16a7a1]/15 text-white/90'
                          : 'border-[#1c3f4c] bg-[#08131b]/70 text-[#9fc3c1]/80 hover:bg-white/5'
                      }`}
                    >
                      {cell.dayNum}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="relative overflow-hidden rounded-2xl border border-[#1c3f4c]/50 bg-gradient-to-br from-[#0c2735]/85 via-[#0a1f2c]/75 to-[#071720]/85 p-6 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
                <div className="pointer-events-none absolute inset-0 opacity-40" style={{ background: 'radial-gradient(600px 260px at 20% 0%, rgba(22,167,161,0.35), transparent 60%), radial-gradient(500px 240px at 100% 20%, rgba(243,204,132,0.22), transparent 55%)' }} />
                <div className="relative flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-2 w-2 rounded-full bg-[#16a7a1] shadow-[0_0_0_4px_rgba(22,167,161,0.15)]" />
                      <p className="text-xs uppercase tracking-[0.32em] text-[#7eb3b0]/80">Statistics</p>
                    </div>
                    <h2 className="text-lg font-semibold text-white mt-2">Chart</h2>
                  </div>
                  <select
                    value={chartRange}
                    onChange={(e) => setChartRange(e.target.value as ChartRange)}
                    className="rounded-xl border border-[#1c3f4c]/70 bg-[#08131b]/70 px-3 py-2 text-sm text-white/90 hover:bg-[#08131b]/85 transition"
                  >
                    <option value="7d">Last 7 days</option>
                    <option value="30d">Last 30 days</option>
                    <option value="month">This month</option>
                    <option value="all">All time</option>
                  </select>
                </div>

                <div className="relative mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-[#1c3f4c]/55 bg-[#071720]/25 p-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-[#9fc3c1]/80">Total (range)</p>
                    <p className="text-xl font-semibold text-white mt-2">
                      {chartMetric === 'totalPayout'
                        ? formatCurrency(rangeInsights.totalPayout)
                        : chartMetric === 'totalSales'
                          ? formatCurrency(rangeInsights.totalSales)
                          : formatCurrency(rangeInsights.totalRevenue)}
                    </p>
                    <p className="text-xs text-[#9fc3c1]/75 mt-1">Buckets: {rangeInsights.count}</p>
                  </div>

                  <div className="rounded-2xl border border-[#1c3f4c]/55 bg-[#071720]/25 p-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-[#9fc3c1]/80">Avg per bucket</p>
                    <p className="text-xl font-semibold text-white mt-2">
                      {chartMetric === 'totalPayout'
                        ? formatCurrency(rangeInsights.avgPayout)
                        : chartMetric === 'totalSales'
                          ? formatCurrency(rangeInsights.avgSales)
                          : formatCurrency(rangeInsights.avgRevenue)}
                    </p>
                    <p className="text-xs text-[#9fc3c1]/75 mt-1">
                      Net: {formatCurrency(rangeInsights.totalRevenue)} · Payout rate: {formatPercent(rangeInsights.payoutRate)}
                    </p>
                  </div>
                </div>

                <div className="relative mt-4 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setChartMetric('totalPayout')}
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                      chartMetric === 'totalPayout'
                        ? 'border-[#f3cc84]/70 bg-gradient-to-r from-[#f3cc84]/25 via-[#f3cc84]/10 to-transparent text-white shadow-[0_0_0_4px_rgba(243,204,132,0.10)]'
                        : 'border-[#1c3f4c]/70 bg-[#08131b]/60 text-[#9fc3c1]/80 hover:bg-white/5'
                    }`}
                  >
                    Payout
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartMetric('totalSales')}
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                      chartMetric === 'totalSales'
                        ? 'border-[#16a7a1]/70 bg-gradient-to-r from-[#16a7a1]/25 via-[#16a7a1]/10 to-transparent text-white shadow-[0_0_0_4px_rgba(22,167,161,0.10)]'
                        : 'border-[#1c3f4c]/70 bg-[#08131b]/60 text-[#9fc3c1]/80 hover:bg-white/5'
                    }`}
                  >
                    Sales
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartMetric('totalRevenue')}
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                      chartMetric === 'totalRevenue'
                        ? 'border-[#7eb3b0]/70 bg-gradient-to-r from-[#7eb3b0]/25 via-[#7eb3b0]/10 to-transparent text-white shadow-[0_0_0_4px_rgba(126,179,176,0.10)]'
                        : 'border-[#1c3f4c]/70 bg-[#08131b]/60 text-[#9fc3c1]/80 hover:bg-white/5'
                    }`}
                  >
                    Revenue
                  </button>
                </div>

                <div className="mt-4">
                  {seriesLoading ? (
                    <div className="text-sm text-[#9fc3c1]/80">Loading chart...</div>
                  ) : seriesError ? (
                    <div className="text-sm text-red-300/80">{seriesError}</div>
                  ) : (
                    (() => {
                      const values = (series || []).map((s) => Number((s as any)?.[chartMetric] ?? 0));
                      const max = Math.max(1, ...values);
                      const w = 640;
                      const h = 180;
                      const padX = 10;
                      const padY = 14;
                      const innerW = w - padX * 2;
                      const innerH = h - padY * 2;
                      const n = Math.max(1, values.length);
                      const gap = n > 20 ? 2 : 4;
                      const barW = Math.max(2, Math.floor((innerW - gap * (n - 1)) / n));
                      const color =
                        chartMetric === 'totalPayout'
                          ? '#f3cc84'
                          : chartMetric === 'totalSales'
                            ? '#16a7a1'
                            : '#7eb3b0';
                      const gradientId = `bar-${chartMetric}`;
                      const yTicks = [1, 0.75, 0.5, 0.25, 0];
                      const dates = (series || []).map((s) => String((s as any)?.date ?? '')).filter(Boolean);
                      const firstLabel = dates.length ? formatBucketDateLabel(dates[0]) : '-';
                      const midLabel = dates.length ? formatBucketDateLabel(dates[Math.floor((dates.length - 1) / 2)]) : '-';
                      const lastLabel = dates.length ? formatBucketDateLabel(dates[dates.length - 1]) : '-';

                      return (
                        <div className="rounded-2xl border border-[#1c3f4c]/45 bg-[#071720]/30 p-3">
                          <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[220px]">
                            <defs>
                              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={color} stopOpacity="0.95" />
                                <stop offset="100%" stopColor={color} stopOpacity="0.25" />
                              </linearGradient>
                            </defs>
                            {Array.from({ length: 4 }).map((_, i) => {
                              const y = padY + Math.round((innerH / 4) * i);
                              return (
                                <line
                                  key={`g-${i}`}
                                  x1={padX}
                                  y1={y}
                                  x2={w - padX}
                                  y2={y}
                                  stroke="#1c3f4c"
                                  strokeOpacity="0.22"
                                  strokeWidth="1"
                                />
                              );
                            })}

                            {yTicks.map((t) => {
                              const y = padY + Math.round(innerH - innerH * t);
                              const v = max * t;
                              return (
                                <text
                                  key={`yt-${t}`}
                                  x={padX}
                                  y={y - 2}
                                  fill="#9fc3c1"
                                  opacity="0.65"
                                  fontSize="10"
                                  textAnchor="start"
                                >
                                  {formatCurrency(v)}
                                </text>
                              );
                            })}
                            <line
                              x1={padX}
                              y1={h - padY}
                              x2={w - padX}
                              y2={h - padY}
                              stroke="#1c3f4c"
                              strokeOpacity="0.6"
                              strokeWidth="2"
                            />
                            {values.map((v, i) => {
                              const x = padX + i * (barW + gap);
                              const barH = Math.round((v / max) * innerH);
                              const y = padY + (innerH - barH);
                              return (
                                <g key={series[i]?.date ?? i}>
                                  <rect x={x} y={y} width={barW} height={barH} rx={6} fill={`url(#${gradientId})`} opacity={0.9} />
                                  <title>
                                    {(series[i]?.date ?? '') +
                                      ' - ' +
                                      (chartMetric === 'totalPayout'
                                        ? 'Payout: '
                                        : chartMetric === 'totalSales'
                                          ? 'Sales: '
                                          : 'Revenue: ') +
                                      formatCurrency(Number(v))}
                                  </title>
                                </g>
                              );
                            })}
                          </svg>

                          <div className="mt-2 flex items-center justify-between text-[11px] text-[#9fc3c1]/75">
                            <span>{firstLabel}</span>
                            <span>{midLabel}</span>
                            <span>{lastLabel}</span>
                          </div>

                          <div className="mt-2 flex items-center justify-between text-[11px] text-[#9fc3c1]/80">
                            <span>Min</span>
                            <span>Max: {formatCurrency(max)}</span>
                          </div>

                          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div className="rounded-xl border border-[#1c3f4c]/45 bg-[#08131b]/55 px-3 py-2">
                              <p className="text-[11px] uppercase tracking-[0.22em] text-[#9fc3c1]/75">Best bucket</p>
                              <p className="text-sm font-semibold text-white mt-1">
                                {rangeInsights.max.date ? rangeInsights.max.date : '-'} · {formatCurrency(rangeInsights.max.value)}
                              </p>
                            </div>
                            <div className="rounded-xl border border-[#1c3f4c]/45 bg-[#08131b]/55 px-3 py-2">
                              <p className="text-[11px] uppercase tracking-[0.22em] text-[#9fc3c1]/75">Worst bucket</p>
                              <p className="text-sm font-semibold text-white mt-1">
                                {rangeInsights.min.date ? rangeInsights.min.date : '-'} · {formatCurrency(rangeInsights.min.value)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })()
                  )}
                </div>
              </div>

              <div className="relative overflow-hidden rounded-2xl border border-[#1c3f4c]/50 bg-gradient-to-br from-[#0c2735]/85 via-[#0a1f2c]/75 to-[#071720]/85 p-6 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
                <div className="pointer-events-none absolute inset-0 opacity-35" style={{ background: 'radial-gradient(520px 240px at 0% 0%, rgba(126,179,176,0.30), transparent 55%), radial-gradient(520px 240px at 100% 10%, rgba(22,167,161,0.22), transparent 55%)' }} />
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-white">Selected Day</h2>
                  <span className="text-sm text-[#9fc3c1]/80">{selectedDate}</span>
                </div>

                {statsError ? <div className="text-sm text-red-300/80 mb-3">{statsError}</div> : null}

                <div className="space-y-4">
                  <div className="rounded-2xl border border-[#453310]/40 bg-gradient-to-br from-[#2a1f0d]/60 to-[#1a1308]/45 p-4 shadow-[0_12px_26px_rgba(0,0,0,0.25)]">
                    <p className="text-xs uppercase tracking-[0.25em] text-[#c9a76b]/80">Total Sales</p>
                    <p className="text-2xl font-bold text-white mt-2">
                      {statsLoading ? 'Loading…' : formatCurrency(stats?.totalSales ?? 0)}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[#1c2f4c]/40 bg-gradient-to-br from-[#0d1f35]/60 to-[#081525]/45 p-4 shadow-[0_12px_26px_rgba(0,0,0,0.25)]">
                    <p className="text-xs uppercase tracking-[0.25em] text-[#7ea3c1]/80">Total Payout</p>
                    <p className="text-2xl font-bold text-white mt-2">
                      {statsLoading ? 'Loading…' : formatCurrency(stats?.totalPayout ?? 0)}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[#1f4e5a]/40 bg-gradient-to-br from-[#0c2735]/60 to-[#0a1f2c]/45 p-4 shadow-[0_12px_26px_rgba(0,0,0,0.25)]">
                    <p className="text-xs uppercase tracking-[0.25em] text-[#7eb3b0]/80">Total Revenue</p>
                    <p className="text-2xl font-bold text-white mt-2">
                      {statsLoading ? 'Loading…' : formatCurrency(stats?.totalRevenue ?? 0)}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="rounded-2xl border border-[#1c3f4c]/45 bg-[#071720]/25 p-4">
                      <p className="text-xs uppercase tracking-[0.25em] text-[#9fc3c1]/80">Net (Revenue)</p>
                      <p className="text-lg font-semibold text-white mt-2">
                        {statsLoading ? 'Loading…' : formatCurrency(stats?.totalRevenue ?? 0)}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-[#1c3f4c]/45 bg-[#071720]/25 p-4">
                      <p className="text-xs uppercase tracking-[0.25em] text-[#9fc3c1]/80">Payout rate</p>
                      <p className="text-lg font-semibold text-white mt-2">
                        {statsLoading
                          ? 'Loading…'
                          : formatPercent((stats?.totalSales ?? 0) > 0 ? (stats?.totalPayout ?? 0) / (stats?.totalSales ?? 1) : 0)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
