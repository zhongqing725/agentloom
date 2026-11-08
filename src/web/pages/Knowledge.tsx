import { useMemo, useState } from 'react'
import {
  RiAddLine,
  RiDeleteBin6Line,
  RiFileTextLine,
  RiSearchLine,
  RiUpload2Line,
} from '@remixicon/react'
import { useApp } from '../App'
import { api } from '../api'
import { Button } from '@/components/base/buttons/button'
import { IconButton } from '@/components/base/buttons/icon-button'
import { Chip } from '@/components/base/badges/chip'
import { Input } from '@/components/base/input/input'
import { SearchField } from '@/components/base/search-field/search-field'
import { Tab, TabList, TabPanel, Tabs } from '@/components/base/tabs/tabs'
import { Textarea } from '@/components/base/textarea/textarea'
import { Tooltip, TooltipTrigger } from '@/components/base/tooltip/tooltip'
import { cx } from '@/utils/cx'
import { Empty, MarkdownView, Modal, PageHeader, Surface } from '../components/ui'
import type { KnowledgeDoc, SearchHit } from '../../shared/types'

function formatDate(value: string) {
  const date = new Date(value)
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
}

const KIND_LABEL: Record<string, string> = {
  paper: '论文',
  report: '官方报告',
  news: '报道',
  filing: '公告',
  other: '其他',
}

export default function Knowledge() {
  const { data, refresh } = useApp()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [source, setSource] = useState('')
  const [tags, setTags] = useState('')
  const [content, setContent] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [kind, setKind] = useState<'paper' | 'report' | 'news' | 'other'>('report')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('AI 眼镜 出货量 渗透率')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<'doc' | 'search'>('doc')
  const [pendingDelete, setPendingDelete] = useState<KnowledgeDoc | null>(null)
  const [deleting, setDeleting] = useState(false)

  const totalChunks = useMemo(
    () => data?.documents.reduce((sum, doc) => sum + doc.chunkCount, 0) ?? 0,
    [data],
  )
  const selected = data?.documents.find((doc) => doc.id === selectedId) ?? data?.documents[0]

  if (!data) return null

  const reset = () => {
    setTitle('')
    setSource('')
    setTags('')
    setContent('')
    setFile(null)
    setUrl('')
    setKind('report')
    setError('')
    setOpen(false)
  }

  const submit = async () => {
    setSaving(true)
    setError('')
    try {
      if (file) {
        const form = new FormData()
        form.append('file', file)
        form.append('title', title || file.name.replace(/\.[^.]+$/, ''))
        form.append('source', source || '上传文档')
        form.append('tags', tags)
        form.append('kind', kind)
        if (url.trim()) form.append('url', url.trim())
        await api.uploadDocument(form)
      } else {
        if (!title.trim() || !content.trim()) throw new Error('标题和正文不能为空。')
        await api.addDocument({
          title: title.trim(),
          source: source.trim() || '手动录入',
          tags: tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
          content: content.trim(),
          kind,
          url: url.trim() || undefined,
        })
      }
      await refresh()
      reset()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const runSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    try {
      const result = await api.search(query)
      setHits(result.hits)
      setView('search')
    } finally {
      setSearching(false)
    }
  }

  const remove = async () => {
    if (!pendingDelete || deleting) return
    setDeleting(true)
    try {
      await api.deleteDocument(pendingDelete.id)
      await refresh()
      if (selectedId === pendingDelete.id) setSelectedId(null)
      setPendingDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="app-page">
      <PageHeader
        title="知识库"
        meta={`${data.documents.length} 篇资料 · 中文 BM25 检索 · 引用可回查`}
        actions={
          <Button leadingIcon={RiAddLine} onClick={() => setOpen(true)}>
            添加资料
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[336px_minmax(0,1fr)]">
        {/* Catalogue ----------------------------------------------------------- */}
        <Surface className="panel kb-catalogue flex flex-col self-start p-2.5">
          <div className="flex items-center justify-between px-2 pb-2 pt-1">
            <span className="t-label">资料目录</span>
            <Chip variant="caption" color="neutral">{data.documents.length}</Chip>
          </div>
          <div className="flex flex-col gap-0.5">
            {data.documents.length === 0 ? (
              <p className="t-small px-2 py-4">知识库还是空的。</p>
            ) : (
              data.documents.map((doc) => {
                const active = selected?.id === doc.id
                return (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(doc.id)
                      setView('doc')
                    }}
                    className={cx(
                      'group w-full rounded-[12px] px-2.5 py-2 text-left transition-colors duration-150',
                      'outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring',
                      active ? 'bg-background-primary-active shadow-xs' : 'hover:bg-background-tertiary-default',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <RiFileTextLine className={cx('size-3.5 shrink-0', active ? 'text-accent-500' : 'text-text-placeholder')} aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-text-primary">{doc.title}</span>
                    </span>
                    <span className="mt-1 flex items-center gap-1.5 ps-5 text-[10.5px] text-text-tertiary">
                      <span className="tabular-nums">{doc.chunkCount} 片段</span>
                      <span aria-hidden>·</span>
                      <span className="tabular-nums">{formatDate(doc.createdAt)}</span>
                      <span className="ms-auto flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        {doc.tags.slice(0, 1).map((tag) => (
                          <Chip key={tag} variant="caption" color="soft">{tag}</Chip>
                        ))}
                      </span>
                    </span>
                  </button>
                )
              })
            )}
          </div>
          <p className="t-meta mt-3 border-t border-border-button-default px-2 pt-3">
            演示知识库为模拟资料，仅用于展示检索与引用流程。
          </p>
        </Surface>

        {/* Reader -------------------------------------------------------------- */}
        <Surface className="panel overflow-hidden p-0">
          <Tabs
            selectedKey={view}
            onSelectionChange={(key) => setView(key as 'doc' | 'search')}
            className="gap-0"
          >
            <div className="flex flex-nowrap items-end justify-between gap-2 border-b border-border-button-default px-4 pt-2">
              <div className="min-w-0 flex-1">
                <TabList aria-label="知识库视图" variant="underline">
                  <Tab id="doc" icon={RiFileTextLine}>资料内容</Tab>
                  <Tab id="search" icon={RiSearchLine}>检索测试</Tab>
                </TabList>
              </div>
              {selected && view === 'doc' && (
                <div className="shrink-0 pb-2">
                  <TooltipTrigger>
                    <IconButton
                      icon={RiDeleteBin6Line}
                      size="small"
                      aria-label={`删除 ${selected.title}`}
                      onClick={() => setPendingDelete(selected)}
                      className="text-text-tertiary"
                    />
                    <Tooltip>删除资料</Tooltip>
                  </TooltipTrigger>
                </div>
              )}
            </div>

            <TabPanel id="doc">
              {selected ? (
                <article className="mx-auto max-w-[70ch] px-6 pb-10 pt-6 sm:px-10">
                  <h2 className="text-[22px] font-semibold leading-snug tracking-[-0.02em] text-text-primary">
                    {selected.title}
                  </h2>
                  <div className="mt-2 flex flex-wrap items-center gap-2.5">
                    <span className="t-meta">{selected.source}</span>
                    <span className="t-meta">·</span>
                    <span className="t-meta">{selected.chunkCount} 个片段</span>
                    <span className="t-meta">·</span>
                    <span className="t-meta">{formatDate(selected.createdAt)}</span>
                    {selected.kind && (
                      <Chip variant="caption" color="neutral">
                        {KIND_LABEL[selected.kind] ?? selected.kind}
                      </Chip>
                    )}
                    {selected.url && (
                      <a href={selected.url} target="_blank" rel="noreferrer" className="link text-[11px]">
                        来源原文
                      </a>
                    )}
                    {selected.tags.map((tag) => (
                      <Chip key={tag} variant="caption" color="neutral">{tag}</Chip>
                    ))}
                  </div>
                  <div className="mt-5 border-t border-border-button-default pt-5">
                    <MarkdownView content={selected.content.replace(/^#\s+.*\n/, '')} />
                  </div>
                </article>
              ) : (
                <div className="p-6">
                  <Empty title="还没有选中资料" description="从左侧目录选择一份资料，正文会在这里打开。" />
                </div>
              )}
            </TabPanel>

            <TabPanel id="search">
              <div className="px-6 py-6 sm:px-8">
                <form
                  className="flex items-end gap-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void runSearch()
                  }}
                >
                  <SearchField
                    aria-label="检索问题"
                    shape="pill"
                    placeholder="例如：2028 年 AI 眼镜出货量是多少？"
                    value={query}
                    onChange={setQuery}
                    isLoading={searching}
                    className="min-w-0 flex-1"
                  />
                  <Button type="submit" variant="secondary" disabled={searching || !query.trim()}>
                    检索
                  </Button>
                </form>

                <div className="mt-5 flex flex-col gap-1">
                  {hits.length === 0 ? (
                    <p className="t-meta">输入一个问题，看看核查员会拿到哪些证据。</p>
                  ) : (
                    hits.map((hit) => (
                      <div key={hit.chunkId} className="rounded-[14px] px-3 py-3 transition-colors duration-150 hover:bg-background-secondary-default">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[12px] font-medium text-text-primary">{hit.docTitle}</span>
                          <Chip variant="caption" color="neutral">{hit.score.toFixed(2)}</Chip>
                        </div>
                        <p className="mt-1.5 line-clamp-3 text-[12px] leading-relaxed text-text-secondary">{hit.text}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </TabPanel>
          </Tabs>
        </Surface>
      </div>

      {/* Add document --------------------------------------------------------- */}
      <Modal
        open={open}
        onClose={reset}
        title="添加知识资料"
        subtitle="支持 Markdown / TXT 上传，也可以直接粘贴正文。"
        footer={
          <>
            <Button variant="secondary" onClick={reset}>取消</Button>
            <Button type="submit" form="add-document-form" disabled={saving}>
              {saving ? '入库中…' : '入库并切分'}
            </Button>
          </>
        }
      >
        <form
          id="add-document-form"
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <Input label="标题" value={title} onChange={setTitle} placeholder="例如：2026 年 AI 眼镜市场追踪" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="来源" value={source} onChange={setSource} placeholder="IDC / 公司公告 / 访谈" />
            <Input label="标签" value={tags} onChange={setTags} placeholder="市场, 出货量" />
          </div>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
            <Input
              label="来源链接"
              value={url}
              onChange={setUrl}
              placeholder="知网 DOI / 官方报告 URL（用于引用溯源）"
            />
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-text-secondary">类型</span>
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value as typeof kind)}
                className="h-9 w-full rounded-2lg border border-border-button-default bg-background-tertiary-default px-3 text-[13px] text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
              >
                <option value="paper">论文（知网/期刊）</option>
                <option value="report">官方报告 / 标准</option>
                <option value="news">报道 / 新闻稿</option>
                <option value="other">其他</option>
              </select>
            </label>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-text-secondary">上传文件</span>
            <label
              className={cx(
                'flex cursor-pointer items-center gap-2.5 rounded-[14px] bg-background-tertiary-default px-3 py-3',
                'text-[13px] text-text-secondary transition-colors duration-150 hover:bg-background-secondary-hover',
              )}
            >
              <RiUpload2Line className="size-5 text-accent-500" aria-hidden />
              <span className="min-w-0 truncate">{file ? file.name : '选择 .md / .txt / .pdf 文件'}</span>
              <input
                type="file"
                accept=".md,.markdown,.txt,.pdf"
                className="sr-only"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <span className="t-meta">PDF 需要有文字层（知网下载的版本通常有）；扫描件请先 OCR。</span>
          </div>
          {!file && (
            <Textarea
              label="正文"
              rows={7}
              value={content}
              onChange={setContent}
              placeholder="粘贴 Markdown 或纯文本，系统会按段落切分并建立索引。"
            />
          )}
          {error && <p className="text-[12px] text-status-rose-text">{error}</p>}
        </form>
      </Modal>

      {/* Delete --------------------------------------------------------------- */}
      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title="删除这份资料？"
        subtitle={pendingDelete?.title}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingDelete(null)}>取消</Button>
            <Button variant="danger" onClick={() => void remove()} disabled={deleting}>
              {deleting ? '删除中…' : '确认删除'}
            </Button>
          </>
        }
      >
        <p className="t-small">
          删除后，引用这份资料的报告仍会保留历史快照，但后续运行无法再检索到它。
        </p>
      </Modal>
    </div>
  )
}
