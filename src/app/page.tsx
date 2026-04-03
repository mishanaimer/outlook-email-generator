'use client'

import { useState, useCallback, useEffect } from 'react'

interface Template {
  id: string
  html: string
  text: string
  fonts: string[]
  hasImages: boolean
  links: string[]
  phones: string[]
  imageSources: string[]
  createdAt: number
}

interface TemplateFolder {
  id: string
  name: string
  templates: Template[]
}

export default function Home() {
  const [folders, setFolders] = useState<TemplateFolder[]>([])
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null)

  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      const html = e.clipboardData?.getData('text/html') || ''
      const text = e.clipboardData?.getData('text/plain') || ''
      if (!html && !text) return

      const target = e.target as HTMLElement
      if (target?.closest('[data-paste-zone]')) return

      if (!activeFolderId) {
        setError('Сначала создайте папку шаблонов')
        return
      }

      addTemplateToFolder(activeFolderId, { html, text })
      e.preventDefault()
    }

    window.addEventListener('paste', handleGlobalPaste)
    return () => window.removeEventListener('paste', handleGlobalPaste)
  }, [activeFolderId])

  const addTemplateToFolder = (folderId: string, { html, text }: { html: string; text: string }) => {
    const fonts = extractFontsFromHtml(html)
    const hasImages = html.includes('<img') || html.includes('src=')
    const links = extractLinks(html || text)
    const phones = extractPhones(html || text)
    const imageSources = extractImageSources(html)

    const template: Template = {
      id: `tpl-${Date.now()}`,
      html,
      text,
      fonts,
      hasImages,
      links,
      phones,
      imageSources,
      createdAt: Date.now()
    }

    setFolders(prev => prev.map(f =>
      f.id === folderId ? { ...f, templates: [...f.templates, template] } : f
    ))
  }

  const createFolder = () => {
    if (!newFolderName.trim()) return
    const folder: TemplateFolder = {
      id: `folder-${Date.now()}`,
      name: newFolderName.trim(),
      templates: []
    }
    setFolders(prev => [...prev, folder])
    setActiveFolderId(folder.id)
    setNewFolderName('')
    setShowNewFolder(false)
  }

  const deleteFolder = (id: string) => {
    setFolders(prev => prev.filter(f => f.id !== id))
    if (activeFolderId === id) {
      setActiveFolderId(null)
      setActiveTemplateId(null)
    }
  }

  const deleteTemplate = (folderId: string, templateId: string) => {
    setFolders(prev => prev.map(f =>
      f.id === folderId ? { ...f, templates: f.templates.filter(t => t.id !== templateId) } : f
    ))
    if (activeTemplateId === templateId) setActiveTemplateId(null)
  }

  const activeFolder = folders.find(f => f.id === activeFolderId) || null
  const activeTemplate = activeFolder?.templates.find(t => t.id === activeTemplateId) || null

  const generateEmail = async () => {
    if (!prompt || !activeTemplate) return

    setGenerating(true)
    setError(null)

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          templateHtml: activeTemplate.html,
          templateText: activeTemplate.text,
          templateInfo: {
            fonts: activeTemplate.fonts,
            hasImages: activeTemplate.hasImages,
            links: activeTemplate.links,
            phones: activeTemplate.phones,
            imageSources: activeTemplate.imageSources
          }
        })
      })

      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.error || 'Не удалось сгенерировать письмо')
      }

      const data = await res.json()
      setResult(data.html)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка')
    } finally {
      setGenerating(false)
    }
  }

  const copyToClipboard = async () => {
    if (!result) return
    setCopied(false)
    try {
      const blob = new Blob([result], { type: 'text/html' })
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': blob })])
    } catch {
      await navigator.clipboard.writeText(result)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const downloadHtml = () => {
    if (!result) return
    const blob = new Blob([result], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'письмо.html'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b px-4 py-2 flex items-center justify-between shrink-0">
        <h1 className="text-lg font-bold text-gray-900">Генератор писем Outlook</h1>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {activeFolder && <span>Папка: <b className="text-gray-700">{activeFolder.name}</b></span>}
          {activeTemplate && activeFolder && <span>• Шаблон: <b className="text-gray-700">#{activeFolder.templates.indexOf(activeTemplate) + 1}</b></span>}
        </div>
      </header>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border-b px-4 py-2 text-sm text-red-700 shrink-0 flex items-center">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-2">✕</button>
        </div>
      )}

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Folders & Templates */}
        <div className="w-72 bg-white border-r flex flex-col shrink-0">
          {/* Folders */}
          <div className="p-2 border-b shrink-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-gray-500 uppercase">Папки шаблонов</span>
              <button
                onClick={() => setShowNewFolder(true)}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                + Новая
              </button>
            </div>

            {showNewFolder && (
              <div className="flex gap-1 mb-1">
                <input
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createFolder()}
                  placeholder="Название папки..."
                  className="flex-1 px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  autoFocus
                />
                <button onClick={createFolder} className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">OK</button>
                <button onClick={() => setShowNewFolder(false)} className="px-1 text-xs text-gray-400 hover:text-gray-600">✕</button>
              </div>
            )}

            <div className="space-y-0.5">
              {folders.map(folder => (
                <div
                  key={folder.id}
                  className={`flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer text-sm ${
                    activeFolderId === folder.id ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50 text-gray-700'
                  }`}
                  onClick={() => { setActiveFolderId(folder.id); setActiveTemplateId(null) }}
                >
                  <span className="flex-1 truncate">📁 {folder.name}</span>
                  <span className="text-xs text-gray-400">{folder.templates.length}</span>
                  <button
                    onClick={e => { e.stopPropagation(); deleteFolder(folder.id) }}
                    className="text-gray-300 hover:text-red-500 text-xs"
                  >✕</button>
                </div>
              ))}
            </div>
          </div>

          {/* Templates in active folder */}
          {activeFolder && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="p-2 border-b shrink-0">
                <div
                  onDrop={e => {
                    e.preventDefault()
                    const html = e.dataTransfer.getData('text/html')
                    const text = e.dataTransfer.getData('text/plain')
                    if (html || text) addTemplateToFolder(activeFolder.id, { html, text })
                  }}
                  onDragOver={e => e.preventDefault()}
                  data-paste-zone
                  className="border-2 border-dashed border-gray-200 rounded-lg p-2 text-center hover:border-blue-400 transition-colors"
                  tabIndex={0}
                >
                  <p className="text-xs text-gray-400">Ctrl+V или перетащите</p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {activeFolder.templates.map((tpl, i) => (
                  <div
                    key={tpl.id}
                    className={`p-2 rounded border text-xs cursor-pointer ${
                      activeTemplateId === tpl.id ? 'bg-blue-50 border-blue-300' : 'bg-gray-50 hover:bg-gray-100'
                    }`}
                    onClick={() => { setActiveTemplateId(tpl.id); setPreviewTemplate(tpl) }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-700">Шаблон {i + 1}</span>
                      <button
                        onClick={e => { e.stopPropagation(); deleteTemplate(activeFolder.id, tpl.id) }}
                        className="text-gray-300 hover:text-red-500"
                      >✕</button>
                    </div>
                    <div className="text-gray-400 space-y-0.5">
                      {tpl.fonts.length > 0 && <div>Шрифт: {tpl.fonts[0]}</div>}
                      {tpl.hasImages && <div>🖼 Картинки</div>}
                      {tpl.links.length > 0 && <div>🔗 Ссылки: {tpl.links.length}</div>}
                      {tpl.phones.length > 0 && <div>📞 Телефоны: {tpl.phones.length}</div>}
                    </div>
                  </div>
                ))}

                {activeFolder.templates.length === 0 && (
                  <div className="text-center text-gray-400 text-xs py-8">
                    Вставьте письмо из Outlook (Ctrl+V) чтобы создать шаблон
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Center: Prompt + Generate */}
        <div className="flex-1 flex flex-col">
          {activeTemplate ? (
            <div className="flex-1 flex flex-col p-4">
              <div className="mb-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-xs text-blue-700 font-medium mb-1">Выбран шаблон:</p>
                <p className="text-xs text-blue-600">
                  Шрифты: {activeTemplate.fonts.join(', ') || 'не определены'}
                  {activeTemplate.hasImages && ' • Картинки'}
                  {activeTemplate.links.length > 0 && ` • Ссылки: ${activeTemplate.links.length}`}
                  {activeTemplate.phones.length > 0 && ` • Телефоны: ${activeTemplate.phones.length}`}
                </p>
              </div>

              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder='Например: "создай письмо для Виктории с базовыми стоимостями для IT-отдела"'
                className="flex-1 p-4 border rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />

              <button
                onClick={generateEmail}
                disabled={generating || !prompt}
                className="mt-3 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                {generating ? 'Генерирую...' : 'Сгенерировать письмо по шаблону'}
              </button>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <p className="text-lg mb-2">Выберите или создайте папку шаблонов</p>
                <p className="text-sm">Скопируйте письмо из Outlook → нажмите Ctrl+V в выбранную папку</p>
              </div>
            </div>
          )}
        </div>

        {/* Right: Result */}
        <div className="w-[480px] bg-white border-l flex flex-col shrink-0">
          {result ? (
            <>
              <div className="flex-1 overflow-y-auto p-4">
                <div
                  className="bg-gray-50 rounded-lg p-4 text-sm"
                  dangerouslySetInnerHTML={{ __html: result }}
                />
              </div>
              <div className="p-3 border-t flex gap-2 shrink-0">
                <button
                  onClick={copyToClipboard}
                  className="flex-1 py-2 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                >
                  {copied ? '✓ Скопировано' : 'Копировать'}
                </button>
                <button
                  onClick={downloadHtml}
                  className="flex-1 py-2 bg-gray-700 text-white text-xs rounded hover:bg-gray-800"
                >
                  Скачать HTML
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              Результат появится здесь
            </div>
          )}
        </div>
      </div>

      {/* Template preview modal */}
      {previewTemplate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setPreviewTemplate(null)}>
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[80vh] flex flex-col m-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 border-b">
              <h3 className="font-medium">Предпросмотр шаблона</h3>
              <button onClick={() => setPreviewTemplate(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div dangerouslySetInnerHTML={{ __html: previewTemplate.html }} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function extractFontsFromHtml(html: string): string[] {
  if (!html) return []
  const fonts = new Set<string>()
  const regex = /font-family:\s*([^;"'}]+)/gi
  let match
  while ((match = regex.exec(html)) !== null) {
    match[1].split(',').forEach(f => fonts.add(f.trim().replace(/['"]/g, '')))
  }
  return fonts.size > 0 ? Array.from(fonts) : []
}

function extractLinks(content: string): string[] {
  const links: string[] = []
  const hrefRegex = /href=["'](https?:\/\/[^"']+)["']/gi
  let match
  while ((match = hrefRegex.exec(content)) !== null) {
    if (!links.includes(match[1])) links.push(match[1])
  }
  const urlRegex = /(https?:\/\/[^\s<>"')]+)/gi
  while ((match = urlRegex.exec(content)) !== null) {
    if (!links.includes(match[1])) links.push(match[1])
  }
  return links
}

function extractPhones(content: string): string[] {
  const phones: string[] = []
  const phoneRegex = /(?:\+7|8)[\s\-\(]*\d{3}[\s\-\)]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}/g
  let match
  while ((match = phoneRegex.exec(content)) !== null) {
    phones.push(match[0])
  }
  return phones
}

function extractImageSources(html: string): string[] {
  const sources: string[] = []
  const srcRegex = /src=["']([^"']+)["']/gi
  let match
  while ((match = srcRegex.exec(html)) !== null) {
    if (!sources.includes(match[1]) && !match[1].startsWith('data:')) {
      sources.push(match[1])
    }
  }
  return sources
}
