import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { BrowserRouter, NavLink, useLocation, useNavigate, Routes, Route } from 'react-router-dom'
import {
  RiArrowRightSLine,
  RiBookOpenLine,
  RiCloseLine,
  RiDashboardLine,
  RiFlowChart,
  RiLineChartLine,
  RiMenuLine,
  RiPlayLargeLine,
  RiSettings3Line,
  RiSparklingLine,
  RiStackLine,
  RiTeamLine,
} from '@remixicon/react'
import type { Bootstrap } from '../shared/types'
import { api } from './api'
import { Modal } from './components/ui'
import { Button } from '@/components/base/buttons/button'
import { IconButton } from '@/components/base/buttons/icon-button'
import { Input } from '@/components/base/input/input'
import { Spinner } from '@/components/base/spinner/spinner'
import { Textarea } from '@/components/base/textarea/textarea'
import { Tooltip, TooltipTrigger } from '@/components/base/tooltip/tooltip'
import { cx } from '@/utils/cx'
import Overview from './pages/Overview'
import Knowledge from './pages/Knowledge'
import Team from './pages/Team'
import WorkflowPage from './pages/WorkflowPage'
import RunPage from './pages/RunPage'
import Evals from './pages/Evals'

interface AppContextValue {
  data: Bootstrap | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)

export function useApp() {
  const value = useContext(AppContext)
  if (!value) throw new Error('useApp must be used inside AppProvider')
  return value
}

function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Bootstrap | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const next = await api.bootstrap()
      setData(next)
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法连接 AgentLoom API')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return <AppContext.Provider value={{ data, loading, error, refresh }}>{children}</AppContext.Provider>
}

const NAV = [
  { to: '/', label: '总览', icon: RiDashboardLine, end: true },
  { to: '/knowledge', label: '知识库', icon: RiBookOpenLine },
  { to: '/team', label: 'Agent 团队', icon: RiTeamLine },
  { to: '/workflow', label: '编排画布', icon: RiFlowChart },
  { to: '/evals', label: '评测', icon: RiLineChartLine },
]

const TITLES: Record<string, string> = {
  '/': '总览',
  '/knowledge': '知识库',
  '/team': 'Agent 团队',
  '/workflow': '编排画布',
  '/evals': '评测',
}

function Sidebar({ onSettings, onClose }: { onSettings: () => void; onClose?: () => void }) {
  const { data } = useApp()
  return (
    <aside className="flex h-full flex-col bg-surface-sidebar px-4 pb-4 pt-5 text-text-on-sidebar">
      <div className="flex items-center gap-3 px-2 pb-7">
        <div className="grid size-9 shrink-0 grid-cols-2 gap-[3px] rounded-[11px] bg-text-on-sidebar p-2">
          <span className="rounded-[2px] bg-surface-sidebar" />
          <span className="rounded-[2px] bg-accent-500" />
          <span className="rounded-[2px] bg-accent-500" />
          <span className="rounded-[2px] bg-surface-sidebar" />
        </div>
        <div className="min-w-0">
          <div className="brand-wordmark text-title-3-semibold tracking-[0.12em]">织序</div>
          <div className="mt-0.5 text-caption-2-semibold uppercase tracking-[0.24em] text-text-on-sidebar-faint">
            Agentloom
          </div>
        </div>
        {onClose && (
          <IconButton
            icon={RiCloseLine}
            size="small"
            aria-label="关闭导航"
            onClick={onClose}
            className="ms-auto border-transparent bg-transparent text-text-on-sidebar-muted shadow-none hover:bg-surface-sidebar-hover hover:text-text-on-sidebar"
          />
        )}
      </div>

      <div className="px-2 pb-2 text-caption-2-semibold uppercase tracking-[0.16em] text-text-on-sidebar-faint">
        工作台
      </div>
      <nav className="flex flex-col gap-1" aria-label="主导航">
        {NAV.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onClose}
              className={({ isActive }) =>
                cx(
                  'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-body-2-medium transition-colors duration-150',
                  isActive
                    ? 'bg-surface-sidebar-active text-text-on-sidebar'
                    : 'text-text-on-sidebar-muted hover:bg-surface-sidebar-hover hover:text-text-on-sidebar',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={cx('size-[18px] shrink-0', isActive ? 'text-accent-300' : 'text-text-on-sidebar-faint')}
                    aria-hidden
                  />
                  <span className="truncate">{item.label}</span>
                </>
              )}
            </NavLink>
          )
        })}
      </nav>

      <div className="mt-7 px-2 pb-2 text-caption-2-semibold uppercase tracking-[0.16em] text-text-on-sidebar-faint">
        当前项目
      </div>
      <div className="rounded-2xl border border-separator-sidebar bg-surface-sidebar-hover p-3">
        <div className="flex items-start gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-accent-500/20 text-accent-300">
            <RiStackLine className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="truncate text-body-2-medium text-text-on-sidebar">
              {data?.project.name ?? 'AI 眼镜产业链研究'}
            </div>
            <div className="mt-0.5 text-caption-1-regular text-text-on-sidebar-faint">
              {data?.project.scenario ?? '产业投研'} · {data?.stats.docs ?? 0} 篇资料
            </div>
          </div>
        </div>
      </div>

      <div className="mt-auto pt-5">
        <div className="flex items-center gap-2.5 rounded-2xl border border-separator-sidebar bg-surface-sidebar-hover px-3 py-2.5">
          <span
            className={cx(
              'size-1.5 shrink-0 rounded-full',
              data?.mode === 'live' ? 'bg-status-lime-text' : 'bg-status-yellow-text',
            )}
          />
          <div className="min-w-0 flex-1">
            <div className="text-caption-1-semibold text-text-on-sidebar">
              {data?.mode === 'live' ? 'Live 模型' : 'Mock 演示'}
            </div>
            <div className="mt-0.5 text-caption-2-regular text-text-on-sidebar-faint">
              {data?.mode === 'live' ? 'DeepSeek 已连接' : '无需 Key 即可运行'}
            </div>
          </div>
          <TooltipTrigger>
            <IconButton
              icon={RiSettings3Line}
              size="small"
              aria-label="模型设置"
              onClick={onSettings}
              className="border-transparent bg-transparent text-text-on-sidebar-muted shadow-none hover:bg-surface-sidebar-hover hover:text-text-on-sidebar"
            />
            <Tooltip>模型与运行设置</Tooltip>
          </TooltipTrigger>
        </div>
        <div className="px-1 pt-3 text-caption-2-regular tracking-[0.04em] text-text-on-sidebar-faint">
          v0.1 · 赛道一 · Agent 编排创新应用
        </div>
      </div>
    </aside>
  )
}

function StartRunButton() {
  const { data } = useApp()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState(
    '请生成一份面向投资决策的 AI 眼镜产业链研究报告，重点回答市场空间、价值链分配、竞争格局与主要风险。',
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const start = async () => {
    if (!input.trim()) return
    setLoading(true)
    setError(null)
    try {
      const { run } = await api.createRun(input)
      setOpen(false)
      navigate(`/runs/${run.id}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '启动失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button leadingIcon={RiPlayLargeLine} onClick={() => setOpen(true)}>
        新建运行
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="启动一次团队运行"
        subtitle={`${data?.stats.agents ?? 8} 个 Agent 会协作完成研究，并在核查节点自动回环。`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={start} disabled={loading || !input.trim()}>
              {loading ? '正在启动…' : '开始运行'}
            </Button>
          </>
        }
      >
        <form
          id="start-run-form"
          onSubmit={(event) => {
            event.preventDefault()
            void start()
          }}
          className="flex flex-col gap-4"
        >
          <Textarea
            label="研究任务"
            rows={5}
            value={input}
            onChange={setInput}
            placeholder="例如：分析 AI 眼镜产业链的投资价值…"
          />
          <div className="flex flex-col gap-2">
            <span className="text-caption-1-semibold text-text-tertiary">快捷任务</span>
            {[
              'AI 眼镜产业链的投资价值与风险',
              '2026 年 AI 眼镜市场空间与竞争格局',
              '从 BOM 看 AI 眼镜的价值池分配',
            ].map((preset) => (
              <Button
                key={preset}
                type="button"
                variant="secondary"
                size="small"
                leadingIcon={RiSparklingLine}
                className="w-full justify-start"
                onClick={() =>
                  setInput(`请生成一份面向投资决策的研究报告：${preset}。重点回答市场空间、价值链分配、竞争格局与主要风险。`)
                }
              >
                {preset}
              </Button>
            ))}
          </div>
        </form>
        {error && <p className="mt-3 text-caption-1-medium text-status-rose-text">{error}</p>}
      </Modal>
    </>
  )
}

function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { refresh } = useApp()
  const [config, setConfig] = useState({ mode: 'mock', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com/v1', hasKey: false })
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('deepseek-chat')
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com/v1')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!open) return
    void api.config().then((next) => {
      setConfig(next)
      setModel(next.model)
      setBaseUrl(next.baseUrl)
    })
  }, [open])

  const save = async () => {
    setSaving(true)
    setMessage('')
    try {
      const next = await api.setConfig({ apiKey: apiKey || undefined, model, baseUrl })
      setConfig(next)
      setApiKey('')
      setMessage('已保存。下一次运行将使用新配置。')
      await refresh()
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="模型与运行设置"
      subtitle="默认使用 Mock 演示模式；填入 DeepSeek API Key 后即可切换为真实模型。"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>关闭</Button>
          <Button onClick={save} disabled={saving}>{saving ? '保存中…' : '保存设置'}</Button>
        </>
      }
    >
      <div className="mb-5 flex items-center gap-2.5 rounded-2xl border border-separator-border bg-background-secondary-default px-3 py-2.5">
        <span
          className={cx(
            'size-1.5 rounded-full',
            config.mode === 'live' ? 'bg-status-lime-text' : 'bg-status-yellow-text',
          )}
        />
        <span className="text-body-2-medium text-text-primary">
          {config.mode === 'live' ? 'Live 模式' : 'Mock 演示模式'}
        </span>
        <span className="text-caption-1-regular text-text-tertiary">
          {config.hasKey ? '服务端已检测到 API Key' : '服务端未配置 API Key'}
        </span>
      </div>
      <div className="flex flex-col gap-4">
        <Input
          label="DeepSeek API Key"
          type="password"
          value={apiKey}
          onChange={setApiKey}
          placeholder={config.hasKey ? '已配置，留空则不修改' : 'sk-…'}
        />
        <Input label="Base URL" value={baseUrl} onChange={setBaseUrl} />
        <Input label="模型" value={model} onChange={setModel} />
        <p className="text-caption-1-regular leading-relaxed text-text-tertiary">
          Key 只保存在当前服务进程内，不会写入数据库。生产环境请使用环境变量{' '}
          <code className="rounded-sm bg-background-tertiary-default px-1 py-0.5 font-mono">AGENTLOOM_API_KEY</code>。
        </p>
        {message && <p className="text-caption-1-medium text-text-secondary">{message}</p>}
      </div>
    </Modal>
  )
}

function Shell() {
  const { data, loading, error } = useApp()
  const location = useLocation()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)

  const title = useMemo(() => {
    if (location.pathname.startsWith('/runs/')) return '运行详情'
    return TITLES[location.pathname] ?? '织序 AgentLoom'
  }, [location.pathname])

  useEffect(() => {
    if (!mobileNav) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [mobileNav])

  if (loading) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background-full text-text-secondary">
        <div className="grid size-14 grid-cols-2 gap-1 rounded-2xl bg-text-primary p-3">
          <span className="rounded-sm bg-background-full" />
          <span className="rounded-sm bg-accent-500" />
          <span className="rounded-sm bg-accent-500" />
          <span className="rounded-sm bg-background-full" />
        </div>
        <div className="flex items-center gap-2 text-body-regular">
          <Spinner size="sm" aria-hidden /> 正在织入工作台…
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background-full px-6 text-center">
        <div className="text-title-2-semibold text-text-primary">无法连接 AgentLoom API</div>
        <p className="max-w-md text-body-regular text-text-secondary">{error}</p>
        <p className="text-caption-1-regular text-text-tertiary">
          请先在项目目录运行 <code className="rounded-sm bg-background-tertiary-default px-1 py-0.5 font-mono">pnpm dev</code>。
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-background-full font-sans text-text-primary">
      <button
        type="button"
        aria-label="关闭导航"
        onClick={() => setMobileNav(false)}
        className={cx(
          'fixed inset-0 z-40 bg-surface-overlay transition-opacity duration-200 lg:hidden',
          mobileNav ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        )}
      />
      <aside
        className={cx(
          'fixed inset-y-0 start-0 z-50 w-[272px] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] lg:w-[248px] lg:translate-x-0',
          mobileNav ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <Sidebar
          onSettings={() => {
            setSettingsOpen(true)
            setMobileNav(false)
          }}
          onClose={() => setMobileNav(false)}
        />
      </aside>

      <div className="min-h-dvh lg:ps-[248px]">
        <header className="sticky top-0 z-30 flex h-15 items-center gap-3 border-b border-separator-border bg-background-primary-default px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <IconButton
            icon={RiMenuLine}
            size="small"
            aria-label="打开导航"
            onClick={() => setMobileNav(true)}
            className="lg:hidden"
          />
          <div className="flex min-w-0 items-center gap-2 text-caption-1-regular text-text-tertiary">
            <span className="hidden sm:inline">织序工作台</span>
            <RiArrowRightSLine className="hidden size-3.5 sm:block" aria-hidden />
            <span className="truncate text-body-2-medium text-text-primary">{title}</span>
          </div>
          <div className="ms-auto flex items-center gap-2">
            <div className="hidden items-center gap-1.5 text-caption-1-medium text-text-secondary sm:flex">
              <span
                className={cx(
                  'size-1.5 rounded-full',
                  data.mode === 'live' ? 'bg-status-lime-text' : 'bg-status-yellow-text',
                )}
              />
              {data.mode === 'live' ? 'Live' : 'Mock'}
            </div>
            <IconButton
              icon={RiSettings3Line}
              aria-label="设置"
              onClick={() => setSettingsOpen(true)}
              className="hidden sm:inline-flex"
            />
            <StartRunButton />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/knowledge" element={<Knowledge />} />
            <Route path="/team" element={<Team />} />
            <Route path="/workflow" element={<WorkflowPage />} />
            <Route path="/runs/:id" element={<RunPage />} />
            <Route path="/evals" element={<Evals />} />
          </Routes>
        </main>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Shell />
      </AppProvider>
    </BrowserRouter>
  )
}
