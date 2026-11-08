import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { RiArrowRightLine, RiHammerLine, RiNodeTree, RiPlayCircleLine } from '@remixicon/react'
import { useApp } from '../App'
import { Button } from '@/components/base/buttons/button'
import { Chip } from '@/components/base/badges/chip'
import { PageHeader, Surface } from '../components/ui'

/** Every plugin has a server-side runtime; the value is the short capability label. */
const RUNTIME: Record<string, string> = {
  'knowledge.retrieve': 'BM25 检索',
  'knowledge.graph': '邻居扩展',
  'knowledge.freshness': '时效排序',
  'cognition.diverge': '发散生成',
  'cognition.critique': '自我批判',
  'cognition.decompose': '任务分解',
  'cognition.strawman': '反方建模',
  'cognition.debate': '多角色辩论',
  'verify.citations': '引用核查',
  'verify.numbers': '数值一致性',
  'verify.entailment': '蕴含判定',
  'tool.calculator': '数值计算',
  'tool.python': '数据统计',
  'tool.browser': '浏览器抓取',
}

const CATEGORIES = ['知识', '认知', '验证', '工具'] as const

export default function Plugins() {
  const { data } = useApp()
  const navigate = useNavigate()
  const plugins = data?.plugins ?? []

  const grouped = useMemo(
    () =>
      CATEGORIES.map((category) => ({
        category,
        items: plugins.filter((plugin) => plugin.category === category),
      })).filter((group) => group.items.length > 0),
    [plugins],
  )

  const mounted = useMemo(() => {
    const onCanvas = new Set(
      (data?.workflow.graph.nodes ?? [])
        .map((node) => node.data.agentId)
        .filter((id): id is string => Boolean(id)),
    )
    const used = new Set<string>()
    for (const agent of data?.agents ?? []) {
      if (!onCanvas.has(agent.id)) continue
      for (const id of agent.plugins) used.add(id)
    }
    return used
  }, [data])

  return (
    <div className="app-page">
      <PageHeader
        title="插件生态"
        meta={`${plugins.length} 个插件 · ${Object.keys(RUNTIME).length} 个可运行 · 挂在画布节点上生效`}
        actions={
          <Button leadingIcon={RiNodeTree} onClick={() => navigate('/workflow')}>
            去画布挂载
          </Button>
        }
      />

      <div className="flex flex-col gap-5">
        {grouped.map((group) => (
          <section key={group.category} className="flex flex-col gap-2">
            <div className="flex items-center gap-2 px-1">
              <span className="t-label">{group.category}</span>
              <span className="t-meta">{group.items.length}</span>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {group.items.map((plugin) => {
                const runtime = RUNTIME[plugin.id]
                const used = mounted.has(plugin.id)
                return (
                  <Surface key={plugin.id} className="panel flex flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="grid size-7 shrink-0 place-items-center rounded-[10px] bg-background-tertiary-default">
                          {runtime ? (
                            <RiPlayCircleLine className="size-4 text-accent-500" aria-hidden />
                          ) : (
                            <RiHammerLine className="size-4 text-text-placeholder" aria-hidden />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-medium text-text-primary">{plugin.name}</span>
                          <span className="t-meta block truncate font-mono">{plugin.id}</span>
                        </span>
                      </div>
                      <Chip variant="caption" color={runtime ? 'lime' : 'neutral'}>
                        {runtime ?? '目录'}
                      </Chip>
                    </div>

                    <p className="text-[12px] leading-relaxed text-text-secondary">{plugin.description}</p>

                    <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                      <span className="t-meta">{runtime ? (used ? '已挂到画布' : '未挂载') : '目录态，未接入'}</span>
                      <Button
                        size="small"
                        variant="secondary"
                        className="lm-cta-secondary"
                        trailingIcon={runtime ? RiArrowRightLine : undefined}
                        disabled={!runtime}
                        onClick={() => navigate('/workflow')}
                      >
                        {runtime ? '挂载' : '目录态'}
                      </Button>
                    </div>
                  </Surface>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
