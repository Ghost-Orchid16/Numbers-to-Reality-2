/**
 * Number formatting for readouts and live equations.
 *
 * SI units internally; auto-scaled units on screen (m → km, N → kN → MN); significant
 * figures chosen per quantity so nothing shows more precision than the model has.
 * Negative numbers use the true minus sign (U+2212). Pair with tabular figures in CSS.
 */

export interface Formatted {
  value: string
  unit: string
}

const MINUS = '−'
const nfCache = new Map<string, Intl.NumberFormat>()

function nf(opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(opts)
  let f = nfCache.get(key)
  if (!f) {
    f = new Intl.NumberFormat('en-US', opts)
    nfCache.set(key, f)
  }
  return f
}

const fixMinus = (s: string): string => s.replace('-', MINUS)

/** Round to `sig` significant figures, with digit grouping: 1240000 → "1,240,000". */
export function fmtSig(x: number, sig = 3): string {
  if (!Number.isFinite(x)) return x > 0 ? '∞' : x < 0 ? `${MINUS}∞` : '—'
  if (x === 0) return '0'
  return fixMinus(nf({ maximumSignificantDigits: sig }).format(x))
}

/** Fixed decimals with grouping: fmtFixed(9.80665, 2) → "9.81". */
export function fmtFixed(x: number, digits: number): string {
  if (!Number.isFinite(x)) return x > 0 ? '∞' : '—'
  const s = nf({ minimumFractionDigits: digits, maximumFractionDigits: digits }).format(x)
  return fixMinus(s === '-0' || /^-0\.0*$/.test(s) ? s.slice(1) : s)
}

/** Integer with grouping: 98000 → "98,000". */
export const fmtInt = (x: number): string => fmtFixed(Math.round(x), 0)

const scaled = (x: number, steps: [number, string][], sig: number): Formatted => {
  const ax = Math.abs(x)
  let [div, unit] = steps[0]
  for (const s of steps) if (ax >= s[0]) [div, unit] = s
  return { value: fmtSig(x / div, sig), unit }
}

export const qty = {
  /** metres → m / km */
  length: (m: number, sig = 3): Formatted =>
    Math.abs(m) < 1000 ? { value: fmtFixed(m, Math.abs(m) < 10 ? 1 : 0), unit: 'm' } : scaled(m, [[1000, 'km']], sig),
  /** m/s → m/s / km/s */
  speed: (v: number, sig = 3): Formatted =>
    Math.abs(v) < 1000 ? { value: fmtFixed(v, Math.abs(v) < 10 ? 1 : 0), unit: 'm/s' } : scaled(v, [[1000, 'km/s']], sig),
  /** newtons → N / kN / MN */
  force: (f: number, sig = 3): Formatted =>
    scaled(f, [
      [1, 'N'],
      [1e3, 'kN'],
      [1e6, 'MN'],
    ], sig),
  /** kilograms → kg / t */
  mass: (kg: number, sig = 3): Formatted =>
    Math.abs(kg) < 1000 ? { value: fmtSig(kg, sig), unit: 'kg' } : { value: fmtSig(kg / 1000, sig), unit: 't' },
  /** pascals → Pa / kPa */
  pressure: (pa: number, sig = 3): Formatted =>
    Math.abs(pa) < 1000 ? { value: fmtFixed(pa, 0), unit: 'Pa' } : scaled(pa, [[1000, 'kPa']], sig),
  /** m/s² → multiples of standard gravity */
  accelG: (a: number): Formatted => ({ value: fmtFixed(a / 9.80665, 2), unit: 'g' }),
  /** radians → degrees */
  angle: (rad: number, digits = 1): Formatted => ({ value: fmtFixed((rad * 180) / Math.PI, digits), unit: '°' }),
  /** kg/m³ */
  density: (rho: number): Formatted => ({ value: rho < 0.001 ? fmtSig(rho, 2) : fmtSig(rho, 3), unit: 'kg/m³' }),
  /** dimensionless ratio, 2 decimals */
  ratio: (r: number): Formatted => ({ value: Number.isFinite(r) ? fmtFixed(r, 2) : '∞', unit: '' }),
  /** seconds, 1 decimal below a minute */
  time: (s: number): Formatted => ({ value: fmtFixed(s, s < 60 ? 1 : 0), unit: 's' }),
}

/** "1.24 MN" */
export const joinQty = (f: Formatted): string => (f.unit ? `${f.value} ${f.unit}` : f.value)

/** Mission clock: T−00:03, T+01:12.4 */
export function missionClock(t: number): string {
  const sign = t < 0 ? MINUS : '+'
  const a = Math.abs(t)
  const mm = Math.floor(a / 60)
  const ss = a - mm * 60
  const sec = t < 0 ? String(Math.ceil(ss)).padStart(2, '0') : ss.toFixed(1).padStart(4, '0')
  return `T${sign}${String(mm).padStart(2, '0')}:${sec}`
}
