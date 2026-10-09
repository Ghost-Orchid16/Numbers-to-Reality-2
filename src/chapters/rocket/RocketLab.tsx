import { useEffect, useRef } from 'react'
import { LabGroup, LabPanel } from '../../components/LabPanel'
import { LiveMetric } from '../../components/LiveMetric'
import { MagneticButton } from '../../components/MagneticButton'
import { SegmentedControl, ToggleControl, VariableControl } from '../../components/VariableControl'
import { fmtFixed, fmtSig, joinQty, qty } from '../../lib/format'
import { cv } from '../../lib/tex'
import { onReadout } from '../../lib/ticker'
import { PLANETS } from '../../sim/core/constants'
import type { PlanetId } from '../../sim/rocket/model'
import { orbitFromState, resolvePlanet } from '../../sim/rocket/model'
import { usePrefs } from '../../state/prefs'
import { derived, read, txt } from './readouts'
import { rocket, useRocketUI } from './runtime'

const WARPS = [1, 4, 20, 100]

/** One sentence that always says what the model is doing — and why. */
function statusLine(): { tone: 'ok' | 'warn' | 'end' | 'idle'; text: string } {
  const ui = useRocketUI.getState()
  const v = rocket.view
  const p = rocket.params
  const planet = resolvePlanet(p.planet)
  const twr0 = derived.twr0()
  if (!ui.launched) {
    if (twr0 >= 1) return { tone: 'idle', text: `Ready · TWR at ignition ${fmtFixed(twr0, 2)} — it will lift off at once.` }
    const mLift = p.thrust / planet.g
    if (mLift <= derived.mf())
      return { tone: 'warn', text: `TWR ${fmtFixed(twr0, 2)} — too heavy even with empty tanks: it can never lift off.` }
    return {
      tone: 'warn',
      text: `TWR ${fmtFixed(twr0, 2)} — not enough thrust. It must burn ${joinQty(qty.mass(derived.m0() - mLift))} on the pad before T > mg.`,
    }
  }
  const s = rocket.sim
  switch (s.ended) {
    case 'apogee':
      return { tone: 'end', text: `Apogee ${txt.m(s.apogee?.h ?? v.h)} at T+${fmtSig(s.time, 3)} s — a suborbital hop, ${txt.m(v.x)} downrange.` }
    case 'orbit': {
      const o = orbitFromState(planet, v.v, v.gamma, v.h)
      return { tone: 'end', text: `Orbit · periapsis ${txt.m(o.periapsis)}, apoapsis ${txt.m(o.apoapsis)}.` }
    }
    case 'escape':
      return { tone: 'end', text: `Escape: ${txt.mps(v.v)} beats √(2gR²/(R+h)) — this rocket leaves ${planet.name} for good.` }
    case 'impact':
      return { tone: 'end', text: `Impact after ${fmtSig(s.time, 3)} s, ${txt.m(v.x)} downrange — the pitch-over bent the path into the ground.` }
    case 'pad-burnout':
      return { tone: 'end', text: 'Propellant exhausted on the pad: thrust never beat weight.' }
    case 'timeout':
      return { tone: 'end', text: 'Simulation limit reached (1 h of flight).' }
  }
  if (v.onPad && rocket.viewTime >= 0)
    return { tone: 'warn', text: `TWR ${fmtFixed(v.twr, 2)} — not enough thrust. Straining on the pad, burning ${txt.t(v.mdot)}/s.` }
  if (rocket.maxQPassed && rocket.viewTime - rocket.maxQ.t < 12)
    return { tone: 'ok', text: `MAX-Q passed: ${txt.pa(rocket.maxQ.q)} at ${txt.m(rocket.maxQ.h)}.` }
  if (!v.engineOn) return { tone: 'ok', text: `Engine cut-off — coasting at ${txt.mps(v.v)}.` }
  return { tone: 'ok', text: `TWR ${fmtFixed(v.twr, 2)} · climbing at ${txt.mps(v.v)}.` }
}

function Status() {
  const ref = useRef<HTMLParagraphElement>(null)
  useEffect(
    () =>
      onReadout(() => {
        const el = ref.current
        if (!el) return
        const s = statusLine()
        if (el.textContent !== s.text) el.textContent = s.text
        el.dataset.tone = s.tone
      }),
    [],
  )
  return <p ref={ref} className="lab-status data" role="status" aria-live="polite" />
}

/**
 * LAB — free interaction (not scroll-scrubbed). The same model runs live in real time × warp.
 * Thrust, I_sp, drag and the pitch program change the running flight immediately; mass and
 * world changes return the rocket to the pad.
 */
export function RocketLab() {
  const params = useRocketUI((s) => s.params)
  const playing = useRocketUI((s) => s.playing)
  const launched = useRocketUI((s) => s.launched)
  const ended = useRocketUI((s) => s.ended)
  const timeScale = useRocketUI((s) => s.timeScale)
  const { setParams, play, pause, reset, setTimeScale } = useRocketUI.getState()
  const reduced = usePrefs((s) => s.reducedMotion)
  const planet = resolvePlanet(params.planet)
  const twrOne = derived.m0() * planet.g

  const primary = !launched || ended ? 'Launch' : playing ? 'Pause' : 'Resume'
  const onPrimary = () => (primary === 'Pause' ? pause() : play())

  return (
    <section id="rocket-lab" className="rocket-lab" aria-labelledby="rocket-lab-title">
      <div className="lab-layout grid-12">
        <div className="lab-intro">
          <p className="label">01 · Lab — free flight</p>
          <h2 id="rocket-lab-title" className="section-title">
            Change a variable. <span className="accent-serif">Launch.</span>
          </h2>
          <p className="section-lede">
            Push thrust below weight and the rocket strains on the pad. Push it past <em>TWR</em> = 1 and it rises.
            Tilt too hard and gravity bends it into the ground. Every number is the model&rsquo;s.
          </p>
          <Status />
          {reduced && <p className="label lab-note">Reduced motion: the flight starts paused — press Launch.</p>}
        </div>
        <LabPanel
          fig="FIG. 01-L — Launch lab"
          title="Mission control"
          description="A single-stage rocket simulated in real time: thrust, mass, specific impulse, drag, gravity and pitch-over drive liftoff, max-Q and burnout."
          footer={
            <p className="label">
              Mass or world changes return the rocket to the pad. Educational model — see the model note below.
            </p>
          }
        >
          <LabGroup title="Flight">
            <div className="lab-actions">
              <MagneticButton className="btn btn-primary" onClick={onPrimary} data-cursor={primary.toUpperCase()}>
                {primary}
              </MagneticButton>
              <button type="button" className="btn btn-ghost interactive" onClick={reset} disabled={!launched}>
                Reset
              </button>
              <SegmentedControl
                label="Time warp"
                value={String(timeScale)}
                options={WARPS.map((w) => ({ value: String(w), label: `×${w}` }))}
                onChange={(v) => setTimeScale(Number(v))}
              />
            </div>
            <div className="lab-readouts">
              <LiveMetric label="Mission clock" read={read.clock} scramble={false} />
              <LiveMetric label="Altitude" tex={cv('altitude', 'h')} varKey="altitude" read={read.altitude} />
              <LiveMetric label="Velocity" tex={cv('velocity', 'v')} varKey="velocity" read={read.velocity} />
              <LiveMetric label="Acceleration" tex={cv('accel', 'a')} varKey="accel" read={read.accel} />
              <LiveMetric label="Mass" tex={cv('mass', 'm')} varKey="mass" read={read.mass} />
              <LiveMetric label="TWR" tex={`\\tfrac{${cv('thrust', 'T')}}{${cv('weight', 'mg')}}`} read={read.twr} />
              <LiveMetric label="Dyn. pressure" tex={cv('q', 'q')} varKey="q" read={read.q} />
            </div>
          </LabGroup>
          <LabGroup title="Vehicle">
            <VariableControl
              label="Thrust"
              tex={cv('thrust', 'T')}
              varKey="thrust"
              min={300_000}
              max={3_000_000}
              step={10_000}
              value={params.thrust}
              onChange={(thrust) => setParams({ thrust })}
              format={(x) => qty.force(x)}
              marks={twrOne > 300_000 && twrOne < 3_000_000 ? [{ value: twrOne, label: 'TWR 1' }] : undefined}
              hint="Applies live — raise it while the rocket strains on the pad."
            />
            <VariableControl
              label="Payload"
              tex={cv('mass', 'm_{\\text{pay}}')}
              varKey="mass"
              min={0}
              max={30_000}
              step={500}
              value={params.payloadMass}
              onChange={(payloadMass) => setParams({ payloadMass })}
              format={(x) => qty.mass(x)}
            />
            <VariableControl
              label="Propellant"
              tex={cv('mass', 'm_{\\text{prop}}')}
              varKey="mass"
              min={20_000}
              max={150_000}
              step={1_000}
              value={params.propellantMass}
              onChange={(propellantMass) => setParams({ propellantMass })}
              format={(x) => qty.mass(x)}
            />
            <VariableControl
              label="Specific impulse"
              tex={cv('isp', 'I_{sp}')}
              varKey="isp"
              min={200}
              max={460}
              step={1}
              value={params.isp}
              onChange={(isp) => setParams({ isp })}
              format={(x) => ({ value: fmtFixed(x, 0), unit: 's' })}
            />
          </LabGroup>
          <LabGroup title="World & flight program">
            <SegmentedControl<PlanetId>
              label="Gravity preset"
              value={planet.id}
              options={(['earth', 'mars', 'moon'] as PlanetId[]).map((id) => ({
                value: id,
                label: PLANETS[id].name,
                detail: `${fmtFixed(PLANETS[id].g, 2)} m/s²`,
              }))}
              onChange={(id) => setParams({ planet: id })}
              hint="Each preset sets g₀, radius and atmosphere together (the Moon has none)."
            />
            <ToggleControl
              label="Aerodynamic drag"
              tex={cv('drag', 'D')}
              varKey="drag"
              checked={params.dragEnabled}
              onChange={(dragEnabled) => setParams({ dragEnabled })}
              hint={`D = ½ρv²C_dA, with C_d = ${fmtFixed(params.cd, 2)} and A = πd²/4 = ${fmtFixed(derived.area(), 2)} m².`}
            />
            <VariableControl
              label="Pitch-over angle"
              tex={cv('gamma', '\\theta_{\\text{kick}}')}
              varKey="gamma"
              min={0}
              max={5}
              step={0.05}
              value={params.pitchKickDeg}
              onChange={(pitchKickDeg) => setParams({ pitchKickDeg })}
              format={(x) => ({ value: fmtFixed(x, 2), unit: '°' })}
              hint={`Applied once at ${fmtFixed(params.pitchKickSpeed, 0)} m/s; then gravity steers. Try 4°.`}
            />
          </LabGroup>
        </LabPanel>
      </div>
    </section>
  )
}
