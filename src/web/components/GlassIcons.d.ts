import type { CSSProperties, ReactElement, ReactNode } from 'react'

export interface GlassIconItem {
  icon: ReactNode
  color?: string
  label?: string
  href?: string
  target?: string
  onClick?: () => void
  id?: string
  className?: string
}

export interface GlassIconsProps {
  items?: GlassIconItem[]
  size?: number
  gap?: number
  columns?: number
  roundness?: number
  refraction?: number
  bevel?: number
  dispersion?: number
  frost?: number
  shine?: number
  tint?: string
  tintOpacity?: number
  iconColor?: string
  plate?: 'tilt' | 'offset' | 'circle' | 'none'
  tilt?: number
  spread?: number
  hover?: 'lift' | 'float' | 'press' | 'none'
  parallax?: number
  labels?: 'hover' | 'always' | 'none'
  intro?: boolean
  theme?: 'dark' | 'light'
  className?: string
  style?: CSSProperties
}

declare const GlassIcons: (props: GlassIconsProps) => ReactElement

export default GlassIcons
