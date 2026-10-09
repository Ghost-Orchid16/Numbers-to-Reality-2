import { useGSAP } from '@gsap/react'
import { gsap } from 'gsap'
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'

gsap.registerPlugin(ScrollTrigger, SplitText, ScrambleTextPlugin, useGSAP)
gsap.defaults({ ease: 'expo.out', duration: 1.1 })
// One ticker drives Lenis, ScrollTrigger and our readouts; never "catch up" after a stall.
gsap.ticker.lagSmoothing(0)

export { gsap, ScrambleTextPlugin, ScrollTrigger, SplitText, useGSAP }
