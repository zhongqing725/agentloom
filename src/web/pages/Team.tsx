import { useState } from 'react'
import {
  RiArrowRightSLine,
  RiBrainLine,
  RiGitBranchLine,
  RiPuzzle2Line,
  RiRobot2Line,
  RiSparklingLine,
  RiToolsLine,
} from '@remixicon/react'
import { useApp } from '../App'
import { api } from '../api'
import { Badge } from '@/components/base/badges/badge'
import { Button } from '@/components/base/buttons/button'
import { Input } from '@/components/base/input/input'
import { Switch } from '@/components/base/switch/switch'
import { Textarea } from '@/components/base/textarea/textarea'
import { cx } from '@/utils/cx'
import { Modal, PageHeader, PluginIcon, Surface } from '../components/ui'
import type { Agent } from '../../shared/types'

const ROLE_LABEL: Record<string, string> = {
  planner: 'Planner',
  researcher: 'Researcher',
  analyst: 'Analyst',
  writer: 'Writer',
  verifier: 'Verifier',
  editor: 'Editor',
  specialist: 'Specialist',
}

export default function Team() {
  const { data, refresh } = useApp()
  const [selected, setSelected] = useState<Agent | null>(null)
  const [draft, setDraft] = useState<Agent | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!data) return null

  const edit = (agent: Agent) => {
    setSelected(agent)
    setDraft({ ...agent, plugins: [...agent.plugins] })
    setError('')
  }

  const save = async () => {
    if (!draft) return
    setSaving(true)
    setError('')
    try {
      await api.updateAgent(draft.id, {
        model: draft.model,
        temperature: draft.temperature,
        systemPrompt: draft.systemPrompt,
        plugins: draft.plugins,
        title: draft.title,
      })
      await refresh()
      setSelected(null)
      setDraft(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const togglePlugin = (id: string) => {
    if (!draft) return
    setDraft({
      ...draft,
      plugins: draft.plugins.includes(id) ? draft.plugins.filter((item) => item !== id) : [...draft.plugins, id],
    })
  }

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="The crew"
        title="Agent 团队"
        description={`${data.agents.length} 个角色组成一条研究流水线。每个节点都可以挂载能力插件，改变它“想多深、怎么想”。`}
        actions={
          <Button
            variant="secondary"
            leadingIcon={RiPuzzle2Line}
            onClick={() => document.getElementById('plugin-library')?.scrollIntoView({ behavior: 'smooth' })}
          >
            浏览插件库
          </Button>
        }
      />

      <Surface className="flex flex-col gap-6 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex max-w-3xl gap-3">
          <RiSparklingLine className="mt-1 size-4 shrink-0 text-accent-600" aria-hidden />
          <p className="text-headline-regular leading-relaxed text-text-primary">
            “不是让一个 Agent 什么都会，而是让每个节点在需要的时候，多一种思考方式。”
          </p>
        </div>
        <div className="flex gap-8 lg:shrink-0">
          {[
            { value: data.agents.length, label: '角色' },
            { value: data.plugins.length, label: '能力插件' },
            { value: data.agents.filter((agent) => agent.plugins.length > 0).length, label: '已挂载' },
          ].map((item) => (
            <div key={item.label}>
              <div className="text-title-1-semibold tracking-[-0.03em] text-text-primary">{item.value}</div>
              <div className="mt-0.5 text-caption-1-regular text-text-tertiary">{item.label}</div>
            </div>
          ))}
        </div>
      </Surface>

      <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {data.agents.map((agent, index) => (
          <Surface
            as="article"
            key={agent.id}
            role="button"
            tabIndex={0}
            onClick={() => edit(agent)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return
              event.preventDefault()
              edit(agent)
            }}
            className={cx(
              'group cursor-pointer p-5 transition-colors duration-150 hover:bg-background-primary-hover',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="grid size-10 place-items-center rounded-2xl bg-accent-50 text-accent-600">
                <RiRobot2Line className="size-5" aria-hidden />
              </span>
              <div className="flex items-center gap-2 text-caption-2-semibold uppercase tracking-[0.1em] text-text-tertiary">
                {String(index + 1).padStart(2, '0')}
                <span className="size-1 rounded-full bg-text-tertiary" aria-hidden />
                {ROLE_LABEL[agent.role] ?? agent.role}
              </div>
            </div>
            <h2 className="mt-5 text-title-3-semibold text-text-primary">{agent.name}</h2>
            <p className="mt-1 text-caption-1-medium text-accent-600">{agent.title}</p>
            <p className="mt-3 line-clamp-3 min-h-12 text-body-2-regular leading-relaxed text-text-secondary">{agent.description}</p>
            <div className="mt-4 flex min-h-6 flex-wrap gap-1.5">
              {agent.plugins.length === 0 && <span className="text-caption-1-regular text-text-tertiary">未挂载插件</span>}
              {agent.plugins.map((pluginId) => {
                const plugin = data.plugins.find((item) => item.id === pluginId)
                if (!plugin) return null
                return (
                  <span
                    key={pluginId}
                    className="inline-flex items-center gap-1 rounded-md border border-separator-border px-1.5 py-0.5 text-caption-2-medium text-text-secondary"
                  >
                    <PluginIcon name={plugin.icon} size={12} /> {plugin.name}
                  </span>
                )
              })}
            </div>
            <div className="mt-4 flex items-center gap-2 border-t border-separator-border pt-3 font-mono text-caption-2-regular text-text-tertiary">
              <span>{agent.model}</span>
              <span className="ms-auto">T {agent.temperature.toFixed(1)}</span>
              <RiArrowRightSLine className="size-4" aria-hidden />
            </div>
          </Surface>
        ))}
      </section>

      <section className="mt-10 scroll-mt-24" id="plugin-library">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-caption-1-semibold uppercase tracking-[0.16em] text-accent-600">Capability plugins</div>
            <h2 className="mt-1.5 text-title-1-medium text-text-primary">能力插件库</h2>
          </div>
          <p className="max-w-lg text-body-2-regular leading-relaxed text-text-secondary">
            插件是“认知显卡”：插到任意节点上，改变这个节点的思考过程，而不是整个团队。
          </p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.plugins.map((plugin) => (
            <Surface key={plugin.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-10 place-items-center rounded-2xl bg-accent-50 text-accent-600">
                  <PluginIcon name={plugin.icon} size={19} />
                </span>
                <span className="text-caption-2-semibold uppercase tracking-[0.08em] text-text-tertiary">{plugin.category}</span>
              </div>
              <h3 className="mt-5 text-title-3-semibold text-text-primary">{plugin.name}</h3>
              <p className="mt-2 min-h-10 text-body-2-regular leading-relaxed text-text-secondary">{plugin.description}</p>
              <div className="mt-4 flex items-center gap-4 border-t border-separator-border pt-3 text-caption-1-regular text-text-tertiary">
                <span className="inline-flex items-center gap-1.5"><RiToolsLine className="size-3.5" /> 节点级挂载</span>
                <span className="inline-flex items-center gap-1.5"><RiGitBranchLine className="size-3.5" /> 可组合</span>
              </div>
            </Surface>
          ))}
        </div>
      </section>

      <Modal
        open={Boolean(selected && draft)}
        onClose={() => { setSelected(null); setDraft(null) }}
        title={draft?.name ?? ''}
        subtitle={draft?.title}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => { setSelected(null); setDraft(null) }}>取消</Button>
            <Button onClick={save} disabled={saving}>{saving ? '保存中…' : '保存节点配置'}</Button>
          </>
        }
      >
        {draft && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="flex flex-col gap-4">
              <Input label="角色定位" value={draft.title} onChange={(value) => setDraft({ ...draft, title: value })} />
              <Textarea
                label="System Prompt"
                rows={7}
                value={draft.systemPrompt}
                onChange={(value) => setDraft({ ...draft, systemPrompt: value })}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="模型" value={draft.model} onChange={(value) => setDraft({ ...draft, model: value })} />
                <Input
                  label={`温度 ${draft.temperature.toFixed(1)}`}
                  type="number"
                  value={String(draft.temperature)}
                  onChange={(value) => setDraft({ ...draft, temperature: Math.max(0, Math.min(1, Number(value))) })}
                />
              </div>
            </div>
            <aside className="min-w-0 border-t border-separator-border pt-5 lg:border-s lg:border-t-0 lg:ps-6 lg:pt-0">
              <div className="flex items-center gap-2">
                <RiBrainLine className="size-4 text-accent-600" aria-hidden />
                <span className="text-body-2-medium text-text-primary">挂载能力</span>
                <Badge color="neutral" className="ms-auto">{draft.plugins.length}</Badge>
              </div>
              <p className="mt-1.5 text-caption-1-regular leading-relaxed text-text-tertiary">
                同一个插件可以挂到不同节点。运行时，它会改变该节点的执行策略。
              </p>
              <div className="mt-4 flex flex-col gap-2">
                {data.plugins.map((plugin) => {
                  const active = draft.plugins.includes(plugin.id)
                  return (
                    <div key={plugin.id} className="flex items-center gap-2.5 rounded-2xl border border-separator-border px-3 py-2">
                      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-background-tertiary-default text-accent-600">
                        <PluginIcon name={plugin.icon} size={14} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-caption-1-medium text-text-primary">{plugin.name}</div>
                        <div className="text-caption-2-regular text-text-tertiary">{plugin.category}</div>
                      </div>
                      <Switch
                        aria-label={`挂载 ${plugin.name}`}
                        size="sm"
                        isSelected={active}
                        onChange={() => togglePlugin(plugin.id)}
                      />
                    </div>
                  )
                })}
              </div>
              <div className="mt-4 flex gap-2 rounded-2xl bg-background-secondary-default p-3 text-caption-1-regular leading-relaxed text-text-tertiary">
                <RiGitBranchLine className="mt-0.5 size-3.5 shrink-0 text-accent-600" aria-hidden />
                建议只在关键节点挂载“发散思考”，避免每个节点都多想，推高延迟与成本。
              </div>
            </aside>
          </div>
        )}
        {error && <p className="mt-3 text-caption-1-medium text-status-rose-text">{error}</p>}
      </Modal>
    </div>
  )
}
