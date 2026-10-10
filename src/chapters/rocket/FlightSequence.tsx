import { useEffect, useRef } from 'react'
import { EquationBlock } from '../../components/EquationBlock'
import { Live } from '../../components/Live'
import { LiveMetric } from '../../components/LiveMetric'
import { ScrollNarrative, type NarrativeStep } from '../../components/ScrollNarrative'
import { setText } from '../../lib/dom'
import { cv } from '../../lib/tex'
import { onFrame } from '../../motion/frame'
import { gsap, ScrollTrigger, useGSAP } from '../../motion/gsap'
import { STILL, STILL_TIME } from '../../perf/still'
import { usePrefs } from '../../state/prefs'
import { flightTimeAt, keyMoments } from './flightMap'
import { read, txt } from './readouts'
import { COUNTDOWN, rocket, rocketScroll } from './runtime'

const view = () => rocket.view
const traj = () => rocket.trajectory

/** T−3 … IGNITION … LIFTOFF in the chapter's stencil face, behind a heat-shimmer filter. */
function Countdown() {
  const text = useRef<HTMLSpanElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const turb = useRef<SVGFETurbulenceElement>(null)
  const disp = useRef<SVGFEDisplacementMapElement>(null)
  const reduced = usePrefs((s) => s.reducedMotion)

  useEffect(() => {
    let last = ''
    const tick = (now: number) => {
      const time = STILL ? STILL_TIME : now
      const t = rocket.viewTime
      const tl = traj().liftoffTime
      let label = ''
      if (rocketScroll.section === 'flight') {
        if (t < 0 && t >= -COUNTDOWN) label = String(Math.ceil(-t))
        else if (t >= 0 && view().onPad) label = 'IGNITION'
        else if (tl !== null && t >= tl && t < tl + 3.5) label = 'LIFTOFF'
      }
      if (label !== last) {
        last = label
        setText(text.current, label)
        wrap.current?.setAttribute('data-on', label ? 'true' : 'false')
        wrap.current?.setAttribute('data-kind', label.length > 2 ? 'word' : 'digit')
      }
      // heat shimmer: stronger once the engine burns — only while a word or digit is showing
      // (the filter has nothing to distort otherwise; writing it every frame re-styled it)
      if (label && !reduced && turb.current && disp.current) {
        const hot = t >= 0 ? 1 : 0.25
        turb.current.setAttribute('baseFrequency', `0.012 ${(0.06 + 0.01 * Math.sin(time * 3)).toFixed(4)}`)
        turb.current.setAttribute('seed', String(Math.floor(time * 14) % 50))
        disp.current.setAttribute('scale', (6 * hot).toFixed(2))
      }
    }
    return onFrame('dom', tick)
  }, [reduced])

  return (
    <div ref={wrap} className="countdown" data-on="false" aria-hidden="true">
      <svg width="0" height="0" className="absolute">
        <filter id="heat-shimmer">
          <feTurbulence ref={turb} type="fractalNoise" baseFrequency="0.012 0.06" numOctaves={2} seed={3} />
          <feDisplacementMap ref={disp} in="SourceGraphic" scale={0} />
        </filter>
      </svg>
      <span ref={text} className="countdown-text display" style={reduced ? undefined : { filter: 'url(#heat-shimmer)' }} />
    </div>
  )
}

const steps: NarrativeStep[] = [
  {
    id: 'countdown',
    active: () => rocket.viewTime < 0,
    kicker: 'T−3 · Countdown',
    title: 'One inequality decides everything.',
    body: (
      <p>
        To leave the pad, thrust must beat weight: <em>T</em> &gt; <em>mg</em>. Here the engine will push{' '}
        <Live varKey="thrust" read={() => txt.N(rocket.params.thrust)} /> against a weight of{' '}
        <Live varKey="weight" read={() => txt.N(view().weight)} />.
      </p>
    ),
  },
  {
    id: 'ignition',
    active: () => rocket.viewTime >= 0 && rocket.viewTime < 2.5,
    kicker: 'T+0 · Ignition',
    title: 'Mass turns into thrust.',
    body: (
      <p>
        The engine swallows <em>ṁ</em> = <em>T</em>/(<em>I</em>
        <sub>sp</sub>·<em>g</em>
        <sub>0</sub>) = <Live varKey="mdot" read={() => `${read.mdot().value} kg/s`} /> of propellant. Every second the
        rocket is lighter — and that changes everything that follows.
      </p>
    ),
  },
  {
    id: 'liftoff',
    active: () => rocket.viewTime >= 2.5 && !view().pitched && view().h < 3000,
    kicker: 'Liftoff',
    title: (
      <>
        F<sub>net</sub> = T − mg − D &gt; 0
      </>
    ),
    body: (
      <p>
        A net force of <Live varKey="fnet" read={() => txt.N(view().fNet)} /> on{' '}
        <Live varKey="mass" read={() => txt.t(view().m)} /> gives <em>a</em> = <em>F</em>/<em>m</em> ={' '}
        <Live varKey="accel" read={() => txt.g(view().accel)} />. A slow start: thrust-to-weight is only{' '}
        <Live read={() => txt.ratio(view().twr)} />.
      </p>
    ),
  },
  {
    id: 'pitch',
    active: () => view().pitched && (!traj().maxQ || rocket.viewTime < traj().maxQ!.t - 9),
    kicker: 'Pitch-over · gravity turn',
    title: 'Lean a little. Let gravity steer.',
    body: (
      <p>
        At <Live varKey="velocity" read={() => txt.mps(rocket.params.pitchKickSpeed)} /> the rocket tilts by{' '}
        <Live read={() => `${rocket.params.pitchKickDeg.toFixed(2)}°`} />. From then on gravity bends the path: γ̇ =
        −(<em>g</em>/<em>v</em> −{' '}
        <em>v</em>/(<em>R</em>+<em>h</em>))·cos γ. Flight-path angle now{' '}
        <Live varKey="gamma" read={() => txt.deg(view().gamma)} />.
      </p>
    ),
  },
  {
    id: 'maxq',
    active: () => !!traj().maxQ && Math.abs(rocket.viewTime - traj().maxQ!.t) <= 9,
    kicker: 'Max-Q',
    title: 'The hardest push of the air.',
    body: (
      <p>
        Dynamic pressure <em>q</em> = ½<em>ρv</em>². Air thins as <em>ρ</em>
        <sub>0</sub>e<sup>−h/H</sup> while <em>v</em> keeps climbing, so their product peaks — here at{' '}
        <Live varKey="q" read={() => txt.pa(traj().maxQ?.q ?? 0)} />,{' '}
        <Live varKey="altitude" read={() => txt.m(traj().maxQ?.h ?? 0)} /> up.
      </p>
    ),
  },
  {
    id: 'lighter',
    active: () => view().engineOn && !!traj().maxQ && rocket.viewTime > traj().maxQ!.t + 9,
    kicker: 'Lighter every second',
    title: 'Same thrust. Less mass.',
    body: (
      <p>
        Mass has fallen to <Live varKey="mass" read={() => txt.t(view().m)} />, so the same thrust now gives{' '}
        <Live varKey="accel" read={() => txt.g(view().accel)} />. Up here drag is only{' '}
        <Live varKey="drag" read={() => txt.N(view().drag)} />.
      </p>
    ),
  },
  {
    id: 'meco',
    active: () => rocket.viewTime > 0 && !view().engineOn && !view().onPad,
    kicker: 'MECO · main-engine cut-off',
    title: 'Promised versus delivered.',
    body: (
      <p>
        Tsiolkovsky promised Δ<em>v</em> = <Live read={() => txt.mps(traj().idealDeltaV)} />. Burnout speed:{' '}
        <Live varKey="velocity" read={() => txt.mps(traj().burnoutSpeed ?? 0)} /> — gravity took{' '}
        <Live varKey="gravity" read={() => txt.mps(view().gravityLoss)} /> and drag{' '}
        <Live varKey="drag" read={() => txt.mps(view().dragLoss)} />.
      </p>
    ),
  },
]

/**
 * PHENOMENON — the pinned launch. Scroll maps to simulated time on the trajectory the model
 * computed for the current lab parameters (recomputed on every change). Under reduced motion
 * the scrub becomes a few key moments with a crossfade.
 */
export function FlightSequence() {
  const root = useRef<HTMLDivElement>(null)
  const reduced = usePrefs((s) => s.reducedMotion)
  const compact = usePrefs((s) => s.compact)

  useGSAP(
    () => {
      const el = root.current!
      const length = compact ? 380 : 520
      const enter = () => {
        rocketScroll.section = 'flight'
      }
      const back = () => {
        rocketScroll.section = 'title'
        rocket.scrubTime = -COUNTDOWN - 1
      }
      if (reduced) {
        let index = -1
        const stage = document.querySelector<HTMLElement>('.stage')
        ScrollTrigger.create({
          trigger: el,
          start: 'top top',
          end: `+=${length}%`,
          pin: true,
          onEnter: enter,
          onEnterBack: enter,
          onLeaveBack: back,
          onUpdate: (self) => {
            const moments = keyMoments(rocket.trajectory)
            const i = Math.min(moments.length - 1, Math.floor(self.progress * moments.length))
            rocketScroll.flight = self.progress
            if (i === index) return
            index = i
            if (stage) {
              gsap.timeline()
                .to(stage, { opacity: 0.12, duration: 0.18, ease: 'none' })
                .call(() => {
                  rocket.scrubTime = moments[i]
                })
                .to(stage, { opacity: 1, duration: 0.3, ease: 'none' })
            } else rocket.scrubTime = moments[i]
          },
        })
        return
      }
      const proxy = { p: 0 }
      gsap.to(proxy, {
        p: 1,
        ease: 'none',
        scrollTrigger: {
          trigger: el,
          start: 'top top',
          end: `+=${length}%`,
          pin: true,
          scrub: 1,
          onEnter: enter,
          onEnterBack: enter,
          onLeaveBack: back,
        },
        onUpdate: () => {
          rocketScroll.flight = proxy.p
          rocket.scrubTime = flightTimeAt(proxy.p, rocket.trajectory)
        },
      })
    },
    { scope: root, dependencies: [reduced, compact] },
  )

  return (
    <div ref={root} className="flight" id="rocket-flight" aria-label="Launch sequence (scroll to advance time)">
      <p className="sr-only">
        A scroll-controlled launch: scrolling advances simulated time from the countdown through liftoff, max-Q and
        engine cut-off, using the trajectory computed by the rocket model for the current lab settings.
      </p>
      <div className="flight-frame">
        <ScrollNarrative steps={steps} className="flight-narrative" />
        <div className="flight-hud" aria-label="Flight readouts">
          <LiveMetric label="Mission clock" read={read.clock} size="lg" scramble={false} className="flight-clock" />
          <LiveMetric label="Altitude" tex={cv('altitude', 'h')} varKey="altitude" read={read.altitude} />
          <LiveMetric label="Velocity" tex={cv('velocity', 'v')} varKey="velocity" read={read.velocity} />
          <LiveMetric label="Acceleration" tex={cv('accel', 'a')} varKey="accel" read={read.accel} />
          <LiveMetric label="Mass" tex={cv('mass', 'm')} varKey="mass" read={read.mass} />
          <LiveMetric label="TWR" tex={`\\tfrac{${cv('thrust', 'T')}}{${cv('weight', 'mg')}}`} read={read.twr} />
          <LiveMetric label="Dyn. pressure" tex={cv('q', 'q')} varKey="q" read={read.q} />
        </div>
        <Countdown />
        <div className="flight-eq">
          <EquationBlock
            fig="EQ. 01"
            title="Force along the flight path"
            tex={`${cv('fnet', 'F_{\\text{net}}')} = ${cv('thrust', 'T')} - ${cv('mass', 'm')}\\,${cv('gravity', 'g')}\\sin${cv('gamma', '\\gamma')} - ${cv('drag', 'D')}`}
            substitution={[
              { varKey: 'thrust', read: () => txt.N(view().thrust) },
              '−',
              '(',
              { varKey: 'mass', read: () => txt.kg(view().m) },
              '×',
              { varKey: 'gravity', read: () => txt.ms2(view().g) },
              '× sin',
              { varKey: 'gamma', read: () => txt.deg(view().gamma) },
              ')',
              '−',
              { varKey: 'drag', read: () => txt.N(view().drag) },
            ]}
            result={[
              {
                varKey: 'fnet',
                read: () => (view().onPad ? `${txt.N(view().fFree)} → pad holds, F = 0` : txt.N(view().fNet)),
              },
            ]}
          />
        </div>
      </div>
    </div>
  )
}
