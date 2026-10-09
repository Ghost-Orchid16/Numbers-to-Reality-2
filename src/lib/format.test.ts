import { describe, expect, it } from 'vitest'
import { fmtFixed, fmtSig, joinQty, missionClock, qty } from './format'

describe('format', () => {
  it('rounds to significant figures with grouping and a true minus', () => {
    expect(fmtSig(1_240_000)).toBe('1,240,000')
    expect(fmtSig(961_380)).toBe('961,000')
    expect(fmtSig(0.012345)).toBe('0.0123')
    expect(fmtSig(-31_412)).toBe('−31,400')
    expect(fmtSig(0)).toBe('0')
  })
  it('fixed decimals never print negative zero', () => {
    expect(fmtFixed(9.80665, 2)).toBe('9.81')
    expect(fmtFixed(-0.0004, 2)).toBe('0.00')
  })
  it('auto-scales SI units', () => {
    expect(joinQty(qty.length(152))).toBe('152 m')
    expect(joinQty(qty.length(152_400))).toBe('152 km')
    expect(joinQty(qty.length(1_850_800))).toBe('1,850 km')
    expect(joinQty(qty.force(1_240_000))).toBe('1.24 MN')
    expect(joinQty(qty.force(31_400))).toBe('31.4 kN')
    expect(joinQty(qty.force(512))).toBe('512 N')
    expect(joinQty(qty.speed(4_242))).toBe('4.24 km/s')
    expect(joinQty(qty.speed(61.3))).toBe('61 m/s')
    expect(joinQty(qty.mass(98_000))).toBe('98 t')
    expect(joinQty(qty.pressure(24_490))).toBe('24.5 kPa')
    expect(joinQty(qty.accelG(2.844))).toBe('0.29 g')
  })
  it('mission clock counts down and up', () => {
    expect(missionClock(-3)).toBe('T−00:03')
    expect(missionClock(72.44)).toBe('T+01:12.4')
    expect(missionClock(0)).toBe('T+00:00.0')
  })
})
