import { useCallback, useEffect, useMemo, useState } from 'react'
import { RiPlayLargeLine, RiRefreshLine, RiSparklingLine } from '@remixicon/react'
import { useApp } from '../App'
import { api } from '../api'
import { Avatar } from '@/components/base/avatar/avatar'
import { Button } from '@/components/base/buttons/button'
import { Chip } from '@/components/base/badges/chip'
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from '@/components/base/table/table'
import { cx } from '@/utils/cx'
import { Empty, PageHeader, SectionHead, Surface } from '../components/ui'
import type { EvalCase, TrainingRun, TrainingVersion } from '../../shared/types'

function formatDate(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function percent(value?: number) {
  return value === undefined ? '—' : `${Math.round(value * 100)}%`
}

export default function Training() {
  const { data, refresh } = useApp()
  const [agentId, setAgentId] = useState<string | null>(null)
  const [cases, setCases] = useState<EvalCase[]>([])
  const [versions, setVersions] = useState<TrainingVersion[]>([])
  const [runs, setRuns] = useState<TrainingRun[]>([])
  const [run, setRun] = useState<TrainingRun | null>(null)
  const [starting, setStarting] = useState(false)
  const [activating, setActivating] = useState<string | null>(null)
  const [activatingVersion, setActivatingVersion] = useState<string | null>(null)
  const [error, setError] = useState('')

  const agent = useMemo(
    () => data?.agents.find((item) => item.id === agentId) ?? data?.agents[0],
    [data, agentId],
  )

  const load = useCallback(async (id: string) => {
    try {
      const next = await api.training(id)
      setCases(next.cases)
      setVersions(next.versions)
      setRuns(next.runs)
      setRun(next.runs[0] ?? null)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法加载训练数据')
    }
  }, [])

  useEffect(() => {
    if (agent) void load(agent.id)
  }, [agent, load])

  useEffect(() => {
    if (!run || run.status !== 'running') return
    const timer = window.setInterval(() => {
      void api.getTrainingRun(run.id).then((next) => {
        setRun(next.run)
        if (next.run.status !== 'running' && agent) void load(agent.id)
      }).catch(() => undefined)
    }, 700)
    return () => window.clearInterval(timer)
  }, [run, agent, load])

  if (!data) return null

  const start = async () => {
    if (!agent) return
    setStarting(true)
    setError('')
    try {
      const { run: created } = await api.startTraining(agent.id)
      setRun(created)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '训练启动失败')
    } finally {
      setStarting(false)
    }
  }

  const activate = async (target: TrainingRun, candidateId: string) => {
    setActivating(candidateId)
    setError('')
    try {
      await api.activateTraining(target.id, candidateId)
      await refresh()
      if (agent) await load(agent.id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '启用失败')
    } finally {
      setActivating(null)
    }
  }

  const rollback = async (versionId: string) => {
    setActivatingVersion(versionId)
    setError('')
    try {
      await api.activateVersion(versionId)
      await refresh()
      if (agent) await load(agent.id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '切换版本失败')
    } finally {
      setActivatingVersion(null)
    }
  }

  const best = run?.candidates.reduce((top, candidate) => Math.max(top, candidate.average), 0) ?? 0

  return (
    <div className="app-page">
      <PageHeader
        title="训练"
        meta={`${data.agents.length} 个节点 · 规则核查打分 · 提示词版本可回滚 · 当前 ${
          data.mode === 'live' ? 'Live 模型' : 'Mock 演示'
        }`}
      />

      <div className="grid gap-4 xl:grid-cols-[264px_minmax(0,1fr)]">
        {/* Agent selector ------------------------------------------------------ */}
        <Surface className="panel self-start p-2.5">
          <div className="flex items-center justify-between px-2 pb-2 pt-1">
            <span className="t-label">选择节点</span>
            <span className="t-meta">{data.agents.length}</span>
          </div>
          <div className="flex flex-col">
            {data.agents.map((item) => {
              const active = agent?.id === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setAgentId(item.id)}
                  className={cx(
                    'flex w-full items-center gap-2.5 rounded-[12px] px-2.5 py-2 text-left transition-colors duration-150',
                    'outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring',
                    active ? 'bg-background-primary-active shadow-xs' : 'hover:bg-background-tertiary-default',
                  )}
                >
                  <Avatar size="xs" initials={item.name.slice(0, 1)} alt={item.name} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-text-primary">{item.name}</span>
                  {item.plugins.length > 0 && <span className="text-[10px] text-text-placeholder">{item.plugins.length}</span>}
                </button>
              )
            })}
          </div>
        </Surface>

        <div className="flex flex-col gap-4">
          {/* Eval set ---------------------------------------------------------- */}
          <Surface className="panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <SectionHead title={agent ? `${agent.name} · 评测集` : '评测集'} />
                <p className="t-small mt-1.5">
                  固定输入与上游上下文，只换提示词。分数来自与运行时同一套规则核查：引用是否成立、数字是否对得上、语义是否重叠。
                </p>
              </div>
              <Button leadingIcon={starting ? RiRefreshLine : RiPlayLargeLine} onClick={() => void start()} disabled={starting || !agent || cases.length === 0}>
                {starting ? '启动中…' : '开始训练'}
              </Button>
            </div>

            {cases.length === 0 ? (
              <div className="mt-4">
                <Empty title="这个节点还没有评测集" description="训练需要固定的评测任务；当前只有撰写师与主编配置了用例。" />
              </div>
            ) : (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {cases.map((item, index) => (
                  <div key={item.id} className="rounded-[14px] bg-background-secondary-default px-3 py-2.5">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[10px] tabular-nums text-text-placeholder">{String(index + 1).padStart(2, '0')}</span>
                      <span className="truncate text-[12.5px] font-medium text-text-primary">{item.title}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 ps-5 text-[11px] leading-relaxed text-text-tertiary">{item.input}</p>
                  </div>
                ))}
              </div>
            )}

            <p className="t-meta mt-3 flex items-center gap-2">
              <RiSparklingLine className="size-3.5 text-accent-500" aria-hidden />
              {data.mode === 'live'
                ? 'Live 模式：候选提示词会真实调用模型，分数由核查器给出。'
                : 'Mock 模式：模拟器按提示词里的显式约束改变输出，用于离线演示训练闭环。'}
            </p>
            {error && <p className="mt-2 text-[12px] text-status-rose-text">{error}</p>}
          </Surface>

          {/* Candidates -------------------------------------------------------- */}
          <Surface className="panel p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <SectionHead title="候选提示词" />
              {run && (
                <div className="flex items-center gap-2">
                  <Chip variant="caption" color={run.status === 'done' ? 'lime' : run.status === 'failed' ? 'rose' : 'orange'}>
                    {run.status === 'done' ? '已完成' : run.status === 'failed' ? '失败' : '训练中'}
                  </Chip>
                  <span className="t-meta">{run.id} · {formatDate(run.startedAt)}</span>
                </div>
              )}
            </div>

            {!run ? (
              <p className="t-small mt-3">还没有训练记录。点「开始训练」跑第一轮。</p>
            ) : run.candidates.length === 0 ? (
              <p className="t-small mt-3">正在评测候选…</p>
            ) : (
              <>
                <div className="mt-3">
                  <Table aria-label="候选提示词" size="sm">
                    <TableHeader>
                      <TableColumn>候选</TableColumn>
                      <TableColumn>均分</TableColumn>
                      {cases.map((item, index) => (
                        <TableColumn key={item.id}>{`用例 ${index + 1}`}</TableColumn>
                      ))}
                      <TableColumn>Tokens</TableColumn>
                      <TableColumn>操作</TableColumn>
                    </TableHeader>
                    <TableBody>
                      {run.candidates.map((candidate) => {
                        const isBest = run.status === 'done' && candidate.average >= best
                        return (
                          <TableRow key={candidate.id}>
                            <TableCell>
                              <span className="flex items-center gap-2">
                                <span className={cx('text-[12.5px]', isBest ? 'font-medium text-text-primary' : 'text-text-secondary')}>
                                  {candidate.label}
                                </span>
                                {isBest && <Chip variant="caption" color="lime">最优</Chip>}
                              </span>
                              <span className="mt-0.5 block ps-0 text-[10.5px] text-text-tertiary">{candidate.rationale}</span>
                            </TableCell>
                            <TableCell>
                              <span className={cx('text-[12.5px] font-medium tabular-nums', isBest ? 'text-accent-600' : 'text-text-primary')}>
                                {percent(candidate.average)}
                              </span>
                            </TableCell>
                            {candidate.scores.map((score, index) => (
                              <TableCell key={index}>
                                <span className="text-[11.5px] tabular-nums text-text-secondary">{percent(score)}</span>
                              </TableCell>
                            ))}
                            <TableCell><span className="text-[11px] tabular-nums text-text-tertiary">{candidate.tokens}</span></TableCell>
                            <TableCell>
                              <Button
                                variant={isBest ? 'secondary' : 'ghost'}
                                size="xs"
                                onClick={() => void activate(run, candidate.id)}
                                disabled={run.status !== 'done' || activating !== null}
                              >
                                {activating === candidate.id ? '启用中…' : '启用'}
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>

                <p className="t-meta mt-3">
                  基线 {percent(run.baseline)} → 最优 {percent(run.best)} · {run.tokens} tokens
                  {run.error ? ` · ${run.error}` : ''}
                </p>
              </>
            )}
          </Surface>

          {/* Versions ---------------------------------------------------------- */}
          <Surface className="panel p-5">
            <SectionHead title="提示词版本" aside={<Chip variant="caption" color="neutral">{versions.length}</Chip>} />
            <div className="mt-3 flex flex-col">
              {versions.length === 0 ? (
                <p className="t-small">还没有版本记录。</p>
              ) : (
                versions.map((version) => (
                  <div key={version.id} className="flex items-start gap-3 border-b border-border-button-default py-2.5 last:border-b-0">
                    <span className="w-9 shrink-0 font-mono text-[11px] tabular-nums text-text-placeholder">
                      v{version.version}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[12.5px] text-text-primary">{version.note || '未命名版本'}</span>
                        {version.isActive && <Chip variant="caption" color="lime">当前生效</Chip>}
                        {version.score !== undefined && (
                          <Chip variant="caption" color="neutral">{percent(version.score)}</Chip>
                        )}
                      </div>
                      <span className="t-meta mt-0.5 block">{formatDate(version.createdAt)}</span>
                    </div>
                    <span className="shrink-0">
                      {version.isActive ? (
                        <span className="text-[11px] text-text-tertiary">—</span>
                      ) : (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => void rollback(version.id)}
                          disabled={activatingVersion !== null}
                        >
                          {activatingVersion === version.id ? '切换中…' : '启用'}
                        </Button>
                      )}
                    </span>
                  </div>
                ))
              )}
            </div>
            <p className="t-meta mt-3">
              启用某个候选会写入新版本，并直接替换这个节点的 systemPrompt；团队页会同步显示新提示词。
            </p>
          </Surface>
        </div>
      </div>
    </div>
  )
}
