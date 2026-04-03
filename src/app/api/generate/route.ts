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
  'mistralai/mistral-7b-instruct:free',
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
        max_tokens: 2000
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
    const { prompt, emailSamples, analysis } = body

    if (!prompt) {
      return NextResponse.json(
        { error: 'Требуется запрос' },
        { status: 400 }
      )
    }

    const hasKey = !!(process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY)
    if (!hasKey) {
      return NextResponse.json(
        { error: 'API ключ не настроен. Добавьте OPENROUTER_API_KEY в переменные окружения Vercel.' },
        { status: 500 }
      )
    }

    const systemPrompt = buildSystemPrompt(emailSamples, analysis)

    const generatedText = await tryModels(FREE_MODELS, systemPrompt, prompt)

    const htmlOutput = textToOutlookHtml(generatedText, analysis)

    return NextResponse.json({
      text: generatedText,
      html: htmlOutput
    })
  } catch (error: any) {
    console.error('Generate error:', error?.message || error)
    return NextResponse.json(
      { error: error?.message || 'Ошибка генерации письма' },
      { status: 500 }
    )
  }
}

function buildSystemPrompt(
  samples: Array<{ subject: string; textPreview: string; htmlPreview?: string }>,
  analysis: any
): string {
  const fonts = analysis?.commonFonts || ['Calibri', 'Arial', 'sans-serif']
  const signatures = analysis?.signatures || []
  const hasImages = analysis?.hasImages

  const samplesText = samples
    .map((s, i) => `Пример ${i + 1}:\nТема: ${s.subject}\n${s.textPreview}`)
    .join('\n\n---\n\n')

  const signatureBlock = signatures.length > 0
    ? `Используй ЭТУ подпись в конце каждого письма (точно как указано):\n${signatures.join('\n---\n')}`
    : 'Включи профессиональную подпись в стиле, соответствующем примерам.'

  return `Ты — эксперт по деловой переписке. Твоя задача — писать профессиональные письма, которые НЕВОЗМОЖНО отличить от написанных человеком.

СТИЛЬ:
- Точно соблюдай тон, формальность и стиль письма из предоставленных примеров
- Используй те же паттерны приветствия и завершения
- Пиши естественно, без шаблонных фраз
- ИЗБЕГАЙ клише ИИ: "надеюсь это письмо найдёт вас в добром здравии", "пожалуйста, не стесняйтесь", "буду рад ответить на вопросы", "всего наилучшего" (если это не стиль автора)
- Будь прямым и профессиональным
- Используй тот же уровень формальности, что в примерах
- Пиши на том же языке, что и запрос пользователя (русский/английский)

ФОРМАТИРОВАНИЕ:
- Шрифты: ${fonts.join(', ')}
- ${signatureBlock}
- ${hasImages ? 'Автор использует картинки/логотипы в письмах — учитывай это' : ''}
- Пиши обычный текст, БЕЗ markdown форматирования
- Короткие абзацы (2-4 предложения)
- Если есть ссылки — используй формат: https://example.com (не гиперссылки текстом)

ПРИМЕРЫ ПИСЕМ ДЛЯ ПОДРАЖАНИЯ:
${samplesText}

Когда пользователь просит написать письмо — пиши его СРАЗУ, без вступлений, объяснений или комментариев.`
}

function textToOutlookHtml(text: string, analysis: any): string {
  const fonts = analysis?.commonFonts || ['Calibri', 'Arial', 'sans-serif']
  const fontFamily = fonts.slice(0, 2).join(', ')
  const signatures = analysis?.signatures || []

  const paragraphs = text.split('\n\n').filter(Boolean)

  const htmlParagraphs = paragraphs.map(p => {
    const lines = p.split('\n').map(line => line.trim()).filter(Boolean)
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

      return `<p style="margin: 0; font-family: ${fontFamily}; font-size: 11pt; color: #000000;">${formatLine(line)}</p>`
    }).join('')
  }).join('')

  const signatureHtml = signatures.length > 0
    ? `<div style="margin-top: 16pt; padding-top: 8pt; border-top: 1px solid #CCCCCC; color: #666666; font-size: 10pt;">${signatures[0]}</div>`
    : ''

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
${htmlParagraphs}
${signatureHtml}
</div>
</body>
</html>`
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
