import type { HTMLAttributes, ReactNode } from 'react'
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
import { Chip } from '@/components/base/badges/chip'
import type { ChipColor } from '@/components/base/badges/chip'
import { ProgressBar } from '@/components/base/progress/progress'
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

/* ---------------------------------------------------------------------------
 * Page header
 * ------------------------------------------------------------------------ */

export function PageHeader({
  title,
  meta,
  actions,
}: {
  title: string
  meta?: string
  actions?: ReactNode
}) {
  return (
    <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[19px] font-semibold leading-tight tracking-[-0.022em] text-text-primary">{title}</h1>
        {meta && <div className="t-meta mt-1">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

/* ---------------------------------------------------------------------------
 * Surface
 * ------------------------------------------------------------------------ */

type SurfaceProps = HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'section' | 'article' | 'aside'
  className?: string
  children: ReactNode
}

export function Surface({ as: Tag = 'div', className, children, ...props }: SurfaceProps) {
  return (
    <Tag {...props} className={cx('glass', className)}>
      {children}
    </Tag>
  )
}

/* ---------------------------------------------------------------------------
 * Section head
 * ------------------------------------------------------------------------ */

export function SectionHead({
  title,
  aside,
  className,
}: {
  title: string
  aside?: ReactNode
  className?: string
}) {
  return (
    <div className={cx('flex items-baseline justify-between gap-4', className)}>
      <h2 className="t-h2">{title}</h2>
      {aside && <div className="flex items-baseline gap-3">{aside}</div>}
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Figures
 * ------------------------------------------------------------------------ */

export function Figure({
  label,
  value,
  unit,
  note,
}: {
  label: string
  value: ReactNode
  unit?: string
  note?: string
}) {
  return (
    <div className="min-w-0">
      <div className="t-label">{label}</div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="figure-value">{value}</span>
        {unit && <span className="t-meta pb-1">{unit}</span>}
      </div>
      {note && <div className="mt-1.5 text-caption-2-regular text-text-tertiary">{note}</div>}
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Status
 * ------------------------------------------------------------------------ */

const STATUS_META: Record<string, { label: string; color: ChipColor }> = {
  pending: { label: '待执行', color: 'neutral' },
  queued: { label: '排队中', color: 'yellow' },
  running: { label: '执行中', color: 'orange' },
  completed: { label: '已完成', color: 'lime' },
  failed: { label: '失败', color: 'rose' },
  waiting: { label: '待复核', color: 'orange' },
  skipped: { label: '已跳过', color: 'neutral' },
  cancelled: { label: '已取消', color: 'neutral' },
  closed: { label: '已归档', color: 'neutral' },
}

export function statusLabel(status: string) {
  return STATUS_META[status]?.label ?? status
}

export function StatusPill({ status, className }: { status: NodeStatus | string; className?: string }) {
  const meta = STATUS_META[status] ?? { label: status, color: 'neutral' as ChipColor }
  return (
    <Chip variant="caption" color={meta.color} className={className}>
      {meta.label}
    </Chip>
  )
}

/* ---------------------------------------------------------------------------
 * Score
 * ------------------------------------------------------------------------ */

export function ScoreRing({
  score,
  size = 86,
  label = '核查分',
  className,
}: {
  score: number
  size?: number
  label?: string
  className?: string
}) {
  const safe = Math.max(0, Math.min(1, score || 0))
  const percent = Math.round(safe * 100)
  const large = size >= 60

  if (!large) {
    return (
      <span
        className={cx(
          't-num text-[13px] font-medium',
          safe >= 0.9 ? 'text-text-primary' : 'text-accent-600',
          className,
        )}
      >
        {percent}%
      </span>
    )
  }

  return (
    <div className={cx('min-w-0', className)}>
      <div className="flex items-baseline gap-1">
        <span className="figure-value">{percent}</span>
        <span className="t-meta pb-0.5">%</span>
      </div>
      {label && <div className="t-label mt-2">{label}</div>}
      <ProgressBar
        aria-label={label || '核查分'}
        value={percent}
        size="sm"
        className="mt-3 max-w-[168px]"
      />
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Empty and modal
 * ------------------------------------------------------------------------ */

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
    <div className="flex min-h-40 flex-col items-start justify-center gap-2 rounded-3xl border border-dashed border-border-button-default p-8">
      <strong className="t-h3">{title}</strong>
      {description && <p className="t-small max-w-md">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
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
      className="panel-solid"
    >
      <ModalHeader title={title} description={subtitle} closeLabel="关闭" />
      <ModalBody>{children}</ModalBody>
      {footer && <ModalFooter>{footer}</ModalFooter>}
    </BoardModal>
  )
}

/* ---------------------------------------------------------------------------
 * Markdown
 * ------------------------------------------------------------------------ */

export function MarkdownView({ content, citations }: { content: string; citations?: Citation[] }) {
  const citationMap = new Map((citations ?? []).map((citation) => [citation.id, citation]))
  const linked = content.replace(/\[([A-Z]\d+)\]/g, '[$1](#cite-$1)')
  return (
    <div className="report-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto">
              <table>{children}</table>
            </div>
          ),
          a: ({ href, children }) => {
            if (href?.startsWith('#cite-')) {
              const id = href.replace('#cite-', '')
              const citation = citationMap.get(id)
              return (
                <sup
                  className="mx-0.5 font-mono text-[0.6875rem] font-medium text-accent-600 no-underline"
                  title={citation ? `${citation.docTitle}\n${citation.quote}` : id}
                >
                  [{id}]
                </sup>
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
