import type { CSSProperties, ReactElement } from 'react'

export interface DriftWallItem {
  image?: string
  title?: string
  href?: string
  /** Text tile: leave `image` out and pass the copy instead. */
  text?: string
  meta?: string
  tag?: string
  index?: string
}

export interface DriftWallProps {
  items?: DriftWallItem[]
  columns?: number
  tileWidth?: number
  tileHeight?: number
  gap?: number
  radius?: number
  tilt?: number
  turn?: number
  roll?: number
  perspective?: number
  depth?: number
  speed?: number
  direction?: 'up' | 'down'
  variance?: number
  parallax?: number
  pauseOnHover?: boolean
  lift?: number
  fade?: number
  dim?: number
  grayscale?: boolean
  overlayColor?: string
  className?: string
  style?: CSSProperties
}

declare const DriftWall: (props: DriftWallProps) => ReactElement

export default DriftWall
