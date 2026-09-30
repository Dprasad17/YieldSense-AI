import { useState } from 'react';
import { CloudRain, Droplets, Sun, Thermometer, Wind } from 'lucide-react';
import { ChartCard, GroupedBarChart } from '../../components/charts';
import {
  Badge,
  Banner,
  Card,
  CardHeader,
  InfoTip,
  PageHeader,
  ProgressRing,
  SegmentedControl,
  Skeleton,
} from '../../components/ui';
import { ErrorState } from '../../components/ui/States';
import { useWeather, useWeatherOverview } from '../../hooks/queries';
import { formatCount, formatNumber, formatPercent, formatRainfall, formatTemperature } from '../../lib/format';
import { useGlobalFilters } from '../../store/filters';
import s from './app.module.css';

const DEFAULT_REGION = 'India';

type Mode = 'dataset' | 'live';

const FACTORS = [
  {
    key: 'rainfall_adequacy_score',
    label: 'Rainfall adequacy',
    icon: CloudRain,
    color: 'var(--data-water)',
    hint: 'Higher is better',
    invert: false,
  },
  {
    key: 'temperature_stress_risk',
    label: 'Heat stress',
    icon: Thermometer,
    color: 'var(--data-temperature)',
    hint: 'Lower is better',
    invert: true,
  },
  {
    key: 'humidity_balance_score',
    label: 'Humidity balance',
    icon: Droplets,
    color: 'var(--info)',
    hint: 'Higher is better',
    invert: false,
  },
  {
    key: 'sunlight_exposure_score',
    label: 'Sunlight exposure',
    icon: Sun,
    color: 'var(--warning)',
    hint: 'Higher is better',
    invert: false,
  },
] as const;

function scoreTone(v: number, invert: boolean) {
  const good = invert ? 100 - v : v;
  return good >= 70 ? 'success' : good >= 45 ? 'warning' : 'danger';
}

export function WeatherPage() {
  const { filters } = useGlobalFilters();
  const region = filters.region || DEFAULT_REGION;
  const [mode, setMode] = useState<Mode>('dataset');
  const q = useWeather(region, mode === 'live');
  const overview = useWeatherOverview().data;
  const data = q.data;
  const a = data?.analytics;
  const isLive = !!data?.status_claim?.toLowerCase().startsWith('live');
  const fellBack = mode === 'live' && data && !isLive;
  const g = overview?.global_averages;

  const raw = a
    ? {
        rainfall_adequacy_score: formatRainfall(a.average_rainfall_mm),
        temperature_stress_risk: formatTemperature(a.average_temperature_C ?? null),
        humidity_balance_score: formatPercent(a.average_humidity_percent),
        sunlight_exposure_score: `${formatNumber(a.average_sunlight_hours, 1)} h/day`,
      }
    : null;

  const comparison =
    a && g
      ? [
          { label: 'Rainfall', region: (a.average_rainfall_mm / g.rainfall_mm) * 100, global: 100 },
          {
            label: 'Temperature',
            region: ((a.average_temperature_C ?? g.temperature_C) / g.temperature_C) * 100,
            global: 100,
          },
          { label: 'Humidity', region: (a.average_humidity_percent / g.humidity_percent) * 100, global: 100 },
          { label: 'Sunlight', region: (a.average_sunlight_hours / g.sunlight_hours) * 100, global: 100 },
        ]
      : [];
  const biggest = comparison.length
    ? [...comparison].sort((x, y) => Math.abs(y.region - 100) - Math.abs(x.region - 100))[0]
    : null;

  return (
    <div className={s.page}>
      <PageHeader
        title="Weather"
        description={`Climate conditions and their scores for ${data?.region ?? region}.`}
        meta={
          <>
            <Badge tone="info">{data?.region ?? region}</Badge>
            {!filters.region && <Badge>Default region · change it in the context bar</Badge>}
          </>
        }
        actions={
          <SegmentedControl<Mode>
            label="Data source"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'dataset', label: 'Dataset' },
              { value: 'live', label: 'Live (Open-Meteo)' },
            ]}
          />
        }
      />

      {fellBack && (
        <Banner tone="warning">
          Live weather isn’t available for this region right now, so dataset values are shown.
        </Banner>
      )}
      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}

      <div className={s.kpis}>
        {FACTORS.map(f => {
          const v = a ? Number(a[f.key] ?? 0) : null;
          return (
            <Card key={f.key}>
              <div className={s.between} style={{ alignItems: 'flex-start' }}>
                <div className={s.stack} style={{ gap: 'var(--space-1)' }}>
                  <span className={s.row} style={{ gap: 'var(--space-2)', fontWeight: 'var(--weight-medium)' }}>
                    <f.icon size={16} color={f.color} aria-hidden="true" /> {f.label}
                  </span>
                  <span className={s.small}>{f.hint}</span>
                  {v != null && (
                    <Badge tone={scoreTone(v, f.invert)}>
                      {scoreTone(v, f.invert) === 'success'
                        ? 'Favourable'
                        : scoreTone(v, f.invert) === 'warning'
                          ? 'Watch'
                          : 'Unfavourable'}
                    </Badge>
                  )}
                </div>
                {v != null ? (
                  <ProgressRing value={v} label={f.label} color={f.color} size={76} />
                ) : (
                  <Skeleton width={76} height={76} radius={38} />
                )}
              </div>
              <div className={s.muted} style={{ marginTop: 'var(--space-3)' }}>
                {raw ? (
                  <>
                    Average:{' '}
                    <span className={s.num} style={{ color: 'var(--ink)' }}>
                      {raw[f.key]}
                    </span>
                  </>
                ) : (
                  <Skeleton width="60%" />
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <div className={s.grid}>
        <div className={s.s8}>
          <ChartCard
            title="Region vs global average"
            subtitle="Each factor as a percentage of the global average (global = 100)"
            info="Values above 100 mean the region is wetter, warmer, more humid or sunnier than the average across all records."
            summary={
              biggest
                ? `${biggest.label} differs most from the global average at ${Math.round(biggest.region)}.`
                : 'Loading comparison.'
            }
            insight={
              biggest
                ? `${biggest.label} is ${biggest.region >= 100 ? `${Math.round(biggest.region - 100)}% above` : `${Math.round(100 - biggest.region)}% below`} the global average in ${data?.region ?? region}.`
                : undefined
            }
            legend={[
              { label: data?.region ?? region, color: 'data-water' },
              { label: 'Global average', color: 'muted' },
            ]}
            height={280}
          >
            {(c, h) =>
              comparison.length ? (
                <GroupedBarChart
                  data={comparison}
                  colors={c}
                  height={h}
                  fy={v => `${Math.round(v)}`}
                  series={[
                    { key: 'region', label: data?.region ?? region, color: c['data-water'] },
                    { key: 'global', label: 'Global average', color: c.muted },
                  ]}
                  refY={100}
                  refLabel="Global"
                />
              ) : (
                <Skeleton height={h} />
              )
            }
          </ChartCard>
        </div>

        <div className={s.s4}>
          <Card>
            <CardHeader
              title="Overall climate score"
              subtitle="Combined rating of the four factors"
              info="Weighted combination of rainfall adequacy, heat stress (inverted), humidity balance and sunlight exposure, as returned by the weather service."
            />
            {a ? (
              <div className={s.stack} style={{ alignItems: 'center' }}>
                <ProgressRing
                  value={a.overall_weather_score}
                  label="Overall climate score"
                  size={148}
                  stroke={12}
                  color="var(--primary)"
                  display={formatNumber(a.overall_weather_score, 1)}
                />
                <div className={s.stack} style={{ width: '100%', gap: 'var(--space-2)' }}>
                  {FACTORS.map(f => (
                    <div key={f.key} className={s.between}>
                      <span className={s.muted}>{f.label}</span>
                      <span className={s.num}>{formatNumber(Number(a[f.key] ?? 0), 0)}</span>
                    </div>
                  ))}
                </div>
                <p
                  className={s.small}
                  style={{
                    margin: 0,
                    alignSelf: 'flex-start',
                    display: 'flex',
                    gap: 'var(--space-1)',
                    alignItems: 'center',
                  }}
                >
                  {isLive ? 'Based on a live Open-Meteo reading' : `Based on ${formatCount(a.record_count)} records`}
                  <InfoTip
                    text={
                      isLive
                        ? `Source: ${data?.status_claim}`
                        : 'Source: YieldSense dataset (historical records for this region).'
                    }
                  />
                </p>
              </div>
            ) : (
              <Skeleton height={260} />
            )}
          </Card>
        </div>

        {isLive && a && (
          <div className={s.s12}>
            <Card>
              <CardHeader title="Current conditions" subtitle={data?.status_claim} />
              <div className={s.tileGrid}>
                <div className={s.tile}>
                  <div className={s.small}>Temperature</div>
                  <div className={s.num} style={{ fontSize: 'var(--text-xl)' }}>
                    {formatTemperature(a.average_temperature_C ?? null)}
                  </div>
                </div>
                <div className={s.tile}>
                  <div className={s.small}>Humidity</div>
                  <div className={s.num} style={{ fontSize: 'var(--text-xl)' }}>
                    {formatPercent(a.average_humidity_percent)}
                  </div>
                </div>
                <div className={s.tile}>
                  <div className={s.small}>Precipitation today</div>
                  <div className={s.num} style={{ fontSize: 'var(--text-xl)' }}>
                    {formatNumber(a.average_rainfall_mm, 1)} mm
                  </div>
                </div>
                {a.wind_speed_kmh != null && (
                  <div className={s.tile}>
                    <div className={s.small} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <Wind size={12} aria-hidden="true" /> Wind
                    </div>
                    <div className={s.num} style={{ fontSize: 'var(--text-xl)' }}>
                      {formatNumber(a.wind_speed_kmh, 1)} km/h
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
