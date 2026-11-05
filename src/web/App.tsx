import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { BrowserRouter, NavLink, useLocation, useNavigate, Routes, Route } from 'react-router-dom'
import {
  RiBookOpenLine,
  RiCloseLine,
  RiDashboardLine,
  RiFlaskLine,
  RiFlowChart,
  RiLineChartLine,
  RiMenuLine,
  RiPlayLargeLine,
  RiSettings3Line,
  RiTeamLine,
} from '@remixicon/react'
import type { Bootstrap } from '../shared/types'
import { api } from './api'
import { Modal } from './components/ui'
import { Modal as BoardModal } from '@/components/base/modal/modal'
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
import Training from './pages/Training'

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
  { to: '/training', label: '训练', icon: RiFlaskLine },
  { to: '/evals', label: '评测', icon: RiLineChartLine },
]

const TITLES: Record<string, string> = {
  '/': '总览',
  '/knowledge': '知识库',
  '/team': 'Agent 团队',
  '/workflow': '编排画布',
  '/training': '训练',
  '/evals': '评测',
}

function Sidebar({ onSettings, onClose }: { onSettings: () => void; onClose?: () => void }) {
  const { data } = useApp()
  return (
    <aside className="glass-strong flex h-full flex-col overflow-hidden rounded-[22px]">
      <div className="flex items-start justify-between gap-3 px-4 pb-4 pt-5">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-[9px] bg-text-primary text-[13px] font-semibold text-text-white">
            织
          </span>
          <div>
            <div className="text-[15px] font-semibold leading-none tracking-[-0.01em] text-text-primary">织序</div>
            <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.22em] text-text-tertiary">Agentloom</div>
          </div>
        </div>
        {onClose && (
          <IconButton
            icon={RiCloseLine}
            size="small"
            aria-label="关闭导航"
            onClick={onClose}
            className="lg:hidden"
          />
        )}
      </div>

      <nav aria-label="主导航" className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2.5">
        <div className="t-label px-2.5 pb-1.5 pt-1">工作区</div>
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
                  'group flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 transition-[background-color,box-shadow,color] duration-150',
                  'outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring',
                  isActive
                    ? 'bg-background-primary-active text-text-primary shadow-xs'
                    : 'text-text-secondary hover:bg-background-tertiary-default hover:text-text-primary',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={cx('size-[18px] shrink-0', isActive ? 'text-accent-500' : 'text-text-tertiary')}
                    aria-hidden
                  />
                  <span className="truncate text-[13px] tracking-[-0.005em]">{item.label}</span>
                </>
              )}
            </NavLink>
          )
        })}
      </nav>

      <div className="px-2.5 pb-4 pt-2">
        <div className="glass-thin rounded-[16px] p-3">
          <div className="t-label">当前项目</div>
          <div className="mt-1.5 text-[13px] leading-snug tracking-[-0.005em] text-text-primary">
            {data?.project.name ?? 'AI 眼镜产业链研究'}
          </div>
          <div className="mt-1 text-[11px] text-text-tertiary">
            {data?.project.scenario ?? '产业投研'} · {data?.stats.docs ?? 0} 篇资料
          </div>
        </div>

        <button
          type="button"
          onClick={onSettings}
          className="mt-2 flex w-full items-center gap-2 rounded-[10px] px-2.5 py-2 text-start outline-none transition-colors duration-150 hover:bg-background-tertiary-default focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          <span
            className={cx('size-1.5 shrink-0 rounded-full', data?.mode === 'live' ? 'bg-status-lime-text' : 'bg-status-yellow-text')}
            aria-hidden
          />
          <span className="flex-1 text-[12px] text-text-secondary">
            {data?.mode === 'live' ? 'Live 模型' : 'Mock 演示'}
          </span>
          <RiSettings3Line className="size-4 text-text-tertiary" aria-hidden />
        </button>

        <div className="px-2.5 pt-2 font-mono text-[9px] tracking-[0.08em] text-text-placeholder">
          v0.1 · 赛道一 · 2026 未来杯
        </div>
      </div>
    </aside>
  )
}

function TopNav({ onSettings, onMenu }: { onSettings: () => void; onMenu: () => void }) {
  const { data } = useApp()

  return (
    <header className="swiss-header">
      <div className="swiss-header-inner">
        <NavLink to="/" className="swiss-brand" aria-label="织序 AgentLoom 首页">
          <span className="swiss-brand-mark">织</span>
          <span className="swiss-brand-word">
            织序
            <span>AgentLoom</span>
          </span>
        </NavLink>

        <nav className="swiss-nav" aria-label="主导航">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => cx('swiss-nav-link', isActive && 'is-active')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="swiss-actions">
          <span className="swiss-mode">
            <span className={cx('swiss-mode-dot', data?.mode === 'live' && 'live')} aria-hidden />
            {data?.mode === 'live' ? 'LIVE' : 'MOCK'}
          </span>
          <TooltipTrigger>
            <IconButton icon={RiSettings3Line} size="small" aria-label="设置" onClick={onSettings} />
            <Tooltip>模型设置</Tooltip>
          </TooltipTrigger>
          <span className="swiss-header-run">
            <StartRunButton size="small" />
          </span>
          <IconButton
            icon={RiMenuLine}
            size="small"
            aria-label="打开导航"
            onClick={onMenu}
            className="swiss-menu-button"
          />
        </div>
      </div>
    </header>
  )
}

function StartRunButton({ size = 'medium' }: { size?: 'medium' | 'small' }) {
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

  const presets = [
    'AI 眼镜产业链的投资价值与风险',
    '2026 年 AI 眼镜市场空间与竞争格局',
    '从 BOM 看 AI 眼镜的价值池分配',
  ]

  return (
    <>
      <Button size={size} leadingIcon={RiPlayLargeLine} onClick={() => setOpen(true)}>
        新建运行
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="启动一次团队运行"
        subtitle={`${data?.stats.agents ?? 8} 个节点按当前画布执行，核查不通过时自动回环。`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={() => void start()} disabled={loading || !input.trim()}>
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
          className="flex flex-col gap-5"
        >
          <Textarea
            label="研究任务"
            rows={5}
            value={input}
            onChange={setInput}
            placeholder="输入一个需要多步研究、证据核验的复杂任务…"
          />
          <div className="flex flex-col gap-2">
            <span className="t-label">常用任务</span>
            <div className="flex flex-col items-start gap-1.5">
              {presets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className="link text-start text-[13px]"
                  onClick={() =>
                    setInput(`请生成一份面向投资决策的研究报告：${preset}。重点回答市场空间、价值链分配、竞争格局与主要风险。`)
                  }
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </form>
        {error && <p className="mt-3 text-[12px] text-status-rose-text">{error}</p>}
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
    }).catch((cause: unknown) => {
      setMessage(cause instanceof Error ? cause.message : '无法加载模型设置')
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
      subtitle="默认使用 Mock 演示模式；填入 DeepSeek API Key 后切换为真实模型。"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>关闭</Button>
          <Button onClick={save} disabled={saving}>{saving ? '保存中…' : '保存设置'}</Button>
        </>
      }
    >
      <div className="mb-5 flex items-center gap-2.5 rounded-[14px] bg-background-tertiary-default px-3 py-2.5">
        <span
          className={cx('size-2 rounded-full', config.mode === 'live' ? 'bg-status-lime-text' : 'bg-status-yellow-text')}
          aria-hidden
        />
        <span className="text-[13px] text-text-primary">{config.mode === 'live' ? 'Live 模式' : 'Mock 演示模式'}</span>
        <span className="ms-auto text-[11px] text-text-tertiary">
          {config.hasKey ? '服务端已配置 Key' : '服务端无 Key'}
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
        <p className="t-small">
          Key 只保存在当前服务进程内，不写入数据库。生产环境请使用环境变量{' '}
          <code className="rounded-md bg-background-tertiary-default px-1 py-0.5 font-mono text-[11px]">AGENTLOOM_API_KEY</code>。
        </p>
        {message && <p className="text-[12px] text-text-secondary">{message}</p>}
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
    setMobileNav(false)
  }, [location.pathname])

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)')
    const closeOnDesktop = () => {
      if (desktop.matches) setMobileNav(false)
    }
    desktop.addEventListener('change', closeOnDesktop)
    return () => desktop.removeEventListener('change', closeOnDesktop)
  }, [])

  if (loading) {
    return (
      <div className="app-ground flex min-h-dvh flex-col items-center justify-center gap-4">
        <div className="glass flex items-center gap-3 rounded-2xl px-4 py-3">
          <Spinner size="sm" aria-hidden />
          <span className="t-meta">正在装载工作台</span>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="app-ground flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="glass panel flex max-w-lg flex-col items-center gap-3">
          <div className="t-h2">无法连接 AgentLoom API</div>
          <p className="t-small">{error}</p>
          <p className="t-meta">
            先在项目目录运行 <code className="font-mono">pnpm dev</code>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="app-ground min-h-dvh font-sans text-text-primary">
      <TopNav
        onSettings={() => setSettingsOpen(true)}
        onMenu={() => setMobileNav(true)}
      />

      <div className="swiss-projectbar">
        <div className="swiss-projectbar-inner">
          <span className="swiss-project-page">{title}</span>
          <span className="swiss-project-sep" aria-hidden />
          <span className="swiss-project-name">{data.project.name}</span>
          <span className="swiss-project-scenario">{data.project.scenario}</span>
          <div className="swiss-project-stats">
            <span>{data.stats.agents} AGENTS</span>
            <span>{data.stats.docs} DOCS</span>
            <span>{data.documents.reduce((sum, doc) => sum + doc.chunkCount, 0)} CHUNKS</span>
            <span>{data.runs.length} RUNS</span>
          </div>
        </div>
      </div>

      <main className="swiss-main">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/knowledge" element={<Knowledge />} />
          <Route path="/team" element={<Team />} />
          <Route path="/workflow" element={<WorkflowPage />} />
          <Route path="/training" element={<Training />} />
          <Route path="/runs/:id" element={<RunPage />} />
          <Route path="/evals" element={<Evals />} />
        </Routes>
      </main>

      <BoardModal
        isOpen={mobileNav}
        onOpenChange={setMobileNav}
        aria-label="主导航"
        overlayClassName="items-stretch justify-start p-0 sm:p-0"
        panelClassName="h-full max-w-[280px]"
        className="h-full gap-0 rounded-none border-0 bg-transparent py-0 shadow-none"
      >
        <Sidebar
          onSettings={() => {
            setSettingsOpen(true)
            setMobileNav(false)
          }}
          onClose={() => setMobileNav(false)}
        />
      </BoardModal>

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
