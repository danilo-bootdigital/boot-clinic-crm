'use client'

/**
 * Gráficos do Design System — wrappers finos sobre Recharts com estilo
 * travado: eixos enxutos, grid horizontal sutil, paleta teal, tooltip
 * em card. Regra: só linha (tempo), barra (comparação) e funil. Nada de
 * pizza/3D/gauge.
 */
import * as React from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  Legend,
} from 'recharts'

// Sequência teal para categorias (do mais forte ao mais claro).
export const VIZ_SEQUENCE = ['#178F77', '#26C6A3', '#5FD9BD', '#99E8D6', '#C9F2E8']
const GRID = '#E5E5E5'
const AXIS = '#8A8A8A'

type Formatter = (value: number) => string

const defaultFmt: Formatter = (v) => v.toLocaleString('pt-BR')

/** Tooltip padrão em card branco com borda + sombra do DS. */
function ChartTooltip({
  active,
  payload,
  label,
  formatter = defaultFmt,
}: {
  active?: boolean
  payload?: { name?: string; value?: number; color?: string; dataKey?: string }[]
  label?: string
  formatter?: Formatter
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-popover">
      {label && <p className="mb-1 text-xs font-semibold text-foreground">{label}</p>}
      <div className="space-y-0.5">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-[2px]" style={{ background: p.color }} />
            {p.name && <span className="text-muted-foreground">{p.name}</span>}
            <span className="ml-auto font-semibold tabular-nums text-foreground">
              {formatter(Number(p.value ?? 0))}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export interface RankDatum {
  label: string
  value: number
}

/** Barras horizontais ranqueadas — comparação/ranking de categorias. */
export function RankBarChart({
  data,
  valueFormatter = defaultFmt,
  labelWidth = 96,
}: {
  data: RankDatum[]
  valueFormatter?: Formatter
  labelWidth?: number
}) {
  const sorted = [...data].sort((a, b) => b.value - a.value)
  const height = Math.max(120, sorted.length * 40)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="label"
          width={labelWidth}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12, fill: AXIS }}
        />
        <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<ChartTooltip formatter={valueFormatter} />} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}>
          {sorted.map((_, i) => (
            <Cell key={i} fill={VIZ_SEQUENCE[i % VIZ_SEQUENCE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Área de tendência — evolução de UMA métrica no tempo (linha + área teal). */
export function AreaTrendChart({
  data,
  dataKey,
  height = 220,
  valueFormatter = defaultFmt,
  axisFormatter,
}: {
  data: Record<string, string | number>[]
  dataKey: string
  height?: number
  valueFormatter?: Formatter
  axisFormatter?: Formatter
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <defs>
          <linearGradient id="areaTeal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#26C6A3" stopOpacity={0.18} />
            <stop offset="100%" stopColor="#26C6A3" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: AXIS }} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={64}
          tick={{ fontSize: 11, fill: AXIS }}
          tickFormatter={axisFormatter ? (v) => axisFormatter(Number(v)) : undefined}
        />
        <Tooltip cursor={{ stroke: GRID }} content={<ChartTooltip formatter={valueFormatter} />} />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke="#26C6A3"
          strokeWidth={2.5}
          fill="url(#areaTeal)"
          dot={false}
          activeDot={{ r: 4, fill: '#26C6A3' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export interface FunnelDatum {
  name: string
  value: number
}

/** Desenho tapered (silhueta de funil) ou lista de faixas com texto. */
export type FunnelVariant = 'funnel' | 'list'

/**
 * Cor do estágio numa rampa proporcional: forte no topo, clara na base,
 * independente de quantos estágios existem. Evita o VIZ_SEQUENCE repetir
 * (escuro, claro, escuro…) quando há mais estágios que cores.
 */
function rampColor(index: number, count: number) {
  if (count <= 1) return VIZ_SEQUENCE[0]
  const step = Math.round((index / (count - 1)) * (VIZ_SEQUENCE.length - 1))
  return VIZ_SEQUENCE[step]
}

/**
 * Funil de pipeline comercial — estágios na ordem (não reordena por valor).
 *
 * Layout próprio em CSS no lugar do FunnelChart do Recharts: com estágios
 * zerados ou sequência não decrescente (0,0,1,1,0…) o funil do Recharts gera
 * polígonos degenerados que se cruzam e empilha os rótulos no centro.
 *
 * Duas leituras da mesma série, ambas dimensionadas para coluna estreita
 * (~18–22rem):
 * - `funnel`: silhueta tapered via clip-path, rótulos na coluna à direita.
 * - `list`: faixa por estágio com nome e contagem dentro da barra.
 */
export function FunnelPipeline({
  data,
  variant = 'funnel',
  valueFormatter = defaultFmt,
}: {
  data: FunnelDatum[]
  variant?: FunnelVariant
  valueFormatter?: Formatter
}) {
  const max = Math.max(...data.map((d) => d.value), 0)
  const total = data.reduce((sum, d) => sum + d.value, 0)
  const pct = (value: number) => (total > 0 ? `${Math.round((value / total) * 100)}%` : null)

  // Largura relativa de cada estágio. Estágio zerado vira um gargalo fino em
  // vez de desaparecer, senão a silhueta se parte no meio.
  const widths = data.map((stage) =>
    stage.value > 0 && max > 0 ? Math.max(12, (stage.value / max) * 100) : 5
  )

  if (variant === 'funnel') {
    return (
      <div className="grid grid-cols-[1fr_minmax(0,7rem)] gap-3">
        {/* Silhueta: faixas encostadas, sem gap, para o taper ficar contínuo. */}
        <div role="presentation">
          {data.map((stage, i) => {
            const top = widths[i]
            const bottom = i < widths.length - 1 ? widths[i + 1] : widths[i]
            const clipPath = `polygon(${50 - top / 2}% 0%, ${50 + top / 2}% 0%, ${
              50 + bottom / 2
            }% 100%, ${50 - bottom / 2}% 100%)`

            return (
              <div
                key={`${stage.name}-shape-${i}`}
                className="h-8"
                style={{
                  clipPath,
                  background:
                    stage.value > 0 ? rampColor(i, data.length) : 'hsl(var(--muted))',
                }}
                title={`${stage.name}: ${valueFormatter(stage.value)}`}
              />
            )
          })}
        </div>

        {/* Rótulos alinhados às faixas pela mesma altura de linha (h-8). */}
        <ul>
          {data.map((stage, i) => (
            <li
              key={`${stage.name}-label-${i}`}
              className="flex h-8 items-center gap-2 text-xs"
            >
              <span className="truncate text-muted-foreground" title={stage.name}>
                {stage.name}
              </span>
              <span className="ml-auto shrink-0 tabular-nums text-foreground">
                <span className="font-semibold">{stage.value}</span>
                {pct(stage.value) && (
                  <span className="ml-1 text-muted-foreground">{pct(stage.value)}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <ul className="space-y-1">
      {data.map((stage, i) => (
        <li
          key={`${stage.name}-${i}`}
          className="relative flex h-8 items-center overflow-hidden rounded-md bg-muted/60"
          title={`${stage.name}: ${valueFormatter(stage.value)}`}
        >
          {/* Preenchimento em tinta clara: mantém o texto legível por cima. */}
          {stage.value > 0 && (
            <div
              className="absolute inset-y-0 left-0 transition-[width] duration-300"
              style={{
                width: `${widths[i]}%`,
                background: rampColor(i, data.length),
                opacity: 0.32,
              }}
            />
          )}
          <span className="relative truncate pl-2.5 text-xs font-medium text-foreground">
            {stage.name}
          </span>
          <span className="relative ml-auto shrink-0 pl-2 pr-2.5 text-xs tabular-nums text-foreground">
            <span className="font-semibold">{stage.value}</span>
            {pct(stage.value) && (
              <span className="ml-1 text-muted-foreground">{pct(stage.value)}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}

export interface SeriesDef {
  key: string
  name: string
  color: string
}

/** Barras agrupadas por categoria do eixo X — comparação no tempo. */
export function GroupedBarChart({
  data,
  series,
  valueFormatter = defaultFmt,
  axisFormatter,
  height = 240,
}: {
  data: Record<string, string | number>[]
  series: SeriesDef[]
  valueFormatter?: Formatter
  axisFormatter?: Formatter
  height?: number
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: AXIS }} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={64}
          tick={{ fontSize: 11, fill: AXIS }}
          tickFormatter={axisFormatter ? (v) => axisFormatter(Number(v)) : undefined}
        />
        <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<ChartTooltip formatter={valueFormatter} />} />
        <Legend
          verticalAlign="top"
          align="right"
          height={28}
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, color: AXIS }}
        />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={28} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
