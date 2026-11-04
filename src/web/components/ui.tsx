import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  BadgeCheck,
  BookOpen,
  Calculator,
  GitBranch,
  MessagesSquare,
  ShieldQuestion,
  type LucideIcon,
} from 'lucide-react'
import type { Citation, NodeStatus } from '../../shared/types'

const PLUGIN_ICONS: Record<string, LucideIcon> = {
  BookOpen,
  GitBranch,
  ShieldQuestion,
  BadgeCheck,
  MessagesSquare,
  Calculator,
}

export function PluginIcon({ name, size = 14 }: { name: string; size?: number }) {
  const Icon = PLUGIN_ICONS[name] ?? BookOpen
  return <Icon size={size} strokeWidth={1.8} />
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}

export function Pill({ children, tone = 'default' }: { children: ReactNode; tone?: string }) {
  return <span className={`pill pill-${tone}`}>{children}</span>
}

const STATUS_META: Record<string, { label: string; tone: string }> = {
  pending: { label: '待执行', tone: 'muted' },
  queued: { label: '排队中', tone: 'amber' },
  running: { label: '执行中', tone: 'teal' },
  completed: { label: '已完成', tone: 'green' },
  failed: { label: '失败', tone: 'red' },
  waiting: { label: '待复核', tone: 'orange' },
  skipped: { label: '已跳过', tone: 'muted' },
  cancelled: { label: '已取消', tone: 'muted' },
}

export function statusLabel(status: string) {
  return STATUS_META[status]?.label ?? status
}

export function statusTone(status: string) {
  return STATUS_META[status]?.tone ?? 'muted'
}

export function StatusPill({ status }: { status: NodeStatus | string }) {
  return (
    <span className={`status-pill tone-${statusTone(status)}`}>
      <span className="status-dot" />
      {statusLabel(status)}
    </span>
  )
}

export function ScoreRing({
  score,
  size = 86,
  label = '核查分',
}: {
  score: number
  size?: number
  label?: string
}) {
  const safe = Math.max(0, Math.min(1, score || 0))
  const radius = size / 2 - 7
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - safe)
  const color = safe >= 0.85 ? '#3E6B48' : safe >= 0.6 ? '#D4552D' : '#B23A48'
  return (
    <div className="score-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e4ddd1" strokeWidth="6" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="score-ring-inner">
        <strong style={{ color }}>{Math.round(safe * 100)}</strong>
        <span>{label}</span>
      </div>
    </div>
  )
}

export function Modal({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide = false,
}: {
  open: boolean
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  if (!open) return null
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Empty({ title, description }: { title: string; description?: string }) {
  return (
    <div className="empty">
      <div className="empty-mark">∅</div>
      <strong>{title}</strong>
      {description && <p>{description}</p>}
    </div>
  )
}

export function MarkdownView({ content, citations }: { content: string; citations?: Citation[] }) {
  const citationMap = new Map((citations ?? []).map((citation) => [citation.id, citation]))
  const linked = content.replace(/\[([A-Z]\d+)\]/g, '[$1](#cite-$1)')
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith('#cite-')) {
              const id = href.replace('#cite-', '')
              const citation = citationMap.get(id)
              return (
                <span className="citation" title={citation ? `${citation.docTitle}\n${citation.quote}` : id}>
                  [{id}]
                </span>
              )
            }
            return (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            )
          },
        }}
      >
        {linked}
      </ReactMarkdown>
    </div>
  )
}
