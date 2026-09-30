import type { FarmSoil, FarmSoilAssessment, NutrientRating } from '../api/types';
import { useFarmSoil } from '../hooks/queries';
import { formatIndex, formatNumber } from '../lib/format';
import s from '../pages/app/app.module.css';
import x from '../pages/app/extras.module.css';
import { Badge, Banner, Card, CardHeader, DataTable, Skeleton, type Tone } from './ui';
import { ErrorState } from './ui/States';

const RATING_TONE: Record<string, Tone> = { Low: 'warning', Medium: 'info', Moderate: 'info', High: 'success' };
type Property = FarmSoil['properties'][string] & { key: string };
type Suitability = FarmSoilAssessment['crop_suitability'][number];

/**
 * Real soil for one farm: ISRIC SoilGrids (0–30 cm) at the farm's location plus its own soil tests,
 * with Soil Health Card nutrient ratings. If SoilGrids is unreachable this shows the error;
 * it never falls back to the synthetic dataset columns.
 */
export function FarmSoilPanel({ farmId, farmName }: { farmId: number; farmName?: string }) {
  const q = useFarmSoil(farmId);

  if (q.isPending)
    return (
      <Card>
        <CardHeader
          title="Soil at this farm"
          subtitle="Fetching SoilGrids data (the first request can take up to a minute)"
        />
        <Skeleton height={220} />
      </Card>
    );
  if (q.isError)
    return (
      <Card>
        <CardHeader title="Soil at this farm" subtitle="Real soil data (ISRIC SoilGrids)" />
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
        <p className={`${s.small} ${x.mt3Only}`}>
          No values are shown because the soil service didn’t answer. Synthetic dataset values are not used as a
          substitute.
        </p>
      </Card>
    );

  const data = q.data;
  const a = data.assessment as unknown as FarmSoilAssessment;
  const properties: Property[] = Object.entries(data.properties).map(([key, v]) => ({ key, ...v }));
  const latest = data.soil_tests[0];
  const rated = latest?.ratings.filter(r => r.rating) ?? [];
  const loc = data.location as {
    basis?: string;
    label?: string;
    sampled_note?: string | null;
    sampled_latitude?: number;
    sampled_longitude?: number;
  };

  return (
    <div className={s.stack}>
      <Card>
        <CardHeader
          title={farmName ? `Soil at ${farmName}` : 'Soil at this farm'}
          subtitle={`ISRIC SoilGrids 2.0, 0–30 cm · ${loc.basis ?? ''}${
            loc.sampled_latitude != null ? ` (${loc.sampled_latitude}, ${loc.sampled_longitude})` : ''
          }`}
          actions={<Badge tone="success">Real · SoilGrids</Badge>}
          info={a.method}
        />
        {loc.sampled_note && <Banner tone="info">{loc.sampled_note}</Banner>}
        <div className={s.kpis}>
          <div className={s.tile}>
            <div className={s.small}>Soil health index</div>
            <div className={`${s.num} ${x.brand}`}>{formatIndex(a.soil_health_index)}</div>
            <div className={s.small}>pH fit for this farm’s crops + fertility</div>
          </div>
          <div className={s.tile}>
            <div className={s.small}>pH · {a.ph.source}</div>
            <div className={`${s.num} ${x.brand}`}>{formatNumber(a.ph.value, 2)}</div>
            <Badge>{a.ph.rating}</Badge>
          </div>
          <div className={s.tile}>
            <div className={s.small}>Organic carbon · {a.organic_carbon.source}</div>
            <div className={`${s.num} ${x.brand}`}>{formatNumber(a.organic_carbon.value_percent, 2)}%</div>
            <Badge tone={RATING_TONE[a.organic_carbon.rating]}>{a.organic_carbon.rating}</Badge>
          </div>
          <div className={s.tile}>
            <div className={s.small}>Fertility · {a.texture}</div>
            <div className={`${s.num} ${x.brand}`}>{a.fertility.class}</div>
            <div className={s.small}>
              CEC {formatNumber(a.cec.value, 1)} {a.cec.unit} ({a.cec.rating.toLowerCase()})
            </div>
          </div>
        </div>
        <div className={`${s.grid} ${x.mt4}`}>
          <div className={s.s6}>
            <DataTable<Property>
              caption="SoilGrids properties"
              compact
              rows={properties}
              rowKey={p => p.key}
              columns={[
                { key: 'l', header: 'Property', render: p => p.label },
                {
                  key: 'v',
                  header: '0–30 cm',
                  align: 'right',
                  render: p => (
                    <strong className={s.num}>
                      {formatNumber(p.value_0_30cm, 2)} {p.unit}
                    </strong>
                  ),
                },
                {
                  key: 'd',
                  header: '0–5 / 5–15 / 15–30 cm',
                  align: 'right',
                  render: p => (
                    <span className={s.num}>
                      {Object.values(p.by_depth)
                        .map(v => formatNumber(v, 2))
                        .join(' / ')}
                    </span>
                  ),
                },
              ]}
            />
          </div>
          <div className={s.s6}>
            <DataTable<Suitability>
              caption="Crop suitability from real soil"
              compact
              rows={a.crop_suitability}
              rowKey={c => c.crop}
              columns={[
                {
                  key: 'c',
                  header: 'Crop',
                  render: c => (
                    <span className={c.grown_on_farm ? x.served : undefined}>
                      {c.crop}
                      {c.grown_on_farm && <span className={s.small}> · grown here</span>}
                    </span>
                  ),
                },
                { key: 'ph', header: 'pH range', align: 'right', render: c => c.ph_range },
                {
                  key: 'i',
                  header: 'Suitability',
                  align: 'right',
                  render: c => (
                    <Badge
                      tone={c.suitability_index >= 0.75 ? 'success' : c.suitability_index >= 0.5 ? 'info' : 'warning'}
                    >
                      {formatIndex(c.suitability_index)}
                    </Badge>
                  ),
                },
              ]}
            />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Nutrient analysis"
          subtitle={
            latest
              ? `Soil test of ${latest.sampled_on}${latest.lab ? ` · ${latest.lab}` : ''}, rated against Soil Health Card limits`
              : 'Rated against Soil Health Card limits (ICAR)'
          }
          info={data.nutrient_source}
        />
        {!latest ? (
          <p className={x.mutedP}>
            No soil test yet. Add one (N, P, K, organic carbon, pH) to get Low / Medium / High ratings and fertilizer
            guidance.
          </p>
        ) : rated.length === 0 ? (
          <p className={x.mutedP}>The latest soil test has no N, P, K or organic carbon values to rate.</p>
        ) : (
          <DataTable<NutrientRating>
            caption="Nutrient ratings"
            compact
            rows={rated}
            rowKey={r => r.nutrient}
            columns={[
              { key: 'n', header: 'Nutrient', render: r => r.label },
              {
                key: 'v',
                header: 'Value',
                align: 'right',
                render: r => (
                  <span className={s.num}>
                    {formatNumber(r.value, 2)} {r.unit}
                    {r.oxide_equivalent && <span className={s.small}> ({r.oxide_equivalent})</span>}
                  </span>
                ),
              },
              {
                key: 'lim',
                header: 'Low below / High above',
                align: 'right',
                render: r => `${r.low_below} / ${r.high_above}`,
              },
              {
                key: 'r',
                header: 'Rating',
                render: r => <Badge tone={RATING_TONE[r.rating ?? 'Medium']}>{r.rating}</Badge>,
              },
              { key: 'g', header: 'Fertilizer guidance', render: r => r.guidance ?? '—' },
            ]}
          />
        )}
        <p className={`${s.small} ${x.mt3Only}`}>{data.nutrient_source}</p>
      </Card>
    </div>
  );
}
