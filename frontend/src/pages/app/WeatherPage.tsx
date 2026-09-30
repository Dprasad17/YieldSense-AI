import { useState } from 'react';
import { CloudRain, Droplets, Sun, Thermometer, Wind } from 'lucide-react';
import { ChartCard, ComposedRainTempChart, GroupedBarChart, MultiLineChart } from '../../components/charts';
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
import { useClimateTrend, useWeather, useWeatherOverview } from '../../hooks/queries';
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

function tone(v: number, invert: boolean) {
  const good = invert ? 100 - v : v;
  return good >= 70 ? 'success' : good >= 45 ? 'warning' : 'danger';
}

const n = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function WeatherPage() {
  const { filters } = useGlobalFilters();
  const region = filters.region || DEFAULT_REGION;
  const [mode, setMode] = useState<Mode>('dataset');
  const q = useWeather(region, mode === 'live');
  const overview = useWeatherOverview().data?.analytics;
  const climate = useClimateTrend(region);
  const climateData = climate.data;
  const data = q.data;
  const a = data?.analytics;
  const live = data?.mode === 'live';

  const raw = a
    ? {
        rainfall_adequacy_score: live
          ? `${formatNumber(n(a.average_rainfall_mm), 1)} mm over ${data?.period}`
          : formatRainfall(n(a.average_rainfall_mm)),
        temperature_stress_risk: formatTemperature(n(a.average_temperature_C)),
        humidity_balance_score: formatPercent(n(a.average_humidity_percent)),
        sunlight_exposure_score: `${formatNumber(n(a.average_sunlight_hours), 1)} h/day`,
      }
    : null;

  const ratio = (x: number | null, g: number | null) => (x != null && g ? (x / g) * 100 : 0);
  const comparison =
    a && overview && !live
      ? [
          { label: 'Rainfall', region: ratio(n(a.average_rainfall_mm), n(overview.average_rainfall_mm)), global: 100 },
          {
            label: 'Temperature',
            region: ratio(n(a.average_temperature_C), n(overview.average_temperature_C)),
            global: 100,
          },
          {
            label: 'Humidity',
            region: ratio(n(a.average_humidity_percent), n(overview.average_humidity_percent)),
            global: 100,
          },
          {
            label: 'Sunlight',
            region: ratio(n(a.average_sunlight_hours), n(overview.average_sunlight_hours)),
            global: 100,
          },
        ]
      : [];
  const biggest = comparison.length
    ? [...comparison].sort((x, y) => Math.abs(y.region - 100) - Math.abs(x.region - 100))[0]
    : null;
  const forecast = data?.forecast ?? [];

  return (
    <div className={s.page}>
      <PageHeader
        title="Weather"
        description={`Climate conditions and scores for ${data?.region ?? region}${live ? ', live from Open-Meteo' : ', from the dataset'}.`}
        meta={
          <>
            <Badge tone="info">{data?.region ?? region}</Badge>
            {data?.period && <Badge>{data.period}</Badge>}
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

      {q.isError &&
        (mode === 'live' ? (
          <Banner tone="warning">{(q.error as Error).message} Switch back to Dataset to see historical values.</Banner>
        ) : (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ))}

      <div className={s.kpis}>
        {FACTORS.map(f => {
          const v = a ? n(a[f.key]) : null;
          return (
            <Card key={f.key}>
              <div className={s.between} style={{ alignItems: 'flex-start' }}>
                <div className={s.stack} style={{ gap: 'var(--space-1)' }}>
                  <span className={s.row} style={{ gap: 'var(--space-2)', fontWeight: 'var(--weight-medium)' }}>
                    <f.icon size={16} color={f.color} aria-hidden="true" /> {f.label}
                  </span>
                  <span className={s.small}>{f.hint}</span>
                  {v != null && (
                    <Badge tone={tone(v, f.invert)}>
                      {tone(v, f.invert) === 'success'
                        ? 'Favourable'
                        : tone(v, f.invert) === 'warning'
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

      {live && forecast.length > 0 && (
        <Card>
          <CardHeader title="7-day forecast" subtitle={data?.status_claim} />
          <div className={s.tileGrid}>
            {forecast.map(d => (
              <div key={d.date} className={s.tile}>
                <div className={s.small}>
                  {new Date(d.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                </div>
                <div className={s.num} style={{ color: 'var(--data-temperature)', fontSize: 'var(--text-lg)' }}>
                  {formatNumber(d.temp_max_C, 0)}° / {formatNumber(d.temp_min_C, 0)}°
                </div>
                <div className={s.num} style={{ color: 'var(--data-water)' }}>
                  {formatNumber(d.precipitation_mm, 1)} mm
                </div>
                <div className={s.small}>{formatNumber(d.sunshine_hours, 1)} h sun</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className={s.grid}>
        <div className={s.s8}>
          {live ? (
            <ChartCard
              title="Rainfall and temperature, next 7 days"
              subtitle="Daily precipitation (bars) and maximum temperature (line)"
              summary={forecast.length ? `${forecast.length}-day forecast for ${data?.region}.` : 'Loading.'}
              legend={[
                { label: 'Rainfall', color: 'data-water' },
                { label: 'Max temperature', color: 'data-temperature' },
              ]}
              height={280}
            >
              {(c, h) =>
                forecast.length ? (
                  <ComposedRainTempChart
                    data={forecast.map(d => ({ label: d.date.slice(5), rain: d.precipitation_mm, temp: d.temp_max_C }))}
                    colors={c}
                    height={h}
                  />
                ) : (
                  <Skeleton height={h} />
                )
              }
            </ChartCard>
          ) : (
            <ChartCard
              title="Region vs all regions"
              subtitle="Each factor as a percentage of the all-region average (= 100)"
              info="Above 100 means the region is wetter, warmer, more humid or sunnier than the average across every record."
              summary={
                biggest ? `${biggest.label} differs most, at ${Math.round(biggest.region)}.` : 'Loading comparison.'
              }
              insight={
                biggest
                  ? `${biggest.label} is ${biggest.region >= 100 ? `${Math.round(biggest.region - 100)}% above` : `${Math.round(100 - biggest.region)}% below`} the all-region average in ${data?.region ?? region}.`
                  : undefined
              }
              legend={[
                { label: data?.region ?? region, color: 'data-water' },
                { label: 'All regions', color: 'muted' },
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
                      { key: 'global', label: 'All regions', color: c.muted },
                    ]}
                    refY={100}
                    refLabel="Average"
                  />
                ) : (
                  <Skeleton height={h} />
                )
              }
            </ChartCard>
          )}
        </div>

        <div className={s.s4}>
          <Card>
            <CardHeader
              title="Overall climate score"
              subtitle="Combined rating of the four factors"
              info="0.35 × rainfall + 0.30 × (100 − heat stress) + 0.20 × humidity + 0.15 × sunlight. Each factor is the share of records inside their crop’s optimal band (dataset) or a live-weather heuristic (live)."
            />
            {a && n(a.overall_weather_score) != null ? (
              <div className={s.stack} style={{ alignItems: 'center' }}>
                <ProgressRing
                  value={n(a.overall_weather_score) ?? 0}
                  label="Overall climate score"
                  size={148}
                  stroke={12}
                  color="var(--primary)"
                  display={formatNumber(n(a.overall_weather_score), 1)}
                />
                <div className={s.stack} style={{ width: '100%', gap: 'var(--space-2)' }}>
                  {FACTORS.map(f => (
                    <div key={f.key} className={s.between}>
                      <span className={s.muted}>{f.label}</span>
                      <span className={s.num}>{formatNumber(n(a[f.key]), 0)}</span>
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
                  {live ? `Based on ${data?.period}` : `Based on ${formatCount(n(a.record_count))} records`}
                  <InfoTip text={`Source: ${data?.data_source}`} />
                </p>
              </div>
            ) : (
              <Skeleton height={260} />
            )}
          </Card>
        </div>

        {live && data?.current && (
          <div className={s.s12}>
            <Card>
              <CardHeader
                title="Current conditions"
                subtitle={
                  data.current.observed_at
                    ? `Observed ${new Date(data.current.observed_at).toLocaleString()}`
                    : undefined
                }
              />
              <div className={s.tileGrid}>
                <div className={s.tile}>
                  <div className={s.small}>Temperature</div>
                  <div className={s.num} style={{ fontSize: 'var(--text-xl)' }}>
                    {formatTemperature(data.current.temperature_C)}
                  </div>
                </div>
                <div className={s.tile}>
                  <div className={s.small}>Humidity</div>
                  <div className={s.num} style={{ fontSize: 'var(--text-xl)' }}>
                    {formatPercent(data.current.humidity_percent)}
                  </div>
                </div>
                <div className={s.tile}>
                  <div className={s.small}>Precipitation</div>
                  <div className={s.num} style={{ fontSize: 'var(--text-xl)' }}>
                    {formatNumber(data.current.precipitation_mm, 1)} mm
                  </div>
                </div>
                <div className={s.tile}>
                  <div className={s.small} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <Wind size={12} aria-hidden="true" /> Wind
                  </div>
                  <div className={s.num} style={{ fontSize: 'var(--text-xl)' }}>
                    {formatNumber(data.current.wind_speed_kmh, 1)} km/h
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}
        <div className={s.s12}>
          {climate.isError ? (
            <ErrorState error={climate.error} onRetry={() => climate.refetch()} />
          ) : (
            <ChartCard
              title={`Yearly climate trend · ${region}`}
              subtitle={
                climateData?.archive.length
                  ? `ERA5 reanalysis at ${climateData.location?.label ?? region}, ${climateData.archive[0].year}–${climateData.archive[climateData.archive.length - 1].year}: annual precipitation (bars) and mean temperature (line)`
                  : 'Dataset values for this region (the climate archive is unavailable)'
              }
              info={climateData ? `${climateData.archive_source ?? 'Dataset only'}. ${climateData.note}` : undefined}
              summary={
                climateData?.temperature_trend_C_per_decade != null
                  ? `Mean temperature changed by ${climateData.temperature_trend_C_per_decade.toFixed(2)} °C per decade.`
                  : 'Loading.'
              }
              insight={
                climateData?.temperature_trend_C_per_decade != null
                  ? `Trend: ${climateData.temperature_trend_C_per_decade >= 0 ? '+' : ''}${climateData.temperature_trend_C_per_decade.toFixed(2)} °C and ${
                      (climateData.precipitation_trend_mm_per_decade ?? 0) >= 0 ? '+' : ''
                    }${formatCount(climateData.precipitation_trend_mm_per_decade)} mm of precipitation per decade (linear fit).`
                  : (climateData?.error ?? undefined)
              }
              legend={
                climateData?.archive.length
                  ? [
                      { label: 'Precipitation', color: 'data-water' },
                      { label: 'Mean temperature', color: 'data-temperature' },
                    ]
                  : [{ label: 'Dataset temperature', color: 'data-temperature' }]
              }
              height={300}
            >
              {(c, h) =>
                !climateData ? (
                  <Skeleton height={h} />
                ) : climateData.archive.length ? (
                  <ComposedRainTempChart
                    data={climateData.archive.map(a => ({
                      label: String(a.year),
                      rain: a.precipitation_mm,
                      temp: a.temperature_C,
                    }))}
                    colors={c}
                    height={h}
                  />
                ) : (
                  <MultiLineChart
                    data={climateData.dataset.map(d => ({ x: d.year, temperature: d.temperature_C }))}
                    colors={c}
                    height={h}
                    fx={v => String(v)}
                    fy={v => `${v.toFixed(1)} °C`}
                    series={[{ key: 'temperature', label: 'Temperature', color: c['data-temperature'] }]}
                  />
                )
              }
            </ChartCard>
          )}
        </div>
      </div>
    </div>
  );
}
