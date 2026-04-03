import { simpleParser } from 'mailparser'
import MSGReader from '@kenjiuno/msgreader'

export interface ParsedEmail {
  from: string
  to: string
  subject: string
  text: string
  html: string
  signature: string | null
  fonts: string[]
  images: Array<{ cid: string; data: Buffer | null }>
  rawHtml: string
}

export async function parseEml(fileBuffer: Buffer): Promise<ParsedEmail> {
  const parsed = await simpleParser(fileBuffer)

  const html = parsed.html || ''
  const fonts = extractFonts(html)
  const signature = extractSignature(html || parsed.textAsHtml || '')
  const images = (parsed.attachments || []).map(att => ({
    cid: att.contentId || '',
    data: att.content as Buffer | null
  })).filter(img => img.cid)

  const addressText = (addr: any) => {
    if (!addr) return ''
    if (Array.isArray(addr)) return addr.map(a => a.text).join(', ')
    return addr.text || ''
  }

  return {
    from: addressText(parsed.from),
    to: addressText(parsed.to),
    subject: parsed.subject || '',
    text: parsed.text || '',
    html,
    signature,
    fonts,
    images,
    rawHtml: html
  }
}

export function parseMsg(fileBuffer: Buffer): ParsedEmail {
  const reader = new MSGReader(fileBuffer.buffer as ArrayBuffer)
  const fileData = reader.getFileData()

  const html = fileData.bodyHtml || fileData.body || ''
  const fonts = extractFonts(html)
  const signature = extractSignature(html || fileData.body || '')
  const images = (fileData.attachments || []).map((att: any) => ({
    cid: att.contentId || att.cid || '',
    data: att.contentBuffer ? Buffer.from(att.contentBuffer) : null
  })).filter((img: any) => img.cid)

  return {
    from: fileData.senderEmail || fileData.senderName || '',
    to: (fileData as any).displayTo || '',
    subject: fileData.subject || '',
    text: fileData.body || '',
    html,
    signature,
    fonts,
    images,
    rawHtml: html
  }
}

export function parseRawText(text: string): ParsedEmail {
  const fonts = ['Calibri', 'Arial', 'sans-serif']
  const signature = extractSignature(text)

  return {
    from: '',
    to: '',
    subject: '',
    text,
    html: `<div style="font-family: Calibri, Arial, sans-serif; font-size: 11pt;">${text.replace(/\n/g, '<br>')}</div>`,
    signature,
    fonts,
    images: [],
    rawHtml: ''
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

  const faceRegex = /@font-face\s*\{[^}]*font-family:\s*['"]?([^'";\s]+)['"]?/gi
  while ((match = faceRegex.exec(html)) !== null) {
    fontFamilies.add(match[1])
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
