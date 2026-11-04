import { useMemo, useState } from 'react'
import {
  BookOpen,
  FileText,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useApp } from '../App'
import { api } from '../api'
import { Empty, Modal, PageHeader, Pill } from '../components/ui'
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

  const remove = async (doc: KnowledgeDoc) => {
    if (!window.confirm(`删除「${doc.title}」？`)) return
    await api.deleteDocument(doc.id)
    await refresh()
    if (selected?.id === doc.id) setSelected(null)
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="KNOWLEDGE"
        title="知识库"
        description="团队的事实底座。每个结论都能回到原文，核查员据此判断引用是否成立。"
        actions={
          <button className="btn btn-accent" onClick={() => setOpen(true)}>
            <Plus size={15} /> 添加资料
          </button>
        }
      />

      <section className="kb-summary">
        <div className="kb-stat">
          <BookOpen size={17} />
          <div><strong>{data.documents.length}</strong><span>篇资料</span></div>
        </div>
        <div className="kb-stat">
          <FileText size={17} />
          <div><strong>{totalChunks}</strong><span>个知识片段</span></div>
        </div>
        <div className="kb-stat">
          <Sparkles size={17} />
          <div><strong>BM25</strong><span>中文检索 + 双字回退</span></div>
        </div>
        <div className="kb-stat note">
          <span>演示知识库为模拟资料，仅用于展示检索与引用流程。</span>
        </div>
      </section>

      <section className="panel search-panel">
        <div className="panel-head compact">
          <div>
            <div className="eyebrow">RETRIEVAL LAB</div>
            <h2>检索测试</h2>
          </div>
          <span className="hint">输入一个问题，看看核查员会拿到哪些证据。</span>
        </div>
        <div className="search-bar">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') void runSearch() }}
            placeholder="例如：2028 年 AI 眼镜出货量是多少？"
          />
          <button className="btn btn-dark sm" onClick={runSearch} disabled={searching}>
            {searching ? '检索中…' : '检索'}
          </button>
        </div>
        {hits.length > 0 && (
          <div className="search-results">
            {hits.map((hit) => (
              <div className="search-hit" key={hit.chunkId}>
                <div className="search-hit-head">
                  <strong>{hit.docTitle}</strong>
                  <Pill tone="teal">score {hit.score.toFixed(2)}</Pill>
                </div>
                <p>{hit.text.slice(0, 220)}…</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="doc-grid">
        {data.documents.length === 0 ? (
          <Empty title="知识库还是空的" description="添加第一份资料，Agent 才能开始带引用地研究。" />
        ) : (
          data.documents.map((doc) => (
            <article className="doc-card" key={doc.id}>
              <div className="doc-top">
                <div className="doc-icon"><FileText size={17} /></div>
                <button className="icon-btn danger" onClick={() => remove(doc)} aria-label="删除">
                  <Trash2 size={14} />
                </button>
              </div>
              <h3>{doc.title}</h3>
              <p className="doc-source">{doc.source}</p>
              <div className="doc-tags">
                {doc.tags.map((tag) => <Pill key={tag} tone="muted">{tag}</Pill>)}
              </div>
              <div className="doc-foot">
                <span>{doc.chunkCount} 个片段</span>
                <span>{formatDate(doc.createdAt)}</span>
                <button className="link-btn" onClick={() => setSelected(doc)}>查看</button>
              </div>
            </article>
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
            <button className="btn btn-ghost" onClick={reset}>取消</button>
            <button className="btn btn-accent" onClick={submit} disabled={saving}>
              {saving ? '入库中…' : '入库并切分'}
            </button>
          </>
        }
      >
        <label className="field">
          <span>标题</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：2026 年 AI 眼镜市场追踪" />
        </label>
        <div className="field-row">
          <label className="field">
            <span>来源</span>
            <input value={source} onChange={(event) => setSource(event.target.value)} placeholder="IDC / 公司公告 / 访谈" />
          </label>
          <label className="field">
            <span>标签</span>
            <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="市场, 出货量" />
          </label>
        </div>
        <label className="field">
          <span>上传文件</span>
          <div className="file-drop">
            <Upload size={18} />
            <span>{file ? file.name : '选择 .md / .txt 文件'}</span>
            <input type="file" accept=".md,.markdown,.txt" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </div>
        </label>
        {!file && (
          <label className="field">
            <span>正文</span>
            <textarea
              rows={7}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="粘贴 Markdown 或纯文本，系统会按段落切分并建立索引。"
            />
          </label>
        )}
        {error && <div className="form-error">{error}</div>}
      </Modal>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.title ?? ''}
        subtitle={selected?.source}
        wide
      >
        <div className="doc-reader">
          {selected?.content.split(/\n{2,}/).map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </Modal>
    </div>
  )
}
