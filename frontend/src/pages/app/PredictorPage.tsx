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

const DEFAULTS: PredictionInput = {
  crop_type: 'Wheat',
  region: 'India',
  irrigation_type: 'Drip',
  fertilizer_type: 'Urea',
  crop_disease_status: 'None',
  soil_pH: 6.5,
  'soil_moisture_%': 40,
  temperature_C: 24.5,
  rainfall_mm: 850,
  'humidity_%': 60,
  sunlight_hours: 7.4,
  pesticide_usage_ml: 450,
  total_days: 125,
  NDVI_index: 0.62,
};

// Ranges accepted by the prediction endpoint.
const schema = z.object({
  crop_type: z.string().min(1, 'Choose a crop.'),
  region: z.string().min(1, 'Choose a region.'),
  irrigation_type: z.string().min(1),
  fertilizer_type: z.string().min(1),
  crop_disease_status: z.string().min(1),
  soil_pH: z.number({ message: 'Enter a number.' }).min(3, 'Between 3 and 10.').max(10, 'Between 3 and 10.'),
  'soil_moisture_%': z.number({ message: 'Enter a number.' }).min(0, '0–100%.').max(100, '0–100%.'),
  temperature_C: z.number({ message: 'Enter a number.' }).min(-10, '−10 to 60 °C.').max(60, '−10 to 60 °C.'),
  rainfall_mm: z.number({ message: 'Enter a number.' }).min(0, '0–2,000 mm.').max(2000, '0–2,000 mm.'),
  'humidity_%': z.number({ message: 'Enter a number.' }).min(0, '0–100%.').max(100, '0–100%.'),
  sunlight_hours: z.number({ message: 'Enter a number.' }).min(0, '0–24 h.').max(24, '0–24 h.'),
  pesticide_usage_ml: z.number({ message: 'Enter a number.' }).min(0, 'Cannot be negative.'),
  total_days: z.number({ message: 'Enter a number.' }).int('Whole days.').min(1, '1–365 days.').max(365, '1–365 days.'),
  NDVI_index: z.number({ message: 'Enter a number.' }).min(0, '0–1.').max(1, '0–1.'),
});

type Key = keyof PredictionInput;
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

  const [values, setValues] = useState<PredictionInput>(() => ({
    ...DEFAULTS,
    ...(filters.crop ? { crop_type: filters.crop } : {}),
    ...(filters.region ? { region: filters.region } : {}),
    ...(takePrefill() ?? {}),
  }));
  const [errors, setErrors] = useState<Errors>({});
  const [open, setOpen] = useState({ crop: true, soil: true, weather: true, ops: true });
  const [result, setResult] = useState<{ input: PredictionInput; result: PredictionResult } | null>(null);
  const [insights, setInsights] = useState<AIInsights | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loadingSample, setLoadingSample] = useState(false);

  const soil = useSoil(values.crop_type).data;
  const phBand = parseRange(soil?.soil_metrics?.optimal_pH_range as string | undefined);

  const set = <K extends Key>(k: K, v: PredictionInput[K]) => {
    setValues(prev => ({ ...prev, [k]: v }));
    setErrors(e => ({ ...e, [k]: undefined }));
  };
  const num = (k: Key) => (e: React.ChangeEvent<HTMLInputElement>) =>
    set(k, (e.target.value === '' ? NaN : Number(e.target.value)) as never);

  const validity = useMemo(() => {
    const r = schema.safeParse(values);
    const bad = new Set(r.success ? [] : r.error.issues.map(i => i.path[0] as Key));
    const ok = (keys: Key[]) => keys.filter(k => !bad.has(k)).length;
    return {
      total: 14 - bad.size,
      crop: ok(['crop_type', 'region', 'crop_disease_status']),
      soil: ok(['soil_pH', 'soil_moisture_%']),
      weather: ok(['temperature_C', 'rainfall_mm', 'humidity_%', 'sunlight_hours']),
      ops: ok(['irrigation_type', 'fertilizer_type', 'pesticide_usage_ml', 'total_days', 'NDVI_index']),
    };
  }, [values]);

  const run = async (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    const parsed = schema.safeParse(values);
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
      const res = await predict.mutateAsync(values);
      setResult({ input: values, result: res });
      insightsM.mutateAsync(values).then(setInsights, () => setInsights(null));
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
        irrigation_type: rec.irrigation_type,
        fertilizer_type: rec.fertilizer_type,
        crop_disease_status: rec.crop_disease_status || 'None',
        soil_pH: rec.soil_pH,
        'soil_moisture_%': rec['soil_moisture_%'],
        temperature_C: rec.temperature_C,
        rainfall_mm: Math.min(2000, rec.rainfall_mm),
        'humidity_%': rec['humidity_%'],
        sunlight_hours: rec.sunlight_hours,
        pesticide_usage_ml: rec.pesticide_usage_ml,
        total_days: rec.total_days,
        NDVI_index: rec.NDVI_index,
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
  const [whatIf, setWhatIf] = useState({ rain: 0, temp: 0, fertilizer: '' });
  const debounced = useDebouncedValue(whatIf, 500);
  const [scenario, setScenario] = useState<{ value: number | null; loading: boolean; error?: string }>({
    value: null,
    loading: false,
  });
  const changed =
    debounced.rain !== 0 ||
    debounced.temp !== 0 ||
    (debounced.fertilizer !== '' && debounced.fertilizer !== result?.input.fertilizer_type);

  useEffect(() => {
    if (!result || !changed) return;
    let cancelled = false;
    const base = result.input;
    const input: PredictionInput = {
      ...base,
      rainfall_mm: Math.max(0, Math.min(2000, Math.round(base.rainfall_mm * (1 + debounced.rain / 100)))),
      temperature_C: Math.round((base.temperature_C + debounced.temp) * 10) / 10,
      fertilizer_type: debounced.fertilizer || base.fertilizer_type,
    };
    Promise.resolve()
      .then(() => {
        if (!cancelled) setScenario(sc => ({ ...sc, loading: true, error: undefined }));
        return predictApi.predict(input);
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
    setValues(DEFAULTS);
    setErrors({});
    setResult(null);
    setInsights(null);
    setWhatIf({ rain: 0, temp: 0, fertilizer: '' });
  };

  return (
    <div className={s.page}>
      <PageHeader
        title="Yield Predictor"
        description="Describe the field and season to estimate yield per hectare."
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
          <div className={s.between}>
            <span className={s.muted}>
              <strong className={s.num} style={{ color: 'var(--ink)' }}>
                {validity.total} of 14
              </strong>{' '}
              fields complete
            </span>
          </div>
          {formError && <Banner tone="danger">{formError}</Banner>}

          <Section
            title="Crop & region"
            count={validity.crop}
            total={3}
            open={open.crop}
            onToggle={() => setOpen(o => ({ ...o, crop: !o.crop }))}
          >
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
            <FormField label="Disease status" htmlFor="p-disease">
              <Select
                id="p-disease"
                value={values.crop_disease_status}
                onChange={e => set('crop_disease_status', e.target.value)}
                options={DISEASE}
              />
            </FormField>
          </Section>

          <Section
            title="Soil"
            count={validity.soil}
            total={2}
            open={open.soil}
            onToggle={() => setOpen(o => ({ ...o, soil: !o.soil }))}
          >
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
          </Section>

          <Section
            title="Weather"
            count={validity.weather}
            total={4}
            open={open.weather}
            onToggle={() => setOpen(o => ({ ...o, weather: !o.weather }))}
          >
            <FormField label="Temperature" htmlFor="p-temp" error={errors.temperature_C} hint="−10 to 60 °C">
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
            <FormField label="Rainfall" htmlFor="p-rain" error={errors.rainfall_mm} hint="Season total, 0–2,000 mm">
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
          </Section>

          <Section
            title="Farm operations"
            count={validity.ops}
            total={5}
            open={open.ops}
            onToggle={() => setOpen(o => ({ ...o, ops: !o.ops }))}
          >
            <FormField label="Irrigation" htmlFor="p-irr">
              <Select
                id="p-irr"
                value={values.irrigation_type}
                onChange={e => set('irrigation_type', e.target.value)}
                options={IRRIGATION}
              />
            </FormField>
            <FormField label="Fertilizer" htmlFor="p-fert">
              <Select
                id="p-fert"
                value={values.fertilizer_type}
                onChange={e => set('fertilizer_type', e.target.value)}
                options={
                  FERTILIZER.includes(values.fertilizer_type) ? FERTILIZER : [values.fertilizer_type, ...FERTILIZER]
                }
              />
            </FormField>
            <FormField label="Pesticide use" htmlFor="p-pest" error={errors.pesticide_usage_ml}>
              <Input
                id="p-pest"
                type="number"
                step={10}
                value={Number.isFinite(values.pesticide_usage_ml) ? values.pesticide_usage_ml : ''}
                onChange={num('pesticide_usage_ml')}
                suffix="ml"
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
            <div className={s.full}>
              <SliderField
                id="p-ndvi"
                label="Vegetation index (NDVI)"
                value={values.NDVI_index}
                onChange={v => set('NDVI_index', v)}
                min={0}
                max={1}
                step={0.01}
                error={errors.NDVI_index}
              />
            </div>
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
                    Predicted yield{modelName ? ` · ${modelName}` : ''}
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
                <FormField label="Fertilizer" htmlFor="wi-fert">
                  <Select
                    id="wi-fert"
                    value={whatIf.fertilizer || result.input.fertilizer_type}
                    onChange={e => setWhatIf(w => ({ ...w, fertilizer: e.target.value }))}
                    options={FERTILIZER}
                  />
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
                <Button size="sm" variant="ghost" onClick={() => setWhatIf({ rain: 0, temp: 0, fertilizer: '' })}>
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
