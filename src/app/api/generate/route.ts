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
        temperature: 0.3,
        max_tokens: 4000
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

    const systemPrompt = buildSystemPrompt(templateHtml, templateText, templateInfo)

    const generatedHtml = await tryModels(FREE_MODELS, systemPrompt, prompt)

    return NextResponse.json({ html: generatedHtml })
  } catch (error: any) {
    console.error('Generate error:', error?.message || error)
    return NextResponse.json(
      { error: error?.message || 'Ошибка генерации письма' },
      { status: 500 }
    )
  }
}

function buildSystemPrompt(templateHtml: string, templateText: string, info: any): string {
  const links = (info?.links || []) as string[]
  const phones = (info?.phones || []) as string[]
  const imageSources = (info?.imageSources || []) as string[]
  const fonts = (info?.fonts || ['Calibri', 'Arial', 'sans-serif']) as string[]

  const linksBlock = links.length > 0
    ? `\nССЫЛКИ ИЗ ШАБЛОНА (сохрани их в письме, не удаляй):\n${links.join('\n')}`
    : ''

  const phonesBlock = phones.length > 0
    ? `\nТЕЛЕФОНЫ ИЗ ШАБЛОНА (сохрани в подписи):\n${phones.join('\n')}`
    : ''

  const imagesBlock = imageSources.length > 0
    ? `\nКАРТИНКИ/ЛОГОТИПЫ ИЗ ШАБЛОНА (сохрани все img теги):\n${imageSources.map((src: string) => `<img src="${src}">`).join('\n')}`
    : ''

  return `Ты — HTML-редактор писем для Outlook. Твоя задача — МОДИФИЦИРОВАТЬ существующий HTML-шаблон письма, заменяя только текстовое содержимое по запросу пользователя.

КРИТИЧЕСКИЕ ПРАВИЛА:
1. СОХРАНИ ПОЛНУЮ HTML-СТРУКТУРУ шаблона — все div, table, span, p теги, классы, стили
2. СОХРАНИ ВСЕ КАРТИНКИ (<img>) — не удаляй и не меняй src
3. СОХРАНИ ВСЕ ССЫЛКИ (<a href>) — не удаляй и не меняй href
4. СОХРАНИ ВСЕ СТИЛИ — font-family, font-size, color, margin, padding, background
5. СОХРАНИ ПОДПИСЬ — блок подписи с контактами, телефонами, логотипами
6. ЗАМЕНИ ТОЛЬКО ТЕКСТОВОЕ СОДЕРЖИМОЕ — текст в тегах p, span, td по запросу пользователя
7. НЕ ДОБАВЛЯЙ markdown — никакого ** или * или #
8. НЕ МЕНЯЙ СТРУКТУРУ — если в шаблоне таблица, оставь таблицу. Если div, оставь div.
9. ВЫВОДИ ТОЛЬКО ГОТОВЫЙ HTML — без объяснений, без markdown code blocks, без комментариев
10. Если пользователь просит изменить получателя, тему, содержание — меняй только эти части, остальное оставь как есть

ФОРМАТИРОВАНИЕ РЕЗУЛЬТАТА:
- Полный HTML документ (с <html>, <head>, <body>)
- Inline стили как в оригинальном шаблоне
- Шрифты: ${fonts.join(', ')}
- Цвета ссылок: #0563C1 (стандарт Outlook)${linksBlock}${phonesBlock}${imagesBlock}

ВАЖНО: Выведи ТОЛЬКО HTML, без обёрток, без пояснений. Начни сразу с <!DOCTYPE html> или <html>.`
}
