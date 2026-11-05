import { useMemo, useState } from 'react'
import {
  RiAddLine,
  RiArrowRightLine,
  RiBookOpenLine,
  RiDeleteBin6Line,
  RiFileTextLine,
  RiPriceTag3Line,
  RiSearchLine,
  RiSparklingLine,
  RiStackLine,
  RiUpload2Line,
} from '@remixicon/react'
import { useApp } from '../App'
import { api } from '../api'
import { Badge } from '@/components/base/badges/badge'
import { Button } from '@/components/base/buttons/button'
import { IconButton } from '@/components/base/buttons/icon-button'
import { Input } from '@/components/base/input/input'
import { Textarea } from '@/components/base/textarea/textarea'
import { Tooltip, TooltipTrigger } from '@/components/base/tooltip/tooltip'
import { cx } from '@/utils/cx'
import { Empty, Modal, PageHeader, Surface } from '../components/ui'
import type { KnowledgeDoc, SearchHit } from '../../shared/types'

function formatDate(value: string) {
  const date = new Date(value)
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
}

export default function Knowledge() {
  const { data, refresh } = useApp()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [source, setSource] = useState('')
  const [tags, setTags] = useState('')
  const [content, setContent] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('AI 眼镜 出货量 渗透率')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<KnowledgeDoc | null>(null)
  const [pendingDelete, setPendingDelete] = useState<KnowledgeDoc | null>(null)
  const [deleting, setDeleting] = useState(false)

  const totalChunks = useMemo(
    () => data?.documents.reduce((sum, doc) => sum + doc.chunkCount, 0) ?? 0,
    [data],
  )

  if (!data) return null

  const reset = () => {
    setTitle('')
    setSource('')
    setTags('')
    setContent('')
    setFile(null)
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
        await api.uploadDocument(form)
      } else {
        if (!title.trim() || !content.trim()) throw new Error('标题和正文不能为空。')
        await api.addDocument({
          title: title.trim(),
          source: source.trim() || '手动录入',
          tags: tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
          content: content.trim(),
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
      if (selected?.id === pendingDelete.id) setSelected(null)
      setPendingDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Knowledge"
        title="知识库"
        description="团队的事实底座。每个结论都能回到原文，核查员据此判断引用是否成立。"
        actions={
          <Button leadingIcon={RiAddLine} onClick={() => setOpen(true)}>
            添加资料
          </Button>
        }
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { icon: RiBookOpenLine, value: data.documents.length, label: '篇资料' },
          { icon: RiStackLine, value: totalChunks, label: '个知识片段' },
          { icon: RiSparklingLine, value: 'BM25', label: '中文检索 + 双字回退' },
        ].map((item) => {
          const Icon = item.icon
          return (
            <Surface key={item.label} className="flex items-center gap-3 p-4 sm:p-5">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-background-tertiary-default text-accent-600">
                <Icon className="size-4" aria-hidden />
              </span>
              <div>
                <div className="text-title-3-semibold text-text-primary">{item.value}</div>
                <div className="mt-0.5 text-caption-1-regular text-text-tertiary">{item.label}</div>
              </div>
            </Surface>
          )
        })}
        <Surface className="col-span-2 flex items-center gap-2.5 p-4 text-body-2-regular text-text-secondary sm:p-5 lg:col-span-1">
          <RiSparklingLine className="size-4 shrink-0 text-accent-600" aria-hidden />
          演示知识库为模拟资料，仅用于展示检索与引用流程。
        </Surface>
      </section>

      <Surface className="mt-4 p-5 sm:p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-caption-1-semibold uppercase tracking-[0.16em] text-accent-600">Retrieval lab</div>
            <h2 className="mt-1.5 text-title-2-semibold text-text-primary">检索测试</h2>
          </div>
          <span className="text-caption-1-regular text-text-tertiary">输入一个问题，看看核查员会拿到哪些证据。</span>
        </div>
        <form
          className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault()
            void runSearch()
          }}
        >
          <Input
            label="检索问题"
            leadingIcon={RiSearchLine}
            value={query}
            onChange={setQuery}
            placeholder="例如：2028 年 AI 眼镜出货量是多少？"
            className="flex-1"
          />
          <Button type="submit" variant="secondary" disabled={searching || !query.trim()}>
            {searching ? '检索中…' : '检索'}
          </Button>
        </form>
        {hits.length > 0 && (
          <div className="mt-5 grid gap-2.5">
            {hits.map((hit) => (
              <div key={hit.chunkId} className="rounded-2xl border border-separator-border bg-background-secondary-default p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-body-2-medium text-text-primary">{hit.docTitle}</span>
                  <Badge color="neutral">score {hit.score.toFixed(2)}</Badge>
                </div>
                <p className="mt-2 text-body-2-regular leading-relaxed text-text-secondary">{hit.text.slice(0, 220)}…</p>
              </div>
            ))}
          </div>
        )}
      </Surface>

      <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data.documents.length === 0 ? (
          <div className="sm:col-span-2 xl:col-span-3">
            <Empty title="知识库还是空的" description="添加第一份资料，Agent 才能开始带引用地研究。" />
          </div>
        ) : (
          data.documents.map((doc) => (
            <Surface key={doc.id} className="group flex min-h-56 flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-9 place-items-center rounded-xl bg-background-tertiary-default text-accent-600">
                  <RiFileTextLine className="size-4" aria-hidden />
                </span>
                <TooltipTrigger>
                  <IconButton
                    icon={RiDeleteBin6Line}
                    size="small"
                    aria-label={`删除 ${doc.title}`}
                    onClick={() => setPendingDelete(doc)}
                    className="text-text-tertiary"
                  />
                  <Tooltip>删除资料</Tooltip>
                </TooltipTrigger>
              </div>
              <h3 className="mt-4 text-title-3-semibold leading-snug text-text-primary">{doc.title}</h3>
              <p className="mt-1 text-caption-1-regular text-text-tertiary">{doc.source}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {doc.tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 rounded-md border border-separator-border px-1.5 py-0.5 text-caption-2-regular text-text-secondary">
                    <RiPriceTag3Line className="size-3" aria-hidden /> {tag}
                  </span>
                ))}
              </div>
              <div className="mt-auto flex items-center gap-3 border-t border-separator-border pt-3 text-caption-1-regular text-text-tertiary">
                <span>{doc.chunkCount} 个片段</span>
                <span>{formatDate(doc.createdAt)}</span>
                <Button variant="ghost" size="xs" trailingIcon={RiArrowRightLine} className="ms-auto" onClick={() => setSelected(doc)}>
                  查看
                </Button>
              </div>
            </Surface>
          ))
        )}
      </section>

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
          <div className="flex flex-col gap-1.5">
            <span className="text-caption-1-semibold text-text-secondary">上传文件</span>
            <label
              className={cx(
                'relative flex cursor-pointer items-center gap-2.5 rounded-2lg border border-dashed border-border-button-default bg-background-tertiary-default px-3 py-3',
                'text-body-2-regular text-text-secondary transition-colors duration-150 hover:bg-background-secondary-hover',
              )}
            >
              <RiUpload2Line className="size-5 text-accent-600" aria-hidden />
              <span className="min-w-0 truncate">{file ? file.name : '选择 .md / .txt 文件'}</span>
              <input
                type="file"
                accept=".md,.markdown,.txt"
                className="sr-only"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
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
          {error && <p className="text-caption-1-medium text-status-rose-text">{error}</p>}
        </form>
      </Modal>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.title ?? ''}
        subtitle={selected?.source}
        wide
      >
        <div className="flex flex-col gap-3">
          {selected?.content.split(/\n{2,}/).map((paragraph, index) => (
            <p key={index} className="text-body-regular leading-8 text-text-secondary">{paragraph}</p>
          ))}
        </div>
      </Modal>

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
        <p className="text-body-regular leading-relaxed text-text-secondary">
          删除后，引用这份资料的报告仍会保留历史快照，但后续运行无法再检索到它。
        </p>
      </Modal>
    </div>
  )
}
