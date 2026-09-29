import React, { useState } from 'react';
import { Search, Download, ChevronLeft, ChevronRight, Database } from 'lucide-react';
import type { CropRecord } from '../api/types';
import { useDatasetSummary, useRecords } from '../hooks/queries';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { formatCount, formatRange } from '../lib/format';
import { selectSummaryKpis } from '../lib/selectors';
import { useGlobalFilters } from '../store/filters';
import { ErrorState, LoadingState } from './ui/States';

const PAGE_SIZE = 15;

export const DataExplorer: React.FC = () => {
  const { filters, setFilters } = useGlobalFilters();
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  const summaryQuery = useDatasetSummary();
  const cropsList = selectSummaryKpis(summaryQuery.data)?.crops ?? [];
  const recordsQuery = useRecords({
    page,
    limit: PAGE_SIZE,
    crop_type: filters.crop || undefined,
    region: filters.region || undefined,
    search: debouncedSearch || undefined,
  });

  const records: CropRecord[] = recordsQuery.data?.data ?? [];
  const totalRecords = recordsQuery.data?.total_records ?? 0;
  const totalPages = recordsQuery.data?.total_pages ?? 1;
  const selectedCrop = filters.crop;

  const setSelectedCrop = (crop: string) => {
    setFilters({ crop });
    setPage(1);
  };
  const onSearchChange = (query: string) => {
    setSearchQuery(query);
    setPage(1);
  };

  /** Exports the rows currently shown. Full filtered export arrives with the reports endpoint in Phase 3. */
  const exportCSV = () => {
    if (!records.length) return;
    const keys = Object.keys(records[0]) as (keyof CropRecord)[];
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csvContent = [keys.join(','), ...records.map(r => keys.map(k => escape(r[k])).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'yieldsense-records.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (recordsQuery.isPending) return <LoadingState label="Loading records…" />;
  if (recordsQuery.isError) return <ErrorState error={recordsQuery.error} onRetry={() => recordsQuery.refetch()} />;

  return (
    <div className="glass-card" style={{ padding: '1.75rem' }}>
      
      {/* Header Controls Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1.25rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Database size={20} color="var(--primary)" aria-hidden="true" />
            Dataset Explorer
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            {formatRange(page, PAGE_SIZE, totalRecords)} records
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search farm, region..."
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value)}
              aria-label="Search records"
              className="input-control"
              style={{ paddingLeft: '2.4rem', width: '230px' }}
            />
          </div>

          <select
            value={selectedCrop}
            onChange={e => setSelectedCrop(e.target.value)}
            className="input-control"
            style={{ minWidth: '150px' }}
            aria-label="Filter by crop"
          >
            <option value="">All crops</option>
            {cropsList.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <button className="btn-primary" onClick={exportCSV}>
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Spacious Data Table */}
      <div className="table-container">
        <table className="custom-table">
          <thead>
            <tr>
              <th style={{ paddingLeft: '1.5rem' }}>Farm ID</th>
              <th>Region</th>
              <th>Crop</th>
              <th>Soil pH</th>
              <th>Temp (°C)</th>
              <th>Rainfall (mm)</th>
              <th>Irrigation</th>
              <th>Fertilizer</th>
              <th>Duration</th>
              <th>Yield (kg/ha)</th>
              <th>NDVI</th>
              <th style={{ paddingRight: '1.5rem' }}>Disease</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r, idx) => (
              <tr key={r.farm_id ?? idx}>
                <td style={{ paddingLeft: '1.5rem', fontWeight: 'var(--weight-semibold)', color: 'var(--ink)' }} className="num">{r.farm_id}</td>
                <td style={{ color: 'var(--text-main)' }}>{r.region}</td>
                <td>
                  <span className="badge badge-green">{r.crop_type}</span>
                </td>
                <td style={{ color: 'var(--text-main)', fontWeight: 600 }}>{r.soil_pH}</td>
                <td style={{ color: 'var(--text-main)' }}>{r.temperature_C}°C</td>
                <td style={{ color: 'var(--text-main)' }}>{r.rainfall_mm} mm</td>
                <td style={{ color: 'var(--text-muted)' }}>{r.irrigation_type}</td>
                <td style={{ color: 'var(--text-muted)' }}>{r.fertilizer_type}</td>
                <td style={{ color: 'var(--text-muted)' }}>{r.total_days} days</td>
                <td className="num" style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--ink)' }}>
                  {formatCount(r.yield_kg_per_hectare)}
                </td>
                <td style={{ fontWeight: 600, color: 'var(--text-main)' }}>{r.NDVI_index}</td>
                <td style={{ paddingRight: '1.5rem' }}>
                  <span className={`badge ${r.crop_disease_status === 'None' ? 'badge-green' : r.crop_disease_status === 'Mild' ? 'badge-blue' : r.crop_disease_status === 'Moderate' ? 'badge-amber' : 'badge-red'}`}>
                    {r.crop_disease_status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Table Pagination */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          Page <strong style={{ color: 'var(--ink)' }}>{formatCount(page)}</strong> of <strong style={{ color: 'var(--ink)' }}>{formatCount(totalPages)}</strong>
        </span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="tab-btn"
            style={{ opacity: page === 1 ? 0.5 : 1, cursor: page === 1 ? 'not-allowed' : 'pointer' }}
          >
            <ChevronLeft size={16} /> Previous
          </button>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="tab-btn"
            style={{ opacity: page >= totalPages ? 0.5 : 1, cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
      </div>

    </div>
  );
};
