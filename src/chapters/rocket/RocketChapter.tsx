import { useEffect, useRef } from 'react'
import { Annotation } from '../../components/Annotation'
import { ChapterTitle } from '../../components/ChapterTitle'
import { ChapterWorld } from '../../components/ChapterWorld'
import { Live } from '../../components/Live'
import { Marquee } from '../../components/Marquee'
import { CHAPTERS } from '../../content/chapters'
import { fmtFixed, fmtSig, joinQty, qty } from '../../lib/format'
import { useModelValue } from '../../lib/useModelValue'
import { gsap, ScrollTrigger, useGSAP } from '../../motion/gsap'
import { RK } from '../../scenes/rocket/rocketGeometry'
import { useDirector } from '../../state/director'
import { usePrefs } from '../../state/prefs'
import { FlightSequence } from './FlightSequence'
import { derived, txt } from './readouts'
import { RocketLab } from './RocketLab'
import { RocketMaths } from './RocketMaths'
import { RocketReality } from './RocketReality'
import { forcesShown, rocket, rocketScroll, tickRocket, useRocketUI } from './runtime'

const CHAPTER = CHAPTERS[1]
const active = () => useDirector.getState().active === 'rocket'

/** Key quantities of the current rocket, computed by the model, for the marquee band. */
function marqueeItems(): string[] {
  const tr = rocket.trajectory
  const items = [
    `Thrust ${joinQty(qty.force(rocket.params.thrust))}`,
    `TWR ${fmtFixed(derived.twr0(), 2)}`,
    `ṁ ${fmtSig(derived.mdot(), 3)} kg/s`,
    `Δv ${joinQty(qty.speed(tr.idealDeltaV))}`,
  ]
  if (tr.maxQ) items.push(`Max-Q ${joinQty(qty.pressure(tr.maxQ.q))}`)
  if (tr.burnoutTime !== null) items.push(`Burn ${fmtFixed(tr.burnoutTime, 0)} s`)
  if (tr.burnoutTime !== null && tr.liftoffTime !== null) items.push(`MECO ${txt.m(tr.track.sample('h', tr.burnoutTime))}`)
  return items
}
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i])

function TitleCard() {
  return (
    <div className="rocket-title" id="rocket-title">
      <ChapterTitle chapter={CHAPTER} accentWord="orbit" kicker="Chapter 01 — Rocket launch" />
      <div className="grid-12 title-body">
        <div className="title-lede">
          <p className="big-idea">
            A rocket is a machine for winning one inequality — <em>thrust</em> &gt; <em>weight</em> — and then for
            trading mass for speed, <Live varKey="mdot" read={() => `${fmtSig(derived.mdot(), 3)} kg`} /> every
            second.
          </p>
        </div>
        <dl className="spec-sheet" aria-label="Vehicle data, from the model">
          <div className="spec-row">
            <dt className="label">FIG. 01 — N→R-1 · single stage</dt>
          </div>
          <div className="spec-row">
            <dt className="label">Height × diameter</dt>
            <dd className="data">
              {fmtFixed(RK.tip, 0)} m × {fmtFixed(RK.radius * 2, 1)} m
            </dd>
          </div>
          <div className="spec-row">
            <dt className="label">Liftoff mass m₀</dt>
            <dd className="data">
              <Live varKey="mass" read={() => txt.kg(derived.m0())} />
            </dd>
          </div>
          <div className="spec-row">
            <dt className="label">Thrust T</dt>
            <dd className="data">
              <Live varKey="thrust" read={() => txt.N(rocket.params.thrust)} />
            </dd>
          </div>
          <div className="spec-row">
            <dt className="label">Specific impulse I_sp</dt>
            <dd className="data">
              <Live varKey="isp" read={() => `${fmtFixed(rocket.params.isp, 0)} s`} />
            </dd>
          </div>
          <div className="spec-row">
            <dt className="label">Thrust-to-weight at ignition</dt>
            <dd className="data">
              <Live read={() => fmtFixed(derived.twr0(), 2)} />
            </dd>
          </div>
        </dl>
      </div>
    </div>
  )
}

/** Labels that ride on the 3D scene: the MAX-Q flag and the force arrows' values. */
function SceneLabels() {
  const showForces = () => active() && forcesShown()
  return (
    <div className="anno-layer" aria-hidden="true">
      <Annotation
        anchor="rocket-nose"
        varKey="q"
        show={() => active() && rocket.maxQPassed && rocket.viewTime - rocket.maxQ.t < 14 && rocket.viewTime >= rocket.maxQ.t}
      >
        <span className="anno-flag display">MAX-Q</span>
        <span className="data">
          <Live read={() => `${txt.pa(rocket.maxQ.q)} · ${txt.m(rocket.maxQ.h)}`} />
        </span>
      </Annotation>
      <Annotation anchor="force-T" varKey="thrust" show={showForces}>
        <span className="data">
          T = <Live read={() => txt.N(rocket.view.thrust)} />
        </span>
      </Annotation>
      <Annotation anchor="force-W" varKey="weight" show={showForces} side="left">
        <span className="data">
          mg = <Live read={() => txt.N(rocket.view.weight)} />
        </span>
      </Annotation>
      <Annotation anchor="force-D" varKey="drag" show={() => showForces() && rocket.view.drag > 50}>
        <span className="data">
          D = <Live read={() => txt.N(rocket.view.drag)} /> <span className="anno-note">(arrow ×4)</span>
        </span>
      </Annotation>
    </div>
  )
}

/**
 * CHAPTER 01 — ROCKET LAUNCH · From thrust to orbit.
 * Title card → pinned flight (scrubbed) → lab (live) → the maths → reality check.
 */
export default function RocketChapter() {
  const root = useRef<HTMLDivElement>(null)
  const reduced = usePrefs((s) => s.reducedMotion)
  const items = useModelValue(marqueeItems, sameList)

  // the simulation clock runs on the shared ticker, independent of the canvas
  useEffect(() => {
    const tick = (_t: number, dtMs: number) => tickRocket(dtMs / 1000)
    gsap.ticker.add(tick, false, true)
    return () => gsap.ticker.remove(tick)
  }, [])

  useGSAP(
    () => {
      const lab = root.current!.querySelector<HTMLElement>('#rocket-lab')!
      ScrollTrigger.create({
        trigger: lab,
        start: 'top 70%',
        onEnter: () => {
          rocketScroll.section = 'lab'
          useRocketUI.getState().setMode('live')
        },
        onLeaveBack: () => {
          rocketScroll.section = 'flight'
          useRocketUI.getState().setMode('scrub')
        },
      })
      ScrollTrigger.create({
        trigger: root.current!.querySelector<HTMLElement>('#rocket-maths')!,
        start: 'top 55%',
        onEnter: () => {
          rocketScroll.side = 'right'
        },
        onLeaveBack: () => {
          rocketScroll.side = 'left'
        },
      })
      ScrollTrigger.create({
        trigger: root.current!.querySelector<HTMLElement>('#rocket-reality')!,
        start: 'top 65%',
        onEnter: () => {
          rocketScroll.reading = true
        },
        onLeaveBack: () => {
          rocketScroll.reading = false
        },
      })
      // colour wash hides the camera cut between the scrubbed flight and the live lab
      const wash = root.current!.querySelector<HTMLElement>('.wash')!
      gsap
        .timeline({ scrollTrigger: { trigger: lab, start: 'top bottom', end: 'top 40%', scrub: reduced ? true : 0.6 } })
        .fromTo(wash, { opacity: 0 }, { opacity: 1, ease: 'power1.in', duration: 1 })
        .to(wash, { opacity: 0, ease: 'power1.out', duration: 1 })
    },
    { scope: root, dependencies: [reduced] },
  )

  return (
    <ChapterWorld chapter={CHAPTER} label="Chapter 01 — Rocket launch: from thrust to orbit" className="rocket-world">
      <div ref={root}>
        <div className="wash" aria-hidden="true" />
        <TitleCard />
        <Marquee items={items} />
        <FlightSequence />
        <RocketLab />
        <RocketMaths />
        <RocketReality />
        <SceneLabels />
      </div>
    </ChapterWorld>
  )
}
