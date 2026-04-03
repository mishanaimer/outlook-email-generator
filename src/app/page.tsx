'use client'

import { useState, useCallback, useRef } from 'react'

interface Analysis {
  emailCount: number
  commonFonts: string[]
  signatures: string[]
  hasImages: boolean
  averageLength: number
  samples: Array<{ subject: string; textPreview: string }>
}

interface PastedEmail {
  html: string
  text: string
  fonts: string[]
  hasImages: boolean
  source: 'clipboard'
}

export default function Home() {
  const [files, setFiles] = useState<File[]>([])
  const [pastedEmails, setPastedEmails] = useState<PastedEmail[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [prompt, setPrompt] = useState('')
  const [result, setResult] = useState<{ text: string; html: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const pasteRef = useRef<HTMLDivElement>(null)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const droppedFiles = Array.from(e.dataTransfer.files)
    setFiles(prev => [...prev, ...droppedFiles])
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(prev => [...prev, ...Array.from(e.target.files!)])
    }
  }

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const html = e.clipboardData.getData('text/html')
    const text = e.clipboardData.getData('text/plain')

    if (html || text) {
      const fonts = extractFontsFromHtml(html)
      const hasImages = html.includes('<img') || html.includes('src=')

      setPastedEmails(prev => [...prev, {
        html: html || '',
        text: text || '',
        fonts,
        hasImages,
        source: 'clipboard'
      }])

      e.preventDefault()
    }
  }, [])

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const removePasted = (index: number) => {
    setPastedEmails(prev => prev.filter((_, i) => i !== index))
  }

  const analyzeEmails = async () => {
    if (files.length === 0 && pastedEmails.length === 0) return

    setAnalyzing(true)
    setError(null)

    try {
      const formData = new FormData()
      files.forEach(file => formData.append('emails', file))

      pastedEmails.forEach((email, i) => {
        formData.append(`pasted_${i}_html`, email.html)
        formData.append(`pasted_${i}_text`, email.text)
      })

      const res = await fetch('/api/analyze', {
        method: 'POST',
        body: formData
      })

      if (!res.ok) throw new Error('Не удалось проанализировать письма')

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
        body: JSON.stringify({
          prompt,
          emailSamples: analysis.samples,
          analysis
        })
      })

      if (!res.ok) throw new Error('Не удалось сгенерировать письмо')

      const data = await res.json()
      setResult(data)
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
      await navigator.clipboard.write([
        new ClipboardItem({ 'text/html': blob })
      ])
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      await navigator.clipboard.writeText(result.text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
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

  const totalSamples = files.length + pastedEmails.length

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Генератор писем Outlook</h1>
          <p className="text-gray-600 mt-1">Загрузите ваши письма, опишите что нужно — получите готовое письмо в стиле Outlook</p>
        </header>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">1. Загрузите примеры писем</h2>

          <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            onPaste={handlePaste}
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors focus-within:border-blue-500 focus-within:bg-blue-50/30"
            tabIndex={0}
          >
            <p className="text-gray-500 mb-2">Перетащите .msg, .eml, текстовые файлы или нажмите Ctrl+V для вставки из буфера</p>
            <p className="text-sm text-gray-400 mb-4">При вставке из Outlook сохраняются шрифты, ссылки, картинки и подписи</p>
            <label className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 transition-colors">
              Выбрать файлы
              <input
                type="file"
                multiple
                accept=".msg,.eml,.txt,.html"
                onChange={handleFileSelect}
                className="hidden"
              />
            </label>
          </div>

          <div
            ref={pasteRef}
            onPaste={handlePaste}
            className="mt-3 p-4 bg-white border rounded-lg"
            tabIndex={0}
          >
            <p className="text-sm text-gray-500 mb-2">Или вставьте письмо сюда (Ctrl+V):</p>
            <div
              contentEditable
              suppressContentEditableWarning
              onPaste={handlePaste}
              className="min-h-[100px] p-3 border border-gray-200 rounded text-sm text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              dangerouslySetInnerHTML={{ __html: '<span>Нажмите Ctrl+V чтобы вставить письмо из Outlook...</span>' }}
              onInput={e => {
                const el = e.currentTarget
                if (el.textContent === 'Нажмите Ctrl+V чтобы вставить письмо из Outlook...') return
                const html = el.innerHTML
                const text = el.textContent || ''
                const fonts = extractFontsFromHtml(html)
                const hasImages = html.includes('<img')

                setPastedEmails(prev => [...prev, {
                  html,
                  text,
                  fonts,
                  hasImages,
                  source: 'clipboard'
                }])
                el.innerHTML = '<span>Нажмите Ctrl+V чтобы вставить письмо из Outlook...</span>'
              }}
            />
          </div>

          {totalSamples > 0 && (
            <div className="mt-4 space-y-2">
              {files.map((file, i) => (
                <div key={`file-${i}`} className="flex items-center justify-between p-3 bg-white rounded-lg border">
                  <span className="text-sm text-gray-700 truncate">📄 {file.name}</span>
                  <button
                    onClick={() => removeFile(i)}
                    className="text-red-500 hover:text-red-700 ml-2 text-sm"
                  >
                    Удалить
                  </button>
                </div>
              ))}

              {pastedEmails.map((email, i) => (
                <div key={`paste-${i}`} className="p-3 bg-white rounded-lg border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-700">📋 Вставлено из буфера</span>
                    <button
                      onClick={() => removePasted(i)}
                      className="text-red-500 hover:text-red-700 text-sm"
                    >
                      Удалить
                    </button>
                  </div>
                  <div className="text-xs text-gray-500">
                    Шрифты: {email.fonts.join(', ') || 'не определены'}
                    {email.hasImages && ' • Картинки найдены'}
                  </div>
                  {email.html && (
                    <div
                      className="mt-2 p-2 bg-gray-50 rounded text-sm max-h-32 overflow-auto"
                      dangerouslySetInnerHTML={{ __html: email.html.substring(0, 500) + (email.html.length > 500 ? '...' : '') }}
                    />
                  )}
                </div>
              ))}

              <button
                onClick={analyzeEmails}
                disabled={analyzing}
                className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {analyzing ? 'Анализирую...' : `Анализировать ${totalSamples} пример(ов)`}
              </button>
            </div>
          )}

          {analysis && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-800">
                Проанализировано: {analysis.emailCount} писем • Шрифты: {analysis.commonFonts.join(', ')} •
                {analysis.hasImages ? ' Картинки найдены •' : ''}
                Средняя длина: {analysis.averageLength} символов
              </p>
              {analysis.signatures.length > 0 && (
                <p className="text-sm text-green-700 mt-2">Подписей найдено: {analysis.signatures.length}</p>
              )}
            </div>
          )}
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">2. Опишите какое письмо нужно</h2>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder='Например: "создай письмо для Виктории с базовыми стоимостями для IT-отдела"'
            className="w-full h-32 p-4 border rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            onClick={generateEmail}
            disabled={generating || !prompt || !analysis}
            className="mt-3 w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? 'Генерирую...' : 'Сгенерировать письмо'}
          </button>
        </section>

        {result && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">3. Результат</h2>
            <div className="bg-white border rounded-lg p-6 mb-4">
              <div
                className="prose max-w-none"
                dangerouslySetInnerHTML={{ __html: result.html }}
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={copyToClipboard}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {copied ? '✓ Скопировано' : 'Копировать в буфер'}
              </button>
              <button
                onClick={downloadHtml}
                className="flex-1 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors"
              >
                Скачать HTML
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
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
