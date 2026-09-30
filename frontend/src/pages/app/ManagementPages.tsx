import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, FileUp, History, ShieldCheck, Upload as UploadIcon } from 'lucide-react';
import { errorMessage } from '../../api/client';
import { uploadsApi } from '../../api/endpoints';
import type { AdminUser, Upload, UploadKind } from '../../api/types';
import { useAuth, useCan } from '../../auth/context';
import {
  Badge,
  Banner,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FormField,
  PageHeader,
  Pagination,
  Select,
  Skeleton,
  Switch,
  Tabs,
  type Column,
} from '../../components/ui';
import { ErrorState } from '../../components/ui/States';
import { useAdminUsers, useAuditLog, useFarms, useUpdateUser, useUploads } from '../../hooks/queries';
import { formatCount } from '../../lib/format';
import s from './app.module.css';

const KINDS: { value: UploadKind; label: string; help: string; privileged?: boolean; farm?: boolean }[] = [
  {
    value: 'farm_records',
    label: 'Farm season records',
    help: 'Year, crop, area and yield per season for one of your farms.',
    farm: true,
  },
  {
    value: 'soil_tests',
    label: 'Soil tests',
    help: 'Sample date, pH and nutrients for one of your farms.',
    farm: true,
  },
  {
    value: 'crop_records',
    label: 'Crop records (reference data)',
    help: 'Region, crop, year and yield rows added to the shared dataset.',
    privileged: true,
  },
  {
    value: 'weather',
    label: 'Weather observations',
    help: 'Region, year and optional month with rainfall, temperature, humidity and sunlight.',
    privileged: true,
  },
];

const STATUS_TONE = { uploaded: 'neutral', validated: 'info', imported: 'success' } as const;

// ================================================================ Data collection

export function DataCollectionPage() {
  const can = useCan();
  const privileged = can('dataset');
  const kinds = KINDS.filter(k => privileged || !k.privileged);
  const [tab, setTab] = useState('upload');
  const [kind, setKind] = useState<UploadKind>(kinds[0].value);
  const [farmId, setFarmId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [upload, setUpload] = useState<Upload | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState<'upload' | 'validate' | 'import' | null>(null);
  const [confirmImport, setConfirmImport] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const farms = useFarms({ page: 1, page_size: 100, mine: true });
  const history = useUploads(historyPage);
  const spec = KINDS.find(k => k.value === kind)!;
  const step = !upload ? 1 : upload.status === 'uploaded' ? 2 : upload.status === 'validated' ? 3 : 4;

  const reset = () => {
    setUpload(null);
    setFile(null);
    setMapping({});
    if (inputRef.current) inputRef.current.value = '';
  };

  const doUpload = async () => {
    if (!file) return;
    if (spec.farm && !farmId) return toast.error('Choose the farm these rows belong to.');
    setBusy('upload');
    try {
      const u = await uploadsApi.upload(kind, file, spec.farm ? Number(farmId) : undefined);
      setUpload(u);
      setMapping(u.mapping);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const doValidate = async () => {
    if (!upload) return;
    setBusy('validate');
    try {
      setUpload(await uploadsApi.validate(upload.id, mapping));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const doImport = async () => {
    if (!upload) return;
    setBusy('import');
    try {
      const u = await uploadsApi.import(upload.id);
      setUpload(u);
      toast.success(`Imported ${formatCount(Number(u.report?.imported_rows ?? 0))} rows`);
      history.refetch();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
      setConfirmImport(false);
    }
  };

  const report = upload?.report as
    | {
        valid_rows: number;
        invalid_rows: number;
        error_count: number;
        errors: { row: number; field: string; message: string }[];
        clean_preview: Record<string, unknown>[];
        imported_rows?: number;
      }
    | null
    | undefined;
  const previewCols = useMemo(() => (upload ? upload.columns.slice(0, 8) : []), [upload]);

  const historyColumns: Column<Upload>[] = [
    { key: 'when', header: 'Uploaded', render: u => new Date(u.created_at).toLocaleString() },
    { key: 'file', header: 'File', render: u => u.filename },
    { key: 'kind', header: 'Type', render: u => KINDS.find(k => k.value === u.kind)?.label ?? u.kind },
    { key: 'rows', header: 'Rows', align: 'right', render: u => formatCount(u.row_count) },
    {
      key: 'imported',
      header: 'Imported',
      align: 'right',
      render: u => formatCount(Number((u.report as { imported_rows?: number } | null)?.imported_rows ?? 0)),
    },
    { key: 'status', header: 'Status', render: u => <Badge tone={STATUS_TONE[u.status]}>{u.status}</Badge> },
    { key: 'user', header: 'By', render: u => u.user },
  ];

  const wizard = (
    <div className={s.grid}>
      <div className={s.s8}>
        <Card>
          <CardHeader
            title={`Step ${Math.min(step, 3)} of 3 · ${step === 1 ? 'Choose a file' : step === 2 ? 'Map columns' : step === 3 ? 'Review and import' : 'Imported'}`}
            subtitle="CSV or Excel (.xlsx), up to 10 MB and 50,000 rows"
          />
          {step === 1 && (
            <div className={s.stack}>
              <FormField label="What are you uploading?" htmlFor="dc-kind" hint={spec.help}>
                <Select
                  id="dc-kind"
                  value={kind}
                  onChange={e => setKind(e.target.value as UploadKind)}
                  options={kinds.map(k => ({ value: k.value, label: k.label }))}
                />
              </FormField>
              {spec.farm && (
                <FormField label="Farm" htmlFor="dc-farm">
                  <Select
                    id="dc-farm"
                    value={farmId}
                    onChange={e => setFarmId(e.target.value)}
                    options={(farms.data?.items ?? []).map(f => ({
                      value: String(f.id),
                      label: `${f.name} · ${f.region}`,
                    }))}
                    placeholder="Choose a farm"
                  />
                </FormField>
              )}
              <label
                htmlFor="dc-file"
                className={s.tile}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  padding: 'var(--space-8)',
                  borderStyle: 'dashed',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) setFile(f);
                }}
              >
                <FileUp size={28} color="var(--primary)" aria-hidden="true" />
                <strong>{file ? file.name : 'Drop a file here or click to browse'}</strong>
                <span className={s.small}>
                  {file ? `${formatCount(Math.round(file.size / 1024))} KB` : '.csv or .xlsx'}
                </span>
                <input
                  id="dc-file"
                  ref={inputRef}
                  type="file"
                  accept=".csv,.xlsx"
                  className="sr-only"
                  onChange={e => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <div>
                <Button
                  variant="primary"
                  icon={UploadIcon}
                  onClick={doUpload}
                  loading={busy === 'upload'}
                  disabled={!file}
                >
                  Upload and continue
                </Button>
              </div>
            </div>
          )}

          {step === 2 && upload && (
            <div className={s.stack}>
              <p className={s.muted} style={{ margin: 0 }}>
                {upload.filename} · {formatCount(upload.row_count)} rows. Match each field to a column in your file; we
                guessed where we could.
              </p>
              <div className={s.sectionBody} style={{ padding: 0 }}>
                {upload.fields.map(f => (
                  <FormField
                    key={f.name}
                    label={`${f.name}${f.required ? ' *' : ''}`}
                    htmlFor={`map-${f.name}`}
                    hint={f.type}
                  >
                    <Select
                      id={`map-${f.name}`}
                      value={mapping[f.name] ?? ''}
                      onChange={e => setMapping(m => ({ ...m, [f.name]: e.target.value || null }))}
                      options={upload.columns}
                      placeholder={f.required ? 'Choose a column' : 'Not in this file'}
                    />
                  </FormField>
                ))}
              </div>
              <div className={s.row}>
                <Button variant="primary" onClick={doValidate} loading={busy === 'validate'}>
                  Validate rows
                </Button>
                <Button variant="ghost" onClick={reset}>
                  Start over
                </Button>
              </div>
            </div>
          )}

          {step >= 3 && upload && report && (
            <div className={s.stack}>
              {step === 4 ? (
                <Banner tone="success">
                  Imported {formatCount(report.imported_rows ?? 0)} rows from {upload.filename}.{' '}
                  {report.invalid_rows ? `${formatCount(report.invalid_rows)} invalid rows were skipped.` : ''}
                </Banner>
              ) : report.invalid_rows ? (
                <Banner tone="warning">
                  {formatCount(report.valid_rows)} rows are valid and {formatCount(report.invalid_rows)} have errors.
                  Importing adds only the valid rows.
                </Banner>
              ) : (
                <Banner tone="success">All {formatCount(report.valid_rows)} rows are valid.</Banner>
              )}
              {report.errors.length > 0 && (
                <DataTable
                  caption="Row errors"
                  rows={report.errors}
                  rowKey={e => `${e.row}-${e.field}`}
                  maxHeight={260}
                  compact
                  columns={[
                    { key: 'row', header: 'Row', align: 'right', render: e => e.row },
                    { key: 'field', header: 'Field', render: e => e.field },
                    { key: 'msg', header: 'Problem', render: e => e.message },
                  ]}
                />
              )}
              {report.error_count > report.errors.length && (
                <p className={s.small}>
                  Showing the first {report.errors.length} of {formatCount(report.error_count)} errors.
                </p>
              )}
              <div className={s.row}>
                {step === 3 ? (
                  <>
                    <Button
                      variant="primary"
                      icon={CheckCircle2}
                      onClick={() => setConfirmImport(true)}
                      disabled={!report.valid_rows}
                    >
                      Import {formatCount(report.valid_rows)} rows
                    </Button>
                    <Button onClick={() => setUpload({ ...upload, status: 'uploaded' })}>Change mapping</Button>
                  </>
                ) : (
                  <Button variant="primary" icon={UploadIcon} onClick={reset}>
                    Upload another file
                  </Button>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>
      <div className={s.s4}>
        <Card>
          <CardHeader
            title="File preview"
            subtitle={upload ? `First rows of ${upload.filename}` : 'Appears after upload'}
          />
          {upload ? (
            <div style={{ overflowX: 'auto' }}>
              <DataTable
                caption="File preview"
                compact
                rows={upload.preview.slice(0, 6)}
                rowKey={r => JSON.stringify(r)}
                columns={previewCols.map(c => ({
                  key: c,
                  header: c,
                  render: (r: Record<string, unknown>) => String(r[c] ?? ''),
                }))}
              />
            </div>
          ) : (
            <EmptyState
              icon={FileUp}
              title="No file yet"
              description="Raw rows and the validation report are kept, so you can review every import."
            />
          )}
        </Card>
      </div>
    </div>
  );

  return (
    <div className={s.page}>
      <PageHeader
        title="Data collection"
        description="Import farm seasons, soil tests, crop records and weather observations from spreadsheets, with validation before anything is saved."
      />
      <Tabs
        label="Data collection"
        value={tab}
        onValueChange={setTab}
        tabs={[
          { value: 'upload', label: 'Upload', content: wizard },
          {
            value: 'history',
            label: 'Import history',
            content: history.isError ? (
              <ErrorState error={history.error} onRetry={() => history.refetch()} />
            ) : history.isPending ? (
              <Skeleton height={200} />
            ) : history.data.items.length ? (
              <Card>
                <DataTable
                  caption="Import history"
                  columns={historyColumns}
                  rows={history.data.items}
                  rowKey={u => u.id}
                />
                <Pagination page={historyPage} pageSize={20} total={history.data.total} onPageChange={setHistoryPage} />
              </Card>
            ) : (
              <Card>
                <EmptyState
                  icon={History}
                  title="No uploads yet"
                  description="Files you upload appear here with their validation results."
                />
              </Card>
            ),
          },
        ]}
      />
      <ConfirmDialog
        open={confirmImport}
        onOpenChange={setConfirmImport}
        title="Import the valid rows?"
        description={`${formatCount(report?.valid_rows ?? 0)} rows will be added. Rows with errors are skipped.`}
        confirmLabel="Import"
        onConfirm={doImport}
        loading={busy === 'import'}
      />
    </div>
  );
}

// ================================================================ Users & roles (admin)

export function UsersPage() {
  const { user: me } = useAuth();
  const users = useAdminUsers();
  const audit = useAuditLog();
  const update = useUpdateUser();
  const [tab, setTab] = useState('users');
  const [pending, setPending] = useState<{ user: AdminUser; role?: string; active?: boolean } | null>(null);

  const apply = async () => {
    if (!pending) return;
    try {
      await update.mutateAsync({ username: pending.user.username, role: pending.role, active: pending.active });
      toast.success('User updated');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(null);
    }
  };

  const columns: Column<AdminUser>[] = [
    { key: 'name', header: 'Name', render: u => <strong>{u.full_name}</strong>, sortValue: u => u.full_name },
    { key: 'username', header: 'Username', render: u => u.username },
    { key: 'email', header: 'Email', render: u => u.email },
    {
      key: 'role',
      header: 'Role',
      render: u => (
        <Select
          aria-label={`Role for ${u.username}`}
          value={u.role}
          disabled={u.username === me?.username}
          onChange={e => setPending({ user: u, role: e.target.value })}
          options={['Farmer', 'Agronomist', 'Admin']}
          style={{ width: 140, height: 32 }}
        />
      ),
    },
    {
      key: 'active',
      header: 'Active',
      render: u => (
        <Switch
          label={u.active ? 'Active' : 'Inactive'}
          checked={u.active}
          disabled={u.username === me?.username}
          onCheckedChange={v => setPending({ user: u, active: v })}
        />
      ),
    },
  ];

  return (
    <div className={s.page}>
      <PageHeader
        title="Users & roles"
        description="Change roles, activate or deactivate accounts, and review the audit log. You can’t change your own role or deactivate yourself."
        meta={
          <Badge tone="model" icon={ShieldCheck}>
            Administrator
          </Badge>
        }
      />
      <Card>
        <dl
          className={s.dl}
          style={{ gridTemplateColumns: 'repeat(4, auto)', justifyContent: 'start', columnGap: 'var(--space-8)' }}
        >
          <dt>Farmer</dt>
          <dd style={{ textAlign: 'left' }}>Predictions, weather, soil, recommendations, risk, farms, analytics</dd>
          <dt>Agronomist</dt>
          <dd style={{ textAlign: 'left' }}>Farmer screens + EDA, dataset, model performance, reference imports</dd>
          <dt>Admin</dt>
          <dd style={{ textAlign: 'left' }}>Everything + users & roles</dd>
        </dl>
      </Card>
      <Tabs
        label="Users and audit"
        value={tab}
        onValueChange={setTab}
        tabs={[
          {
            value: 'users',
            label: `Users (${users.data?.total ?? '—'})`,
            content: users.isError ? (
              <ErrorState error={users.error} onRetry={() => users.refetch()} />
            ) : users.isPending ? (
              <Skeleton height={240} />
            ) : (
              <Card>
                <DataTable caption="Users" columns={columns} rows={users.data.items} rowKey={u => u.username} />
              </Card>
            ),
          },
          {
            value: 'audit',
            label: 'Audit log',
            content: audit.isPending ? (
              <Skeleton height={200} />
            ) : audit.data?.items.length ? (
              <Card>
                <DataTable
                  caption="Audit log"
                  rows={audit.data.items}
                  rowKey={a => a.id}
                  columns={[
                    { key: 'when', header: 'When', render: a => new Date(a.created_at).toLocaleString() },
                    { key: 'actor', header: 'By', render: a => a.actor },
                    { key: 'action', header: 'Action', render: a => <Badge>{a.action.replace('_', ' ')}</Badge> },
                    { key: 'target', header: 'User', render: a => a.target },
                    {
                      key: 'detail',
                      header: 'Detail',
                      render: a =>
                        a.detail && 'from' in a.detail ? `${String(a.detail.from)} → ${String(a.detail.to)}` : '—',
                    },
                  ]}
                />
              </Card>
            ) : (
              <Card>
                <EmptyState title="No changes yet" description="Role and status changes are recorded here." />
              </Card>
            ),
          },
        ]}
      />
      <ConfirmDialog
        open={!!pending}
        onOpenChange={o => !o && setPending(null)}
        title={
          pending?.role
            ? `Change ${pending.user.username}’s role to ${pending.role}?`
            : `${pending?.active ? 'Activate' : 'Deactivate'} ${pending?.user.username}?`
        }
        description={
          pending?.active === false
            ? 'They are signed out immediately and can’t sign in until reactivated.'
            : 'The change applies to their next request and is recorded in the audit log.'
        }
        confirmLabel="Confirm"
        tone={pending?.active === false ? 'danger' : 'primary'}
        onConfirm={apply}
        loading={update.isPending}
      />
    </div>
  );
}
