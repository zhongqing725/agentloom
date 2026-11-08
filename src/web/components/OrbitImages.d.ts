import type { CSSProperties, ReactNode, ReactElement } from 'react'

export type OrbitShape =
  | 'circle'
  | 'ellipse'
  | 'square'
  | 'rectangle'
  | 'triangle'
  | 'star'
  | 'heart'
  | 'infinity'
  | 'wave'
  | 'custom'

export interface OrbitImageItem {
  src?: string
  alt?: string
  /** Local patch: render this instead of an image. */
  node?: ReactNode
}

export interface OrbitImagesProps {
  images?: (string | OrbitImageItem)[]
  altPrefix?: string
  shape?: OrbitShape
  customPath?: string
  baseWidth?: number
  radiusX?: number
  radiusY?: number
  radius?: number
  starPoints?: number
  starInnerRatio?: number
  rotation?: number
  duration?: number
  itemSize?: number
  direction?: 'normal' | 'reverse'
  fill?: boolean
  width?: string | number
  height?: string | number
  className?: string
  showPath?: boolean
  pathColor?: string
  pathWidth?: number
  pathDash?: number
  easing?: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'
  paused?: boolean
  depth?: number
  itemRadius?: number
  shadow?: number
  hoverScale?: number
  hoverSpeed?: number
  draggable?: boolean
  clickToFront?: boolean
  onItemClick?: (index: number, src: string | undefined) => void
  alignToPath?: boolean
  intro?: boolean
  centerContent?: ReactNode
  style?: CSSProperties
}

declare const OrbitImages: (props: OrbitImagesProps) => ReactElement

export default OrbitImages
