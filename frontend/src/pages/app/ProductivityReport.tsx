import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { Badge, Button, Skeleton } from '../../components/ui';
import { ratingTone } from '../../components/ui/helpers';
import {
  contextQuery,
  useActiveModel,
  useFarmComparison,
  useFarms,
  useMyFarms,
  useRecommendationsHub,
  useRisk,
  useSeasonalTrends,
} from '../../hooks/queries';
import { formatCount, formatDeltaPercent, formatPercent, formatYield } from '../../lib/format';
import { filtersSearch, useGlobalFilters } from '../../store/filters';
import { usePreferences } from '../../store/preferences';
import s from './app.module.css';
import x from './extras.module.css';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={x.reportSection}>
      <h2 className={x.h2}>{title}</h2>
      {children}
    </section>
  );
}

/** Printable productivity report for the current context (Farm · Region · Crop · Year), A4 width. */
export function ProductivityReportPage() {
  const { unit } = usePreferences();
  const { filters } = useGlobalFilters();
  const ctx = contextQuery(filters);
  const trends = useSeasonalTrends({ ...ctx, year_from: undefined, year_to: undefined });
  const top = useFarmComparison({ ...ctx, limit: 10, sort: 'yield_desc' });
  const bottom = useFarmComparison({ ...ctx, limit: 5, sort: 'yield_asc' });
  const risk = useRisk(ctx);
  const hub = useRecommendationsHub(ctx);
  const myFarms = useMyFarms();
  const model = useActiveModel().data;
  const farmName = useFarms({ page: 1, page_size: 100, mine: true }).data?.items.find(
    f => String(f.id) === filters.farm,
  )?.name;

  useEffect(() => {
    document.title = 'Productivity report · YieldSense AI';
  }, []);

  const series = trends.data?.series ?? [];
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  const first = series[0];
  const span = first && last ? last.year - first.year : 0;
  const yoy = last && prev ? ((last.mean_yield_kg_ha - prev.mean_yield_kg_ha) / prev.mean_yield_kg_ha) * 100 : null;
  const cagr =
    first && last && span > 0 ? (Math.pow(last.mean_yield_kg_ha / first.mean_yield_kg_ha, 1 / span) - 1) * 100 : null;
  const forecast = trends.data?.forecast;
  const context = [
    farmName && `Farm: ${farmName}`,
    `Region: ${filters.region || 'All'}`,
    `Crop: ${filters.crop || 'All'}`,
    filters.year && `Year: ${filters.year}`,
  ]
    .filter(Boolean)
    .join(' · ');
  const loading = trends.isPending || top.isPending || risk.isPending || hub.isPending;

  return (
    <div data-theme="light" className={x.reportPage}>
      <div className={`no-print ${x.reportBar}`}>
        <Link to={`/app/analytics${filtersSearch(new URLSearchParams(window.location.search))}`} className={s.row}>
          <ArrowLeft size={16} aria-hidden="true" /> Back to Analytics
        </Link>
        <Button variant="primary" icon={Printer} onClick={() => window.print()} disabled={loading}>
          Print or save as PDF
        </Button>
      </div>
      <article className={x.reportSheet}>
        <header className={`${s.between} ${x.reportHeader}`}>
          <div>
            <div className={x.brand}>
              YieldSense <span className={x.primaryText}>AI</span>
            </div>
            <h1 className={x.h2Flat}>Productivity report</h1>
            <div className={s.small}>{context}</div>
          </div>
          <div className={`${s.small} ${x.tr}`}>
            Generated {new Date().toLocaleString()}
            <br />
            {model ? `${model.name} v${model.version ?? ''}` : ''}
          </div>
        </header>

        {loading ? (
          <div className={`${s.stack} ${x.mt6}`}>
            <Skeleton height={80} />
            <Skeleton height={200} />
            <Skeleton height={160} />
          </div>
        ) : (
          <>
            <Section title="Summary">
              <div className={x.statGrid}>
                {[
                  [
                    last ? `Mean yield ${last.year}` : 'Mean yield',
                    last ? `${formatYield(last.mean_yield_kg_ha, unit)} ${unit}` : '—',
                    last ? `${formatCount(last.record_count)} records` : '',
                  ],
                  ['Year on year', formatDeltaPercent(yoy), prev && last ? `${prev.year} → ${last.year}` : ''],
                  ['Growth (CAGR)', formatDeltaPercent(cagr), first && last ? `${first.year}–${last.year}` : ''],
                  [
                    forecast ? `Model ${forecast.year}` : 'Model forecast',
                    forecast ? `${formatYield(forecast.mean_kg_ha, unit)} ${unit}` : '—',
                    forecast
                      ? `P10–P90 ${formatYield(forecast.p10_kg_ha, unit)}–${formatYield(forecast.p90_kg_ha, unit)}`
                      : '',
                  ],
                ].map(([label, value, sub]) => (
                  <div key={label} className={x.statBox}>
                    <div className={s.small}>{label}</div>
                    <div className={`${x.brand} ${s.num}`}>{value}</div>
                    <div className={s.small}>{sub}</div>
                  </div>
                ))}
              </div>
              {trends.data && <p className={s.small}>Scope: {trends.data.scope}.</p>}
            </Section>

            <Section title="Yield by year">
              {series.length === 0 ? (
                <p className={s.muted}>No records in this context.</p>
              ) : (
                <table className={x.tableSm}>
                  <thead>
                    <tr>
                      <th scope="col" className={x.cellHead}>
                        Year
                      </th>
                      <th scope="col" className={x.cellNum}>
                        Mean ({unit})
                      </th>
                      <th scope="col" className={x.cellNum}>
                        Median ({unit})
                      </th>
                      <th scope="col" className={x.cellNum}>
                        Records
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {series.slice(-12).map(p => (
                      <tr key={p.year}>
                        <td className={x.cell}>{p.year}</td>
                        <td className={x.cellNum}>{formatYield(p.mean_yield_kg_ha, unit)}</td>
                        <td className={x.cellNum}>{formatYield(p.median_yield_kg_ha, unit)}</td>
                        <td className={x.cellNum}>{formatCount(p.record_count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {forecast && <p className={s.small}>{forecast.method}</p>}
            </Section>

            {(myFarms.data?.farms.length ?? 0) > 0 && (
              <Section title="Farms vs regional reference">
                <table className={x.tableSm}>
                  <thead>
                    <tr>
                      <th scope="col" className={x.cellHead}>
                        Farm
                      </th>
                      <th scope="col" className={x.cellHead}>
                        Latest season
                      </th>
                      <th scope="col" className={x.cellNum}>
                        Yield
                      </th>
                      <th scope="col" className={x.cellNum}>
                        Reference
                      </th>
                      <th scope="col" className={x.cellNum}>
                        Δ
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {myFarms.data?.farms.map(f => (
                      <tr key={f.farm_id}>
                        <td className={x.cell}>
                          {f.name}
                          <div className={s.small}>{f.region}</div>
                        </td>
                        <td className={x.cell}>{f.latest_year ? `${f.latest_year} · ${f.latest_crop}` : '—'}</td>
                        <td className={x.cellNum}>{formatYield(f.latest_yield_kg_ha, unit)}</td>
                        <td className={x.cellNum}>{formatYield(f.reference_kg_ha, unit)}</td>
                        <td className={x.cellNum}>{formatDeltaPercent(f.delta_pct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className={s.small}>{myFarms.data?.method}</p>
              </Section>
            )}

            <Section title="Highest and lowest yields">
              <table className={x.tableSm}>
                <thead>
                  <tr>
                    <th scope="col" className={x.cellHead}>
                      Record
                    </th>
                    <th scope="col" className={x.cellHead}>
                      Region · crop · year
                    </th>
                    <th scope="col" className={x.cellNum}>
                      Yield ({unit})
                    </th>
                    <th scope="col" className={x.cellHead}>
                      Risk
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...(top.data?.farms ?? []), ...(bottom.data?.farms ?? []).slice().reverse()].map((r, i) => (
                    <tr key={`${r.farm_id}-${i}`}>
                      <td className={x.cell}>{r.farm_id}</td>
                      <td className={x.cell}>
                        {r.region} · {r.crop_type} · {r.year}
                      </td>
                      <td className={x.cellNum}>{formatYield(r.yield_kg_ha, unit)}</td>
                      <td className={x.cell}>
                        <Badge tone={ratingTone(r.risk_rating, false)}>{r.risk_rating}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className={s.small}>Top 10 and bottom 5 records in this context.</p>
            </Section>

            <Section title="Risks">
              {(risk.data?.risks ?? []).length === 0 ? (
                <p className={s.muted}>No records in this context.</p>
              ) : (
                <ul className={x.listIndent}>
                  {risk.data?.risks.map(r => (
                    <li key={r.type} className={x.mb4}>
                      <strong>{r.label}</strong> — {r.level} (score {r.score}/25):{' '}
                      {formatPercent(r.share_affected * 100)} of records affected. {r.mitigation}
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Recommendations">
              {(hub.data?.recommendations ?? []).length === 0 ? (
                <p className={s.muted}>No recommendations for this context.</p>
              ) : (
                <ol className={x.listIndent}>
                  {hub.data?.recommendations.slice(0, 6).map(r => (
                    <li key={r.id} className={x.mb6}>
                      <strong>{r.title}</strong> <Badge>{r.severity}</Badge>
                      <div>{r.action}</div>
                      <div className={s.small}>
                        {r.impact_kg_ha != null
                          ? `Estimated impact ${formatYield(r.impact_kg_ha, unit)} ${unit} on affected records.`
                          : 'Impact not estimated (synthetic column, not a model input).'}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Section>
          </>
        )}

        <footer className={`${s.small} ${x.reportFooter}`}>
          Data: country-level FAOSTAT yields, rainfall and temperature (1990–2023, CRU TS); soil, humidity, sunlight,
          irrigation, fertilizer and disease columns are synthetic. Forecasts are model estimates and should be used
          alongside local expertise.
        </footer>
      </article>
    </div>
  );
}
