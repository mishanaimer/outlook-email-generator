'use client'

import { useState, useCallback, useEffect } from 'react'

interface Analysis {
  emailCount: number
  commonFonts: string[]
  signatures: string[]
  hasImages: boolean
  averageLength: number
  links: string[]
  phones: string[]
  imageSources: string[]
  samples: Array<{ subject: string; textPreview: string; htmlPreview: string }>
}

interface EmailSample {
  id: string
  type: 'file' | 'paste'
  name?: string
  html: string
  text: string
  fonts: string[]
  hasImages: boolean
}

export default function Home() {
  const [samples, setSamples] = useState<EmailSample[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [prompt, setPrompt] = useState('')
  const [result, setResult] = useState<{ text: string; html: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<'samples' | 'generate' | 'result'>('samples')

  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      const html = e.clipboardData?.getData('text/html') || ''
      const text = e.clipboardData?.getData('text/plain') || ''
      if (!html && !text) return

      const target = e.target as HTMLElement
      if (target?.closest('[data-paste-zone]')) return

      const fonts = extractFontsFromHtml(html)
      const hasImages = html.includes('<img') || html.includes('src=')

      setSamples(prev => [...prev, {
        id: `paste-${Date.now()}`,
        type: 'paste',
        html,
        text,
        fonts,
        hasImages
      }])

      e.preventDefault()
    }

    window.addEventListener('paste', handleGlobalPaste)
    return () => window.removeEventListener('paste', handleGlobalPaste)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const droppedFiles = Array.from(e.dataTransfer.files)
    droppedFiles.forEach(file => {
      setSamples(prev => [...prev, {
        id: `file-${Date.now()}-${file.name}`,
        type: 'file',
        name: file.name,
        html: '',
        text: '',
        fonts: [],
        hasImages: false,
        _file: file
      } as any])
    })
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      Array.from(e.target.files).forEach(file => {
        setSamples(prev => [...prev, {
          id: `file-${Date.now()}-${file.name}`,
          type: 'file',
          name: file.name,
          html: '',
          text: '',
          fonts: [],
          hasImages: false,
          _file: file
        } as any])
      })
    }
  }

  const removeSample = (id: string) => {
    setSamples(prev => prev.filter(s => s.id !== id))
  }

  const analyzeEmails = async () => {
    if (samples.length === 0) return

    setAnalyzing(true)
    setError(null)

    try {
      const formData = new FormData()
      samples.forEach(s => {
        if (s.type === 'file' && (s as any)._file) {
          formData.append('emails', (s as any)._file)
        } else {
          formData.append('pasted_html', s.html)
          formData.append('pasted_text', s.text)
        }
      })

      const res = await fetch('/api/analyze', { method: 'POST', body: formData })

      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.error || 'Не удалось проанализировать письма')
      }

      const data = await res.json()
      setAnalysis(data.analysis)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка')
    } finally {
      setAnalyzing(false)
    }
  }

  const generateEmail = async () => {
    if (!prompt || !analysis) return

    setGenerating(true)
    setError(null)

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, emailSamples: analysis.samples, analysis })
      })

      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.error || 'Не удалось сгенерировать письмо')
      }

      setResult(await res.json())
      setActiveTab('result')
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
      const blob = new Blob([result.html], { type: 'text/html' })
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': blob })])
    } catch {
      await navigator.clipboard.writeText(result.text)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const downloadHtml = () => {
    if (!result) return
    const blob = new Blob([result.html], { type: 'text/html' })
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
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {(['samples', 'generate', 'result'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                activeTab === tab
                  ? 'bg-white shadow text-gray-900 font-medium'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'samples' ? `Примеры (${samples.length})` : tab === 'generate' ? 'Запрос' : 'Результат'}
            </button>
          ))}
        </div>
      </header>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border-b px-4 py-2 text-sm text-red-700 shrink-0">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-700">✕</button>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel - Samples */}
        <div className={`w-80 bg-white border-r flex flex-col shrink-0 ${activeTab !== 'samples' ? 'hidden lg:flex' : ''}`}>
          <div className="p-3 border-b shrink-0">
            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              data-paste-zone
              className="border-2 border-dashed border-gray-300 rounded-lg p-3 text-center hover:border-blue-400 transition-colors cursor-pointer"
              tabIndex={0}
            >
              <p className="text-xs text-gray-500 mb-1">Перетащите файлы или Ctrl+V</p>
              <label className="inline-block px-3 py-1 bg-blue-600 text-white text-xs rounded cursor-pointer hover:bg-blue-700">
                Выбрать файлы
                <input type="file" multiple accept=".msg,.eml,.txt,.html" onChange={handleFileSelect} className="hidden" />
              </label>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {samples.map(sample => (
              <div key={sample.id} className="p-2 bg-gray-50 rounded border text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-gray-700 truncate">
                    {sample.type === 'file' ? `📄 ${sample.name}` : '📋 Вставлено'}
                  </span>
                  <button onClick={() => removeSample(sample.id)} className="text-red-400 hover:text-red-600 ml-1">✕</button>
                </div>
                <div className="text-gray-400">
                  {sample.fonts.length > 0 && `Шрифты: ${sample.fonts.slice(0, 2).join(', ')}`}
                  {sample.hasImages && ' • Картинки'}
                </div>
              </div>
            ))}

            {samples.length > 0 && (
              <button
                onClick={analyzeEmails}
                disabled={analyzing}
                className="w-full py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {analyzing ? 'Анализирую...' : `Анализировать (${samples.length})`}
              </button>
            )}
          </div>

          {analysis && (
            <div className="p-2 bg-green-50 border-t text-xs text-green-700 shrink-0">
              <div>Писем: {analysis.emailCount} • Шрифты: {analysis.commonFonts.join(', ')}</div>
              {analysis.links.length > 0 && <div className="mt-1">Ссылки: {analysis.links.length}</div>}
              {analysis.phones.length > 0 && <div>Телефоны: {analysis.phones.length}</div>}
              {analysis.hasImages && <div>Картинки: да</div>}
            </div>
          )}
        </div>

        {/* Center panel - Generate */}
        <div className={`flex-1 flex flex-col ${activeTab !== 'generate' ? 'hidden lg:flex' : ''}`}>
          <div className="flex-1 p-4 flex flex-col">
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder='Например: "создай письмо для Виктории с базовыми стоимостями для IT-отдела"'
              className="flex-1 p-4 border rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
            <button
              onClick={generateEmail}
              disabled={generating || !prompt || !analysis}
              className="mt-3 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              {generating ? 'Генерирую...' : 'Сгенерировать письмо'}
            </button>
          </div>
        </div>

        {/* Right panel - Result */}
        <div className={`w-96 bg-white border-l flex flex-col shrink-0 ${activeTab !== 'result' ? 'hidden lg:flex' : ''}`}>
          {result ? (
            <>
              <div className="flex-1 overflow-y-auto p-4">
                <div
                  className="bg-gray-50 rounded-lg p-4 text-sm"
                  dangerouslySetInnerHTML={{ __html: result.html }}
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
