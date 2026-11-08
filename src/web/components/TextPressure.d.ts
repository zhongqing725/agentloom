import type { ReactElement } from 'react'

export interface TextPressureProps {
  text?: string
  fontFamily?: string
  fontUrl?: string
  fontSize?: number
  as?: 'h1' | 'p' | 'div'
  width?: boolean
  weight?: boolean
  italic?: boolean
  alpha?: boolean
  flex?: boolean
  stroke?: boolean
  scale?: boolean
  radius?: number
  smoothing?: number
  idle?: 'none' | 'wave' | 'pulse'
  idleSpeed?: number
  clickRipple?: boolean
  textColor?: string
  pressureColor?: string
  strokeColor?: string
  strokeWidth?: number
  className?: string
  minFontSize?: number
}

declare const TextPressure: (props: TextPressureProps) => ReactElement

export default TextPressure
