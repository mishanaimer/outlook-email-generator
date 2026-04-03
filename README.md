# Outlook Email Generator

Generate professional Outlook-compatible emails using free AI models. Upload your existing emails as templates, describe what you need in plain language, and get a polished email that's indistinguishable from human-written ones.

## Features

- **Upload emails** — drag & drop `.msg`, `.eml`, or text files
- **Auto-analyze** — extracts fonts, signatures, style, and formatting
- **Natural language** — write requests like "создай письмо для Виктории с базовыми стоимостями для IT-отдела"
- **Outlook compatible** — inline styles, proper fonts, preserved signatures
- **Free AI models** — uses OpenRouter free tier (Gemma, Llama, Mistral, Qwen)

## Quick Start

1. **Get a free OpenRouter API key**
   - Go to https://openrouter.ai/
   - Sign up (free)
   - Create an API key at https://openrouter.ai/keys

2. **Set up environment**
   ```bash
   cp .env.example .env.local
   ```
   Add your API key to `.env.local`:
   ```
   OPENROUTER_API_KEY=sk-or-v1-...
   ```

3. **Install and run**
   ```bash
   npm install
   npm run dev
   ```
   Open http://localhost:3000

## Deploy to Vercel

1. Push to GitHub
2. Go to https://vercel.com/new
3. Import your repository
4. Add environment variable `OPENROUTER_API_KEY`
5. Deploy

Free tier includes 100GB bandwidth and serverless function execution.

## How It Works

1. **Upload** your existing emails (.msg, .eml, or text)
2. **Analyze** extracts fonts, signatures, writing style, and formatting patterns
3. **Describe** what email you need in plain language
4. **Generate** — AI writes the email matching your style with Outlook-compatible formatting
5. **Export** — copy to clipboard or download as HTML, ready for Outlook

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── analyze/route.ts    # Email upload & analysis API
│   │   └── generate/route.ts   # AI email generation API
│   ├── layout.tsx
│   └── page.tsx                # Main UI
└── lib/
    └── email-parser.ts         # .msg, .eml, text parsing
```

## Supported Formats

- `.msg` — Outlook message files
- `.eml` — Standard email format
- `.txt` — Plain text emails
- `.html` — HTML emails
