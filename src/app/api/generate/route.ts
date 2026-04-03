import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || ''
})

const FREE_MODELS = [
  'openrouter/free',
  'google/gemma-3-27b-it:free',
  'meta-llama/llama-3.3-8b-instruct:free',
  'qwen/qwen2.5-72b-instruct:free'
]

async function tryModels(models: string[], systemPrompt: string, userPrompt: string) {
  for (const model of models) {
    try {
      const response = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 1500
      })
      return response.choices[0].message.content || ''
    } catch (err: any) {
      console.warn(`Model ${model} failed:`, err?.message || err)
    }
  }
  throw new Error('Все бесплатные модели недоступны')
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { prompt, templateHtml, templateText, templateInfo } = body

    if (!prompt || !templateHtml) {
      return NextResponse.json(
        { error: 'Требуются запрос и HTML шаблона' },
        { status: 400 }
      )
    }

    const hasKey = !!(process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY)
    if (!hasKey) {
      return NextResponse.json(
        { error: 'API ключ не настроен' },
        { status: 500 }
      )
    }

    const systemPrompt = buildSystemPrompt(templateText, templateInfo)

    const generatedText = await tryModels(FREE_MODELS, systemPrompt, prompt)

    const resultHtml = injectTextIntoTemplate(generatedText, templateHtml, templateInfo)

    return NextResponse.json({ html: resultHtml, text: generatedText })
  } catch (error: any) {
    console.error('Generate error:', error?.message || error)
    return NextResponse.json(
      { error: error?.message || 'Ошибка генерации письма' },
      { status: 500 }
    )
  }
}

function buildSystemPrompt(templateText: string, info: any): string {
  const links = (info?.links || []) as string[]
  const phones = (info?.phones || []) as string[]
  const fonts = (info?.fonts || ['Calibri', 'Arial', 'sans-serif']) as string[]

  const linksBlock = links.length > 0
    ? `\nССЫЛКИ (используй когда уместно):\n${links.join('\n')}`
    : ''

  const phonesBlock = phones.length > 0
    ? `\nТЕЛЕФОНЫ (используй в подписи когда уместно):\n${phones.join('\n')}`
    : ''

  return `Ты — ассистент по деловой переписке. Пиши текст письма НА РУССКОМ ЯЗЫКЕ.

ПРАВИЛА:
1. Пиши ТОЛЬКО ТЕКСТ письма — БЕЗ HTML, БЕЗ markdown, БЕЗ обёрток
2. Пиши НА РУССКОМ ЯЗЫКЕ (если пользователь не просит другой язык)
3. НЕ пиши вступления типа "Вот ваше письмо:" или "Конечно!"
4. НЕ пиши заключений типа "Надеюсь, это поможет"
5. Используй стиль и тон из примеров ниже
6. Короткие абзацы (2-4 предложения)
7. Разделяй абзацы ДВОЙНЫМ переносом строки

ФОРМАТИРОВАНИЕ:
- Шрифты: ${fonts.join(', ')}
- Обычный текст, без форматирования${linksBlock}${phonesBlock}

ПРИМЕР ТЕКСТА ИЗ ШАБЛОНА (для понимания стиля):
---
${templateText.substring(0, 1500)}
---

Напиши текст письма по запросу пользователя. ТОЛЬКО ТЕКСТ, ничего больше.`
}

function injectTextIntoTemplate(generatedText: string, templateHtml: string, info: any): string {
  const fonts = (info?.fonts || ['Calibri', 'Arial', 'sans-serif']) as string[]
  const fontFamily = fonts.slice(0, 2).join(', ')

  const paragraphs = generatedText
    .split('\n\n')
    .filter(p => p.trim())

  const bodyHtml = paragraphs.map(p => {
    const lines = p.split('\n').map(l => l.trim()).filter(Boolean)
    return lines.map(line => {
      const isSignature = line.startsWith('--') ||
        line.toLowerCase().includes('с уважением') ||
        line.toLowerCase().includes('best regards') ||
        line.toLowerCase().includes('kind regards') ||
        line.toLowerCase().includes('с наилучшими')

      if (isSignature) {
        return `<p style="margin-top: 12pt; color: #666666; font-size: 10pt;">${formatLine(line)}</p>`
      }

      const isLink = /^https?:\/\//.test(line)
      if (isLink) {
        return `<p style="margin: 0; font-family: ${fontFamily}; font-size: 11pt;"><a href="${escapeHtml(line)}" style="color: #0563C1; text-decoration: underline;">${escapeHtml(line)}</a></p>`
      }

      const isPhone = /(?:\+7|8)[\s\-\(]*\d{3}[\s\-\)]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}/.test(line)
      if (isPhone) {
        return `<p style="margin: 0; font-family: ${fontFamily}; font-size: 11pt;"><a href="tel:${line.replace(/\D/g, '')}" style="color: #0563C1; text-decoration: none;">${escapeHtml(line)}</a></p>`
      }

      return `<p style="margin: 0; font-family: ${fontFamily}; font-size: 11pt; color: #000000;">${formatLine(line)}</p>`
    }).join('')
  }).join('')

  const signatureHtml = extractSignatureFromTemplate(templateHtml)

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="color-scheme" content="light">
<!--[if mso]>
<style type="text/css">
body, table, td {font-family: ${fontFamily}, Arial, sans-serif !important; font-size: 11pt !important;}
</style>
<![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #FFFFFF;">
<div style="font-family: ${fontFamily}; font-size: 11pt; color: #000000; line-height: 1.4;">
${bodyHtml}
${signatureHtml}
</div>
</body>
</html>`
}

function extractSignatureFromTemplate(templateHtml: string): string {
  const signaturePatterns = [
    /(<div[^>]*class="[^"]*signature[^"]*"[^>]*>[\s\S]*?<\/div>)/i,
    /(<div[^>]*style="[^"]*border-top[^"]*"[^>]*>[\s\S]*?<\/div>)/i,
    /(<p[^>]*style="[^"]*color:\s*#666666[^"]*"[^>]*>[\s\S]*?<\/p>)/i,
    /(<table[^>]*class="[^"]*signature[^"]*"[^>]*>[\s\S]*?<\/table>)/i,
  ]

  for (const pattern of signaturePatterns) {
    const match = pattern.exec(templateHtml)
    if (match) {
      return `<div style="margin-top: 16pt; padding-top: 8pt;">${match[1]}</div>`
    }
  }

  return ''
}

function formatLine(line: string): string {
  let formatted = escapeHtml(line)
  formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  formatted = formatted.replace(/\*(.+?)\*/g, '<em>$1</em>')
  formatted = formatted.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color: #0563C1; text-decoration: underline;">$1</a>')
  return formatted
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
