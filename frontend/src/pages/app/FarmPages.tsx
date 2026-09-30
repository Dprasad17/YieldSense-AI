import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Cpu, MapPin, Pencil, Plus, Search, Sprout, Trash2 } from 'lucide-react';
import { errorMessage } from '../../api/client';
import { farmsApi, soilTestsApi } from '../../api/endpoints';
import type { Farm, FarmInput, FarmRecord, FarmRecordInput, SoilTestInput } from '../../api/types';
import { useAuth, useCan } from '../../auth/context';
import { FarmMap } from '../../components/FarmMap';
import { FarmSoilPanel } from '../../components/FarmSoilPanel';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FormField,
  IconButton,
  Input,
  Modal,
  PageHeader,
  Pagination,
  SegmentedControl,
  Select,
  Skeleton,
  type Column,
} from '../../components/ui';
import { ratingTone } from '../../components/ui/helpers';
import { ErrorState } from '../../components/ui/States';
import {
  useDatasetSummary,
  useFarm,
  useFarms,
  useFarmsInvalidate,
  useRegions,
  useSoilTests,
} from '../../hooks/queries';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { formatCount, formatIndex, formatNumber, formatYield, formatYieldWithUnit } from '../../lib/format';
import { setPrefill } from '../../lib/localStore';
import { usePreferences } from '../../store/preferences';
import s from './app.module.css';
import x from './extras.module.css';

const IRRIGATION = ['Drip', 'Sprinkler', 'Flood', 'Rainfed'] as const;
type Irrigation = (typeof IRRIGATION)[number];

const num = (v: string) => (v.trim() === '' ? null : Number(v));

// ================================================================ Farm form

function FarmForm({
  open,
  onOpenChange,
  farm,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  farm?: Farm | null;
  onSaved: (f: Farm) => void;
}) {
  const regions = useRegions().data ?? [];
  const crops = [...(useDatasetSummary().data?.crops_supported ?? [])].sort();
  const [v, setV] = useState(() => ({
    name: farm?.name ?? '',
    region: farm?.region ?? '',
    area_ha: farm ? String(farm.area_ha) : '',
    crops: farm?.crops ?? ([] as string[]),
    irrigation_type: (farm?.irrigation_type ?? '') as Irrigation | '',
    soil_ph: farm?.soil_ph != null ? String(farm.soil_ph) : '',
    soil_moisture_percent: farm?.soil_moisture_percent != null ? String(farm.soil_moisture_percent) : '',
    soil_type: farm?.soil_type ?? '',
    latitude: farm?.latitude != null ? String(farm.latitude) : '',
    longitude: farm?.longitude != null ? String(farm.longitude) : '',
    notes: farm?.notes ?? '',
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set =
    (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setV(p => ({ ...p, [k]: e.target.value }));

  const save = async () => {
    const errs: Record<string, string> = {};
    if (v.name.trim().length < 2) errs.name = 'Enter a farm name.';
    if (!v.region) errs.region = 'Choose a region.';
    if (!(Number(v.area_ha) > 0)) errs.area_ha = 'Area must be greater than 0.';
    if (!v.crops.length) errs.crops = 'Choose at least one crop.';
    const ph = num(v.soil_ph);
    if (ph != null && (ph < 3 || ph > 10)) errs.soil_ph = 'pH is between 3 and 10.';
    const moist = num(v.soil_moisture_percent);
    if (moist != null && (moist < 0 || moist > 100)) errs.soil_moisture_percent = '0–100%.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const body: FarmInput = {
      name: v.name.trim(),
      region: v.region,
      area_ha: Number(v.area_ha),
      crops: v.crops,
      irrigation_type: v.irrigation_type || null,
      soil_ph: ph,
      soil_moisture_percent: moist,
      soil_type: v.soil_type.trim() || null,
      latitude: num(v.latitude),
      longitude: num(v.longitude),
      notes: v.notes.trim() || null,
    };
    setSaving(true);
    try {
      const saved = farm ? await farmsApi.update(farm.id, body) : await farmsApi.create(body);
      toast.success(farm ? 'Farm updated' : 'Farm created');
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={farm ? `Edit ${farm.name}` : 'Add a farm'}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={saving}>
            {farm ? 'Save changes' : 'Create farm'}
          </Button>
        </>
      }
    >
      <div className={`${s.sectionBody} ${x.p0}`}>
        <FormField label="Farm name" htmlFor="ff-name" error={errors.name}>
          <Input id="ff-name" value={v.name} onChange={set('name')} invalid={!!errors.name} />
        </FormField>
        <FormField label="Region (country)" htmlFor="ff-region" error={errors.region}>
          <Select
            id="ff-region"
            value={v.region}
            onChange={set('region')}
            options={regions}
            placeholder="Choose a region"
          />
        </FormField>
        <FormField label="Area" htmlFor="ff-area" error={errors.area_ha}>
          <Input
            id="ff-area"
            type="number"
            step="0.1"
            suffix="ha"
            value={v.area_ha}
            onChange={set('area_ha')}
            invalid={!!errors.area_ha}
          />
        </FormField>
        <FormField label="Irrigation" htmlFor="ff-irr">
          <Select
            id="ff-irr"
            value={v.irrigation_type}
            onChange={set('irrigation_type')}
            options={IRRIGATION}
            placeholder="Not specified"
          />
        </FormField>
        <div className={s.full}>
          <FormField label="Crops grown" error={errors.crops}>
            <div className={s.chips} role="group" aria-label="Crops grown">
              {crops.map(c => {
                const on = v.crops.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    className={`${s.chip} ${x.chipBtn} ${on ? x.chipOn : ''}`}
                    onClick={() => setV(p => ({ ...p, crops: on ? p.crops.filter(x => x !== c) : [...p.crops, c] }))}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </FormField>
        </div>
        <FormField label="Soil pH" htmlFor="ff-ph" error={errors.soil_ph} hint="Optional, 3–10">
          <Input
            id="ff-ph"
            type="number"
            step="0.1"
            value={v.soil_ph}
            onChange={set('soil_ph')}
            invalid={!!errors.soil_ph}
          />
        </FormField>
        <FormField label="Soil moisture" htmlFor="ff-moist" error={errors.soil_moisture_percent} hint="Optional">
          <Input
            id="ff-moist"
            type="number"
            step="0.5"
            suffix="%"
            value={v.soil_moisture_percent}
            onChange={set('soil_moisture_percent')}
          />
        </FormField>
        <FormField label="Soil type" htmlFor="ff-soiltype" hint="Optional, e.g. Sandy loam">
          <Input id="ff-soiltype" value={v.soil_type} onChange={set('soil_type')} />
        </FormField>
        <div className={`${s.row} ${x.alignStart}`}>
          <div className={x.flex1}>
            <FormField label="Latitude" htmlFor="ff-lat" hint="Optional">
              <Input id="ff-lat" type="number" step="0.0001" value={v.latitude} onChange={set('latitude')} />
            </FormField>
          </div>
          <div className={x.flex1}>
            <FormField label="Longitude" htmlFor="ff-lon">
              <Input id="ff-lon" type="number" step="0.0001" value={v.longitude} onChange={set('longitude')} />
            </FormField>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ================================================================ Farms list

export function FarmsPage() {
  const can = useCan();
  const navigate = useNavigate();
  const invalidate = useFarmsInvalidate();
  const { unit } = usePreferences();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 300);
  const [scope, setScope] = useState<'all' | 'mine'>('all');
  const [creating, setCreating] = useState(false);
  const privileged = can('dataset');
  const q = useFarms({
    page,
    page_size: 12,
    search: debounced || undefined,
    mine: privileged ? scope === 'mine' : undefined,
  });

  return (
    <div className={s.page}>
      <PageHeader
        title="Farms"
        description={
          privileged
            ? 'Every farm on the platform. You can open any farm; owners and administrators can edit.'
            : 'Your farms, their seasons, and the predictions, recommendations and risks for each.'
        }
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
            Add farm
          </Button>
        }
      />
      <div className={s.row}>
        <div className={x.searchBox}>
          <Input
            icon={Search}
            placeholder="Search farms, regions or owners…"
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              setPage(1);
            }}
            aria-label="Search farms"
          />
        </div>
        {privileged && (
          <SegmentedControl<'all' | 'mine'>
            label="Show"
            value={scope}
            onChange={v => {
              setScope(v);
              setPage(1);
            }}
            options={[
              { value: 'all', label: 'All farms' },
              { value: 'mine', label: 'My farms' },
            ]}
          />
        )}
      </div>

      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.isPending ? (
        <div className={s.tileGrid}>
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} height={170} />
          ))}
        </div>
      ) : q.data.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Sprout}
            title={debounced ? 'No farms match' : 'No farms yet'}
            description={
              debounced
                ? 'Try another search.'
                : 'Add your first farm to track seasons and get farm-specific recommendations.'
            }
            action={
              !debounced && (
                <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
                  Add farm
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <>
          <div className={`${s.grid} ${x.cardGrid}`}>
            {q.data.items.map(f => (
              <Link key={f.id} to={`/app/farms/${f.id}`} className={x.plainLink}>
                <Card>
                  <div className={s.between}>
                    <strong className={x.textLg}>{f.name}</strong>
                    <Badge>{formatNumber(f.area_ha, 1)} ha</Badge>
                  </div>
                  <div className={`${s.muted} ${x.metaRow}`}>
                    <MapPin size={14} aria-hidden="true" /> {f.region}
                    {privileged && <span> · {f.owner}</span>}
                  </div>
                  <div className={s.chips}>
                    {f.crops.map(c => (
                      <Badge key={c} tone="success">
                        {c}
                      </Badge>
                    ))}
                  </div>
                  <div className={`${s.between} ${x.mt3}`}>
                    <span className={s.small}>{formatCount(f.record_count)} season records</span>
                    <span className={s.num}>
                      {f.latest_yield_kg_ha != null ? formatYieldWithUnit(f.latest_yield_kg_ha, unit) : '—'}
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
          <Pagination page={page} pageSize={12} total={q.data.total} onPageChange={setPage} />
        </>
      )}

      {creating && (
        <FarmForm
          open={creating}
          onOpenChange={setCreating}
          onSaved={f => {
            invalidate();
            navigate(`/app/farms/${f.id}`);
          }}
        />
      )}
    </div>
  );
}

// ================================================================ Farm detail

function RecordForm({
  farm,
  record,
  open,
  onOpenChange,
  onSaved,
}: {
  farm: Farm;
  record?: FarmRecord | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [v, setV] = useState(() => ({
    year: String(record?.year ?? new Date().getFullYear()),
    crop_type: record?.crop_type ?? farm.crops[0] ?? '',
    area_ha: String(record?.area_ha ?? farm.area_ha),
    yield_kg_ha: record?.yield_kg_ha != null ? String(record.yield_kg_ha) : '',
    rainfall_mm: record?.rainfall_mm != null ? String(record.rainfall_mm) : '',
    temperature_c: record?.temperature_c != null ? String(record.temperature_c) : '',
    pesticide_usage_ml: record?.pesticide_usage_ml != null ? String(record.pesticide_usage_ml) : '',
    fertilizer_type: record?.fertilizer_type ?? '',
    fertilizer_kg_ha: record?.fertilizer_kg_ha != null ? String(record.fertilizer_kg_ha) : '',
    irrigation_type: (record?.irrigation_type ?? farm.irrigation_type ?? '') as Irrigation | '',
  }));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setV(p => ({ ...p, [k]: e.target.value }));
  const crops = [...new Set([...farm.crops, ...(useDatasetSummary().data?.crops_supported ?? [])])];

  const save = async () => {
    const year = Number(v.year);
    if (!(year >= 1950 && year <= 2100)) return setError('Year must be between 1950 and 2100.');
    if (!(Number(v.area_ha) > 0)) return setError('Area must be greater than 0.');
    const body: FarmRecordInput = {
      year,
      crop_type: v.crop_type,
      area_ha: Number(v.area_ha),
      yield_kg_ha: num(v.yield_kg_ha),
      rainfall_mm: num(v.rainfall_mm),
      temperature_c: num(v.temperature_c),
      pesticide_usage_ml: num(v.pesticide_usage_ml),
      fertilizer_type: v.fertilizer_type.trim() || null,
      fertilizer_kg_ha: num(v.fertilizer_kg_ha),
      irrigation_type: v.irrigation_type || null,
    };
    setSaving(true);
    try {
      if (record) await farmsApi.updateRecord(farm.id, record.id, body);
      else await farmsApi.addRecord(farm.id, body);
      toast.success(record ? 'Season updated' : 'Season added');
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={record ? `Edit ${record.year} season` : 'Add a season'}
      description="What was grown, how, and what it yielded."
      wide
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={saving}>
            Save season
          </Button>
        </>
      }
    >
      {error && (
        <p className={x.errorP} role="alert">
          {error}
        </p>
      )}
      <div className={`${s.sectionBody} ${x.p0}`}>
        <FormField label="Year" htmlFor="fr-year">
          <Input id="fr-year" type="number" value={v.year} onChange={set('year')} />
        </FormField>
        <FormField label="Crop" htmlFor="fr-crop">
          <Select id="fr-crop" value={v.crop_type} onChange={set('crop_type')} options={crops} />
        </FormField>
        <FormField label="Area planted" htmlFor="fr-area">
          <Input id="fr-area" type="number" step="0.1" suffix="ha" value={v.area_ha} onChange={set('area_ha')} />
        </FormField>
        <FormField label="Yield" htmlFor="fr-yield" hint="Leave empty if not harvested yet">
          <Input id="fr-yield" type="number" suffix="kg/ha" value={v.yield_kg_ha} onChange={set('yield_kg_ha')} />
        </FormField>
        <FormField label="Rainfall" htmlFor="fr-rain">
          <Input id="fr-rain" type="number" suffix="mm" value={v.rainfall_mm} onChange={set('rainfall_mm')} />
        </FormField>
        <FormField label="Average temperature" htmlFor="fr-temp">
          <Input
            id="fr-temp"
            type="number"
            step="0.1"
            suffix="°C"
            value={v.temperature_c}
            onChange={set('temperature_c')}
          />
        </FormField>
        <FormField label="Pesticide use" htmlFor="fr-pest">
          <Input
            id="fr-pest"
            type="number"
            suffix="ml"
            value={v.pesticide_usage_ml}
            onChange={set('pesticide_usage_ml')}
          />
        </FormField>
        <FormField label="Fertilizer" htmlFor="fr-fert">
          <Input id="fr-fert" value={v.fertilizer_type} onChange={set('fertilizer_type')} placeholder="e.g. Urea" />
        </FormField>
        <FormField label="Fertilizer rate" htmlFor="fr-fertkg">
          <Input
            id="fr-fertkg"
            type="number"
            suffix="kg/ha"
            value={v.fertilizer_kg_ha}
            onChange={set('fertilizer_kg_ha')}
          />
        </FormField>
        <FormField label="Irrigation" htmlFor="fr-irr">
          <Select
            id="fr-irr"
            value={v.irrigation_type}
            onChange={set('irrigation_type')}
            options={IRRIGATION}
            placeholder="Not specified"
          />
        </FormField>
      </div>
    </Modal>
  );
}

function SoilTestForm({
  farmId,
  open,
  onOpenChange,
  onSaved,
}: {
  farmId: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [v, setV] = useState({
    sampled_on: new Date().toISOString().slice(0, 10),
    ph: '',
    moisture_percent: '',
    nitrogen_kg_ha: '',
    phosphorus_kg_ha: '',
    potassium_kg_ha: '',
    organic_matter_percent: '',
    lab: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV(p => ({ ...p, [k]: e.target.value }));
  const save = async () => {
    const ph = num(v.ph);
    if (ph == null || ph < 3 || ph > 10) return setError('Enter a pH between 3 and 10.');
    const body: SoilTestInput = {
      farm_id: farmId,
      sampled_on: v.sampled_on,
      ph,
      moisture_percent: num(v.moisture_percent),
      nitrogen_kg_ha: num(v.nitrogen_kg_ha),
      phosphorus_kg_ha: num(v.phosphorus_kg_ha),
      potassium_kg_ha: num(v.potassium_kg_ha),
      organic_matter_percent: num(v.organic_matter_percent),
      lab: v.lab.trim() || null,
    };
    setSaving(true);
    try {
      await soilTestsApi.create(body);
      toast.success('Soil test saved');
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Add a soil test"
      wide
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={saving}>
            Save soil test
          </Button>
        </>
      }
    >
      {error && (
        <p className={x.errorP} role="alert">
          {error}
        </p>
      )}
      <div className={`${s.sectionBody} ${x.p0}`}>
        <FormField label="Sampled on" htmlFor="st-date">
          <Input id="st-date" type="date" value={v.sampled_on} onChange={set('sampled_on')} />
        </FormField>
        <FormField label="pH" htmlFor="st-ph">
          <Input id="st-ph" type="number" step="0.1" value={v.ph} onChange={set('ph')} />
        </FormField>
        <FormField label="Moisture" htmlFor="st-moist">
          <Input id="st-moist" type="number" suffix="%" value={v.moisture_percent} onChange={set('moisture_percent')} />
        </FormField>
        <FormField label="Organic matter" htmlFor="st-om">
          <Input
            id="st-om"
            type="number"
            step="0.1"
            suffix="%"
            value={v.organic_matter_percent}
            onChange={set('organic_matter_percent')}
          />
        </FormField>
        <FormField label="Available N" htmlFor="st-n" hint="kg N/ha">
          <Input id="st-n" type="number" suffix="kg/ha" value={v.nitrogen_kg_ha} onChange={set('nitrogen_kg_ha')} />
        </FormField>
        <FormField label="Available P" htmlFor="st-p" hint="kg P/ha (elemental, Olsen)">
          <Input id="st-p" type="number" suffix="kg/ha" value={v.phosphorus_kg_ha} onChange={set('phosphorus_kg_ha')} />
        </FormField>
        <FormField label="Available K" htmlFor="st-k" hint="kg K/ha (elemental)">
          <Input id="st-k" type="number" suffix="kg/ha" value={v.potassium_kg_ha} onChange={set('potassium_kg_ha')} />
        </FormField>
        <FormField label="Laboratory" htmlFor="st-lab">
          <Input id="st-lab" value={v.lab} onChange={set('lab')} />
        </FormField>
      </div>
    </Modal>
  );
}

export function FarmDetailPage() {
  const { id } = useParams();
  const farmId = Number(id);
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { unit } = usePreferences();
  const invalidate = useFarmsInvalidate();
  const [crop, setCrop] = useState<string | undefined>(undefined);
  const q = useFarm(Number.isFinite(farmId) ? farmId : null, crop);
  const soil = useSoilTests(Number.isFinite(farmId) ? farmId : null);
  const [editing, setEditing] = useState(false);
  const [recordForm, setRecordForm] = useState<{ open: boolean; record?: FarmRecord | null }>({ open: false });
  const [soilForm, setSoilForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteRecord, setDeleteRecord] = useState<FarmRecord | null>(null);
  const f = q.data;
  const canEdit = !!f && !!user && (f.owner.toLowerCase() === user.username.toLowerCase() || role === 'Admin');

  const recordColumns: Column<FarmRecord>[] = useMemo(
    () => [
      { key: 'year', header: 'Year', render: r => <strong className={s.num}>{r.year}</strong>, sortValue: r => r.year },
      { key: 'crop', header: 'Crop', render: r => <Badge tone="success">{r.crop_type}</Badge> },
      { key: 'area', header: 'Area (ha)', align: 'right', render: r => formatNumber(r.area_ha, 1) },
      {
        key: 'yield',
        header: `Yield (${unit})`,
        align: 'right',
        render: r => (r.yield_kg_ha != null ? formatYield(r.yield_kg_ha, unit) : '—'),
      },
      { key: 'rain', header: 'Rainfall (mm)', align: 'right', render: r => formatNumber(r.rainfall_mm, 0) },
      { key: 'temp', header: 'Temp (°C)', align: 'right', render: r => formatNumber(r.temperature_c, 1) },
      { key: 'fert', header: 'Fertilizer', render: r => r.fertilizer_type ?? '—' },
      {
        key: 'actions',
        header: 'Actions',
        render: r =>
          canEdit ? (
            <span className={`${s.row} ${x.rowTight}`}>
              <IconButton
                icon={Pencil}
                label={`Edit ${r.year} season`}
                size="sm"
                onClick={() => setRecordForm({ open: true, record: r })}
              />
              <IconButton
                icon={Trash2}
                label={`Delete ${r.year} season`}
                size="sm"
                onClick={() => setDeleteRecord(r)}
              />
              <IconButton
                icon={Cpu}
                label={`Predict with ${r.year} values`}
                size="sm"
                onClick={() => {
                  setPrefill({
                    crop_type: r.crop_type,
                    region: f?.region ?? '',
                    year: r.year,
                    ...(r.rainfall_mm != null ? { rainfall_mm: r.rainfall_mm } : {}),
                    ...(r.temperature_c != null ? { temperature_C: r.temperature_c } : {}),
                    ...(r.pesticide_usage_ml != null ? { pesticide_usage_ml: r.pesticide_usage_ml } : {}),
                    farm_id: farmId,
                  } as never);
                  navigate(`/app/predict?farm=${farmId}`);
                }}
              />
            </span>
          ) : (
            '—'
          ),
      },
    ],
    [canEdit, unit, f?.region, farmId, navigate],
  );

  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.isPending || !f) return <Skeleton height={400} />;

  const refresh = () => {
    invalidate();
    q.refetch();
  };

  return (
    <div className={s.page}>
      <PageHeader
        title={f.name}
        description={`${f.region} · ${formatNumber(f.area_ha, 1)} ha${f.soil_type ? ` · ${f.soil_type}` : ''} · owner ${f.owner}`}
        meta={
          <>
            {f.crops.map(c => (
              <Badge key={c} tone="success">
                {c}
              </Badge>
            ))}
            {f.irrigation_type && <Badge>{f.irrigation_type} irrigation</Badge>}
          </>
        }
        actions={
          <>
            <ButtonLink
              to={`/app/predict?farm=${f.id}&region=${encodeURIComponent(f.region)}&crop=${encodeURIComponent(f.context_crop)}`}
              icon={Cpu}
            >
              Predict for this farm
            </ButtonLink>
            {canEdit && (
              <>
                <Button icon={Pencil} onClick={() => setEditing(true)}>
                  Edit
                </Button>
                <Button variant="ghost" icon={Trash2} onClick={() => setConfirmDelete(true)}>
                  Delete
                </Button>
              </>
            )}
          </>
        }
      />

      <div className={s.grid}>
        <div className={s.s5}>
          <Card>
            <CardHeader
              title="Location"
              subtitle={f.latitude != null ? 'Farm coordinates' : `${f.region} (region position)`}
            />
            <FarmMap region={f.region} name={f.name} latitude={f.latitude} longitude={f.longitude} />
          </Card>
        </div>
        <div className={s.s7}>
          <Card>
            <CardHeader
              title="Farm context"
              subtitle="Recommendations and risks use this farm’s region and the selected crop"
              actions={
                f.crops.length > 1 ? (
                  <Select
                    aria-label="Crop"
                    value={f.context_crop}
                    onChange={e => setCrop(e.target.value)}
                    options={f.crops}
                    className={x.w150}
                  />
                ) : undefined
              }
            />
            <dl className={s.dl}>
              <dt>
                Reference mean yield ({f.region} · {f.context_crop})
              </dt>
              <dd>{formatYieldWithUnit(f.reference_mean_kg_ha, unit)}</dd>
              <dt>Latest recorded yield</dt>
              <dd>
                {f.records[0]?.yield_kg_ha != null
                  ? `${formatYieldWithUnit(f.records[0].yield_kg_ha, unit)} (${f.records[0].year})`
                  : '—'}
              </dd>
              <dt>Soil pH</dt>
              <dd>{f.soil_ph != null ? formatIndex(f.soil_ph) : '—'}</dd>
              <dt>Soil moisture</dt>
              <dd>{f.soil_moisture_percent != null ? `${formatNumber(f.soil_moisture_percent, 1)}%` : '—'}</dd>
            </dl>
            <div className={`${s.row} ${x.mt4}`}>
              {f.risks
                .filter(r => r.level !== 'Low')
                .map(r => (
                  <Badge key={r.type} tone={ratingTone(r.level === 'Moderate' ? 'medium' : r.level, false)}>
                    {r.label}: {r.level}
                  </Badge>
                ))}
              {f.risks.every(r => r.level === 'Low') && <Badge tone="success">All risks low</Badge>}
            </div>
          </Card>
        </div>

        <div className={s.s12}>
          <Card>
            <CardHeader
              title="Season records"
              subtitle={`${f.records.length} seasons`}
              actions={
                canEdit ? (
                  <Button
                    size="sm"
                    variant="primary"
                    icon={Plus}
                    onClick={() => setRecordForm({ open: true, record: null })}
                  >
                    Add season
                  </Button>
                ) : undefined
              }
            />
            {f.records.length ? (
              <DataTable caption="Season records" columns={recordColumns} rows={f.records} rowKey={r => String(r.id)} />
            ) : (
              <EmptyState
                title="No seasons recorded"
                description="Add a season, or import many at once from Data collection."
              />
            )}
          </Card>
        </div>

        <div className={s.s6}>
          <Card>
            <CardHeader
              title="Recommendations"
              subtitle={`${f.region} · ${f.context_crop}`}
              actions={
                <ButtonLink to={`/app/recommendations?farm=${f.id}`} size="sm" variant="ghost">
                  Open
                </ButtonLink>
              }
            />
            {f.recommendations.length ? (
              <ul className={s.list}>
                {f.recommendations.map(r => (
                  <li key={r.id} className={s.between}>
                    <span className={`${s.row} ${x.gap2}`}>
                      <Badge
                        tone={
                          r.severity === 'critical'
                            ? 'danger'
                            : r.severity === 'high'
                              ? 'warning'
                              : r.severity === 'medium'
                                ? 'info'
                                : 'neutral'
                        }
                      >
                        {r.severity}
                      </Badge>
                      {r.title}
                    </span>
                    {r.impact_kg_ha != null && r.impact_kg_ha > 0 && (
                      <span className={s.num}>+{formatYield(r.impact_kg_ha, unit)}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={s.muted}>No issues found for this context.</p>
            )}
          </Card>
        </div>

        <div className={s.s6}>
          <Card>
            <CardHeader
              title="Predictions"
              subtitle="Linked to this farm"
              actions={
                <ButtonLink to={`/app/history?farm=${f.id}`} size="sm" variant="ghost">
                  History
                </ButtonLink>
              }
            />
            {f.predictions.length ? (
              <ul className={s.list}>
                {(
                  f.predictions as {
                    id: string;
                    created_at: string;
                    crop_type: string;
                    year?: number;
                    predicted_yield_kg_ha: number;
                  }[]
                )
                  .slice(0, 6)
                  .map(p => (
                    <li key={p.id} className={s.between}>
                      <span>
                        {p.crop_type} {p.year ?? ''}{' '}
                        <span className={s.small}>· {new Date(p.created_at).toLocaleDateString()}</span>
                      </span>
                      <span className={s.num}>{formatYieldWithUnit(p.predicted_yield_kg_ha, unit)}</span>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className={s.muted}>No predictions yet. Use “Predict for this farm”.</p>
            )}
          </Card>
        </div>

        <div className={s.s12}>
          <FarmSoilPanel farmId={f.id} farmName={f.name} />
        </div>

        <div className={s.s12}>
          <Card>
            <CardHeader
              title="Soil tests"
              subtitle="Lab or field measurements (stored in MongoDB)"
              actions={
                canEdit ? (
                  <Button size="sm" icon={Plus} onClick={() => setSoilForm(true)}>
                    Add soil test
                  </Button>
                ) : undefined
              }
            />
            {soil.isPending ? (
              <Skeleton height={80} />
            ) : soil.data && soil.data.length ? (
              <DataTable
                caption="Soil tests"
                rows={soil.data}
                rowKey={t => t.id}
                columns={[
                  { key: 'date', header: 'Sampled', render: t => t.sampled_on },
                  { key: 'ph', header: 'pH', align: 'right', render: t => formatIndex(t.ph) },
                  {
                    key: 'm',
                    header: 'Moisture (%)',
                    align: 'right',
                    render: t => formatNumber(t.moisture_percent, 1),
                  },
                  { key: 'n', header: 'N (kg/ha)', align: 'right', render: t => formatNumber(t.nitrogen_kg_ha, 0) },
                  { key: 'p', header: 'P (kg/ha)', align: 'right', render: t => formatNumber(t.phosphorus_kg_ha, 0) },
                  { key: 'k', header: 'K (kg/ha)', align: 'right', render: t => formatNumber(t.potassium_kg_ha, 0) },
                  {
                    key: 'om',
                    header: 'Organic matter (%)',
                    align: 'right',
                    render: t => formatNumber(t.organic_matter_percent, 1),
                  },
                  { key: 'src', header: 'Source', render: t => <Badge>{t.source}</Badge> },
                ]}
              />
            ) : (
              <p className={s.muted}>No soil tests yet.</p>
            )}
          </Card>
        </div>
      </div>

      {editing && <FarmForm open={editing} onOpenChange={setEditing} farm={f} onSaved={refresh} />}
      {recordForm.open && (
        <RecordForm
          farm={f}
          record={recordForm.record}
          open={recordForm.open}
          onOpenChange={o => setRecordForm({ open: o })}
          onSaved={refresh}
        />
      )}
      {soilForm && (
        <SoilTestForm
          farmId={f.id}
          open={soilForm}
          onOpenChange={setSoilForm}
          onSaved={() => {
            void soil.refetch();
            refresh();
          }}
        />
      )}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${f.name}?`}
        description="This removes the farm, its season records and soil tests. Predictions stay in history without the farm link."
        confirmLabel="Delete farm"
        tone="danger"
        onConfirm={async () => {
          try {
            await farmsApi.remove(f.id);
            toast.success('Farm deleted');
            invalidate();
            navigate('/app/farms');
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
      />
      <ConfirmDialog
        open={!!deleteRecord}
        onOpenChange={o => !o && setDeleteRecord(null)}
        title={`Delete the ${deleteRecord?.year} season?`}
        description="This can’t be undone."
        confirmLabel="Delete season"
        tone="danger"
        onConfirm={async () => {
          if (!deleteRecord) return;
          try {
            await farmsApi.removeRecord(f.id, deleteRecord.id);
            toast.success('Season deleted');
            setDeleteRecord(null);
            refresh();
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
      />
    </div>
  );
}
