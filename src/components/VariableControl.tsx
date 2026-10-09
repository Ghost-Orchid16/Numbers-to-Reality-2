import { useId, useMemo, type CSSProperties, type ReactNode } from 'react'
import type { Formatted } from '../lib/format'
import { renderTex } from '../lib/tex'

const pct = (v: number, min: number, max: number) => ((v - min) / (max - min)) * 100

/**
 * A styled native range input bound to one model variable. The track fill, thumb, symbol and
 * value all use the variable's colour (and its symbol + label, never colour alone).
 */
export function VariableControl({
  label,
  tex,
  varKey,
  min,
  max,
  step,
  value,
  onChange,
  format,
  hint,
  marks,
}: {
  label: string
  tex: string
  varKey?: string
  min: number
  max: number
  step: number
  value: number
  onChange: (v: number) => void
  format: (v: number) => Formatted
  /** short description read by screen readers and shown under the control */
  hint?: ReactNode
  /** labelled tick marks, e.g. TWR = 1 */
  marks?: { value: number; label: string }[]
}) {
  const id = useId()
  const symbol = useMemo(() => renderTex(tex), [tex])
  const f = format(value)
  const fmin = format(min)
  const fmax = format(max)
  return (
    <div
      className="vc"
      style={{ '--c': varKey ? `var(--v-${varKey})` : 'var(--accent)', '--fill': `${pct(value, min, max)}%` } as CSSProperties}
    >
      <label htmlFor={id} className="vc-head">
        <span className="vc-sym" dangerouslySetInnerHTML={{ __html: symbol }} />
        <span className="label vc-label">{label}</span>
        <output htmlFor={id} className="data vc-value">
          {f.value}
          {f.unit && <span className="vc-unit"> {f.unit}</span>}
        </output>
      </label>
      <div className="vc-track-wrap">
        <input
          id={id}
          className="vc-range interactive"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-valuetext={`${f.value} ${f.unit}`.trim()}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onChange={(e) => onChange(Number(e.currentTarget.value))}
        />
        {marks?.map((m) => (
          <span key={m.label} className="vc-mark label" style={{ left: `${pct(m.value, min, max)}%` }}>
            {m.label}
          </span>
        ))}
      </div>
      <div className="vc-scale label" aria-hidden="true">
        <span>{`${fmin.value} ${fmin.unit}`.trim()}</span>
        <span>{`${fmax.value} ${fmax.unit}`.trim()}</span>
      </div>
      {hint && (
        <p id={`${id}-hint`} className="vc-hint">
          {hint}
        </p>
      )}
    </div>
  )
}

/** On/off switch for a model term (e.g. drag). */
export function ToggleControl({
  label,
  tex,
  varKey,
  checked,
  onChange,
  hint,
}: {
  label: string
  tex?: string
  varKey?: string
  checked: boolean
  onChange: (v: boolean) => void
  hint?: string
}) {
  const id = useId()
  const symbol = useMemo(() => (tex ? renderTex(tex) : ''), [tex])
  return (
    <div className="vc vc-toggle" style={{ '--c': varKey ? `var(--v-${varKey})` : 'var(--accent)' } as CSSProperties}>
      <label htmlFor={id} className="vc-head">
        {symbol && <span className="vc-sym" dangerouslySetInnerHTML={{ __html: symbol }} />}
        <span className="label vc-label">{label}</span>
        <span className="data vc-value">{checked ? 'ON' : 'OFF'}</span>
        <input
          id={id}
          type="checkbox"
          role="switch"
          className="vc-switch interactive"
          checked={checked}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onChange={(e) => onChange(e.currentTarget.checked)}
        />
      </label>
      {hint && (
        <p id={`${id}-hint`} className="vc-hint">
          {hint}
        </p>
      )}
    </div>
  )
}

/** One-of-n choice rendered as a radio group (e.g. Earth / Mars / Moon). */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string
  value: T
  options: { value: T; label: string; detail?: string }[]
  onChange: (v: T) => void
  hint?: string
}) {
  const name = useId()
  return (
    <fieldset className="vc vc-seg">
      <legend className="label vc-label">{label}</legend>
      <div className="vc-seg-options">
        {options.map((o) => (
          <label key={o.value} className="vc-seg-option interactive" data-checked={o.value === value || undefined}>
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={o.value === value}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            <span className="vc-seg-name">{o.label}</span>
            {o.detail && <span className="data vc-seg-detail">{o.detail}</span>}
          </label>
        ))}
      </div>
      {hint && <p className="vc-hint">{hint}</p>}
    </fieldset>
  )
}
