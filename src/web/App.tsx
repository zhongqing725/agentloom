import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { RiArrowLeftLine, RiCloseLine, RiSettings3Line } from '@remixicon/react'
import type { Bootstrap } from '../shared/types'
import { api } from './api'
import { installCardTilt } from './tilt'
import { Modal } from './components/ui'
import { Button } from '@/components/base/buttons/button'
import { IconButton } from '@/components/base/buttons/icon-button'
import { Input } from '@/components/base/input/input'
import { cx } from '@/utils/cx'
import Home from './pages/Home'
import Knowledge from './pages/Knowledge'
import Team from './pages/Team'
import WorkflowPage from './pages/WorkflowPage'
import RunPage from './pages/RunPage'
import Evals from './pages/Evals'
import Plugins from './pages/Plugins'
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

const OVERLAY_TITLES: Record<string, string> = {
  '/workflow': '编排画布',
  '/knowledge': '知识库',
  '/team': 'Agent 团队',
  '/training': '训练',
  '/evals': '评测',
  '/plugins': '插件生态',
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

/** One page only: the home stays mounted and every other view slides up over it. */
function Root() {
  const location = useLocation()
  const navigate = useNavigate()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const overlay = location.pathname !== '/'
  const title = OVERLAY_TITLES[location.pathname] ?? (location.pathname.startsWith('/runs/') ? '运行详情' : '织序')

  useEffect(() => installCardTilt(), [])

  useEffect(() => {
    if (!overlay) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') navigate('/')
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [overlay, navigate])

  return (
    <>
      {/* 面板打开时把首页移出渲染树：IntersectionObserver 全部失配，粒子/轨道/文字压力自动停摆。 */}
      <div className={overlay ? 'lm-home is-behind' : 'lm-home'}>
        <Home onOpenSettings={() => setSettingsOpen(true)} />
      </div>

      <div className={cx('loom-overlay', overlay && 'is-open')} aria-hidden={!overlay}>
        <div className="loom-overlay-panel" role="dialog" aria-modal={overlay} aria-label={title}>
          {overlay && (
            <>
              <header className="loom-overlay-bar">
                <button type="button" className="loom-back" onClick={() => navigate('/')}>
                  <RiArrowLeftLine className="size-4" aria-hidden />
                  返回
                </button>
                <span className="loom-overlay-title">{title}</span>
                <span className="loom-overlay-spacer" />
                <IconButton
                  icon={RiSettings3Line}
                  size="small"
                  aria-label="设置"
                  className="lm-icon-btn"
                  onClick={() => setSettingsOpen(true)}
                />
                <IconButton
                  icon={RiCloseLine}
                  size="small"
                  aria-label="关闭"
                  className="lm-icon-btn"
                  onClick={() => navigate('/')}
                />
              </header>
              <div className="loom-overlay-body">
                <Routes>
                  <Route path="/knowledge" element={<Knowledge />} />
                  <Route path="/team" element={<Team />} />
                  <Route path="/workflow" element={<WorkflowPage />} />
                  <Route path="/training" element={<Training />} />
                  <Route path="/runs/:id" element={<RunPage />} />
                  <Route path="/evals" element={<Evals />} />
                  <Route path="/plugins" element={<Plugins />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </div>
            </>
          )}
        </div>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Root />
      </AppProvider>
    </BrowserRouter>
  )
}
