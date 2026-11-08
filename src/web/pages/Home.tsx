import { useEffect, useRef, useState, type ComponentType, type RefObject } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RiArrowRightLine,
  RiArrowRightSLine,
  RiArrowRightUpLine,
  RiBookOpenLine,
  RiDashboardLine,
  RiFlowChart,
  RiHome5Line,
  RiLineChartLine,
  RiNotification3Line,
  RiPlayLargeLine,
  RiSearchLine,
  RiSettings3Line,
  RiStackLine,
  RiTeamLine,
} from '@remixicon/react'
import { useApp } from '../App'
import { api } from '../api'
import { Avatar } from '@/components/base/avatar/avatar'
import { Badge } from '@/components/base/badges/badge'
import { Button } from '@/components/base/buttons/button'
import { IconButton } from '@/components/base/buttons/icon-button'
import { Chip } from '@/components/base/badges/chip'
import { Tooltip, TooltipTrigger } from '@/components/base/tooltip/tooltip'
import { cx } from '@/utils/cx'
import Antigravity from '../components/Antigravity'
import DriftWall from '../components/DriftWall'
import TextPressure from '../components/TextPressure'
import OrbitImages from '../components/OrbitImages'
import GooeyNav from '../components/GooeyNav'
import GlassIcons from '../components/GlassIcons'

const ROLE_LABEL: Record<string, string> = {
  planner: '规划',
  researcher: '研究',
  analyst: '分析',
  writer: '撰写',
  verifier: '核查',
  editor: '终审',
  specialist: '专家',
}

const RUN_LABEL: Record<string, string> = {
  completed: '已完成',
  running: '运行中',
  failed: '失败',
  queued: '排队中',
  pending: '待执行',
  cancelled: '已取消',
}

// 六条独立行星轨道：由近到远，半径递增、周期递增
const RAIL_GLASS = {
  size: 112,
  gap: 22,
  columns: 1,
  roundness: 0.42,
  refraction: 0.9,
  bevel: 0.6,
  dispersion: 0.12,
  frost: 0.15,
  shine: 0.95,
  tint: '#ffffff',
  tintOpacity: 0.05,
  iconColor: '#ffffff',
  plate: 'tilt',
  tilt: 22,
  spread: 0.5,
  hover: 'lift',
  parallax: 1,
  labels: 'hover',
  intro: false,
  theme: 'dark',
} as const

const TASK =
  '请生成一份面向投资决策的 AI 眼镜产业链研究报告，重点回答市场空间、价值链分配、竞争格局与主要风险。'

function when(iso?: string) {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** Six chrome rings, ported from agentloom.landing. Drag to spin. */
function OrbitRings({ canvasRef }: { canvasRef?: RefObject<HTMLCanvasElement | null> }) {
  const localRef = useRef<HTMLCanvasElement>(null)
  const ref = canvasRef ?? localRef

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    let cancelled = false
    let handle: { dispose: () => void } | undefined

    void import('../landing/orbit')
      .then(({ startOrbit }) => {
        if (cancelled) return
        handle = startOrbit(canvas, { iridescence: 0, interactive: true, neutral: true })
      })
      .catch(() => {
        // no WebGL or no HDRI: the halo alone still reads
      })

    return () => {
      cancelled = true
      handle?.dispose()
    }
  }, [])

  return <canvas ref={ref} className="lm-ring-canvas" aria-hidden />
}

export default function Home({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const navigate = useNavigate()
  const { data } = useApp()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [compact, setCompact] = useState(false)
  const [ballTurn, setBallTurn] = useState(0)
  const ringRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)')
    const sync = () => setCompact(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const runs = data?.runs ?? []
  const agents = data?.agents ?? []
  const docs = data?.documents ?? []
  const latest = runs[0]
  const chunks = docs.reduce((sum, doc) => sum + doc.chunkCount, 0)
  const passRate = data ? Math.round(data.stats.passRate <= 1 ? data.stats.passRate * 100 : data.stats.passRate) : null

  const navItems = [
    { label: '首页', href: '#home' },
    { label: '控制台', href: '#console' },
    { label: '编排画布', href: '/workflow' },
    { label: '证据账本', href: latest ? `/runs/${latest.id}?tab=ledger` : '/knowledge' },
    { label: '插件生态', href: '/plugins' },
  ]

  const start = async () => {
    setLoading(true)
    setError('')
    try {
      const { run } = await api.createRun(TASK)
      navigate(`/runs/${run.id}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '启动失败')
    } finally {
      setLoading(false)
    }
  }

  const scrollTo = (id: string) => {
    if (id === 'home') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const leftRail = [
    { label: '首页', icon: RiHome5Line, color: 'blue', onClick: () => scrollTo('home') },
    { label: '控制台', icon: RiDashboardLine, color: 'indigo', onClick: () => scrollTo('console') },
    { label: '画布', icon: RiFlowChart, color: 'purple', onClick: () => navigate('/workflow') },
  ]

  const rightRail = [
    { label: '证据', icon: RiBookOpenLine, color: 'silver', onClick: () => scrollTo('proof') },
    { label: '团队', icon: RiTeamLine, color: 'teal', onClick: () => navigate('/team') },
    { label: '评测', icon: RiLineChartLine, color: 'blue', onClick: () => navigate('/evals') },
  ]

  const orbitNav = [...leftRail, ...rightRail]

  // Orbit geometry: 66vw wide ellipse, half as tall; tiles ride itemSize units.
  const radiusY = compact ? 520 : 240
  const tileSize = compact ? 56 : 80
  const orbitItemSize = compact ? 150 : 96

  return (
    <div className="lm-root">
      <div className="lm-aurora" aria-hidden>
        <span className="lm-orb lm-orb-a" />
        <span className="lm-orb lm-orb-b" />
        <span className="lm-orb lm-orb-c" />
        <span className="lm-orb lm-orb-d" />
        <span className="lm-grid" />
      </div>
      <div className="lm-antigravity" aria-hidden>
        <Antigravity
          colors={['#5227FF', '#FF9FFC', '#B497CF']}
          count={compact ? 1200 : 3000}
          magnetRadius={9}
          ringRadius={7}
          particleSize={compact ? 0.4 : 0.55}
          particleShape="capsule"
          particleVariance={1}
          fieldStrength={10}
          waveAmplitude={1}
          waveCount={3}
          waveSpeed={0.4}
          colorMode="conic"
          colorSpeed={0.05}
          pulseSpeed={3}
          depthFactor={1}
          ambient={compact ? 0.3 : 0.45}
          lerpSpeed={0.05}
          autoAnimate
          interactive
          clickBurst
          intro
          lightMode={false}
        />
      </div>

      <div className="lm-shell">
        <header className="lm-topbar">
          <div className="lm-brand">
            <GlassIcons
              items={[{ icon: <span className="lm-brand-glyph">织</span>, color: 'silver', href: '#home', label: '织序 AgentLoom 首页' }]}
              size={56}
              gap={0}
              columns={1}
              roundness={0.5}
              refraction={1}
              bevel={0.65}
              dispersion={0.1}
              frost={0.12}
              shine={1}
              tint="#ffffff"
              tintOpacity={0.04}
              iconColor="#ffffff"
              plate="none"
              tilt={22}
              spread={0.4}
              hover="press"
              parallax={1}
              labels="none"
              intro={false}
              theme="dark"
            />
            <a className="lm-brand-word" href="#home" aria-label="织序 AgentLoom 首页">
              <b>织序</b>
              <span>Agentloom</span>
            </a>
          </div>
          <span className="lm-topbar-spacer" />
          <div className="lm-topbar-nav">
            <GooeyNav items={navItems} onNavigate={(item) => item.href && navigate(item.href)} initialActiveIndex={0} theme="dark" size="sm" frame particleCount={12} spread={46} animationTime={600} timeVariance={300} gooeyness={0.5} wobble={0.5} hoverEffect />
          </div>
          <div className="lm-topbar-tools">
            <button type="button" className="lm-quick" onClick={() => navigate('/knowledge')}>
              知识库
            </button>
            <button type="button" className="lm-quick" onClick={() => navigate('/evals')}>
              评测
            </button>
            <TooltipTrigger>
              <IconButton icon={RiSearchLine} size="small" aria-label="搜索" className="lm-icon-btn" />
              <Tooltip>搜索 Agent、证据与运行</Tooltip>
            </TooltipTrigger>
            <span className="lm-bell">
              <TooltipTrigger>
                <IconButton icon={RiNotification3Line} size="small" aria-label="通知" className="lm-icon-btn" />
                <Tooltip>{runs.length} 条运行记录</Tooltip>
              </TooltipTrigger>
              <Badge color="primary">{runs.length || 3}</Badge>
            </span>
            <IconButton
              icon={RiSettings3Line}
              size="small"
              aria-label="设置"
              className="lm-icon-btn"
              onClick={onOpenSettings}
            />
            <span className="lm-nav-divider" aria-hidden />
            <span className="lm-nav-user">
              <Avatar size="sm" color="blue" initials="织" aria-hidden />
              <span className="lm-nav-user-name">{data?.project.name ?? '研究团队'}</span>
            </span>
          </div>
        </header>

        <aside className="lm-hero" id="home">
          <div className="lm-hero-pressure">
            <TextPressure
              text="AGENT TEAMS SHIP LIKE A PRODUCT."
              flex
              alpha={false}
              stroke={false}
              width
              weight
              italic
              radius={0.5}
              smoothing={0.5}
              idle="wave"
              idleSpeed={1}
              clickRipple
              strokeColor="#ff5a1f"
              strokeWidth={3}
              minFontSize={16}
              scale={false}
              textColor="#f5f5f7"
            />
          </div>
          <p className="lm-hero-sub">
            {Array.from('Build / Verify / Deliver —— 每一个结论，都能回到证据。').map((char, index) =>
              char === ' ' ? (
                <span key={index} className="lm-wave-space">
                  {'\u00A0'}
                </span>
              ) : (
                <span
                  key={index}
                  className="lm-wave-char"
                  style={{ animationDelay: `${-index * 0.075}s` }}
                >
                  {char}
                </span>
              ),
            )}
          </p>

          <div className="lm-orbit-stage">
            <OrbitImages
              className="lm-orbit"
              images={orbitNav.map(({ label, icon: Icon, color }) => ({
                alt: label,
                node: (
                  <span className="lm-tile">
                    <GlassIcons
                      items={[{ icon: <Icon aria-hidden />, color, label: '' }]}
                      {...RAIL_GLASS}
                      size={tileSize}
                      labels="none"
                    />
                    <span className="lm-tile-label">{label}</span>
                  </span>
                ),
              }))}
              shape="ellipse"
              baseWidth={1400}
              radiusX={700}
              radiusY={radiusY}
              rotation={-6}
              duration={52}
              itemSize={orbitItemSize}
              depth={0.6}
              showPath
              pathColor="rgba(255,255,255,0.10)"
              pathWidth={1.2}
              onItemClick={(index) => {
                // Ball leans toward the picked tile before the (possibly) route change.
                setBallTurn(index * 60 - 180)
                orbitNav[index]?.onClick()
              }}
              shadow={0}
              hoverScale={1.06}
              hoverSpeed={0}
              clickToFront
              intro
              centerContent={
                <div className="lm-ball" style={{ transform: `rotate(${ballTurn}deg) rotateX(-14deg)` }}>
                  <div className="lm-ring-stage">
                    <span className="lm-ring-halo" aria-hidden />
                    <OrbitRings canvasRef={ringRef} />
                  </div>
                </div>
              }
            />
            <p className="lm-orbit-caption lm-glass">拖动旋转 · 6 个入口</p>
          </div>

          <div className="lm-actions lm-actions-center">
            <Button size="medium" className="lm-cta-primary" leadingIcon={RiPlayLargeLine} onClick={() => void start()} disabled={loading}>
              {loading ? '正在启动…' : '运行示例研究'}
            </Button>
            <Button size="medium" className="lm-cta-secondary" trailingIcon={RiArrowRightLine} onClick={() => navigate('/workflow')}>
              打开画布
            </Button>
          </div>

          <div className="lm-status lm-glass">
            <span className={cx('lm-status-live', latest?.status === 'running' && 'is-running')}>
              <i aria-hidden />
              {latest ? RUN_LABEL[latest.status] ?? latest.status : '待机'}
            </span>
            <span className="lm-status-text">
              {latest ? `最近运行 ${when(latest.startedAt)}` : '尚无运行记录'}
            </span>
            <span className="lm-status-sep" aria-hidden />
            <span className="lm-status-text">通过率 {passRate ?? '—'}%</span>
            <span className="lm-status-sep" aria-hidden />
            <span className="lm-status-text">{docs.length} 篇资料</span>
            <span className="lm-status-sep" aria-hidden />
            <span className="lm-status-text">{agents.length} 个角色</span>
          </div>

          {error && <p className="lm-error">{error}</p>}
        </aside>

        <section className="lm-section" id="console">
          <div className="lm-section-head">
            <div>
              <div className="lm-card-kicker">01 · Console</div>
              <h2>控制台</h2>
              <p>
                {data ? `${data.project.name} · ${data.project.scenario} · ${data.mode === 'live' ? 'Live 模型' : 'Mock 演示'}` : '正在连接 AgentLoom API…'}
              </p>
            </div>
            <div className="lm-band-actions">
              <Button variant="secondary" size="small" className="lm-cta-secondary" leadingIcon={RiFlowChart} onClick={() => navigate('/workflow')}>
                编排画布
              </Button>
              <Button size="small" className="lm-cta-primary" leadingIcon={RiPlayLargeLine} onClick={() => void start()} disabled={loading}>
                {loading ? '正在启动…' : '新建运行'}
              </Button>
            </div>
          </div>

          <div className="lm-kpis">
            <article className="lm-kpi lm-glass" data-tilt>
              <div className="lm-kpi-top"><span>累计运行</span><RiLineChartLine className="size-3.5" aria-hidden /></div>
              <div className="lm-kpi-value">{data ? data.stats.runs : '—'}<small> 次</small></div>
              <div className="lm-kpi-note">{latest ? `最近 ${when(latest.startedAt)}` : '尚未运行'}</div>
            </article>
            <article className="lm-kpi lm-glass" data-tilt>
              <div className="lm-kpi-top"><span>通过率</span><RiLineChartLine className="size-3.5" aria-hidden /></div>
              <div className="lm-kpi-value">{passRate ?? '—'}<small> %</small></div>
              <div className="lm-kpi-note">{data ? `核查阈值 ${data.workflow.settings.verifyThreshold}` : '等待数据'}</div>
            </article>
            <article className="lm-kpi lm-glass" data-tilt>
              <div className="lm-kpi-top"><span>平均核查分</span><RiLineChartLine className="size-3.5" aria-hidden /></div>
              <div className="lm-kpi-value">{data ? Math.round(data.stats.avgScore <= 1 ? data.stats.avgScore * 100 : data.stats.avgScore) : '—'}<small> %</small></div>
              <div className="lm-kpi-note">{data ? `自循环上限 ${data.workflow.settings.maxLoop} 轮` : '等待数据'}</div>
            </article>
            <article className="lm-kpi lm-glass" data-tilt>
              <div className="lm-kpi-top"><span>知识库</span><RiStackLine className="size-3.5" aria-hidden /></div>
              <div className="lm-kpi-value">{docs.length || '—'}<small> 篇</small></div>
              <div className="lm-kpi-note">{`${agents.length || 0} 个 Agent`}</div>
            </article>
          </div>

          <div className="lm-console-grid">
            <div className="lm-panel lm-glass" data-tilt>
              <div className="lm-panel-head">
                <span className="lm-card-kicker">最近运行</span>
                <span className="lm-panel-count">{runs.length} 条</span>
              </div>
              {runs.length === 0 ? (
                <p className="lm-panel-empty">还没有运行记录。跑一个示例，团队会在画布上走一遍完整闭环。</p>
              ) : (
                <div className="lm-run-list">
                  {runs.slice(0, 6).map((run) => (
                    <button key={run.id} type="button" className="lm-run-row" onClick={() => navigate(`/runs/${run.id}`)}>
                      <span className="lm-run-id">{run.id.slice(-8).toUpperCase()}</span>
                      <Chip variant="caption" color={run.status === 'completed' ? 'lime' : run.status === 'failed' ? 'rose' : 'neutral'}>
                        {run.status === 'completed' ? '已完成' : run.status === 'failed' ? '失败' : run.status}
                      </Chip>
                      <span className="lm-run-input">{run.input}</span>
                      <span className="lm-run-score">{run.score !== undefined ? `${Math.round(run.score * 100)}%` : '—'}</span>
                      <RiArrowRightSLine className="size-3.5 shrink-0 text-text-placeholder" aria-hidden />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="lm-panel lm-glass" data-tilt>
              <div className="lm-panel-head">
                <span className="lm-card-kicker">Agent 团队</span>
                <button type="button" className="lm-panel-link" onClick={() => navigate('/team')}>
                  全部 <RiArrowRightLine className="size-3" aria-hidden />
                </button>
              </div>
              <div className="lm-agent-list">
                {agents.slice(0, 6).map((agent) => (
                  <div key={agent.id} className="lm-agent-row">
                    <Avatar size="sm" initials={agent.name.slice(0, 1)} alt={agent.name} />
                    <span className="lm-agent-copy">
                      <b>{agent.name}</b>
                      <span>{agent.title}</span>
                    </span>
                    <Chip variant="caption" color="neutral">{ROLE_LABEL[agent.role] ?? agent.role}</Chip>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="lm-section" id="canvas">
          <div className="lm-section-head">
            <div>
              <div className="lm-card-kicker">02 · Canvas</div>
              <h2>三张画布，一条闭环。</h2>
              <p>编排画布决定谁来做，证据账本决定能不能信，插件生态决定能做什么。三者串成一条可回放的链路。</p>
            </div>
            <Button size="small" variant="secondary" className="lm-cta-secondary" trailingIcon={RiArrowRightLine} onClick={() => navigate('/team')}>
              浏览 Agent 团队
            </Button>
          </div>

          <div className="lm-bento">
            <article className="lm-card lm-glass" data-tilt onClick={() => navigate('/workflow')}>
              <div className="lm-card-kicker">Orchestration</div>
              <h3>编排画布</h3>
              <p>拖拽节点即可改流程；保存后，下一次运行使用新图。历史运行保留当时的调度轨迹。</p>
              <div className="lm-card-art">
                <div className="lm-mini-flow">
                  <span className="lm-chip-node">规划</span>
                  <RiArrowRightLine className="lm-arrow size-3" aria-hidden />
                  <span className="lm-chip-node violet">三路并行</span>
                  <RiArrowRightLine className="lm-arrow size-3" aria-hidden />
                  <span className="lm-chip-node">合成</span>
                  <RiArrowRightLine className="lm-arrow size-3" aria-hidden />
                  <span className="lm-chip-node">核查</span>
                </div>
              </div>
            </article>

            <article className="lm-card lm-glass" data-tilt id="proof" onClick={() => navigate(runs[0] ? `/runs/${runs[0].id}?tab=ledger` : '/knowledge')}>
              <div className="lm-card-kicker">Evidence</div>
              <h3>证据账本</h3>
              <p>结论和原文一一对应，点开就能回读。</p>
              <div className="lm-card-art">
                <div className="lm-ledger">
                  <div className="lm-ledger-row"><span>2029 年出货量 1,200 万台</span><b>支持</b></div>
                  <div className="lm-ledger-row"><span>BOM 中光波导占比 28%</span><b>支持</b></div>
                  <div className="lm-ledger-row is-warn"><span>渠道加价率 2.1×</span><b>待补证</b></div>
                </div>
              </div>
            </article>

            <article className="lm-card lm-glass" data-tilt id="plugins" onClick={() => navigate('/plugins')}>
              <div className="lm-card-kicker">Plugins</div>
              <h3>插件生态</h3>
              <p>14 个能力插件都已接入运行时：检索、图谱、时效、发散、辩论、核验、计算与浏览器抓取。</p>
              <div className="lm-card-art">
                <div className="lm-plugins">
                  <span className="lm-plugin on">知识检索</span>
                  <span className="lm-plugin on">邻居扩展</span>
                  <span className="lm-plugin on">发散思考</span>
                  <span className="lm-plugin on">多角色辩论</span>
                  <span className="lm-plugin on">引用核验</span>
                  <span className="lm-plugin on">浏览器抓取</span>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section className="lm-section lm-wall" id="wall">
          <div className="lm-section-head">
            <div>
              <div className="lm-card-kicker">03 · Library</div>
              <h2>资料不是附件，是证据墙。</h2>
              <p>入库的原文按最近使用排开，标题、来源、段落数一目了然；点开任意一张，团队都知道该回到哪一句。</p>
            </div>
            <Button size="small" variant="secondary" className="lm-cta-secondary" trailingIcon={RiArrowRightLine} onClick={() => navigate('/knowledge')}>
              打开知识库
            </Button>
          </div>

          <div className="lm-wall-frame">
            <DriftWall
              items={docs.map((doc, index) => ({
                text: doc.title,
                meta: `${doc.source} · ${doc.chunkCount} 段`,
                tag: doc.tags[0] ?? doc.kind ?? '资料',
                index: String(index + 1).padStart(2, '0'),
              }))}
              columns={5}
              tileWidth={220}
              tileHeight={150}
              gap={14}
              radius={16}
              tilt={12}
              turn={-10}
              roll={0}
              perspective={1200}
              depth={120}
              speed={42}
              direction="up"
              variance={0.45}
              parallax={0.6}
              lift={64}
              fade={0.35}
              dim={1}
              grayscale={false}
              overlayColor="#000000"
              pauseOnHover={false}
            />
          </div>
        </section>

        <section className="lm-band lm-glass" data-tilt>
          <div>
            <h2>把下一份研究，交给一支可验证的团队。</h2>
            <p>从一条任务开始：规划、并行研究、合成、核查。全流程留痕，随时回放。</p>
          </div>
          <div className="lm-band-actions">
            <Button size="medium" className="lm-cta-primary" onClick={() => void start()} disabled={loading}>
              运行示例研究
            </Button>
            <Button size="medium" variant="secondary" className="lm-cta-secondary" onClick={() => navigate('/evals')} leadingIcon={RiStackLine}>
              查看评测
            </Button>
          </div>
        </section>

        <footer className="lm-foot">
          <div className="lm-wordmark" aria-hidden>AGENTLOOM</div>
        </footer>
      </div>
    </div>
  )
}
