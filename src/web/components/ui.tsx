import type { HTMLAttributes, KeyboardEvent, ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  RiBookOpenLine,
  RiCheckboxCircleLine,
  RiDiscussLine,
  RiGitBranchLine,
  RiQuestionLine,
  RiShieldCheckLine,
  RiVerifiedBadgeLine,
  RiCalculatorLine,
} from '@remixicon/react'
import { Modal as BoardModal, ModalBody, ModalFooter, ModalHeader } from '@/components/base/modal/modal'
import { cx } from '@/utils/cx'
import type { Citation, NodeStatus } from '../../shared/types'

const PLUGIN_ICONS = {
  'book-open': RiBookOpenLine,
  'git-branch': RiGitBranchLine,
  'shield-question': RiQuestionLine,
  'badge-check': RiVerifiedBadgeLine,
  'messages-square': RiDiscussLine,
  calculator: RiCalculatorLine,
  'shield-check': RiShieldCheckLine,
  check: RiCheckboxCircleLine,
} as const

export function pluginIconComponent(name: string) {
  return PLUGIN_ICONS[name as keyof typeof PLUGIN_ICONS] ?? RiBookOpenLine
}

export function PluginIcon({ name, size = 14, className }: { name: string; size?: number; className?: string }) {
  const Icon = pluginIconComponent(name)
  return <Icon size={size} className={className} aria-hidden />
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
    <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-caption-1-semibold uppercase tracking-[0.18em] text-accent-600">
            {eyebrow}
          </div>
        )}
        <h1 className="mt-2 text-title-1-medium text-text-primary sm:text-display-4-medium">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-body-regular text-text-secondary">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

type SurfaceProps = HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'section' | 'article' | 'aside'
  className?: string
  children: ReactNode
}

export function Surface({ as: Tag = 'div', className, children, ...props }: SurfaceProps) {
  return (
    <Tag
      {...props}
      className={cx(
        'rounded-3xl border border-separator-border bg-background-primary-default shadow-card backdrop-blur-xl',
        className,
      )}
    >
      {children}
    </Tag>
  )
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('text-caption-1-semibold uppercase tracking-[0.16em] text-accent-600', className)}>
      {children}
    </div>
  )
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending: { label: '待执行', className: 'bg-background-tertiary-default text-text-secondary' },
  queued: { label: '排队中', className: 'bg-status-yellow-background text-status-yellow-text' },
  running: { label: '执行中', className: 'bg-accent-100 text-accent-700' },
  completed: { label: '已完成', className: 'bg-status-lime-background text-status-lime-text' },
  failed: { label: '失败', className: 'bg-status-rose-background text-status-rose-text' },
  waiting: { label: '待复核', className: 'bg-status-orange-background text-status-orange-text' },
  skipped: { label: '已跳过', className: 'bg-background-tertiary-default text-text-tertiary' },
  cancelled: { label: '已取消', className: 'bg-background-tertiary-default text-text-secondary' },
}

export function statusLabel(status: string) {
  return STATUS_META[status]?.label ?? status
}

export function StatusPill({ status, className }: { status: NodeStatus | string; className?: string }) {
  const meta = STATUS_META[status] ?? { label: status, className: 'bg-background-tertiary-default text-text-secondary' }
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-caption-1-semibold',
        meta.className,
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {meta.label}
    </span>
  )
}

/** Legacy compatibility while pages migrate to StatusPill and Badge. */
export function Pill({ children, tone = 'muted' }: { children: ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    muted: 'bg-background-tertiary-default text-text-secondary',
    green: 'bg-status-lime-background text-status-lime-text',
    orange: 'bg-status-orange-background text-status-orange-text',
    teal: 'bg-accent-100 text-accent-700',
    purple: 'bg-background-tertiary-default text-text-secondary',
    amber: 'bg-status-yellow-background text-status-yellow-text',
    red: 'bg-status-rose-background text-status-rose-text',
  }
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-caption-1-semibold',
        tones[tone] ?? tones.muted,
      )}
    >
      {children}
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
  const toneClass = safe >= 0.85 ? 'text-status-lime-text' : safe >= 0.6 ? 'text-accent-500' : 'text-status-rose-text'
  return (
    <div className={cx('relative shrink-0', toneClass)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-border-button-default)"
          strokeWidth="6"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <strong className={size >= 60 ? 'text-title-3-semibold' : 'text-caption-1-semibold'}>
          {Math.round(safe * 100)}
        </strong>
        {label && <span className="text-caption-2-medium text-text-tertiary">{label}</span>}
      </div>
    </div>
  )
}

export function Empty({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-3xl border border-dashed border-border-button-default bg-background-secondary-default p-8 text-center">
      <div className="flex size-11 items-center justify-center rounded-full bg-background-tertiary-default text-foreground-icon-secondary">
        <RiCheckboxCircleLine className="size-5" aria-hidden />
      </div>
      <strong className="mt-4 text-title-3-semibold text-text-primary">{title}</strong>
      {description && <p className="mt-1 max-w-md text-body-regular text-text-secondary">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
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
  return (
    <BoardModal
      isOpen={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      size={wide ? 'xl' : 'md'}
      className="bg-background-primary-default"
    >
      <ModalHeader title={title} description={subtitle} closeLabel="关闭" />
      <ModalBody>{children}</ModalBody>
      {footer && <ModalFooter>{footer}</ModalFooter>}
    </BoardModal>
  )
}

export function MarkdownView({ content, citations }: { content: string; citations?: Citation[] }) {
  const citationMap = new Map((citations ?? []).map((citation) => [citation.id, citation]))
  const linked = content.replace(/\[([A-Z]\d+)\]/g, '[$1](#cite-$1)')
  return (
    <div className="report-prose report-serif">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith('#cite-')) {
              const id = href.replace('#cite-', '')
              const citation = citationMap.get(id)
              return (
                <span
                  className="mx-0.5 inline-flex rounded-sm bg-accent-100 px-1 text-caption-1-semibold text-accent-700"
                  title={citation ? `${citation.docTitle}\n${citation.quote}` : id}
                >
                  [{id}]
                </span>
              )
            }
            return (
              <a href={href} target="_blank" rel="noreferrer" className="text-accent-700 underline underline-offset-2">
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

export function onActivateKey(event: KeyboardEvent, action: () => void) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  action()
}
