import type { WorldId } from '../design/worlds'

/** The museum's floor plan. Order = scroll order. */
export type ChapterId = WorldId

export interface ChapterMeta {
  id: ChapterId
  index: number
  /** "00" … "08" */
  code: string
  /** ChapterNav label */
  nav: string
  title: string
  subtitle: string
  /** built chapters have a scene + narrative; the rest appear in the nav as upcoming */
  built: boolean
}

export const CHAPTERS: readonly ChapterMeta[] = [
  { id: 'intro', index: 0, code: '00', nav: 'INTRO', title: 'Numbers → Reality', subtitle: 'Where mathematics becomes reality.', built: true },
  { id: 'rocket', index: 1, code: '01', nav: 'ROCKET', title: 'Rocket Launch', subtitle: 'From thrust to orbit', built: true },
  { id: 'gps', index: 2, code: '02', nav: 'GPS', title: 'GPS', subtitle: 'Four clocks find you', built: false },
  { id: 'f1', index: 3, code: '03', nav: 'F1', title: 'F1 Aerodynamics', subtitle: 'Upside-down wings', built: false },
  { id: 'ai', index: 4, code: '04', nav: 'AI', title: 'The Mathematics Inside AI', subtitle: 'How numbers learn', built: false },
  { id: 'ct', index: 5, code: '05', nav: 'CT', title: 'Seeing Inside', subtitle: 'CT scanning', built: false },
  { id: 'skyscraper', index: 6, code: '06', nav: 'SKYSCRAPER', title: 'Making a Building Stand', subtitle: 'Skyscraper', built: false },
  { id: 'robot', index: 7, code: '07', nav: 'ROBOT ARM', title: 'Teaching Machines to Move', subtitle: 'Robotic arm', built: false },
  { id: 'accelerator', index: 8, code: '08', nav: 'ACCELERATOR', title: 'Bending Particles', subtitle: 'Particle accelerator', built: false },
]

/** Number of exhibition chapters (00 is the entrance). */
export const CHAPTER_COUNT = 8

export const chapterById = (id: ChapterId): ChapterMeta => CHAPTERS.find((c) => c.id === id)!
