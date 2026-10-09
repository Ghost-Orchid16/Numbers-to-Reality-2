import { EquationBlock } from '../../components/EquationBlock'
import { Live } from '../../components/Live'
import { MagneticButton } from '../../components/MagneticButton'
import { fmtFixed, fmtSig } from '../../lib/format'
import { cv } from '../../lib/tex'
import { G0 } from '../../sim/core/constants'
import { derived, read, txt } from './readouts'
import { rocket, useRocketUI } from './runtime'

const v = () => rocket.view
const p = () => rocket.params

/** Mission bar, so the flight can run while you read the equations it is solving. */
function MissionBar() {
  const playing = useRocketUI((s) => s.playing)
  const launched = useRocketUI((s) => s.launched)
  const ended = useRocketUI((s) => s.ended)
  const { play, pause, reset } = useRocketUI.getState()
  const label = !launched || ended ? 'Launch' : playing ? 'Pause' : 'Resume'
  return (
    <div className="mission-bar interactive">
      <span className="label">[ live flight ]</span>
      <span className="data mission-clock">
        <Live read={() => read.clock().value} />
      </span>
      <MagneticButton className="btn btn-primary btn-sm" onClick={() => (label === 'Pause' ? pause() : play())}>
        {label}
      </MagneticButton>
      <button type="button" className="btn btn-ghost btn-sm interactive" onClick={reset} disabled={!launched}>
        Reset
      </button>
    </div>
  )
}

/** Burn time so far: t in m(t) = m₀ − ṁt, capped at burnout. */
const burnClock = () => {
  const mdot = derived.mdot()
  if (rocket.viewTime <= 0 || mdot <= 0) return 0
  return Math.min(rocket.viewTime, (derived.m0() - derived.mf()) / mdot)
}

/**
 * THE MATHS — the equations the simulation integrates, each typeset once and followed by the
 * numbers it is using right now (the lab flight).
 */
export function RocketMaths() {
  return (
    <section id="rocket-maths" className="rocket-maths" aria-labelledby="rocket-maths-title">
      <div className="grid-12 maths-head">
        <div className="maths-intro">
          <p className="label">01 · The maths</p>
          <h2 id="rocket-maths-title" className="section-title">
            Five equations, <span className="accent-serif">integrated</span> 240 times a second.
          </h2>
          <p className="section-lede">
            The flight you see is these lines, stepped forward with fourth-order Runge–Kutta. The colours match the
            sliders, the readouts and the arrows on the rocket.
          </p>
        </div>
        <MissionBar />
      </div>
      <div className="grid-12 maths-grid">
        <EquationBlock
          fig="EQ. 01 — Newton along the path"
          title="Force balance"
          tex={`${cv('fnet', 'F_{\\text{net}}')} = ${cv('thrust', 'T')} - ${cv('mass', 'm')}\\,${cv('gravity', 'g')}\\sin${cv('gamma', '\\gamma')} - ${cv('drag', 'D')}`}
          substitution={[
            { varKey: 'thrust', read: () => txt.N(v().thrust) },
            '− (',
            { varKey: 'mass', read: () => txt.kg(v().m) },
            '×',
            { varKey: 'gravity', read: () => txt.ms2(v().g) },
            '× sin',
            { varKey: 'gamma', read: () => txt.deg(v().gamma) },
            ') −',
            { varKey: 'drag', read: () => txt.N(v().drag) },
          ]}
          result={[{ varKey: 'fnet', read: () => (v().onPad ? `${txt.N(v().fFree)} · pad holds` : txt.N(v().fNet)) }]}
          note={
            <>
              In vertical flight γ = 90°, so sin γ = 1 and this is <em>F</em> = <em>T</em> − <em>mg</em> − <em>D</em>.
              While <em>T</em> &lt; <em>mg</em> the pad pushes back and nothing moves.
            </>
          }
        />
        <EquationBlock
          fig="EQ. 02 — Newton's second law"
          title="Acceleration"
          tex={`${cv('accel', 'a')} = \\dfrac{${cv('fnet', 'F_{\\text{net}}')}}{${cv('mass', 'm')}}`}
          substitution={[
            { varKey: 'fnet', read: () => txt.N(v().fNet) },
            '÷',
            { varKey: 'mass', read: () => txt.kg(v().m) },
          ]}
          result={[{ varKey: 'accel', read: () => `${txt.ms2(v().accel)} = ${txt.g(v().accel)}` }]}
        />
        <EquationBlock
          fig="EQ. 03 — Rocket engine"
          title="Mass flow and mass"
          tex={`${cv('mdot', '\\dot m')} = \\dfrac{${cv('thrust', 'T')}}{${cv('isp', 'I_{sp}')}\\,g_0}, \\qquad ${cv('mass', 'm')}(t) = ${cv('mass', 'm_0')} - ${cv('mdot', '\\dot m')}\\,t`}
          substitution={[
            { varKey: 'thrust', read: () => txt.N(p().thrust) },
            '÷ (',
            { varKey: 'isp', read: () => `${fmtFixed(p().isp, 0)} s` },
            `× ${fmtFixed(G0, 2)} m/s²)`,
          ]}
          result={[{ varKey: 'mdot', read: () => `${fmtSig(derived.mdot(), 3)} kg/s` }]}
          note={
            <>
              Now: <em>m</em> = <Live varKey="mass" read={() => txt.kg(derived.m0())} /> −{' '}
              <Live varKey="mdot" read={() => `${fmtSig(derived.mdot(), 3)} kg/s`} /> ×{' '}
              <Live read={() => txt.s(burnClock())} /> = <Live varKey="mass" read={() => txt.kg(v().m)} />. Here{' '}
              <em>g</em>
              <sub>0</sub> is standard gravity, 9.80665 m/s², by the definition of <em>I</em>
              <sub>sp</sub> — even on Mars.
            </>
          }
        />
        <EquationBlock
          fig="EQ. 04 — Aerodynamic drag"
          title="Drag"
          tex={`${cv('drag', 'D')} = \\tfrac12\\,${cv('density', '\\rho(h)')}\\,${cv('velocity', 'v')}^2\\,C_d A`}
          substitution={[
            '½ ×',
            { varKey: 'density', read: () => txt.rho(v().rho) },
            '× (',
            { varKey: 'velocity', read: () => txt.mps(v().v) },
            ')² ×',
            { read: () => `${fmtFixed(p().cd, 2)} × ${fmtFixed(derived.area(), 2)} m²` },
          ]}
          result={[{ varKey: 'drag', read: () => (p().dragEnabled ? txt.N(v().drag) : '0 N (drag switched off)') }]}
        />
        <EquationBlock
          fig="EQ. 05 — Exponential atmosphere"
          title="Air density"
          tex={`${cv('density', '\\rho(h)')} = \\rho_0\\, e^{-${cv('altitude', 'h')}/H}`}
          substitution={[
            { read: () => `${fmtSig(derived.planet().rho0, 4)} kg/m³ × e^(−` },
            { varKey: 'altitude', read: () => txt.m(v().h) },
            { read: () => `÷ ${fmtSig(derived.planet().scaleHeight / 1000, 3)} km)` },
          ]}
          result={[{ varKey: 'density', read: () => txt.rho(v().rho) }]}
          note={<>An isothermal model with scale height H ≈ 8.5 km on Earth. Real air is layered and its temperature varies.</>}
        />
        <EquationBlock
          fig="EQ. 06 — Inverse-square gravity"
          title="Gravity with altitude"
          tex={`${cv('gravity', 'g(h)')} = g_0\\left(\\dfrac{R}{R + ${cv('altitude', 'h')}}\\right)^{2}`}
          substitution={[
            {
              read: () =>
                `${fmtFixed(derived.planet().g, 2)} m/s² × (${fmtSig(derived.planet().radius / 1000, 4)} km ÷ (${fmtSig(derived.planet().radius / 1000, 4)} km +`,
            },
            { varKey: 'altitude', read: () => txt.m(v().h) },
            '))²',
          ]}
          result={[{ varKey: 'gravity', read: () => txt.ms2(v().g) }]}
        />
        <EquationBlock
          fig="EQ. 07 — Dynamic pressure"
          title="q and max-Q"
          tex={`${cv('q', 'q')} = \\tfrac12\\,${cv('density', '\\rho')}\\,${cv('velocity', 'v')}^2`}
          substitution={[
            '½ ×',
            { varKey: 'density', read: () => txt.rho(v().rho) },
            '× (',
            { varKey: 'velocity', read: () => txt.mps(v().v) },
            ')²',
          ]}
          result={[{ varKey: 'q', read: () => txt.pa(v().q) }]}
          note={
            <>
              Peak so far:{' '}
              <Live
                varKey="q"
                read={() => (rocket.maxQPassed ? `MAX-Q ${txt.pa(rocket.maxQ.q)} at ${txt.m(rocket.maxQ.h)}` : 'still rising')}
              />
              .
            </>
          }
        />
        <EquationBlock
          fig="EQ. 08 — Tsiolkovsky (level 2–3)"
          title="The rocket equation"
          tex={`\\Delta v = ${cv('isp', 'I_{sp}')}\\,g_0 \\ln\\dfrac{${cv('mass', 'm_0')}}{${cv('mass', 'm_f')}}`}
          substitution={[
            { varKey: 'isp', read: () => `${fmtFixed(p().isp, 0)} s` },
            `× ${fmtFixed(G0, 2)} m/s² × ln(`,
            { varKey: 'mass', read: () => txt.kg(derived.m0()) },
            '÷',
            { varKey: 'mass', read: () => txt.kg(derived.mf()) },
            ')',
          ]}
          result={[{ read: () => txt.mps(derived.idealDv()) }]}
          note={
            <>
              That is the speed with no gravity and no air. This flight&rsquo;s bill so far: gravity loss{' '}
              <Live varKey="gravity" read={() => txt.mps(v().gravityLoss)} />, drag loss{' '}
              <Live varKey="drag" read={() => txt.mps(v().dragLoss)} /> — speed the rocket paid for but never kept.
            </>
          }
        />
      </div>
    </section>
  )
}
