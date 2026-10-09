import { Live } from '../../components/Live'
import { RealityCheck } from '../../components/RealityCheck'
import { Tooltip } from '../../components/Tooltip'
import { fmtFixed } from '../../lib/format'
import { derived, txt } from './readouts'
import { rocket } from './runtime'

/**
 * REALITY CHECK — 1 intuition · 2 mathematics · 3 engineering reality, and the model's label.
 */
export function RocketReality() {
  return (
    <section id="rocket-reality" className="rocket-reality" aria-labelledby="rocket-reality-title">
      <div className="grid-12">
        <div className="reality-head">
          <p className="label">01 · Reality check</p>
          <h2 id="rocket-reality-title" className="section-title">
            What this model knows — <span className="accent-serif">and what it leaves out.</span>
          </h2>
        </div>
        <div className="reality-wrap">
          <RealityCheck
            intuition={
              <p>
                Push harder than gravity pulls and you rise. Burn propellant and you get lighter, so the same push
                accelerates you more. The air pushes back hardest when you are fast <em>and</em> still low — that peak
                is max-Q.
              </p>
            }
            mathematics={
              <p>
                Newton&rsquo;s second law along the flight path plus the gravity-turn equations: five coupled ODEs
                (speed, flight-path angle, altitude, downrange distance, mass), integrated with RK4 at 1/240 s. After the{' '}
                <Live varKey="gamma" read={() => `${fmtFixed(rocket.params.pitchKickDeg, 2)}°`} /> kick, gravity alone
                steers. And the{' '}
                <Tooltip term="Δv budget">
                  Tsiolkovsky&rsquo;s Δv is what the engine could give with no gravity and no air. The simulation tracks
                  where the rest went; the test suite checks the books balance to within 1 m/s.
                </Tooltip>{' '}
                balances: <Live read={() => txt.mps(derived.idealDv())} /> ideal = burnout speed + gravity loss + drag loss.
              </p>
            }
            engineering={
              <ul className="reality-list">
                <li>Two or more stages — one stage this size cannot reach orbit on Earth.</li>
                <li>Throttle down through max-Q to cap aerodynamic loads; closed-loop guidance, not a fixed kick.</li>
                <li>Mach-dependent drag, thrust that grows as outside pressure falls, winds and Earth&rsquo;s rotation (≈ 400 m/s free eastward).</li>
                <li>6-DOF simulations of attitude, structural loads, sloshing propellant and engine-out cases.</li>
              </ul>
            }
            note={
              <p>
                Educational model — single-stage point mass; constant thrust and <em>I</em>
                <sub>sp</sub>; constant <em>C</em>
                <sub>d</sub> = 0.35; isothermal exponential atmosphere (<em>ρ</em>
                <sub>0</sub> = 1.225 kg/m³, <em>H</em> = 8.5 km); inverse-square gravity over a spherical, non-rotating
                planet; a simple pitch program. Not an orbital launch planner.
              </p>
            }
          />
          <aside className="sources" aria-label="Models and sources">
            <p className="label">Models &amp; sources</p>
            <ul>
              <li>Gravity-turn equations: H. D. Curtis, <em>Orbital Mechanics for Engineering Students</em>, ch. 11.</li>
              <li>Rocket equation: K. Tsiolkovsky (1903). Standard gravity g₀ = 9.80665 m/s² (CGPM 1901).</li>
              <li>Sea-level density 1.225 kg/m³: U.S. Standard Atmosphere 1976. Planet radii and surface gravity: NASA fact sheets.</li>
            </ul>
          </aside>
        </div>
      </div>
    </section>
  )
}
