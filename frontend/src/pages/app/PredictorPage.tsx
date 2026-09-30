import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import * as Slider from '@radix-ui/react-slider';
import { ChevronDown, ChevronUp, Cpu, Dice5, FileDown, Pencil, RotateCcw, Save, Sparkles } from 'lucide-react';
import { errorMessage } from '../../api/client';
import { predictApi, recordsApi } from '../../api/endpoints';
import type { AIInsights, PredictionInput, PredictionResult } from '../../api/types';
import { useAuth, useCan } from '../../auth/context';
import {
  Badge,
  Banner,
  Button,
  Card,
  CardHeader,
  FormField,
  Input,
  ModelChip,
  PageHeader,
  SegmentedControl,
  Select,
  Skeleton,
} from '../../components/ui';
import { ratingTone } from '../../components/ui/helpers';
import { useActiveModel, useDatasetSummary, useInsights, usePredict, useRegions, useSoil } from '../../hooks/queries';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { formatDeltaPercent, formatYield } from '../../lib/format';
import { saveRecent, setReport, takePrefill } from '../../lib/localStore';
import { normalizeModelName } from '../../lib/selectors';
import { YIELD_UNITS, type YieldUnit } from '../../lib/units';
import { useGlobalFilters } from '../../store/filters';
import { usePreferences } from '../../store/preferences';
import s from './app.module.css';

const IRRIGATION = ['Drip', 'Sprinkler', 'Flood', 'Rainfed'];
const FERTILIZER = ['NPK 15-15-15', 'Urea', 'Organic Compost', 'DAP'];
const DISEASE = ['None', 'Mild', 'Moderate', 'Severe'];

/**
 * Form state. Model inputs are required; field conditions are optional ('' or NaN = not recorded)
 * and only feed the risk flags and insights, never the model.
 */
interface FormValues {
  crop_type: string;
  region: string;
  year: number;
  rainfall_mm: number;
  temperature_C: number;
  pesticide_usage_ml: number;
  total_days: number;
  irrigation_type: string;
  fertilizer_type: string;
  crop_disease_status: string;
  soil_pH: number;
  'soil_moisture_%': number;
  'humidity_%': number;
  sunlight_hours: number;
}

const MODEL_KEYS = [
  'crop_type',
  'region',
  'year',
  'rainfall_mm',
  'temperature_C',
  'pesticide_usage_ml',
  'total_days',
] as const satisfies readonly (keyof FormValues)[];
const CONDITION_KEYS = [
  'irrigation_type',
  'fertilizer_type',
  'crop_disease_status',
  'soil_pH',
  'soil_moisture_%',
  'humidity_%',
  'sunlight_hours',
] as const satisfies readonly (keyof FormValues)[];

const DEFAULTS: FormValues = {
  crop_type: 'Wheat',
  region: 'India',
  year: 2013,
  rainfall_mm: 850,
  temperature_C: 24.5,
  pesticide_usage_ml: 450,
  total_days: 125,
  irrigation_type: 'Drip',
  fertilizer_type: 'Urea',
  crop_disease_status: 'None',
  soil_pH: 6.5,
  'soil_moisture_%': 40,
  'humidity_%': 60,
  sunlight_hours: 7.4,
};

const EMPTY_CONDITIONS: Pick<FormValues, (typeof CONDITION_KEYS)[number]> = {
  irrigation_type: '',
  fertilizer_type: '',
  crop_disease_status: '',
  soil_pH: NaN,
  'soil_moisture_%': NaN,
  'humidity_%': NaN,
  sunlight_hours: NaN,
};

const zNum = () => z.number({ message: 'Enter a number.' });
const optionalNumber = (min: number, max: number, msg: string) => z.number().min(min, msg).max(max, msg).optional();

// Ranges accepted by the prediction endpoint.
const schema = z.object({
  crop_type: z.string().min(1, 'Choose a crop.'),
  region: z.string().min(1, 'Choose a region.'),
  year: zNum().int('Whole year.').min(1990, '1990–2030.').max(2030, '1990–2030.'),
  rainfall_mm: zNum().min(0, '0–5,000 mm.').max(5000, '0–5,000 mm.'),
  temperature_C: zNum().min(-10, '−10 to 60 °C.').max(60, '−10 to 60 °C.'),
  pesticide_usage_ml: zNum().min(0, 'Cannot be negative.'),
  total_days: zNum().int('Whole days.').min(1, '1–365 days.').max(365, '1–365 days.'),
  irrigation_type: z.string().optional(),
  fertilizer_type: z.string().optional(),
  crop_disease_status: z.string().optional(),
  soil_pH: optionalNumber(3, 10, 'Between 3 and 10.'),
  'soil_moisture_%': optionalNumber(0, 100, '0–100%.'),
  'humidity_%': optionalNumber(0, 100, '0–100%.'),
  sunlight_hours: optionalNumber(0, 24, '0–24 h.'),
});

/** Request body: model inputs as entered; field conditions only when recorded. */
function toRequest(v: FormValues, farmId?: number): PredictionInput {
  const body: Record<string, unknown> = {};
  for (const k of MODEL_KEYS) body[k] = v[k];
  for (const k of CONDITION_KEYS) {
    const value = v[k];
    if (typeof value === 'string' ? value !== '' : Number.isFinite(value)) body[k] = value;
  }
  if (farmId) body.farm_id = farmId;
  return body as unknown as PredictionInput;
}

type Key = keyof FormValues;
type Errors = Partial<Record<Key, string>>;

function parseRange(text?: string): [number, number] | null {
  const m = text?.match(/([\d.]+)\s*[-–]\s*([\d.]+)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

function SliderField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
  band,
  error,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  band?: [number, number] | null;
  error?: string;
}) {
  const pos = (v: number) => `${((v - min) / (max - min)) * 100}%`;
  return (
    <FormField
      label={label}
      htmlFor={id}
      error={error}
      optimal={band ? `${band[0]}–${band[1]}${suffix ? ` ${suffix}` : ''}` : undefined}
      hint={band ? undefined : `${min}–${max}${suffix ? ` ${suffix}` : ''}`}
    >
      <div className={s.row} style={{ flexWrap: 'nowrap' }}>
        <Slider.Root
          className={s.slider}
          value={[Number.isFinite(value) ? value : min]}
          min={min}
          max={max}
          step={step}
          onValueChange={v => onChange(v[0])}
          aria-label={label}
        >
          <Slider.Track className={s.sliderTrack}>
            {band && (
              <span
                className={s.band}
                style={{ left: pos(band[0]), width: `calc(${pos(band[1])} - ${pos(band[0])})` }}
              />
            )}
            <Slider.Range className={s.sliderRange} />
          </Slider.Track>
          <Slider.Thumb className={s.sliderThumb} aria-label={label} />
        </Slider.Root>
        <div style={{ width: 110, flexShrink: 0 }}>
          <Input
            id={id}
            type="number"
            step={step}
            value={Number.isFinite(value) ? value : ''}
            onChange={e => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
            suffix={suffix}
            invalid={!!error}
          />
        </div>
      </div>
    </FormField>
  );
}

function Section({
  title,
  count,
  total,
  open,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  total: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className={s.section}>
      <button type="button" className={s.sectionHead} onClick={onToggle} aria-expanded={open}>
        <span>{title}</span>
        <span className={s.row} style={{ gap: 'var(--space-2)' }}>
          <Badge tone={count === total ? 'success' : 'neutral'}>
            {count}/{total}
          </Badge>
          {open ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
        </span>
      </button>
      {open && <div className={s.sectionBody}>{children}</div>}
    </section>
  );
}

export function PredictorPage() {
  const { user } = useAuth();
  const can = useCan();
  const navigate = useNavigate();
  const { unit, setUnit } = usePreferences();
  const { filters } = useGlobalFilters();
  const crops = useDatasetSummary().data?.crops_supported ?? [];
  const regions = useRegions().data ?? [];
  const activeModel = useActiveModel().data;
  const predict = usePredict();
  const insightsM = useInsights();
  const formRef = useRef<HTMLFormElement>(null);

  const farmId = filters.farm ? Number(filters.farm) : undefined;
  const summary = useDatasetSummary().data;
  const lastYear = summary?.year_max ?? 2013;
  const [values, setValues] = useState<FormValues>(() => ({
    ...DEFAULTS,
    ...(filters.crop ? { crop_type: filters.crop } : {}),
    ...(filters.region ? { region: filters.region } : {}),
    ...((takePrefill() ?? {}) as Partial<FormValues>),
  }));
  const [errors, setErrors] = useState<Errors>({});
  const [open, setOpen] = useState({ model: true, conditions: true });
  const [result, setResult] = useState<{ input: PredictionInput; result: PredictionResult } | null>(null);
  const [conditionsOn, setConditionsOn] = useState(true);
  const [insights, setInsights] = useState<AIInsights | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loadingSample, setLoadingSample] = useState(false);

  const soil = useSoil(values.crop_type).data;
  const phBand = parseRange(soil?.soil_metrics?.optimal_pH_range as string | undefined);

  const set = <K extends Key>(k: K, v: FormValues[K]) => {
    setValues(prev => ({ ...prev, [k]: v }));
    setErrors(e => ({ ...e, [k]: undefined }));
  };
  const num = (k: Key) => (e: React.ChangeEvent<HTMLInputElement>) =>
    set(k, (e.target.value === '' ? NaN : Number(e.target.value)) as never);

  const effective = useMemo(() => (conditionsOn ? values : { ...values, ...EMPTY_CONDITIONS }), [values, conditionsOn]);

  const validity = useMemo(() => {
    const r = schema.safeParse(toRequest(effective));
    const bad = new Set(r.success ? [] : r.error.issues.map(i => i.path[0] as Key));
    const recorded = toRequest(effective) as unknown as Record<string, unknown>;
    return {
      model: MODEL_KEYS.filter(k => !bad.has(k)).length,
      conditions: CONDITION_KEYS.filter(k => k in recorded && !bad.has(k)).length,
    };
  }, [effective]);

  const run = async (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    const body = toRequest(effective, farmId);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      const errs: Errors = {};
      for (const i of parsed.error.issues) errs[i.path[0] as Key] ??= i.message;
      setErrors(errs);
      setFormError('Fix the highlighted fields.');
      return;
    }
    setFormError(null);
    setInsights(null);
    try {
      const res = await predict.mutateAsync(body);
      setResult({ input: body, result: res });
      insightsM.mutateAsync(body).then(setInsights, () => setInsights(null));
    } catch (err) {
      setFormError(errorMessage(err));
    }
  };

  const loadSample = async () => {
    setLoadingSample(true);
    try {
      const rec = await recordsApi.sample({ crop: values.crop_type || undefined });
      if (!rec) throw new Error('No record found');
      setValues({
        crop_type: rec.crop_type,
        region: rec.region,
        year: rec.year ?? lastYear,
        rainfall_mm: rec.rainfall_mm,
        temperature_C: rec.temperature_C,
        pesticide_usage_ml: rec.pesticide_usage_ml,
        total_days: rec.total_days,
        irrigation_type: rec.irrigation_type,
        fertilizer_type: rec.fertilizer_type,
        crop_disease_status: rec.crop_disease_status || 'None',
        soil_pH: rec.soil_pH,
        'soil_moisture_%': rec['soil_moisture_%'],
        'humidity_%': rec['humidity_%'],
        sunlight_hours: rec.sunlight_hours,
      });
      setErrors({});
      toast.success(`Loaded record ${rec.farm_id}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoadingSample(false);
    }
  };

  // ---------------------------------------------------------------- what-if
  const [whatIf, setWhatIf] = useState({ rain: 0, temp: 0, pest: 0 });
  const debounced = useDebouncedValue(whatIf, 500);
  const [scenario, setScenario] = useState<{ value: number | null; loading: boolean; error?: string }>({
    value: null,
    loading: false,
  });
  const changed = debounced.rain !== 0 || debounced.temp !== 0 || debounced.pest !== 0;

  useEffect(() => {
    if (!result || !changed) return;
    let cancelled = false;
    const base = result.input;
    const input: PredictionInput = {
      ...base,
      rainfall_mm: Math.max(0, Math.min(5000, Math.round(base.rainfall_mm * (1 + debounced.rain / 100)))),
      temperature_C: Math.round((base.temperature_C + debounced.temp) * 10) / 10,
      pesticide_usage_ml: Math.max(0, Math.round(base.pesticide_usage_ml * (1 + debounced.pest / 100))),
      farm_id: undefined,
    };
    Promise.resolve()
      .then(() => {
        if (!cancelled) setScenario(sc => ({ ...sc, loading: true, error: undefined }));
        return predictApi.whatIf(input);
      })
      .then(
        r => !cancelled && setScenario({ value: r.predicted_yield_kg_ha, loading: false }),
        err => !cancelled && setScenario({ value: null, loading: false, error: errorMessage(err) }),
      );
    return () => {
      cancelled = true;
    };
  }, [debounced, result, changed]);

  const base = result?.result.predicted_yield_kg_ha ?? 0;
  const delta = scenario.value != null && base > 0 ? ((scenario.value - base) / base) * 100 : null;
  const modelName = activeModel ? normalizeModelName(activeModel.name).name : null;

  const save = () => {
    if (!result || !user) return;
    saveRecent(user.username, { input: result.input, result: result.result, insights, modelName });
    toast.success('Saved to recent predictions on this device');
  };

  const report = () => {
    if (!result) return;
    setReport({
      id: 'report',
      savedAt: new Date().toISOString(),
      input: result.input,
      result: result.result,
      insights,
      modelName: activeModel?.name ?? null,
    });
    window.open('/report/prediction', '_blank', 'noopener');
  };

  const reset = () => {
    setValues({ ...DEFAULTS, year: lastYear });
    setConditionsOn(true);
    setErrors({});
    setResult(null);
    setInsights(null);
    setWhatIf({ rain: 0, temp: 0, pest: 0 });
  };

  return (
    <div className={s.page}>
      <PageHeader
        title="Yield Predictor"
        description="Model inputs drive the estimate; field conditions add risk flags and advice."
        meta={
          activeModel &&
          (can('models') ? (
            <ModelChip
              name={modelName ?? activeModel.name}
              r2={activeModel.r2}
              rmse={activeModel.rmse}
              to="/app/models"
            />
          ) : (
            <ModelChip name={modelName ?? activeModel.name} />
          ))
        }
        actions={
          <>
            <Button icon={Dice5} onClick={loadSample} loading={loadingSample}>
              Load sample values
            </Button>
            <Button icon={RotateCcw} variant="ghost" onClick={reset}>
              Reset
            </Button>
          </>
        }
      />

      <div className={s.grid}>
        <form ref={formRef} className={`${s.s7} ${s.stack}`} onSubmit={run} noValidate aria-label="Prediction inputs">
          {formError && <Banner tone="danger">{formError}</Banner>}

          <Section
            title="Model inputs"
            count={validity.model}
            total={MODEL_KEYS.length}
            open={open.model}
            onToggle={() => setOpen(o => ({ ...o, model: !o.model }))}
          >
            <p className={`${s.small} ${s.full}`} style={{ margin: 0 }}>
              The {modelName ?? 'yield model'} uses exactly these {MODEL_KEYS.length} values. They are country-level
              figures in the training data (FAOSTAT), so enter values for the region, not a single field.
            </p>
            <FormField label="Crop" htmlFor="p-crop" error={errors.crop_type}>
              <Select
                id="p-crop"
                value={values.crop_type}
                onChange={e => set('crop_type', e.target.value)}
                options={crops.length ? [...crops].sort() : [values.crop_type]}
              />
            </FormField>
            <FormField label="Region" htmlFor="p-region" error={errors.region}>
              <Select
                id="p-region"
                value={values.region}
                onChange={e => set('region', e.target.value)}
                options={regions.length ? regions : [values.region]}
              />
            </FormField>
            <FormField
              label="Season year"
              htmlFor="p-year"
              error={errors.year}
              hint={
                values.year > lastYear
                  ? `After ${lastYear} the model holds the ${lastYear} level (no trend extrapolation)`
                  : `Training data covers ${summary?.year_min ?? 1990}–${lastYear}`
              }
            >
              <Input
                id="p-year"
                type="number"
                step={1}
                value={Number.isFinite(values.year) ? values.year : ''}
                onChange={num('year')}
                invalid={!!errors.year}
              />
            </FormField>
            <FormField label="Rainfall" htmlFor="p-rain" error={errors.rainfall_mm} hint="Average annual, 0–5,000 mm">
              <Input
                id="p-rain"
                type="number"
                step={10}
                value={Number.isFinite(values.rainfall_mm) ? values.rainfall_mm : ''}
                onChange={num('rainfall_mm')}
                suffix="mm"
                invalid={!!errors.rainfall_mm}
              />
            </FormField>
            <FormField
              label="Temperature"
              htmlFor="p-temp"
              error={errors.temperature_C}
              hint="Average annual, −10 to 60 °C"
            >
              <Input
                id="p-temp"
                type="number"
                step={0.5}
                value={Number.isFinite(values.temperature_C) ? values.temperature_C : ''}
                onChange={num('temperature_C')}
                suffix="°C"
                invalid={!!errors.temperature_C}
              />
            </FormField>
            <FormField
              label="Pesticide use"
              htmlFor="p-pest"
              error={errors.pesticide_usage_ml}
              hint="Dataset index: national tonnes × 100"
            >
              <Input
                id="p-pest"
                type="number"
                step={10}
                value={Number.isFinite(values.pesticide_usage_ml) ? values.pesticide_usage_ml : ''}
                onChange={num('pesticide_usage_ml')}
                invalid={!!errors.pesticide_usage_ml}
              />
            </FormField>
            <FormField label="Growing period" htmlFor="p-days" error={errors.total_days} hint="Sowing to harvest">
              <Input
                id="p-days"
                type="number"
                step={1}
                value={Number.isFinite(values.total_days) ? values.total_days : ''}
                onChange={num('total_days')}
                suffix="days"
                invalid={!!errors.total_days}
              />
            </FormField>
          </Section>

          <Section
            title="Field conditions (optional)"
            count={validity.conditions}
            total={CONDITION_KEYS.length}
            open={open.conditions}
            onToggle={() => setOpen(o => ({ ...o, conditions: !o.conditions }))}
          >
            <div className={`${s.full} ${s.between}`}>
              <p className={s.small} style={{ margin: 0 }}>
                Not used by the model (these columns are synthetic in the training data). They drive the risk flags and
                the AI insight.
              </p>
              <label className={s.row} style={{ gap: 'var(--space-2)', whiteSpace: 'nowrap' }}>
                <input
                  type="checkbox"
                  checked={conditionsOn}
                  onChange={e => setConditionsOn(e.target.checked)}
                  aria-label="Include field conditions"
                />
                Include
              </label>
            </div>
            {conditionsOn && (
              <>
                <FormField label="Irrigation" htmlFor="p-irr">
                  <Select
                    id="p-irr"
                    value={values.irrigation_type}
                    onChange={e => set('irrigation_type', e.target.value)}
                    options={IRRIGATION}
                    placeholder="Not recorded"
                  />
                </FormField>
                <FormField label="Fertilizer" htmlFor="p-fert">
                  <Select
                    id="p-fert"
                    value={values.fertilizer_type}
                    onChange={e => set('fertilizer_type', e.target.value)}
                    options={
                      !values.fertilizer_type || FERTILIZER.includes(values.fertilizer_type)
                        ? FERTILIZER
                        : [values.fertilizer_type, ...FERTILIZER]
                    }
                    placeholder="Not recorded"
                  />
                </FormField>
                <FormField label="Disease status" htmlFor="p-disease">
                  <Select
                    id="p-disease"
                    value={values.crop_disease_status}
                    onChange={e => set('crop_disease_status', e.target.value)}
                    options={DISEASE}
                    placeholder="Not recorded"
                  />
                </FormField>
                <FormField label="Sunlight" htmlFor="p-sun" error={errors.sunlight_hours} hint="Hours per day">
                  <Input
                    id="p-sun"
                    type="number"
                    step={0.1}
                    value={Number.isFinite(values.sunlight_hours) ? values.sunlight_hours : ''}
                    onChange={num('sunlight_hours')}
                    suffix="h/day"
                    invalid={!!errors.sunlight_hours}
                  />
                </FormField>
                <SliderField
                  id="p-ph"
                  label="Soil pH"
                  value={values.soil_pH}
                  onChange={v => set('soil_pH', v)}
                  min={3}
                  max={10}
                  step={0.1}
                  band={phBand}
                  error={errors.soil_pH}
                />
                <SliderField
                  id="p-moist"
                  label="Soil moisture"
                  value={values['soil_moisture_%']}
                  onChange={v => set('soil_moisture_%', v)}
                  min={0}
                  max={100}
                  step={0.5}
                  suffix="%"
                  error={errors['soil_moisture_%']}
                />
                <div className={s.full}>
                  <SliderField
                    id="p-hum"
                    label="Humidity"
                    value={values['humidity_%']}
                    onChange={v => set('humidity_%', v)}
                    min={0}
                    max={100}
                    step={1}
                    suffix="%"
                    error={errors['humidity_%']}
                  />
                </div>
              </>
            )}
          </Section>

          <Button type="submit" variant="primary" size="lg" icon={Cpu} loading={predict.isPending}>
            Predict yield
          </Button>
        </form>

        <aside className={`${s.s5} ${s.sticky} ${s.stack}`} aria-live="polite">
          <Card>
            <CardHeader
              title="Result"
              subtitle={
                result ? `${result.input.crop_type} · ${result.input.region}` : 'Your prediction will appear here'
              }
              actions={
                <SegmentedControl<YieldUnit>
                  label="Yield unit"
                  value={unit}
                  onChange={setUnit}
                  options={YIELD_UNITS.map(u => ({ value: u, label: u }))}
                />
              }
            />
            {predict.isPending ? (
              <div className={s.stack}>
                <Skeleton height={48} width="60%" />
                <Skeleton height={20} />
                <Skeleton height={80} />
              </div>
            ) : result ? (
              <div className={s.stack}>
                <div>
                  <span className={s.big}>{formatYield(result.result.predicted_yield_kg_ha, unit)}</span>{' '}
                  <span className={s.muted}>{unit}</span>
                  <div className={s.small} style={{ marginTop: 'var(--space-1)' }}>
                    Likely range (P10–P90):{' '}
                    <span className={s.num}>
                      {formatYield(result.result.low_kg_ha, unit)}–{formatYield(result.result.high_kg_ha, unit)}
                    </span>{' '}
                    {unit}
                  </div>
                  <div className={s.small}>
                    {result.result.model_name}
                    {result.result.model_version ? ` v${result.result.model_version}` : ''} · season{' '}
                    {result.result.year ?? lastYear}
                    {result.result.risk_flags.length > 0 && ` · risk flags: ${result.result.risk_flags.join(', ')}`}
                  </div>
                </div>
                <div className={s.row}>
                  <Badge tone={ratingTone(result.result.productivity_rating)}>
                    Productivity: {result.result.productivity_rating}
                  </Badge>
                  <Badge tone={ratingTone(result.result.risk_rating, false)}>Risk: {result.result.risk_rating}</Badge>
                </div>
                <div className={s.tile}>
                  <div className={s.row} style={{ marginBottom: 'var(--space-2)' }}>
                    <Sparkles size={16} color="var(--data-model)" aria-hidden="true" />
                    <strong>AI insight</strong>
                    {insights && <span className={s.small}>· {insights.llm_provider}</span>}
                  </div>
                  {insightsM.isPending ? (
                    <div className={s.stack}>
                      <Skeleton />
                      <Skeleton width="80%" />
                    </div>
                  ) : insights ? (
                    <>
                      <p style={{ margin: 0 }}>{insights.ai_insights}</p>
                      {insights.recommendations.length > 0 && (
                        <ul style={{ margin: 'var(--space-2) 0 0', paddingLeft: 'var(--space-5)' }} className={s.muted}>
                          {insights.recommendations.slice(0, 3).map(r => (
                            <li key={r}>{r}</li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <span className={s.muted}>Insights are unavailable right now.</span>
                  )}
                </div>
                <div className={s.row}>
                  <Button size="sm" icon={FileDown} onClick={report}>
                    Download report
                  </Button>
                  <Button size="sm" icon={Save} onClick={save}>
                    Save to recent
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Pencil}
                    onClick={() =>
                      formRef.current
                        ?.querySelector('input,select')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                    }
                  >
                    Adjust inputs
                  </Button>
                </div>
              </div>
            ) : (
              <div className={s.stack} aria-hidden="true" style={{ opacity: 0.6 }}>
                <Skeleton height={44} width="55%" />
                <div className={s.row}>
                  <Skeleton width={120} height={22} />
                  <Skeleton width={100} height={22} />
                </div>
                <Skeleton height={72} />
                <p className={s.muted} style={{ margin: 0 }}>
                  Fill in the form and select <strong>Predict yield</strong>. You’ll see the estimate, productivity and
                  risk ratings, and an AI insight.
                </p>
              </div>
            )}
          </Card>

          {result && (
            <Card>
              <CardHeader title="What if?" subtitle="Change one thing and see how the prediction moves" />
              <div className={s.stack}>
                <FormField label={`Rainfall ${whatIf.rain >= 0 ? '+' : ''}${whatIf.rain}%`} htmlFor="wi-rain">
                  <Slider.Root
                    id="wi-rain"
                    className={s.slider}
                    value={[whatIf.rain]}
                    min={-50}
                    max={50}
                    step={5}
                    onValueChange={v => setWhatIf(w => ({ ...w, rain: v[0] }))}
                    aria-label="Rainfall change"
                  >
                    <Slider.Track className={s.sliderTrack}>
                      <Slider.Range className={s.sliderRange} />
                    </Slider.Track>
                    <Slider.Thumb className={s.sliderThumb} aria-label="Rainfall change" />
                  </Slider.Root>
                </FormField>
                <FormField label={`Temperature ${whatIf.temp >= 0 ? '+' : ''}${whatIf.temp} °C`} htmlFor="wi-temp">
                  <Slider.Root
                    id="wi-temp"
                    className={s.slider}
                    value={[whatIf.temp]}
                    min={-5}
                    max={5}
                    step={0.5}
                    onValueChange={v => setWhatIf(w => ({ ...w, temp: v[0] }))}
                    aria-label="Temperature change"
                  >
                    <Slider.Track className={s.sliderTrack}>
                      <Slider.Range className={s.sliderRange} />
                    </Slider.Track>
                    <Slider.Thumb className={s.sliderThumb} aria-label="Temperature change" />
                  </Slider.Root>
                </FormField>
                <FormField label={`Pesticide use ${whatIf.pest >= 0 ? '+' : ''}${whatIf.pest}%`} htmlFor="wi-pest">
                  <Slider.Root
                    id="wi-pest"
                    className={s.slider}
                    value={[whatIf.pest]}
                    min={-50}
                    max={50}
                    step={5}
                    onValueChange={v => setWhatIf(w => ({ ...w, pest: v[0] }))}
                    aria-label="Pesticide change"
                  >
                    <Slider.Track className={s.sliderTrack}>
                      <Slider.Range className={s.sliderRange} />
                    </Slider.Track>
                    <Slider.Thumb className={s.sliderThumb} aria-label="Pesticide change" />
                  </Slider.Root>
                </FormField>
                <div className={s.tile}>
                  {!changed ? (
                    <span className={s.muted}>Move a slider to compare with the base prediction.</span>
                  ) : scenario.loading ? (
                    <Skeleton height={28} width="50%" />
                  ) : scenario.error ? (
                    <span style={{ color: 'var(--danger)' }}>{scenario.error}</span>
                  ) : scenario.value != null ? (
                    <div className={s.between}>
                      <span>
                        <span
                          className={s.num}
                          style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-semibold)' }}
                        >
                          {formatYield(scenario.value, unit)}
                        </span>{' '}
                        <span className={s.muted}>{unit}</span>
                      </span>
                      <Badge tone={(delta ?? 0) >= 0 ? 'success' : 'danger'}>{formatDeltaPercent(delta)} vs base</Badge>
                    </div>
                  ) : null}
                </div>
                <Button size="sm" variant="ghost" onClick={() => setWhatIf({ rain: 0, temp: 0, pest: 0 })}>
                  Reset scenario
                </Button>
              </div>
            </Card>
          )}
          {!result && (
            <Button variant="ghost" onClick={() => navigate('/app/history')} disabled={!can('history')}>
              View recent predictions
            </Button>
          )}
        </aside>
      </div>
    </div>
  );
}
