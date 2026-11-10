import { Component, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { DirectionProvider } from '@/components/foundations/direction/direction'
import App from './App'
import '../styles/globals.css'
import './theme-refresh.css'
import '../styles/apple-theme.css'
import '../styles/home.css'
import '../styles/tilt.css'

document.documentElement.classList.add('dark')

class RootErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AgentLoom] render failed', error, info)
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <div
        style={{
          minHeight: '100dvh',
          display: 'grid',
          placeContent: 'center',
          gap: 12,
          padding: 24,
          background: '#000',
          color: '#f5f5f7',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 600 }}>页面加载失败</div>
        <div style={{ maxWidth: 360, fontSize: 13, lineHeight: 1.7, color: '#a1a1aa' }}>
          请刷新重试；如果反复出现，请清除缓存或换一个浏览器。
        </div>
        <button
          type="button"
          onClick={() => location.reload()}
          style={{
            justifySelf: 'center',
            height: 36,
            padding: '0 18px',
            border: '1px solid rgba(255,255,255,.18)',
            borderRadius: 999,
            background: 'rgba(255,255,255,.08)',
            color: '#f5f5f7',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          重新加载
        </button>
      </div>
    )
  }
}

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <RootErrorBoundary>
    <DirectionProvider locale="zh-CN">
      <App />
    </DirectionProvider>
  </RootErrorBoundary>,
)
