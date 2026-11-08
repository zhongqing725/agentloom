import type { CSSProperties, ReactNode, ReactElement } from 'react'

export interface GooeyNavItem {
  label: string
  href?: string
  icon?: ReactNode
}

export interface GooeyNavProps {
  items?: GooeyNavItem[]
  initialActiveIndex?: number
  activeIndex?: number
  onChange?: (index: number, item: GooeyNavItem) => void
  /** Called for route hrefs (`/…`); the anchor's default jump is cancelled. */
  onNavigate?: (item: GooeyNavItem, index: number) => void
  theme?: 'dark' | 'light'
  color?: string
  activeTextColor?: string
  colors?: string[]
  size?: 'sm' | 'md' | 'lg'
  frame?: boolean
  animationTime?: number
  particleCount?: number
  timeVariance?: number
  spread?: number
  gooeyness?: number
  wobble?: number
  hoverEffect?: boolean
  className?: string
  style?: CSSProperties
}

declare const GooeyNav: (props: GooeyNavProps) => ReactElement

export default GooeyNav
