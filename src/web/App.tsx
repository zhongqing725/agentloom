import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { BrowserRouter, NavLink, useLocation, useNavigate, Routes, Route } from 'react-router-dom'
import {
  Activity,
  BookOpen,
  Boxes,
  ChevronRight,
  LayoutDashboard,
  Network,
  Play,
  Settings,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import type { Bootstrap } from '../shared/types'
import { api } from './api'
import { Modal, Pill } from './components/ui'
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

  const refresh = async () => {
    try {
      const next = await api.bootstrap()
      setData(next)
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法连接 AgentLoom API')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  return <AppContext.Provider value={{ data, loading, error, refresh }}>{children}</AppContext.Provider>
}

const NAV = [
  { to: '/', label: '总览', icon: LayoutDashboard, end: true },
  { to: '/knowledge', label: '知识库', icon: BookOpen },
  { to: '/team', label: 'Agent 团队', icon: Users },
  { to: '/workflow', label: '编排画布', icon: Network },
  { to: '/evals', label: '评测', icon: Activity },
]

const TITLES: Record<string, string> = {
  '/': '总览',
  '/knowledge': '知识库',
  '/team': 'Agent 团队',
  '/workflow': '编排画布',
  '/evals': '评测',
}

function Sidebar({ onSettings }: { onSettings: () => void }) {
  const { data } = useApp()
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div>
          <div className="brand-cn">织序</div>
          <div className="brand-en">AGENTLOOM</div>
        </div>
      </div>

      <div className="side-label">工作台</div>
      <nav className="nav">
        {NAV.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={17} strokeWidth={1.8} />
              <span>{item.label}</span>
              <ChevronRight size={13} className="nav-arrow" />
            </NavLink>
          )
        })}
      </nav>

      <div className="side-label">当前项目</div>
      <div className="project-card">
        <div className="project-icon">
          <Boxes size={16} />
        </div>
        <div>
          <strong>{data?.project.name ?? 'AI 眼镜产业链研究'}</strong>
          <span>{data?.project.scenario ?? '产业投研'} · {data?.stats.docs ?? 0} 篇资料</span>
        </div>
      </div>

      <div className="sidebar-foot">
        <div className="mode-box">
          <span className={`mode-dot ${data?.mode === 'live' ? 'live' : ''}`} />
          <div>
            <strong>{data?.mode === 'live' ? 'Live 模型' : 'Mock 演示'}</strong>
            <span>{data?.mode === 'live' ? 'DeepSeek 已连接' : '无需 Key 即可运行'}</span>
          </div>
          <button className="icon-btn subtle" onClick={onSettings} aria-label="模型设置">
            <Settings size={15} />
          </button>
        </div>
        <div className="side-version">v0.1 · 赛道一 · Agent 编排创新应用</div>
      </div>
    </aside>
  )
}

function StartRunButton() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState(
    '请生成一份面向投资决策的 AI 眼镜产业链研究报告，重点回答市场空间、价值链分配、竞争格局与主要风险。',
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const start = async () => {
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
      <button className="btn btn-dark" onClick={() => setOpen(true)}>
        <Play size={14} fill="currentColor" />
        新建运行
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="启动一次团队运行"
        subtitle="研究任务会交给 8 个 Agent 协作完成，并在核查节点自动回环。"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setOpen(false)}>取消</button>
            <button className="btn btn-accent" onClick={start} disabled={loading || !input.trim()}>
              {loading ? '正在启动…' : '开始运行'}
            </button>
          </>
        }
      >
        <label className="field">
          <span>研究任务</span>
          <textarea
            rows={5}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="例如：分析 AI 眼镜产业链的投资价值…"
          />
        </label>
        <div className="prompt-presets">
          {[
            'AI 眼镜产业链的投资价值与风险',
            '2026 年 AI 眼镜市场空间与竞争格局',
            '从 BOM 看 AI 眼镜的价值池分配',
          ].map((preset) => (
            <button
              key={preset}
              className="preset"
              onClick={() =>
                setInput(`请生成一份面向投资决策的研究报告：${preset}。重点回答市场空间、价值链分配、竞争格局与主要风险。`)
              }
            >
              <Sparkles size={12} />
              {preset}
            </button>
          ))}
        </div>
        {error && <div className="form-error">{error}</div>}
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
          <button className="btn btn-ghost" onClick={onClose}>关闭</button>
          <button className="btn btn-accent" onClick={save} disabled={saving}>
            {saving ? '保存中…' : '保存设置'}
          </button>
        </>
      }
    >
      <div className="settings-state">
        <Pill tone={config.mode === 'live' ? 'green' : 'amber'}>
          {config.mode === 'live' ? 'Live 模式' : 'Mock 演示模式'}
        </Pill>
        <span>{config.hasKey ? '服务端已检测到 API Key' : '服务端未配置 API Key'}</span>
      </div>
      <label className="field">
        <span>DeepSeek API Key</span>
        <input
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={config.hasKey ? '已配置，留空则不修改' : 'sk-…'}
        />
      </label>
      <label className="field">
        <span>Base URL</span>
        <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
      </label>
      <label className="field">
        <span>模型</span>
        <input value={model} onChange={(event) => setModel(event.target.value)} />
      </label>
      <p className="hint">
        Key 只保存在当前服务进程内，不会写入数据库。生产环境请使用环境变量 <code>AGENTLOOM_API_KEY</code>。
      </p>
      {message && <div className="form-note">{message}</div>}
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

  if (loading) {
    return (
      <div className="boot">
        <div className="brand-mark large">
          <span /><span /><span /><span />
        </div>
        <strong>正在织入工作台…</strong>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="boot error">
        <strong>无法连接 AgentLoom API</strong>
        <p>{error}</p>
        <p className="hint">请先在项目目录运行 <code>pnpm dev</code>。</p>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <div className={`mobile-overlay ${mobileNav ? 'show' : ''}`} onClick={() => setMobileNav(false)} />
      <div className={`sidebar-wrap ${mobileNav ? 'show' : ''}`}>
        <Sidebar onSettings={() => { setSettingsOpen(true); setMobileNav(false) }} />
      </div>
      <div className="main">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileNav(true)} aria-label="打开导航">
            <span /><span /><span />
          </button>
          <div className="breadcrumb">
            <span>织序工作台</span>
            <ChevronRight size={12} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-right">
            <div className={`mode-pill ${data.mode === 'live' ? 'live' : ''}`}>
              <span className="mode-dot" />
              {data.mode === 'live' ? 'Live' : 'Mock'}
            </div>
            <button className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="设置">
              <Settings size={17} />
            </button>
            <StartRunButton />
          </div>
        </header>
        <main className="content">
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
