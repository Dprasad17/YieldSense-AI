/**
 * Theme-aware chart library on Recharts. Every chart has axes, gridlines, a custom tooltip,
 * a legend where there are several series, and a screen-reader summary.
 */
import { memo, useRef, useState, type ReactNode } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { Download, Maximize2 } from 'lucide-react';
import { Card, CardHeader, IconButton, InsightCallout, Modal } from '../ui';
import { regression } from './regression';
import { useChartColors, type ChartColors } from './theme';
import cs from './charts.module.css';

type Fmt = (v: number) => string;
const plain: Fmt = v => v.toLocaleString('en-US', { maximumFractionDigits: 2 });

// ---------------------------------------------------------------- ChartCard

async function downloadPng(container: HTMLElement | null, filename: string, background: string) {
  const svg = container?.querySelector('svg.recharts-surface');
  if (!svg) return;
  const { width, height } = svg.getBoundingClientRect();
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  const data = new XMLSerializer().serializeToString(clone);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([data], { type: 'image/svg+xml;charset=utf-8' }));
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('render failed'));
    img.src = url;
  });
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `${filename}.png`;
  a.click();
}

export interface ChartCardProps {
  title: string;
  subtitle?: ReactNode;
  info?: string;
  insight?: ReactNode;
  actions?: ReactNode;
  /** Plain-language summary for screen readers. */
  summary: string;
  height?: number;
  children: (colors: ChartColors, height: number) => ReactNode;
  legend?: { label: string; color: keyof ChartColors | string }[];
}

export function ChartCard({
  title,
  subtitle,
  info,
  insight,
  actions,
  summary,
  height = 260,
  children,
  legend,
}: ChartCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const colors = useChartColors(ref);
  const [expanded, setExpanded] = useState(false);
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const legendEl = legend && legend.length > 0 && (
    <div className={cs.legend}>
      {legend.map(l => (
        <span key={l.label} className={cs.legendItem}>
          <span
            className={cs.swatch}
            style={{ background: (colors as Record<string, string>)[l.color] ?? l.color }}
            aria-hidden="true"
          />
          {l.label}
        </span>
      ))}
    </div>
  );
  return (
    <Card>
      <CardHeader
        title={title}
        subtitle={subtitle}
        info={info}
        actions={
          <>
            {actions}
            <IconButton
              icon={Download}
              label={`Download ${title} as PNG`}
              size="sm"
              onClick={() => downloadPng(ref.current, slug, colors.surface)}
            />
            <IconButton icon={Maximize2} label={`Expand ${title}`} size="sm" onClick={() => setExpanded(true)} />
          </>
        }
      />
      <div ref={ref} className={cs.body} role="figure" aria-label={`${title}. ${summary}`}>
        <div aria-hidden="true">{children(colors, height)}</div>
        <p className="sr-only">{summary}</p>
      </div>
      {legendEl}
      {insight && <InsightCallout>{insight}</InsightCallout>}
      <Modal open={expanded} onOpenChange={setExpanded} title={title} description={subtitle} wide>
        <div className={cs.body}>{children(colors, 480)}</div>
        {legendEl}
      </Modal>
    </Card>
  );
}

// ---------------------------------------------------------------- shared bits

interface TipPayload {
  name?: string;
  value?: number | [number, number];
  color?: string;
  dataKey?: string | number;
}

function ChartTooltip({
  active,
  payload,
  label,
  fx,
  fy,
  names,
}: {
  active?: boolean;
  payload?: TipPayload[];
  label?: string | number;
  fx: Fmt;
  fy: Fmt;
  names?: Record<string, string>;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className={cs.tooltip}>
      <div className={cs.tooltipTitle}>{typeof label === 'number' ? fx(label) : label}</div>
      {payload.map(p => (
        <div key={String(p.dataKey)} className={cs.tooltipRow}>
          <span>
            <span className={cs.swatch} style={{ background: p.color }} />
            {names?.[String(p.dataKey)] ?? p.name}
          </span>
          <span>
            {Array.isArray(p.value) ? `${fy(p.value[0])}–${fy(p.value[1])}` : p.value != null ? fy(p.value) : '—'}
          </span>
        </div>
      ))}
    </div>
  );
}

const axisProps = (c: ChartColors) => ({
  stroke: c.border,
  tick: { fill: c.muted, fontSize: 12 },
  tickLine: false,
});

// ---------------------------------------------------------------- Trend with forecast band

export interface TrendPoint {
  x: number | string;
  actual?: number | null;
  forecast?: number | null;
  band?: [number, number] | null;
}

export const TrendChart = memo(function TrendChart({
  data,
  colors,
  height,
  fx = plain,
  fy = plain,
  actualLabel = 'Actual',
  forecastLabel = 'Forecast',
  color,
}: {
  data: TrendPoint[];
  colors: ChartColors;
  height: number;
  fx?: Fmt;
  fy?: Fmt;
  actualLabel?: string;
  forecastLabel?: string;
  color?: string;
}) {
  const main = color ?? colors['data-vegetation'];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart accessibilityLayer={false} data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={colors.border} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="x" {...axisProps(colors)} tickFormatter={v => (typeof v === 'number' ? fx(v) : String(v))} />
        <YAxis {...axisProps(colors)} tickFormatter={fy} width={64} axisLine={false} />
        <RTooltip
          content={
            <ChartTooltip
              fx={fx}
              fy={fy}
              names={{ actual: actualLabel, forecast: forecastLabel, band: 'Confidence band' }}
            />
          }
        />
        <Area dataKey="band" stroke="none" fill={colors['data-model']} fillOpacity={0.18} isAnimationActive={false} />
        <Line
          dataKey="actual"
          stroke={main}
          strokeWidth={2.5}
          dot={{ r: 3, fill: main }}
          connectNulls={false}
          isAnimationActive={false}
        />
        <Line
          dataKey="forecast"
          stroke={colors['data-model']}
          strokeWidth={2.5}
          strokeDasharray="6 5"
          dot={{ r: 4, fill: colors['data-model'] }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
});

// ---------------------------------------------------------------- Horizontal ranking

export const RankBarChart = memo(function RankBarChart({
  data,
  colors,
  height,
  fy = plain,
  color,
  benchmark,
  benchmarkLabel = 'Average',
  highlight,
}: {
  data: { label: string; value: number }[];
  colors: ChartColors;
  height: number;
  fy?: Fmt;
  color?: string;
  benchmark?: number;
  benchmarkLabel?: string;
  highlight?: string;
}) {
  const fill = color ?? colors['data-vegetation'];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        accessibilityLayer={false}
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 24, bottom: 0, left: 8 }}
      >
        <CartesianGrid stroke={colors.border} strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" {...axisProps(colors)} tickFormatter={fy} />
        <YAxis type="category" dataKey="label" {...axisProps(colors)} width={110} axisLine={false} />
        <RTooltip
          cursor={{ fill: colors['surface-2'] }}
          content={<ChartTooltip fx={plain} fy={fy} names={{ value: 'Value' }} />}
        />
        {benchmark != null && (
          <ReferenceLine
            x={benchmark}
            stroke={colors.warning}
            strokeDasharray="4 4"
            label={{ value: benchmarkLabel, fill: colors.muted, fontSize: 11, position: 'top' }}
          />
        )}
        <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {data.map(d => (
            <Cell key={d.label} fill={fill} fillOpacity={highlight && d.label !== highlight ? 0.45 : 1} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
});

// ---------------------------------------------------------------- Vertical bars (compare / histogram)

export const BarCompareChart = memo(function BarCompareChart({
  data,
  colors,
  height,
  fx,
  fy = plain,
  color,
  refLines,
}: {
  data: { label: string; value: number }[];
  colors: ChartColors;
  height: number;
  fx?: (v: string) => string;
  fy?: Fmt;
  color?: string;
  refLines?: { x: string; label: string; color?: string }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart accessibilityLayer={false} data={data} margin={{ top: 16, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={colors.border} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" {...axisProps(colors)} tickFormatter={fx} interval="preserveStartEnd" />
        <YAxis {...axisProps(colors)} tickFormatter={fy} width={56} axisLine={false} />
        <RTooltip
          cursor={{ fill: colors['surface-2'] }}
          content={<ChartTooltip fx={plain} fy={fy} names={{ value: 'Value' }} />}
        />
        {refLines?.map(r => (
          <ReferenceLine
            key={r.label}
            x={r.x}
            stroke={r.color ?? colors.warning}
            strokeDasharray="4 4"
            label={{ value: r.label, fill: colors.muted, fontSize: 11, position: 'top' }}
          />
        ))}
        <Bar
          dataKey="value"
          fill={color ?? colors['data-vegetation']}
          radius={[4, 4, 0, 0]}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
});

// ---------------------------------------------------------------- Rain bars + temperature line

export const ComposedRainTempChart = memo(function ComposedRainTempChart({
  data,
  colors,
  height,
}: {
  data: { label: string; rain: number; temp: number }[];
  colors: ChartColors;
  height: number;
}) {
  const mm: Fmt = v => `${Math.round(v)} mm`;
  const deg: Fmt = v => `${v.toFixed(1)} °C`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart accessibilityLayer={false} data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={colors.border} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" {...axisProps(colors)} />
        <YAxis yAxisId="rain" {...axisProps(colors)} tickFormatter={mm} width={60} axisLine={false} />
        <YAxis
          yAxisId="temp"
          orientation="right"
          {...axisProps(colors)}
          tickFormatter={deg}
          width={60}
          axisLine={false}
        />
        <RTooltip
          cursor={{ fill: colors['surface-2'] }}
          content={({ active, payload, label }) => (
            <ChartTooltip
              active={active}
              payload={payload as unknown as TipPayload[]}
              label={label as string}
              fx={plain}
              fy={v => (v > 60 ? mm(v) : deg(v))}
              names={{ rain: 'Rainfall', temp: 'Temperature' }}
            />
          )}
        />
        <Bar
          yAxisId="rain"
          dataKey="rain"
          fill={colors['data-water']}
          radius={[4, 4, 0, 0]}
          isAnimationActive={false}
        />
        <Line
          yAxisId="temp"
          dataKey="temp"
          stroke={colors['data-temperature']}
          strokeWidth={2.5}
          dot={{ r: 3 }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
});

// ---------------------------------------------------------------- Scatter with regression

export const ScatterFitChart = memo(function ScatterFitChart({
  points,
  colors,
  height,
  fx = plain,
  fy = plain,
  color,
  xLabel,
  yLabel,
}: {
  points: { x: number; y: number }[];
  colors: ChartColors;
  height: number;
  fx?: Fmt;
  fy?: Fmt;
  color?: string;
  xLabel: string;
  yLabel: string;
}) {
  const fit = regression(points);
  const xs = points.map(p => p.x);
  const [lo, hi] = [Math.min(...xs), Math.max(...xs)];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart accessibilityLayer={false} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={colors.border} strokeDasharray="3 3" />
        <XAxis
          type="number"
          dataKey="x"
          name={xLabel}
          {...axisProps(colors)}
          tickFormatter={fx}
          domain={['auto', 'auto']}
        />
        <YAxis
          type="number"
          dataKey="y"
          name={yLabel}
          {...axisProps(colors)}
          tickFormatter={fy}
          width={64}
          axisLine={false}
        />
        <ZAxis range={[24, 24]} />
        <RTooltip
          cursor={{ strokeDasharray: '3 3', stroke: colors.muted }}
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as { x: number; y: number } | undefined;
            if (!active || !p) return null;
            return (
              <div className={cs.tooltip}>
                <div className={cs.tooltipRow}>
                  <span>{xLabel}</span>
                  <span>{fx(p.x)}</span>
                </div>
                <div className={cs.tooltipRow}>
                  <span>{yLabel}</span>
                  <span>{fy(p.y)}</span>
                </div>
              </div>
            );
          }}
        />
        <Scatter data={points} fill={color ?? colors['data-water']} fillOpacity={0.55} isAnimationActive={false} />
        {fit && (
          <ReferenceLine
            segment={[
              { x: lo, y: fit.slope * lo + fit.intercept },
              { x: hi, y: fit.slope * hi + fit.intercept },
            ]}
            stroke={colors.warning}
            strokeWidth={2}
            strokeDasharray="6 4"
          />
        )}
      </ScatterChart>
    </ResponsiveContainer>
  );
});

// ---------------------------------------------------------------- Curve with optimal band

export const BandCurveChart = memo(function BandCurveChart({
  data,
  colors,
  height,
  fx = plain,
  fy = plain,
  band,
  color,
  name = 'Value',
}: {
  data: { x: number; y: number }[];
  colors: ChartColors;
  height: number;
  fx?: Fmt;
  fy?: Fmt;
  band?: { from: number; to: number; label: string };
  color?: string;
  name?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart accessibilityLayer={false} data={data} margin={{ top: 16, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={colors.border} strokeDasharray="3 3" vertical={false} />
        <XAxis type="number" dataKey="x" domain={['dataMin', 'dataMax']} {...axisProps(colors)} tickFormatter={fx} />
        <YAxis {...axisProps(colors)} tickFormatter={fy} width={64} axisLine={false} />
        <RTooltip content={<ChartTooltip fx={fx} fy={fy} names={{ y: name }} />} />
        {band && (
          <ReferenceArea
            x1={band.from}
            x2={band.to}
            fill={colors.success}
            fillOpacity={0.12}
            stroke={colors.success}
            strokeOpacity={0.4}
            label={{ value: band.label, fill: colors.muted, fontSize: 11, position: 'insideTop' }}
          />
        )}
        <Line
          dataKey="y"
          stroke={color ?? colors['data-soil']}
          strokeWidth={2.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
});

// ---------------------------------------------------------------- Sparkline

export const Sparkline = memo(function Sparkline({
  values,
  color = 'var(--primary)',
  width = 96,
  height = 28,
  label,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
  label: string;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * width},${height - 2 - ((v - min) / (max - min || 1)) * (height - 4)}`)
    .join(' ');
  return (
    <svg width={width} height={height} role="img" aria-label={label} style={{ flexShrink: 0 }}>
      <polyline
        points={pts}
        fill="none"
        style={{ stroke: color }}
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
});

// ---------------------------------------------------------------- Grouped bars (two series)

export const GroupedBarChart = memo(function GroupedBarChart({
  data,
  colors,
  height,
  fy = plain,
  series,
  refY,
  refLabel,
}: {
  data: Record<string, string | number>[];
  colors: ChartColors;
  height: number;
  fy?: Fmt;
  series: { key: string; label: string; color: string }[];
  refY?: number;
  refLabel?: string;
}) {
  const names = Object.fromEntries(series.map(s => [s.key, s.label]));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart accessibilityLayer={false} data={data} margin={{ top: 16, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={colors.border} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" {...axisProps(colors)} />
        <YAxis {...axisProps(colors)} tickFormatter={fy} width={56} axisLine={false} />
        <RTooltip cursor={{ fill: colors['surface-2'] }} content={<ChartTooltip fx={plain} fy={fy} names={names} />} />
        {refY != null && (
          <ReferenceLine
            y={refY}
            stroke={colors.muted}
            strokeDasharray="4 4"
            label={{ value: refLabel, fill: colors.muted, fontSize: 11, position: 'insideTopRight' }}
          />
        )}
        {series.map(s => (
          <Bar key={s.key} dataKey={s.key} fill={s.color} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
});

/** Several series over one x axis (e.g. share of records breaching each risk threshold by year). */
export const MultiLineChart = memo(function MultiLineChart({
  data,
  colors,
  height,
  fx = plain,
  fy = plain,
  series,
}: {
  data: Record<string, string | number>[];
  colors: ChartColors;
  height: number;
  fx?: Fmt;
  fy?: Fmt;
  series: { key: string; label: string; color: string }[];
}) {
  const names = Object.fromEntries(series.map(s => [s.key, s.label]));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart accessibilityLayer={false} data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={colors.border} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="x" {...axisProps(colors)} tickFormatter={v => fx(v)} />
        <YAxis {...axisProps(colors)} tickFormatter={fy} width={56} axisLine={false} />
        <RTooltip
          content={({ active, payload, label }) => (
            <ChartTooltip
              active={active}
              payload={payload as unknown as TipPayload[]}
              label={label as string}
              fx={fx}
              fy={fy}
              names={names}
            />
          )}
        />
        {series.map(s => (
          <Line key={s.key} dataKey={s.key} stroke={s.color} strokeWidth={2} dot={false} isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
});
