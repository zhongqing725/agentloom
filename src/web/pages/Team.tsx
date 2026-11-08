import { useState } from 'react'
import {
  RiArrowRightSLine,
  RiBrainLine,
  RiGitBranchLine,
  RiSparklingLine,
  RiToolsLine,
} from '@remixicon/react'
import { useApp } from '../App'
import { api } from '../api'
import { Avatar } from '@/components/base/avatar/avatar'
import { Button } from '@/components/base/buttons/button'
import { Chip } from '@/components/base/badges/chip'
import { Input } from '@/components/base/input/input'
import { SwitchCard } from '@/components/base/switch/switch-card'
import { Textarea } from '@/components/base/textarea/textarea'
import { cx } from '@/utils/cx'
import { Modal, PageHeader, PluginIcon, SectionHead, Surface } from '../components/ui'
import { RUNTIME_PLUGIN_IDS, TOOL_PLUGIN_IDS, type Agent } from '../../shared/types'

const ROLE_LABEL: Record<string, string> = {
  planner: '规划',
  researcher: '研究',
  analyst: '分析',
  writer: '撰写',
  verifier: '核查',
  editor: '终审',
  specialist: '专家',
}

const IMPLEMENTED = new Set(RUNTIME_PLUGIN_IDS)

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
        tools: draft.plugins.filter((id) => TOOL_PLUGIN_IDS.includes(id)),
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

  const onCanvas = new Set(
    data.workflow.graph.nodes.map((node) => node.data.agentId).filter((id): id is string => Boolean(id)),
  )

  return (
    <div className="app-page">
      <PageHeader
        title="Agent 团队"
        meta={`${data.agents.length} 个角色 · ${onCanvas.size} 个在画布 · ${data.plugins.length} 个能力插件 · 点击任意节点编辑`}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(324px,1fr)]">
        {/* Roster ------------------------------------------------------------- */}
        <Surface className="panel self-start p-2.5">
          <div className="flex items-center justify-between px-2 pb-2 pt-1">
            <span className="t-label">节点</span>
            <span className="t-meta">模型 · 温度 · 插件</span>
          </div>
          <div className="flex flex-col">
            {data.agents.map((agent) => (
              <button
                key={agent.id}
                type="button"
                onClick={() => edit(agent)}
                className={cx(
                  'group flex w-full items-center gap-3 rounded-[12px] px-2.5 py-2.5 text-left transition-colors duration-150',
                  'outline-none hover:bg-background-tertiary-default focus-visible:ring-2 focus-visible:ring-border-focus-ring',
                )}
              >
                <Avatar size="sm" initials={agent.name.slice(0, 1)} alt={agent.name} />
                <span className="w-[92px] shrink-0">
                  <span className="block truncate text-[13px] font-medium text-text-primary">{agent.name}</span>
                  <span className="mt-0.5 block text-[10px] tracking-[0.06em] text-text-placeholder">
                    {ROLE_LABEL[agent.role] ?? agent.role}
                    {onCanvas.has(agent.id) ? '' : ' · 未上画布'}
                  </span>
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-text-tertiary">{agent.title}</span>
                <span className="hidden shrink-0 items-center gap-2 sm:flex">
                  <span className="font-mono text-[10px] text-text-placeholder">{agent.model}</span>
                  <span className="text-[10px] tabular-nums text-text-placeholder">T{agent.temperature.toFixed(1)}</span>
                  <span className="flex w-[46px] items-center justify-end gap-1 text-text-placeholder">
                    {agent.plugins.length === 0 ? (
                      <span className="text-[10px]">未挂载</span>
                    ) : (
                      agent.plugins.map((pluginId) => {
                        const plugin = data.plugins.find((item) => item.id === pluginId)
                        return plugin ? <PluginIcon key={pluginId} name={plugin.icon} size={11} /> : null
                      })
                    )}
                  </span>
                </span>
                <RiArrowRightSLine className="size-3.5 shrink-0 text-text-placeholder transition-colors group-hover:text-accent-500" aria-hidden />
              </button>
            ))}
          </div>
        </Surface>

        {/* Plugins ------------------------------------------------------------ */}
        <Surface className="panel flex flex-col p-5">
          <SectionHead title="能力插件库" aside={<Chip variant="caption" color="neutral">{data.plugins.length}</Chip>} />
          <p className="t-small mt-1.5">
            插件是“认知显卡”：插到任意节点上，改变这个节点的思考方式，而不是整个团队。
          </p>
          <div className="mt-4 flex flex-col">
            {data.plugins.map((plugin) => (
              <div key={plugin.id} className="flex items-start gap-3 border-b border-border-button-default py-3 last:border-b-0">
                <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-background-tertiary-default text-accent-600">
                  <PluginIcon name={plugin.icon} size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-medium text-text-primary">{plugin.name}</span>
                    <Chip variant="caption" color={IMPLEMENTED.has(plugin.id) ? 'lime' : 'neutral'}>
                      {IMPLEMENTED.has(plugin.id) ? '已实现' : '目录态'}
                    </Chip>
                  </div>
                  <code className="t-code mt-0.5 block">{plugin.id}</code>
                  <p className="mt-1 text-[11px] leading-relaxed text-text-tertiary">{plugin.description}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-auto flex items-center gap-4 pt-4 text-[10.5px] text-text-tertiary">
            <span className="inline-flex items-center gap-1.5"><RiToolsLine className="size-3.5" /> 节点级挂载</span>
            <span className="inline-flex items-center gap-1.5"><RiGitBranchLine className="size-3.5" /> 可组合</span>
            <span className="inline-flex items-center gap-1.5"><RiSparklingLine className="size-3.5" /> 改变执行策略</span>
          </div>
        </Surface>
      </div>

      <Modal
        open={Boolean(selected && draft)}
        onClose={() => { setSelected(null); setDraft(null) }}
        title={draft?.name ?? ''}
        subtitle={draft?.title}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => { setSelected(null); setDraft(null) }}>取消</Button>
            <Button onClick={() => void save()} disabled={saving}>{saving ? '保存中…' : '保存节点配置'}</Button>
          </>
        }
      >
        {draft && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
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

            <aside className="flex min-w-0 flex-col gap-2">
              <div className="flex items-center gap-2 px-1">
                <RiBrainLine className="size-4 text-accent-500" aria-hidden />
                <span className="text-[13px] font-medium text-text-primary">挂载能力</span>
                <Chip variant="caption" color="neutral" className="ms-auto">{draft.plugins.length}</Chip>
              </div>
              <div className="flex flex-col gap-2">
                {data.plugins.map((plugin) => (
                  <SwitchCard
                    key={plugin.id}
                    title={plugin.name}
                    description={IMPLEMENTED.has(plugin.id) ? plugin.category : `${plugin.category} · 目录态`}
                    isSelected={draft.plugins.includes(plugin.id)}
                    isDisabled={!IMPLEMENTED.has(plugin.id)}
                    onChange={() => togglePlugin(plugin.id)}
                  />
                ))}
              </div>
              <div className="mt-2 flex gap-2 rounded-[14px] bg-background-secondary-default p-3 text-[11px] leading-relaxed text-text-tertiary">
                <RiSparklingLine className="mt-0.5 size-3.5 shrink-0 text-accent-500" aria-hidden />
                建议只在关键节点挂载「发散思考」，避免每个节点都多想，推高延迟与成本。
              </div>
            </aside>
          </div>
        )}
        {error && <p className="mt-3 text-[12px] text-status-rose-text">{error}</p>}
      </Modal>
    </div>
  )
}
