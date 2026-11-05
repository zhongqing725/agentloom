import { createRoot } from 'react-dom/client'
import { DirectionProvider } from '@/components/foundations/direction/direction'
import App from './App'
import '../styles/globals.css'
import './theme-refresh.css'
import '../styles/swiss-theme.css'

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <DirectionProvider locale="zh-CN">
    <App />
  </DirectionProvider>,
)

