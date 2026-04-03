import { NextRequest, NextResponse } from 'next/server'
import { parseEml, parseMsg, parseRawText } from '@/lib/email-parser'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const files = formData.getAll('emails') as File[]

    const pastedHtml = formData.getAll('pasted_html') as string[]
    const pastedText = formData.getAll('pasted_text') as string[]

    if (!files.length && !pastedHtml.length) {
      return NextResponse.json(
        { error: 'Не предоставлено ни файлов, ни вставленных писем' },
        { status: 400 }
      )
    }

    const parsedEmails: Array<{
      from: string; to: string; subject: string; text: string;
      html: string; signature: string | null; fonts: string[];
      hasImages: boolean; links: string[]; phones: string[]; imageSources: string[]
    }> = []

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer())
      const fileName = file.name.toLowerCase()
      let parsed

      if (fileName.endsWith('.eml')) {
        parsed = await parseEml(buffer)
      } else if (fileName.endsWith('.msg')) {
        parsed = parseMsg(buffer)
      } else {
        const text = buffer.toString('utf-8')
        parsed = parseRawText(text)
      }

      parsedEmails.push({
        from: parsed.from,
        to: parsed.to,
        subject: parsed.subject,
        text: parsed.text,
        html: parsed.html,
        signature: parsed.signature,
        fonts: parsed.fonts,
        hasImages: parsed.images.length > 0,
        links: extractLinks(parsed.html || parsed.text),
        phones: extractPhones(parsed.html || parsed.text),
        imageSources: extractImageSources(parsed.html)
      })
    }

    for (let i = 0; i < pastedHtml.length; i++) {
      const html = pastedHtml[i] || ''
      const text = pastedText[i] || ''
      const fonts = extractFonts(html)
      const signature = extractSignature(html || text)
      const hasImages = html.includes('<img') || html.includes('src=')

      parsedEmails.push({
        from: '',
        to: '',
        subject: '',
        text,
        html,
        signature,
        fonts,
        hasImages,
        links: extractLinks(html || text),
        phones: extractPhones(html || text),
        imageSources: extractImageSources(html)
      })
    }

    const allLinks = parsedEmails.flatMap(e => e.links)
    const allPhones = parsedEmails.flatMap(e => e.phones)
    const allImages = parsedEmails.flatMap(e => e.imageSources)

    const analysis = {
      emailCount: parsedEmails.length,
      commonFonts: extractCommonFonts(parsedEmails),
      signatures: parsedEmails.map(e => e.signature).filter(Boolean),
      hasImages: parsedEmails.some(e => e.hasImages),
      averageLength: Math.round(
        parsedEmails.reduce((sum, e) => sum + e.text.length, 0) / parsedEmails.length
      ),
      links: [...new Set(allLinks)],
      phones: [...new Set(allPhones)],
      imageSources: [...new Set(allImages)],
      samples: parsedEmails.slice(0, 3).map(e => ({
        subject: e.subject || 'Вставленное письмо',
        textPreview: e.text.substring(0, 500),
        htmlPreview: e.html.substring(0, 2000)
      }))
    }

    return NextResponse.json({ analysis, parsedEmails })
  } catch (error) {
    console.error('Analyze error:', error)
    return NextResponse.json(
      { error: 'Ошибка анализа писем' },
      { status: 500 }
    )
  }
}

function extractFonts(html: string): string[] {
  const fontFamilies = new Set<string>()
  const regex = /font-family:\s*([^;"'}]+)/gi
  let match

  while ((match = regex.exec(html)) !== null) {
    const fonts = match[1].split(',').map(f => f.trim().replace(/['"]/g, ''))
    fonts.forEach(f => fontFamilies.add(f))
  }

  return fontFamilies.size > 0 ? Array.from(fontFamilies) : ['Calibri', 'Arial', 'sans-serif']
}

function extractSignature(content: string): string | null {
  const signatures = content.split(/--\s*\n|_\s*\n|Regards|Best regards|С уважением|С наилучшими пожеланиями|Kind regards/i)

  if (signatures.length > 1) {
    const sig = signatures.slice(1).join('').trim()
    if (sig.length > 5 && sig.length < 1000) {
      return sig
    }
  }

  const htmlSigRegex = /<div\s+class="[^"]*signature[^"]*"[^>]*>([\s\S]*?)<\/div>/i
  const htmlMatch = htmlSigRegex.exec(content)
  return htmlMatch ? htmlMatch[1].trim() : null
}

function extractCommonFonts(emails: Array<{ fonts: string[] }>): string[] {
  const fontCounts: Record<string, number> = {}

  emails.forEach(email => {
    email.fonts.forEach(font => {
      fontCounts[font] = (fontCounts[font] || 0) + 1
    })
  })

  return Object.entries(fontCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([font]) => font)
}

function extractLinks(content: string): string[] {
  const links: string[] = []
  const hrefRegex = /href=["'](https?:\/\/[^"']+)["']/gi
  let match
  while ((match = hrefRegex.exec(content)) !== null) {
    links.push(match[1])
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
    sources.push(match[1])
  }
  return sources
}
