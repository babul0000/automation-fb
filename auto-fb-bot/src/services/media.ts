import fs from 'fs';
import path from 'path';
import axios from 'axios';
import puppeteer from 'puppeteer-core';
import { env, isConfiguredForGemini } from '../config/env';

/**
 * Automated Branded Infographic & Carousel Generator for ByteBangla
 * Renders high-converting 1080x1080 / 1080x1350 Bengali tech cheat sheets
 * featuring realistic macOS code editor mockups, brand vector badges, and syntax highlighting.
 */

export interface BannerResult {
  imageUrl: string;
  imagePath: string;
  imageBuffer: Buffer;
  prompt: string;
  seed: number;
  slideType: string;
}

export interface InfographicData {
  category: string;
  headline: string;
  subhead: string;
  toolBrand?: string; // 'chatgpt' | 'vscode' | 'github' | 'sheets' | 'notion' | 'python'
  mockupSnippet?: string; // Real copy-pasteable code, formula, or prompt
  snippetType?: 'CODE' | 'FORMULA' | 'PROMPT' | 'SHORTCUT';
  steps: {
    num: string;
    title: string;
    desc: string;
  }[];
  cta: string;
  accentColor?: string;
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Brand SVG Vector Icons for Authentic Tech Visuals (Scalable)
 */
const BRAND_ICONS: Record<string, string> = {
  chatgpt: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.28 9.87a5.98 5.98 0 0 0-.52-4.93 6.06 6.06 0 0 0-6.49-2.87 6.03 6.03 0 0 0-4.63-2.07c-3.1 0-5.69 2.33-6.03 5.41a6.04 6.04 0 0 0-3.98 2.88 6.05 6.05 0 0 0 .74 7.08 5.98 5.98 0 0 0 .51 4.93 6.06 6.06 0 0 0 6.5 2.87 6.03 6.03 0 0 0 4.62 2.07c3.11 0 5.7-2.33 6.04-5.41a6.04 6.04 0 0 0 3.97-2.88 6.05 6.05 0 0 0-.73-7.08z" fill="#10A37F"/>
    </svg>
  `,
  vscode: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.5 2L6.5 12l11 10 4-2V4l-4-2z" fill="#007ACC"/>
      <path d="M17.5 2l-11 10 11 10V2z" fill="#1F9CF0"/>
      <path d="M6.5 12L2 8.5v7l4.5-3.5z" fill="#0065A9"/>
    </svg>
  `,
  github: `
    <svg viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
      <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
    </svg>
  `,
  sheets: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="3" width="18" height="18" rx="3" fill="#0F9D58"/>
      <path d="M7 8h10M7 12h10M7 16h10" stroke="white" stroke-width="2" stroke-linecap="round"/>
    </svg>
  `,
  excel: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#107C41"/>
      <path d="M7 7l10 10M17 7l-10 10" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
    </svg>
  `,
  notion: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="4" fill="#FFFFFF"/>
      <path d="M4.5 4.5l11.5 2.5v12.5l-11.5-2.5V4.5z" fill="#000000"/>
      <path d="M8 8.5v7l4-5.5v7" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `,
  python: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M11.9 2c-5.2 0-4.9 2.2-4.9 2.2l.1 2.3h4.9v.7H4.6S2 6.9 2 12.1c0 5.2 2.3 5 2.3 5l1.4-.1v-2s-.1-2.3 2.3-2.3h4v-.7H7.1s-2.3 0-2.3-2.3c0-2.3 2.3-2.3 2.3-2.3h4.8V2zm-1.8 1.4c.4 0 .7.3.7.7s-.3.7-.7.7-.7-.3-.7-.7.3-.7.7-.7z" fill="#3776AB"/>
      <path d="M12.1 22c5.2 0 4.9-2.2 4.9-2.2l-.1-2.3h-4.9v-.7h7.4s2.6.3 2.6-4.9c0-5.2-2.3-5-2.3-5l-1.4.1v2s.1 2.3-2.3 2.3h-4v.7h4.9s2.3 0 2.3 2.3c0 2.3-2.3 2.3-2.3 2.3h-4.8V22zm1.8-1.4c-.4 0-.7-.3-.7-.7s.3-.7.7-.7.7.3.7.7-.3.7-.7.7z" fill="#FFD438"/>
    </svg>
  `,
  canva: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="11" fill="#00C4CC"/>
      <path d="M13.5 7.5c-3 0-5.5 2.5-5.5 5.5s2.5 5.5 5.5 5.5c1.8 0 3.2-.8 4-1.8l-1.4-1.2c-.6.6-1.5 1.2-2.6 1.2-2 0-3.6-1.6-3.6-3.7s1.6-3.7 3.6-3.7c1.1 0 2 .5 2.6 1.2l1.4-1.2c-.8-1-2.2-1.8-4-1.8z" fill="white"/>
    </svg>
  `,
  claude: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="6" fill="#D97706"/>
      <path d="M12 4l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5z" fill="#FEF3C7"/>
    </svg>
  `,
  gemini: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C12 7.52 7.52 12 2 12C7.52 12 12 16.48 12 22C12 16.48 16.48 12 22 12C16.48 12 12 7.52 12 2Z" fill="#1A73E8"/>
    </svg>
  `,
  chrome: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" fill="#EA4335"/>
      <circle cx="12" cy="12" r="5" fill="#FFFFFF"/>
      <circle cx="12" cy="12" r="4" fill="#1A73E8"/>
    </svg>
  `,
  windows: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 5l7-1v7H3V5zm8-1.2L21 2v9h-10V3.8zM3 13h7v7l-7-1v-6zm8 0h10v9.2L11 20.8V13z" fill="#0078D7"/>
    </svg>
  `,
  default: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="20" height="20" rx="5" fill="#0284C7"/>
      <path d="M8 12h8M12 8v8" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
    </svg>
  `,
};

export function getBrandIconSvg(brand?: string, size: number = 28): string {
  let rawSvg = BRAND_ICONS.default;
  if (brand) {
    const key = brand.toLowerCase();
    for (const b of Object.keys(BRAND_ICONS)) {
      if (key.includes(b)) {
        rawSvg = BRAND_ICONS[b];
        break;
      }
    }
  }
  return `<div class="brand-svg-wrap" style="width:${size}px;height:${size}px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">${rawSvg}</div>`;
}

/**
 * Extracts structured 3-step cheat sheet data + code mockup snippet from Bengali topic
 */
export async function extractInfographicDataWithAI(topicTitle: string): Promise<InfographicData> {
  const fallback: InfographicData = {
    category: 'এআই প্রোডাক্টিভিটি',
    headline: topicTitle.slice(0, 50),
    subhead: 'ঘণ্টার কাজ ৫ মিনিটে শেষ করার ৩টি প্র্যাকটিক্যাল টেকনিক',
    toolBrand: 'chatgpt',
    snippetType: 'PROMPT',
    mockupSnippet: 'Act as a Senior Engineer: Analyze this code and optimize performance for production.',
    steps: [
      {
        num: '01',
        title: 'প্রম্পট / কোড টেমপ্লেট কপি করুন',
        desc: 'সরাসরি টুল ইন্টারফেসে পেস্ট করে প্যারামিটার সেট করুন',
      },
      {
        num: '02',
        title: 'অটোমেটেড রেজাল্ট এক্সিকিউট করুন',
        desc: 'এআই নিজে থেকে সেরা আউটপুট ও সলিউশন জেনারেট করবে',
      },
      {
        num: '03',
        title: '১-ক্লিকে সেভ ও প্রোডাকশনে ব্যবহার',
        desc: 'আপনার প্রজেক্টে সাথে সাথে এপ্লাই করে সময় বাঁচান',
      },
    ],
    cta: 'লিঙ্ক পেতে কমেন্টে "AI" লিখুন এবং পোস্টটি সেভ করুন!',
  };

  if (!isConfiguredForGemini()) {
    return fallback;
  }

  const prompt = `You are the lead visual designer and infographic editor for "ByteBangla" (সহজ বাংলায় এআই ও টেক টিপস).
Analyze this tech topic: "${topicTitle}".
Create structured, authentic Bengali content for a 1080x1080 Facebook Infographic Cheat Sheet with a realistic macOS code/prompt mockup.

Return ONLY a valid JSON object without markdown fences:
{
  "category": "ছোট ১-২ শব্দের ক্যাটাগরি (যেমন: এআই টুলস, কোডিং হ্যাক্স, ডাটা অটোমেশন)",
  "headline": "বড় ও বোল্ড আকর্ষণীয় বাংলা শিরোনাম (ইউজারের পেইন পয়েন্ট ও সমাধান, সর্বোচ্চ ৮-১০ শব্দ)",
  "subhead": "১ লাইনে বাস্তব সুফল (যেমন: ঘণ্টার কাজ শেষ করুন মাত্র ২ মিনিটে)",
  "toolBrand": "chatgpt" or "vscode" or "github" or "sheets" or "notion" or "python",
  "snippetType": "CODE" or "FORMULA" or "PROMPT" or "SHORTCUT",
  "mockupSnippet": "A real, concrete 1-2 line copy-pasteable prompt, formula, or shortcut (e.g. '=AI.EXTRACT(A2, \\"Email\\")' or 'Ctrl + Shift + P > Format Document' or 'Act as a Senior React Engineer: [Task]...')",
  "steps": [
    { "num": "01", "title": "স্টেপ ১ শিরোনাম", "desc": "১ লাইনে বাস্তবসম্মত করণীয় ধাপ" },
    { "num": "02", "title": "স্টেপ ২ শিরোনাম", "desc": "১ লাইনে বাস্তবসম্মত করণীয় ধাপ" },
    { "num": "03", "title": "স্টেপ ৩ শিরোনাম", "desc": "১ লাইনে ফাইনাল রেজাল্ট" }
  ],
  "cta": "লিঙ্ক পেতে কমেন্টে 'AI' লিখুন এবং পোস্টটি সেভ করুন!"
}`;

  const modelsToTry = [
    process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash',
  ];

  for (const model of modelsToTry) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
      const response = await axios.post(
        endpoint,
        {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.6, maxOutputTokens: 900 },
        },
        { timeout: 20000 }
      );

      const raw = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (raw) {
      const cleaned = raw.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
      const parsed = JSON.parse(cleaned);
      if (parsed.headline && Array.isArray(parsed.steps) && parsed.steps.length >= 3) {
        return {
          category: parsed.category || 'এআই ও টেক টিপস',
          headline: parsed.headline,
          subhead: parsed.subhead || 'সহজ ৩টি ধাপে শিখে নিন সেরা টেকনিক',
          toolBrand: parsed.toolBrand || 'chatgpt',
          snippetType: parsed.snippetType || 'PROMPT',
          mockupSnippet: parsed.mockupSnippet || 'Act as a Senior Specialist: Explain this concept with 3 practical examples.',
          steps: parsed.steps.slice(0, 3).map((s: any, idx: number) => ({
            num: `0${idx + 1}`,
            title: s.title,
            desc: s.desc,
          })),
          cta: parsed.cta || 'লিঙ্ক পেতে কমেন্টে "AI" লিখুন এবং পোস্টটি সেভ করুন!',
        };
        }
      }
    } catch (err: any) {
      console.warn(`[Media Service Notice] Model ${model} extraction failed: ${err.message}. Trying next...`);
    }
  }

  return fallback;
}

/**
 * Renders a pixel-perfect 1080x1080 (Square) or 1080x1350 (Portrait) Infographic Cheat Sheet PNG
 * featuring realistic macOS UI window dots, brand vector badge, and syntax-highlighted code/prompt box.
 */
export async function renderInfographicToPng(
  data: InfographicData,
  width: number = 1080,
  height: number = 1080,
  chromePath: string = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
): Promise<Buffer> {
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height });

    const brandIconSvg = getBrandIconSvg(data.toolBrand);
    const snippet = data.mockupSnippet || 'Act as a Senior Engineer: Analyze this code and optimize performance.';
    const snippetLabel = data.snippetType || 'PROMPT';

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@500;600&family=Hind+Siliguri:wght@500;600;700&family=Outfit:wght@700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: ${width}px;
      height: ${height}px;
      background: radial-gradient(circle at 18% 12%, #0b1329 0%, #030712 100%);
      font-family: 'Hind Siliguri', 'Kalpurush', sans-serif;
      color: #FFFFFF;
      overflow: hidden;
      padding: 50px 60px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
    }
    .glow-blob-1 {
      position: absolute;
      width: 550px;
      height: 550px;
      border-radius: 50%;
      background: #0284c7;
      filter: blur(150px);
      opacity: 0.16;
      top: -120px;
      left: -100px;
      pointer-events: none;
    }
    .glow-blob-2 {
      position: absolute;
      width: 550px;
      height: 550px;
      border-radius: 50%;
      background: #8b5cf6;
      filter: blur(160px);
      opacity: 0.14;
      bottom: -120px;
      right: -100px;
      pointer-events: none;
    }
    /* macOS Window Header Bar */
    .macos-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(17, 24, 39, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.08);
      padding: 10px 20px;
      border-radius: 16px;
      position: relative;
      z-index: 10;
    }
    .macos-dots {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .macos-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
    }
    .dot-red { background: #FF5F56; }
    .dot-yellow { background: #FFBD2E; }
    .dot-green { background: #27C93F; }
    .window-title {
      font-family: 'Fira Code', monospace;
      font-size: 14px;
      color: #94a3b8;
      letter-spacing: 0.5px;
    }
    .brand-group {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .brand-title {
      font-family: 'Outfit', sans-serif;
      font-size: 16px;
      font-weight: 800;
      color: #38bdf8;
      letter-spacing: 0.5px;
    }

    /* Hero Section */
    .hero {
      position: relative;
      z-index: 10;
      margin-top: 4px;
    }
    .hero-top-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .hero-accent {
      width: 60px;
      height: 4px;
      background: linear-gradient(90deg, #38bdf8, #818cf8);
      border-radius: 2px;
    }
    .category-badge {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.15);
      padding: 6px 16px;
      border-radius: 20px;
      font-size: 18px;
      font-weight: 600;
      color: #cbd5e1;
    }
    .headline {
      font-size: 46px;
      font-weight: 700;
      line-height: 1.25;
      color: #FFFFFF;
      text-shadow: 0 2px 20px rgba(0,0,0,0.8);
      margin-bottom: 6px;
    }
    .subhead {
      font-size: 24px;
      color: #94a3b8;
      font-weight: 500;
    }

    /* Code / Formula / Prompt Mockup Box */
    .mockup-container {
      position: relative;
      z-index: 10;
      background: #090d16;
      border: 1.5px solid #1e293b;
      border-radius: 16px;
      padding: 16px 22px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.6);
    }
    .mockup-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      font-family: 'Fira Code', monospace;
      font-size: 12px;
      color: #64748b;
    }
    .copy-pill {
      background: rgba(56, 189, 248, 0.15);
      border: 1px solid #38bdf8;
      color: #38bdf8;
      padding: 3px 10px;
      border-radius: 12px;
      font-weight: 700;
      font-size: 11px;
    }
    .mockup-code {
      font-family: 'Fira Code', 'Consolas', monospace;
      font-size: 20px;
      line-height: 1.4;
      color: #e2e8f0;
      word-break: break-all;
    }
    .mockup-code .syntax-kw { color: #f472b6; font-weight: 600; }
    .mockup-code .syntax-fn { color: #60a5fa; font-weight: 600; }
    .mockup-code .syntax-str { color: #4ade80; }

    /* 3 Actionable Steps Cards */
    .cards-container {
      display: flex;
      flex-direction: column;
      gap: 14px;
      position: relative;
      z-index: 10;
    }
    .card {
      display: flex;
      align-items: center;
      gap: 20px;
      background: rgba(17, 24, 39, 0.75);
      backdrop-filter: blur(16px);
      border: 1.5px solid rgba(255, 255, 255, 0.08);
      border-left: 5px solid #38bdf8;
      padding: 18px 24px;
      border-radius: 18px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    }
    .card:nth-child(2) { border-left-color: #facc15; }
    .card:nth-child(3) { border-left-color: #4ade80; }
    .card-num {
      width: 54px;
      height: 54px;
      border-radius: 16px;
      background: rgba(2, 132, 199, 0.15);
      border: 1.5px solid #38bdf8;
      color: #38bdf8;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Outfit', sans-serif;
      font-size: 24px;
      font-weight: 800;
      flex-shrink: 0;
    }
    .card:nth-child(2) .card-num {
      background: rgba(250, 204, 21, 0.15);
      border-color: #facc15;
      color: #facc15;
    }
    .card:nth-child(3) .card-num {
      background: rgba(74, 222, 128, 0.15);
      border-color: #4ade80;
      color: #4ade80;
    }
    .card-content h3 {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 4px;
      color: #f8fafc;
    }
    .card-content p {
      font-size: 21px;
      color: #cbd5e1;
      font-weight: 400;
      line-height: 1.3;
    }

    /* CTA Bar */
    .cta-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #0f172a;
      border: 1.5px solid #334155;
      padding: 16px 28px;
      border-radius: 20px;
      position: relative;
      z-index: 10;
    }
    .cta-left {
      display: flex;
      align-items: center;
      gap: 14px;
      font-size: 25px;
      font-weight: 700;
      color: #facc15;
    }
    .cta-left .badge-icon {
      background: rgba(250, 204, 21, 0.2);
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
    }
    .tag {
      font-family: 'Outfit', sans-serif;
      font-size: 20px;
      font-weight: 700;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="glow-blob-1"></div>
  <div class="glow-blob-2"></div>

  <!-- macOS Window Bar with Brand Icon -->
  <div class="macos-bar">
    <div class="macos-dots">
      <span class="macos-dot dot-red"></span>
      <span class="macos-dot dot-yellow"></span>
      <span class="macos-dot dot-green"></span>
      <span class="window-title">bytebangla-${(data.toolBrand || 'ai-tools')}.config</span>
    </div>
    <div class="brand-group">
      ${brandIconSvg}
      <span class="brand-title">BYTEBANGLA</span>
    </div>
  </div>

  <!-- Hero Section -->
  <div class="hero">
    <div class="hero-top-row">
      <div class="hero-accent"></div>
      <div class="category-badge">${data.category}</div>
    </div>
    <h1 class="headline">${data.headline}</h1>
    <p class="subhead">${data.subhead}</p>
  </div>

  <!-- Real Code / Formula / Prompt Mockup Box -->
  <div class="mockup-container">
    <div class="mockup-header">
      <span>// COPY-PASTEABLE ${snippetLabel}</span>
      <span class="copy-pill">⚡ 60s HACK</span>
    </div>
    <div class="mockup-code">
      <span class="syntax-kw">&gt; </span><span class="syntax-str">"${snippet}"</span>
    </div>
  </div>

  <!-- 3 Actionable Step Cards -->
  <div class="cards-container">
    ${data.steps
      .map(
        (s) => `
    <div class="card">
      <div class="card-num">${s.num}</div>
      <div class="card-content">
        <h3>${s.title}</h3>
        <p>${s.desc}</p>
      </div>
    </div>`
      )
      .join('')}
  </div>

  <!-- Bottom CTA Bar -->
  <div class="cta-bar">
    <div class="cta-left">
      <div class="badge-icon">⚡</div>
      <span>${data.cta}</span>
    </div>
    <div class="tag">#ByteBangla</div>
  </div>
</body>
</html>
`;

    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    const buffer = await page.screenshot({ type: 'png' });
    return Buffer.from(buffer);
  } finally {
    await browser.close();
  }
}

/**
 * Generates a high-converting, branded 1080x1080 Infographic Cheat Sheet banner for a Facebook post
 */
export async function generatePostBanner(topicTitle: string): Promise<BannerResult> {
  const seed = Math.floor(Math.random() * 1000000);
  console.log(`[Media Service] 🎨 Crafting 1080x1080 authentic Bengali infographic for: "${topicTitle}"...`);

  const infographicData = await extractInfographicDataWithAI(topicTitle);
  const buffer = await renderInfographicToPng(infographicData, 1080, 1080);

  const postsDir = path.resolve(process.cwd(), 'data', 'posts');
  ensureDir(postsDir);
  const filename = `post_banner_${Date.now()}_${seed}.png`;
  const filePath = path.join(postsDir, filename);
  fs.writeFileSync(filePath, buffer);

  console.log(`[Media Service] ✅ Authentic 1080x1080 Infographic generated: ${filePath}`);

  return {
    imageUrl: filePath,
    imagePath: filePath,
    imageBuffer: buffer,
    prompt: `ByteBangla 1080x1080 Infographic: ${topicTitle}`,
    seed,
    slideType: 'cover',
  };
}

/**
 * Generates a branded 3-slide visual carousel with 1080x1080 resolution
 */
export async function generateCarouselSlides(topicTitle: string): Promise<BannerResult[]> {
  console.log(`[Media Service] 🎠 Generating branded 3-slide 1080x1080 carousel for: "${topicTitle}"...`);

  const baseSeed = Math.floor(Math.random() * 900000);
  const postsDir = path.resolve(process.cwd(), 'data', 'posts');
  ensureDir(postsDir);

  const mainData = await extractInfographicDataWithAI(topicTitle);

  // Slide 1: Main 3-Step Infographic Cheat Sheet
  const s1Buffer = await renderInfographicToPng(mainData, 1080, 1080);
  const s1Path = path.join(postsDir, `carousel_${Date.now()}_1.png`);
  fs.writeFileSync(s1Path, s1Buffer);

  // Slide 2: Workflow & Deep Dive
  const slide2Data: InfographicData = {
    category: 'ওয়ার্কফ্লো হ্যাক্স',
    headline: 'কীভাবে দ্রুত কাজ শেষ করবেন?',
    subhead: 'বাইট বাংলা প্র্যাকটিক্যাল টেকনিক ও প্রো টিপস',
    toolBrand: mainData.toolBrand || 'vscode',
    snippetType: 'SHORTCUT',
    mockupSnippet: 'Ctrl + Shift + P > Format Document (Auto-Indent & Clean Code)',
    steps: [
      { num: '01', title: 'টুলের সঠিক টেমপ্লেট বাছুন', desc: 'রেডিমেড প্রম্পট বা টেমপ্লেট বেছে নিলে ৫০% সময় বাঁচে' },
      { num: '02', title: 'কাস্টমাইজ ও রিফাইন করুন', desc: 'নিজের প্রয়োজন অনুযায়ী সেটিংস ও রেজোলিউশন এডজাস্ট করুন' },
      { num: '03', title: 'অটো সেভ ও ক্লাউড সিঙ্ক', desc: 'ক্লাউডে সেভ রাখুন যাতে যেকোনো ডিভাইস থেকে কাজ করা যায়' },
    ],
    cta: 'আপনার প্রিয় এআই টুল কোনটি? কমেন্টে জানান!',
  };
  const s2Buffer = await renderInfographicToPng(slide2Data, 1080, 1080);
  const s2Path = path.join(postsDir, `carousel_${Date.now()}_2.png`);
  fs.writeFileSync(s2Path, s2Buffer);

  // Slide 3: Checklist & Summary
  const slide3Data: InfographicData = {
    category: 'চেকলিস্ট ও সামারি',
    headline: 'আজকের পোস্টের মূল সারসংক্ষেপ',
    subhead: 'পরবর্তীতে সহজে খুঁজে পেতে পোস্টটি এখনই সেভ রাখুন',
    toolBrand: 'github',
    snippetType: 'FORMULA',
    mockupSnippet: 'git commit -m "feat: 3x faster productivity workflow implemented"',
    steps: [
      { num: '01', title: 'ফ্রি রিসোর্স ও লিংক', desc: 'কমেন্ট সেকশনে চেক করুন অফিশিয়াল সাইটের ডিরেক্ট লিঙ্ক' },
      { num: '02', title: 'সহকর্মীদের মেনশন করুন', desc: 'যাদের এই ট্রিকস কাজে লাগবে তাদের পোস্টটি শেয়ার করুন' },
      { num: '03', title: 'ডেইলি টেক আপডেটস', desc: 'প্রতিদিন সহজ বাংলায় এমন দরকারি টিপস পেতে বাইট বাংলায় ফলো রাখুন' },
    ],
    cta: 'লিঙ্ক পেতে কমেন্টে "AI" লিখুন এবং ফলো করুন!',
  };
  const s3Buffer = await renderInfographicToPng(slide3Data, 1080, 1080);
  const s3Path = path.join(postsDir, `carousel_${Date.now()}_3.png`);
  fs.writeFileSync(s3Path, s3Buffer);

  console.log(`[Media Service] ✅ 3 Branded 1080x1080 Carousel slides generated successfully.`);

  return [
    { imageUrl: s1Path, imagePath: s1Path, imageBuffer: s1Buffer, prompt: 'Slide 1: Hero Cheat Sheet', seed: baseSeed, slideType: 'cover' },
    { imageUrl: s2Path, imagePath: s2Path, imageBuffer: s2Buffer, prompt: 'Slide 2: Workflow Deep Dive', seed: baseSeed + 1, slideType: 'features' },
    { imageUrl: s3Path, imagePath: s3Path, imageBuffer: s3Buffer, prompt: 'Slide 3: Summary Checklist', seed: baseSeed + 2, slideType: 'summary' },
  ];
}

/**
 * =========================================================================
 * 4-Scene Dynamic State-Driven Video Template System (1080x1920 Vertical)
 * 100% Synced with Audio Script Phases:
 * 1. Scene 1: The Problem State (0s – 5s)
 * 2. Scene 2: The Tool Reveal (5s – 12s)
 * 3. Scene 3: The Live Solution & Shortcut (12s – 22s)
 * 4. Scene 4: Viral Save & CTA State (22s – 30s)
 * =========================================================================
 */

export interface DynamicReelSceneData {
  topic: string;
  toolBrand?: string;
  toolName?: string;
  practicalSnippet?: string;
  snippetType?: 'CODE' | 'FORMULA' | 'PROMPT' | 'SHORTCUT';
  targetAudience?: 'OFFICE' | 'STUDENTS' | 'FREELANCERS';
  phase1Hook: string;
  phase2Solution: string;
  phase3Steps: string;
  phase4Cta: string;
}

export interface DynamicReelSceneFrames {
  scene1Path: string;
  scene2Path: string;
  scene3Path: string;
  scene4Path: string;
}

function isSpreadsheetTopic(topic: string, toolBrand?: string): boolean {
  const combined = `${topic} ${toolBrand || ''}`.toLowerCase();
  return (
    combined.includes('sheet') ||
    combined.includes('excel') ||
    combined.includes('শিট') ||
    combined.includes('এক্সেল') ||
    combined.includes('formula') ||
    combined.includes('ডাটা') ||
    combined.includes('data') ||
    combined.includes('table')
  );
}

function resolveToolDisplayName(data: DynamicReelSceneData): string {
  if (data.toolName && data.toolName.trim().length > 0) {
    return data.toolName.trim();
  }
  const brand = (data.toolBrand || '').toLowerCase();
  const topic = data.topic.toLowerCase();

  if (brand.includes('vscode') || topic.includes('vs code') || topic.includes('vscode')) {
    return 'VS Code Auto Prettier';
  }
  if (brand.includes('sheet') || topic.includes('sheet') || topic.includes('শিট')) {
    return 'Google Sheets =UNIQUE()';
  }
  if (brand.includes('excel') || topic.includes('excel') || topic.includes('এক্সেল')) {
    return 'Excel Power Query';
  }
  if (brand.includes('chatgpt') || topic.includes('chatgpt') || topic.includes('gpt')) {
    return 'ChatGPT Code Interpreter';
  }
  if (brand.includes('claude') || topic.includes('claude')) {
    return 'Claude 3.7 Sonnet';
  }
  if (brand.includes('gemini') || topic.includes('gemini')) {
    return 'Google Gemini 2.5';
  }
  if (brand.includes('github') || topic.includes('github') || topic.includes('git')) {
    return 'GitHub Copilot Workspace';
  }
  if (brand.includes('notion') || topic.includes('notion')) {
    return 'Notion AI Workspace';
  }
  if (brand.includes('canva') || topic.includes('canva')) {
    return 'Canva Magic Studio';
  }
  if (brand.includes('python') || topic.includes('python')) {
    return 'Python Automation Script';
  }
  return 'Smart AI Productivity Tool';
}

function resolveShortcutDetails(data: DynamicReelSceneData): { keys: string[]; isFormula: boolean; label: string } {
  const snippet = (data.practicalSnippet || '').trim();
  if (snippet.startsWith('=')) {
    return {
      keys: [snippet.slice(0, 36)],
      isFormula: true,
      label: 'Formula / ফাংশন',
    };
  }
  if (snippet.includes('+')) {
    const rawKeys = snippet.split('+').map((k) => k.trim().replace(/[\[\]]/g, ''));
    return {
      keys: rawKeys.filter(Boolean),
      isFormula: false,
      label: 'Keyboard Shortcut',
    };
  }
  const brand = (data.toolBrand || '').toLowerCase();
  const topic = data.topic.toLowerCase();
  if (brand.includes('vscode') || topic.includes('vs code')) {
    return { keys: ['Alt', 'Shift', 'F'], isFormula: false, label: 'Format Document' };
  }
  if (brand.includes('sheet') || topic.includes('sheet') || topic.includes('শিট')) {
    return { keys: ['=UNIQUE(A2:D)'], isFormula: true, label: 'Deduplication Formula' };
  }
  if (brand.includes('excel') || topic.includes('excel')) {
    return { keys: ['Alt', 'F12'], isFormula: false, label: 'Power Query' };
  }
  return { keys: ['Ctrl', 'Shift', 'P'], isFormula: false, label: 'Command Palette' };
}

function resolveAudienceLabel(audience?: string): string {
  switch (audience) {
    case 'OFFICE':
      return '🎯 অফিস কর্মী ও এক্সেল ইউজারদের বড় ভুল';
    case 'STUDENTS':
      return '🎯 শিক্ষার্থী ও অ্যাসাইনমেন্ট নির্মাতাদের সমস্যা';
    case 'FREELANCERS':
      return '🎯 ফ্রিল্যান্সার ও কোডারদের সময় অপচয়';
    default:
      return '🎯 অধিকাংশ মানুষের নিয়মিত ভুল ও সময় অপচয়';
  }
}

/**
 * Scene 1: The Problem State (0s – 5s)
 * Dark-mode code editor or spreadsheet showing messy unformatted data with red syntax squiggles
 * and top tag pulsing with "⚠️ Common Mistake / Pain Point".
 */
function buildScene1ProblemHtml(data: DynamicReelSceneData): string {
  const isSheet = isSpreadsheetTopic(data.topic, data.toolBrand);
  const audienceBadge = resolveAudienceLabel(data.targetAudience);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@500;600;700&family=Hind+Siliguri:wght@600;700;800&family=Outfit:wght@700;800;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 1080px;
      height: 1920px;
      background: radial-gradient(circle at 50% 20%, #1e0910 0%, #030712 100%);
      font-family: 'Hind Siliguri', sans-serif;
      color: #ffffff;
      overflow: hidden;
      position: relative;
    }
    .glow-blob-red {
      position: absolute;
      width: 650px;
      height: 650px;
      border-radius: 50%;
      background: #dc2626;
      filter: blur(170px);
      opacity: 0.18;
      top: 180px;
      left: 215px;
      pointer-events: none;
    }
    .top-header {
      position: absolute;
      top: 140px;
      left: 60px;
      right: 60px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      z-index: 10;
    }
    .pulse-badge {
      display: inline-flex;
      align-items: center;
      gap: 14px;
      background: rgba(239, 68, 68, 0.15);
      border: 2px solid #ef4444;
      box-shadow: 0 0 30px rgba(239, 68, 68, 0.45);
      padding: 12px 34px;
      border-radius: 40px;
      font-family: 'Outfit', sans-serif;
      font-size: 24px;
      font-weight: 800;
      color: #fca5a5;
      letter-spacing: 0.5px;
    }
    .pulse-dot {
      width: 16px;
      height: 16px;
      background: #ef4444;
      border-radius: 50%;
      box-shadow: 0 0 16px #ef4444;
    }
    .audience-pill {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.15);
      padding: 8px 24px;
      border-radius: 20px;
      font-size: 24px;
      font-weight: 700;
      color: #e2e8f0;
    }
    .main-window {
      position: absolute;
      top: 360px;
      left: 60px;
      right: 60px;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(20px);
      border: 2px solid rgba(239, 68, 68, 0.4);
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.8), 0 0 40px rgba(239, 68, 68, 0.2);
      border-radius: 28px;
      overflow: hidden;
      z-index: 10;
    }
    .window-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(10, 15, 30, 0.95);
      border-bottom: 1.5px solid rgba(255, 255, 255, 0.08);
      padding: 16px 24px;
    }
    .macos-dots { display: flex; gap: 10px; }
    .macos-dot { width: 14px; height: 14px; border-radius: 50%; }
    .dot-red { background: #FF5F56; }
    .dot-yellow { background: #FFBD2E; }
    .dot-green { background: #27C93F; }
    .window-title {
      font-family: 'Fira Code', monospace;
      font-size: 20px;
      font-weight: 600;
      color: #f87171;
    }
    .window-tag {
      font-family: 'Outfit', sans-serif;
      font-size: 18px;
      font-weight: 800;
      color: #94a3b8;
    }
    .window-body {
      padding: 34px 38px;
      min-height: 480px;
    }
    /* Spreadsheet Styles */
    .sheet-table {
      width: 100%;
      border-collapse: collapse;
      font-family: 'Fira Code', monospace;
      font-size: 22px;
    }
    .sheet-table th {
      background: rgba(30, 41, 59, 0.9);
      color: #94a3b8;
      padding: 14px 18px;
      text-align: left;
      border: 1px solid #334155;
      font-size: 18px;
    }
    .sheet-table td {
      padding: 16px 18px;
      border: 1px solid #1e293b;
      color: #cbd5e1;
    }
    .row-duplicate {
      background: rgba(239, 68, 68, 0.12);
    }
    .squiggly-error {
      text-decoration: underline wavy #ef4444;
      text-decoration-thickness: 3px;
      color: #fca5a5;
      font-weight: 700;
    }
    .tag-error-pill {
      background: rgba(239, 68, 68, 0.2);
      border: 1px solid #ef4444;
      color: #fca5a5;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 700;
    }
    /* Code Editor Styles */
    .code-editor {
      font-family: 'Fira Code', monospace;
      font-size: 24px;
      line-height: 1.8;
      color: #cbd5e1;
    }
    .code-line {
      display: flex;
      gap: 20px;
    }
    .line-no {
      color: #64748b;
      width: 35px;
      text-align: right;
      user-select: none;
    }
    .syntax-kw { color: #f43f5e; font-weight: 700; }
    .syntax-fn { color: #38bdf8; font-weight: 600; }
    .syntax-str { color: #facc15; }
    .syntax-comment { color: #ef4444; font-weight: 600; }
    /* Warning Footer Box */
    .warning-footer {
      margin-top: 28px;
      background: rgba(239, 68, 68, 0.15);
      border: 2px dashed #ef4444;
      border-radius: 18px;
      padding: 20px 24px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .warning-footer-title {
      font-size: 26px;
      font-weight: 800;
      color: #fca5a5;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .warning-footer-desc {
      font-size: 22px;
      color: #fecaca;
    }
    /* Bottom Voice Caption Card */
    .bottom-caption-card {
      position: absolute;
      bottom: 200px;
      left: 60px;
      right: 60px;
      background: rgba(3, 7, 18, 0.94);
      backdrop-filter: blur(24px);
      border: 3px solid #ef4444;
      box-shadow: 0 16px 45px rgba(0, 0, 0, 0.9), 0 0 35px rgba(239, 68, 68, 0.35);
      border-radius: 28px;
      padding: 28px 36px;
      text-align: center;
      z-index: 50;
    }
    .caption-pill {
      display: inline-block;
      background: rgba(239, 68, 68, 0.2);
      border: 1px solid #ef4444;
      color: #fca5a5;
      padding: 6px 20px;
      border-radius: 20px;
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 12px;
    }
    .caption-text {
      font-size: 42px;
      font-weight: 700;
      line-height: 1.35;
      color: #ffffff;
      text-shadow: 0 2px 14px rgba(0,0,0,0.9);
    }
  </style>
</head>
<body>
  <div class="glow-blob-red"></div>

  <div class="top-header">
    <div class="pulse-badge">
      <span class="pulse-dot"></span>
      <span>⚠️ Common Mistake / Pain Point</span>
    </div>
    <div class="audience-pill">${audienceBadge}</div>
  </div>

  <div class="main-window">
    <div class="window-bar">
      <div class="macos-dots">
        <span class="macos-dot dot-red"></span>
        <span class="macos-dot dot-yellow"></span>
        <span class="macos-dot dot-green"></span>
      </div>
      <div class="window-title">${isSheet ? 'sales_messy_records.xlsx ⚠️' : 'unformatted_legacy_code.ts ⚠️'}</div>
      <div class="window-tag">BYTEBANGLA UI</div>
    </div>
    <div class="window-body">
      ${
        isSheet
          ? `
      <table class="sheet-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>CLIENT NAME</th>
            <th>RAW VALUE</th>
            <th>STATUS</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>#101</td>
            <td>john doe  </td>
            <td>  $4,500 </td>
            <td>PENDING</td>
          </tr>
          <tr class="row-duplicate">
            <td>#101</td>
            <td><span class="squiggly-error">JOHN DOE  </span></td>
            <td>  $4,500 </td>
            <td><span class="tag-error-pill">❌ DUPLICATE</span></td>
          </tr>
          <tr>
            <td>#102</td>
            <td>Sara K.   </td>
            <td><span class="squiggly-error">#REF! ERROR</span></td>
            <td><span class="tag-error-pill">❌ BROKEN</span></td>
          </tr>
          <tr class="row-duplicate">
            <td>#101</td>
            <td><span class="squiggly-error">john doe  </span></td>
            <td>  $4,500 </td>
            <td><span class="tag-error-pill">❌ DUPLICATE</span></td>
          </tr>
          <tr>
            <td>#103</td>
            <td>Rahim M.  </td>
            <td>  $1,200 </td>
            <td>DONE</td>
          </tr>
        </tbody>
      </table>
      <div class="warning-footer">
        <div class="warning-footer-title">❌ 348 Duplicate Records & Unformatted Rows Detected</div>
        <div class="warning-footer-desc">⚠️ এক এক করে ম্যানুয়ালি ঠিক করতে ২-৩ ঘণ্টা মূল্যবান সময় নষ্ট!</div>
      </div>
      `
          : `
      <div class="code-editor">
        <div class="code-line"><span class="line-no">1</span><span><span class="syntax-kw">const</span> <span class="syntax-fn">fetchData</span> = <span class="syntax-kw">async</span>(url) =&gt; {</span></div>
        <div class="code-line"><span class="line-no">2</span><span>  <span class="syntax-kw">var</span> raw = <span class="syntax-kw">await</span> fetch(url); <span class="syntax-comment">// ❌ Legacy var</span></span></div>
        <div class="code-line"><span class="line-no">3</span><span>  <span class="squiggly-error">let parsed = raw.json();</span> <span class="syntax-comment">// ❌ Missing await error</span></span></div>
        <div class="code-line"><span class="line-no">4</span><span>  <span class="syntax-kw">for</span>(i = 0; i &lt; parsed.length; i++){</span></div>
        <div class="code-line"><span class="line-no">5</span><span>    <span class="squiggly-error">console.log( parsed[ i ] );</span> <span class="syntax-comment">// ❌ Bad indent & spacing</span></span></div>
        <div class="code-line"><span class="line-no">6</span><span>  }</span></div>
        <div class="code-line"><span class="line-no">7</span><span>};</span></div>
      </div>
      <div class="warning-footer">
        <div class="warning-footer-title">❌ 3 Syntax Warnings & Code Smells Detected</div>
        <div class="warning-footer-desc">⚠️ প্রতি লাইনে কোড ম্যানুয়ালি রি-ফরম্যাট করতে ৪৫ মিনিট সময় অপচয়!</div>
      </div>
      `
      }
    </div>
  </div>

  <div class="bottom-caption-card">
    <div class="caption-pill">⚠️ পেইন-পয়েন্ট ও সাধারণ ভুল</div>
    <div class="caption-text">${data.phase1Hook}</div>
  </div>
</body>
</html>
`;
}

/**
 * Scene 2: The Tool Reveal (5s – 12s)
 * Screen transition showing prominent official brand logo inside an animated glow card
 * with large typography displaying the EXACT tool/extension/formula name.
 */
function buildScene2RevealHtml(data: DynamicReelSceneData): string {
  const toolName = resolveToolDisplayName(data);
  const brandIconSvg = getBrandIconSvg(data.toolBrand, 110);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@500;600;700&family=Hind+Siliguri:wght@600;700;800&family=Outfit:wght@700;800;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 1080px;
      height: 1920px;
      background: radial-gradient(circle at 50% 25%, #082142 0%, #020713 100%);
      font-family: 'Hind Siliguri', sans-serif;
      color: #ffffff;
      overflow: hidden;
      position: relative;
    }
    .glow-blob-cyan {
      position: absolute;
      width: 700px;
      height: 700px;
      border-radius: 50%;
      background: #0284c7;
      filter: blur(180px);
      opacity: 0.25;
      top: 280px;
      left: 190px;
      pointer-events: none;
    }
    .top-header {
      position: absolute;
      top: 140px;
      left: 60px;
      right: 60px;
      display: flex;
      justify-content: center;
      z-index: 10;
    }
    .top-badge {
      display: inline-flex;
      align-items: center;
      gap: 14px;
      background: rgba(56, 189, 248, 0.15);
      border: 2px solid #38bdf8;
      box-shadow: 0 0 35px rgba(56, 189, 248, 0.4);
      padding: 12px 36px;
      border-radius: 40px;
      font-family: 'Outfit', sans-serif;
      font-size: 24px;
      font-weight: 800;
      color: #7dd3fc;
      letter-spacing: 0.5px;
    }
    .top-badge .dot {
      width: 14px;
      height: 14px;
      background: #38bdf8;
      border-radius: 50%;
      box-shadow: 0 0 14px #38bdf8;
    }
    .reveal-card {
      position: absolute;
      top: 320px;
      left: 60px;
      right: 60px;
      background: linear-gradient(160deg, rgba(15, 23, 42, 0.96), rgba(2, 6, 23, 0.98));
      backdrop-filter: blur(28px);
      border: 3px solid rgba(56, 189, 248, 0.55);
      box-shadow: 0 25px 70px rgba(0, 0, 0, 0.85), 0 0 55px rgba(14, 165, 233, 0.3);
      border-radius: 36px;
      padding: 60px 48px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      z-index: 10;
    }
    .brand-logo-ring {
      width: 170px;
      height: 170px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.05);
      border: 3px solid rgba(56, 189, 248, 0.7);
      box-shadow: 0 0 50px rgba(56, 189, 248, 0.4), inset 0 0 30px rgba(56, 189, 248, 0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 34px;
    }
    .tool-headline {
      font-family: 'Outfit', sans-serif;
      font-size: 64px;
      font-weight: 900;
      line-height: 1.15;
      color: #ffffff;
      text-shadow: 0 4px 25px rgba(56, 189, 248, 0.6);
      margin-bottom: 24px;
      max-width: 820px;
    }
    .pills-row {
      display: flex;
      gap: 16px;
      margin-bottom: 32px;
      flex-wrap: wrap;
      justify-content: center;
    }
    .value-pill {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(56, 189, 248, 0.4);
      padding: 10px 22px;
      border-radius: 20px;
      font-size: 22px;
      font-weight: 700;
      color: #e0f2fe;
    }
    .value-pill.highlight {
      background: rgba(74, 222, 128, 0.15);
      border-color: #4ade80;
      color: #86efac;
    }
    .tool-description {
      font-size: 28px;
      font-weight: 600;
      color: #94a3b8;
      line-height: 1.4;
      max-width: 760px;
    }
    /* Bottom Voice Caption Card */
    .bottom-caption-card {
      position: absolute;
      bottom: 200px;
      left: 60px;
      right: 60px;
      background: rgba(3, 7, 18, 0.94);
      backdrop-filter: blur(24px);
      border: 3px solid #38bdf8;
      box-shadow: 0 16px 45px rgba(0, 0, 0, 0.9), 0 0 35px rgba(56, 189, 248, 0.35);
      border-radius: 28px;
      padding: 28px 36px;
      text-align: center;
      z-index: 50;
    }
    .caption-pill {
      display: inline-block;
      background: rgba(56, 189, 248, 0.2);
      border: 1px solid #38bdf8;
      color: #7dd3fc;
      padding: 6px 20px;
      border-radius: 20px;
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 12px;
    }
    .caption-text {
      font-size: 42px;
      font-weight: 700;
      line-height: 1.35;
      color: #ffffff;
      text-shadow: 0 2px 14px rgba(0,0,0,0.9);
    }
  </style>
</head>
<body>
  <div class="glow-blob-cyan"></div>

  <div class="top-header">
    <div class="top-badge">
      <span class="dot"></span>
      <span>⚡ THE SMART SOLUTION / অফিশিয়াল সমাধান</span>
    </div>
  </div>

  <div class="reveal-card">
    <div class="brand-logo-ring">
      ${brandIconSvg}
    </div>
    <h1 class="tool-headline">${toolName}</h1>
    <div class="pills-row">
      <div class="value-pill highlight">⭐ 100% Free & Official</div>
      <div class="value-pill">⚡ 1-Click Action</div>
      <div class="value-pill">⏱️ Saves 2+ Hours Daily</div>
    </div>
    <p class="tool-description">ম্যানুয়ালি সময় নষ্ট করা বন্ধ করুন — এই স্মার্ট টুলটি স্বয়ংক্রিয়ভাবে জটিল কাজ নিমেষেই শেষ করে!</p>
  </div>

  <div class="bottom-caption-card">
    <div class="caption-pill">💡 অফিশিয়াল স্মার্ট টুল</div>
    <div class="caption-text">${data.phase2Solution}</div>
  </div>
</body>
</html>
`;
}

/**
 * Scene 3: The Live Solution & Shortcut (12s – 22s)
 * macOS code window showing live before-and-after transformation with animated glowing key-caps
 * popping into screen and instant clean syntax-highlighted beauty.
 */
function buildScene3SolutionHtml(data: DynamicReelSceneData): string {
  const isSheet = isSpreadsheetTopic(data.topic, data.toolBrand);
  const shortcut = resolveShortcutDetails(data);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@500;600;700&family=Hind+Siliguri:wght@600;700;800&family=Outfit:wght@700;800;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 1080px;
      height: 1920px;
      background: radial-gradient(circle at 50% 20%, #032b1a 0%, #020b06 100%);
      font-family: 'Hind Siliguri', sans-serif;
      color: #ffffff;
      overflow: hidden;
      position: relative;
    }
    .glow-blob-green {
      position: absolute;
      width: 650px;
      height: 650px;
      border-radius: 50%;
      background: #10b981;
      filter: blur(170px);
      opacity: 0.22;
      top: 240px;
      left: 215px;
      pointer-events: none;
    }
    .top-header {
      position: absolute;
      top: 140px;
      left: 60px;
      right: 60px;
      display: flex;
      justify-content: center;
      z-index: 10;
    }
    .top-badge {
      display: inline-flex;
      align-items: center;
      gap: 14px;
      background: rgba(74, 222, 128, 0.15);
      border: 2px solid #4ade80;
      box-shadow: 0 0 35px rgba(74, 222, 128, 0.4);
      padding: 12px 36px;
      border-radius: 40px;
      font-family: 'Outfit', sans-serif;
      font-size: 24px;
      font-weight: 800;
      color: #86efac;
      letter-spacing: 0.5px;
    }
    .top-badge .dot {
      width: 14px;
      height: 14px;
      background: #4ade80;
      border-radius: 50%;
      box-shadow: 0 0 14px #4ade80;
    }
    .solution-window {
      position: absolute;
      top: 320px;
      left: 60px;
      right: 60px;
      background: rgba(15, 23, 42, 0.90);
      backdrop-filter: blur(24px);
      border: 2.5px solid rgba(74, 222, 128, 0.5);
      box-shadow: 0 25px 70px rgba(0, 0, 0, 0.85), 0 0 45px rgba(74, 222, 128, 0.25);
      border-radius: 30px;
      overflow: hidden;
      z-index: 10;
    }
    .window-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(10, 15, 30, 0.95);
      border-bottom: 1.5px solid rgba(255, 255, 255, 0.08);
      padding: 16px 24px;
    }
    .macos-dots { display: flex; gap: 10px; }
    .macos-dot { width: 14px; height: 14px; border-radius: 50%; }
    .dot-red { background: #FF5F56; }
    .dot-yellow { background: #FFBD2E; }
    .dot-green { background: #27C93F; }
    .window-title {
      font-family: 'Fira Code', monospace;
      font-size: 20px;
      font-weight: 600;
      color: #86efac;
    }
    .window-status {
      background: rgba(74, 222, 128, 0.2);
      border: 1px solid #4ade80;
      color: #86efac;
      padding: 4px 14px;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 800;
    }
    .window-body {
      padding: 30px 36px;
    }
    /* 3D Glowing Mechanical Keycaps / Formula Capsule */
    .shortcut-hero {
      background: rgba(3, 7, 18, 0.85);
      border: 2px solid rgba(56, 189, 248, 0.4);
      border-radius: 24px;
      padding: 24px 30px;
      margin-bottom: 26px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
    }
    .keycaps-row {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .keycap-3d {
      background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
      border: 2.5px solid #38bdf8;
      border-bottom: 7px solid #0284c7;
      box-shadow: 0 12px 25px rgba(0, 0, 0, 0.8), 0 0 25px rgba(56, 189, 248, 0.35);
      border-radius: 16px;
      padding: 14px 28px;
      font-family: 'Fira Code', monospace;
      font-size: 34px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: 1px;
    }
    .plus-sign {
      font-family: 'Outfit', sans-serif;
      font-size: 36px;
      font-weight: 900;
      color: #38bdf8;
      text-shadow: 0 0 16px #38bdf8;
    }
    .formula-capsule {
      background: linear-gradient(180deg, #064e3b 0%, #022c22 100%);
      border: 2.5px solid #4ade80;
      border-bottom: 7px solid #16a34a;
      box-shadow: 0 12px 25px rgba(0, 0, 0, 0.8), 0 0 30px rgba(74, 222, 128, 0.4);
      border-radius: 20px;
      padding: 16px 34px;
      font-family: 'Fira Code', monospace;
      font-size: 30px;
      font-weight: 700;
      color: #ffffff;
    }
    .shortcut-instruction {
      font-size: 22px;
      font-weight: 700;
      color: #facc15;
    }
    /* Clean Transformed Content */
    .sheet-clean-table {
      width: 100%;
      border-collapse: collapse;
      font-family: 'Fira Code', monospace;
      font-size: 21px;
    }
    .sheet-clean-table th {
      background: rgba(30, 41, 59, 0.95);
      color: #86efac;
      padding: 12px 16px;
      text-align: left;
      border: 1px solid #334155;
      font-size: 17px;
    }
    .sheet-clean-table td {
      padding: 14px 16px;
      border: 1px solid #1e293b;
      color: #f1f5f9;
    }
    .badge-success {
      background: rgba(74, 222, 128, 0.2);
      border: 1px solid #4ade80;
      color: #86efac;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 800;
    }
    .code-clean {
      font-family: 'Fira Code', monospace;
      font-size: 23px;
      line-height: 1.8;
      color: #f8fafc;
    }
    .code-line {
      display: flex;
      gap: 18px;
    }
    .line-no {
      color: #64748b;
      width: 30px;
      text-align: right;
      user-select: none;
    }
    .syntax-kw { color: #38bdf8; font-weight: 700; }
    .syntax-fn { color: #facc15; font-weight: 600; }
    .syntax-type { color: #4ade80; }
    .syntax-comment { color: #86efac; font-weight: 600; }
    .success-footer {
      margin-top: 22px;
      background: rgba(74, 222, 128, 0.15);
      border: 2px solid #4ade80;
      border-radius: 18px;
      padding: 16px 22px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 22px;
      font-weight: 800;
      color: #86efac;
    }
    /* Bottom Voice Caption Card */
    .bottom-caption-card {
      position: absolute;
      bottom: 200px;
      left: 60px;
      right: 60px;
      background: rgba(3, 7, 18, 0.94);
      backdrop-filter: blur(24px);
      border: 3px solid #4ade80;
      box-shadow: 0 16px 45px rgba(0, 0, 0, 0.9), 0 0 35px rgba(74, 222, 128, 0.35);
      border-radius: 28px;
      padding: 28px 36px;
      text-align: center;
      z-index: 50;
    }
    .caption-pill {
      display: inline-block;
      background: rgba(74, 222, 128, 0.2);
      border: 1px solid #4ade80;
      color: #86efac;
      padding: 6px 20px;
      border-radius: 20px;
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 12px;
    }
    .caption-text {
      font-size: 42px;
      font-weight: 700;
      line-height: 1.35;
      color: #ffffff;
      text-shadow: 0 2px 14px rgba(0,0,0,0.9);
    }
  </style>
</head>
<body>
  <div class="glow-blob-green"></div>

  <div class="top-header">
    <div class="top-badge">
      <span class="dot"></span>
      <span>✨ LIVE SOLUTION & SHORTCUT / ম্যাজিক সলিউশন</span>
    </div>
  </div>

  <div class="solution-window">
    <div class="window-bar">
      <div class="macos-dots">
        <span class="macos-dot dot-red"></span>
        <span class="macos-dot dot-yellow"></span>
        <span class="macos-dot dot-green"></span>
      </div>
      <div class="window-title">${isSheet ? 'clean_analytics_final.xlsx' : 'clean_production_code.ts'}</div>
      <div class="window-status">✅ 100% Formatted</div>
    </div>
    <div class="window-body">
      <div class="shortcut-hero">
        ${
          shortcut.isFormula
            ? `<div class="formula-capsule"><code>${shortcut.keys[0]}</code></div>`
            : `
        <div class="keycaps-row">
          ${shortcut.keys.map((k) => `<div class="keycap-3d">${k}</div>`).join('<span class="plus-sign">+</span>')}
        </div>
        `
        }
        <div class="shortcut-instruction">⚡ প্রেস করতেই ১ সেকেন্ডে অটোমেটিক ট্রান্সফর্মেশন!</div>
      </div>

      ${
        isSheet
          ? `
      <table class="sheet-clean-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>CLEAN CLIENT NAME</th>
            <th>FORMATTED AMOUNT</th>
            <th>STATUS</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>#101</td>
            <td>John Doe</td>
            <td>$4,500.00</td>
            <td><span class="badge-success">✅ ACTIVE</span></td>
          </tr>
          <tr>
            <td>#102</td>
            <td>Sara K.</td>
            <td>$3,800.00</td>
            <td><span class="badge-success">✅ ACTIVE</span></td>
          </tr>
          <tr>
            <td>#103</td>
            <td>Rahim M.</td>
            <td>$1,200.00</td>
            <td><span class="badge-success">✅ ACTIVE</span></td>
          </tr>
        </tbody>
      </table>
      <div class="success-footer">
        <span>✨ 0 Duplicates • Clean Table Auto-Sorted</span>
        <span>⏱️ 0.1s Execution</span>
      </div>
      `
          : `
      <div class="code-clean">
        <div class="code-line"><span class="line-no">1</span><span><span class="syntax-comment">// ✅ Clean, Formatted &amp; Optimized Production Code</span></span></div>
        <div class="code-line"><span class="line-no">2</span><span><span class="syntax-kw">export const</span> <span class="syntax-fn">fetchCleanData</span> = <span class="syntax-kw">async</span> (url: <span class="syntax-type">string</span>) =&gt; {</span></div>
        <div class="code-line"><span class="line-no">3</span><span>  <span class="syntax-kw">const</span> response = <span class="syntax-kw">await</span> fetch(url);</span></div>
        <div class="code-line"><span class="line-no">4</span><span>  <span class="syntax-kw">return</span> response.json();</span></div>
        <div class="code-line"><span class="line-no">5</span><span>};</span></div>
      </div>
      <div class="success-footer">
        <span>✨ Auto-Formatted Document • Clean Syntax</span>
        <span>⚡ 0 Warnings</span>
      </div>
      `
      }
    </div>
  </div>

  <div class="bottom-caption-card">
    <div class="caption-pill">🚀 লাইভ সমাধান ও স্টেপস</div>
    <div class="caption-text">${data.phase3Steps}</div>
  </div>
</body>
</html>
`;
}

/**
 * Scene 4: Viral Save & CTA State (22s – 30s)
 * Bookmark/Save animation + floating Facebook comment bubble showing "💬 Type 'AI' to get link"
 * with ByteBangla verified creator badge at the center.
 */
function buildScene4CtaHtml(data: DynamicReelSceneData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@500;600;700&family=Hind+Siliguri:wght@600;700;800&family=Outfit:wght@700;800;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 1080px;
      height: 1920px;
      background: radial-gradient(circle at 50% 25%, #250942 0%, #06020c 100%);
      font-family: 'Hind Siliguri', sans-serif;
      color: #ffffff;
      overflow: hidden;
      position: relative;
    }
    .glow-blob-purple {
      position: absolute;
      width: 700px;
      height: 700px;
      border-radius: 50%;
      background: #a855f7;
      filter: blur(180px);
      opacity: 0.24;
      top: 260px;
      left: 190px;
      pointer-events: none;
    }
    .top-header {
      position: absolute;
      top: 140px;
      left: 60px;
      right: 60px;
      display: flex;
      justify-content: center;
      z-index: 10;
    }
    .top-badge {
      display: inline-flex;
      align-items: center;
      gap: 14px;
      background: rgba(168, 85, 247, 0.18);
      border: 2px solid #a855f7;
      box-shadow: 0 0 35px rgba(168, 85, 247, 0.45);
      padding: 12px 36px;
      border-radius: 40px;
      font-family: 'Outfit', sans-serif;
      font-size: 24px;
      font-weight: 800;
      color: #e9d5ff;
      letter-spacing: 0.5px;
    }
    .top-badge .dot {
      width: 14px;
      height: 14px;
      background: #c084fc;
      border-radius: 50%;
      box-shadow: 0 0 14px #c084fc;
    }
    .cta-hub {
      position: absolute;
      top: 290px;
      left: 60px;
      right: 60px;
      display: flex;
      flex-direction: column;
      gap: 24px;
      z-index: 10;
    }
    /* Verified Creator Card */
    .creator-card {
      background: linear-gradient(145deg, rgba(15, 23, 42, 0.95), rgba(30, 15, 55, 0.95));
      backdrop-filter: blur(24px);
      border: 2px solid rgba(168, 85, 247, 0.4);
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(168, 85, 247, 0.25);
      border-radius: 30px;
      padding: 30px 36px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .creator-left {
      display: flex;
      align-items: center;
      gap: 20px;
    }
    .avatar-circle {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: linear-gradient(135deg, #38bdf8, #818cf8);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Outfit', sans-serif;
      font-size: 32px;
      font-weight: 900;
      color: #030712;
      box-shadow: 0 0 25px rgba(56, 189, 248, 0.5);
    }
    .creator-info h2 {
      font-family: 'Outfit', sans-serif;
      font-size: 34px;
      font-weight: 800;
      color: #ffffff;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .verified-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: #0284c7;
      color: #ffffff;
      font-size: 16px;
      font-weight: 900;
    }
    .creator-info p {
      font-size: 22px;
      color: #cbd5e1;
      font-weight: 600;
    }
    .follow-pill {
      background: linear-gradient(90deg, #0284c7, #6366f1);
      box-shadow: 0 4px 20px rgba(2, 132, 199, 0.4);
      padding: 12px 28px;
      border-radius: 30px;
      font-family: 'Outfit', sans-serif;
      font-size: 22px;
      font-weight: 800;
      color: #ffffff;
      white-space: nowrap;
    }
    /* Bookmark / Save Card */
    .save-card {
      background: linear-gradient(145deg, rgba(20, 10, 40, 0.95), rgba(10, 5, 25, 0.95));
      backdrop-filter: blur(24px);
      border: 2.5px solid #facc15;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8), 0 0 35px rgba(250, 204, 21, 0.25);
      border-radius: 30px;
      padding: 34px 40px;
      display: flex;
      align-items: center;
      gap: 26px;
    }
    .save-icon-box {
      width: 90px;
      height: 90px;
      border-radius: 24px;
      background: rgba(250, 204, 21, 0.15);
      border: 2px solid #facc15;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 44px;
      flex-shrink: 0;
      box-shadow: 0 0 30px rgba(250, 204, 21, 0.35);
    }
    .save-content h3 {
      font-size: 32px;
      font-weight: 800;
      color: #fef08a;
      line-height: 1.25;
      margin-bottom: 6px;
    }
    .save-content p {
      font-size: 22px;
      color: #cbd5e1;
    }
    /* Floating Facebook Comment Bubble */
    .comment-bubble-card {
      background: rgba(15, 23, 42, 0.95);
      backdrop-filter: blur(24px);
      border: 2.5px solid #38bdf8;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8), 0 0 35px rgba(56, 189, 248, 0.3);
      border-radius: 30px;
      padding: 32px 38px;
      display: flex;
      gap: 22px;
    }
    .comment-avatar {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: #0284c7;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      flex-shrink: 0;
    }
    .comment-box {
      flex: 1;
      background: rgba(30, 41, 59, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 20px;
      padding: 18px 24px;
    }
    .comment-header {
      font-family: 'Outfit', sans-serif;
      font-size: 20px;
      font-weight: 800;
      color: #38bdf8;
      margin-bottom: 6px;
    }
    .comment-main {
      font-size: 30px;
      font-weight: 800;
      color: #ffffff;
      margin-bottom: 6px;
    }
    .comment-sub {
      font-size: 20px;
      color: #94a3b8;
      font-weight: 500;
    }
    /* Bottom Voice Caption Card */
    .bottom-caption-card {
      position: absolute;
      bottom: 200px;
      left: 60px;
      right: 60px;
      background: rgba(3, 7, 18, 0.94);
      backdrop-filter: blur(24px);
      border: 3px solid #c084fc;
      box-shadow: 0 16px 45px rgba(0, 0, 0, 0.9), 0 0 35px rgba(192, 132, 252, 0.35);
      border-radius: 28px;
      padding: 28px 36px;
      text-align: center;
      z-index: 50;
    }
    .caption-pill {
      display: inline-block;
      background: rgba(168, 85, 247, 0.2);
      border: 1px solid #c084fc;
      color: #e9d5ff;
      padding: 6px 20px;
      border-radius: 20px;
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 12px;
    }
    .caption-text {
      font-size: 42px;
      font-weight: 700;
      line-height: 1.35;
      color: #ffffff;
      text-shadow: 0 2px 14px rgba(0,0,0,0.9);
    }
  </style>
</head>
<body>
  <div class="glow-blob-purple"></div>

  <div class="top-header">
    <div class="top-badge">
      <span class="dot"></span>
      <span>💾 SAVE THIS REEL • পরে কাজে লাগবে</span>
    </div>
  </div>

  <div class="cta-hub">
    <!-- Verified Creator Badge -->
    <div class="creator-card">
      <div class="creator-left">
        <div class="avatar-circle">BB</div>
        <div class="creator-info">
          <h2>ByteBangla <span class="verified-icon">✓</span></h2>
          <p>টেকনোলজি সহজ বাংলায় • Verified Creator</p>
        </div>
      </div>
      <div class="follow-pill">+ Follow</div>
    </div>

    <!-- Bookmark / Save Trigger Card -->
    <div class="save-card">
      <div class="save-icon-box">🔖</div>
      <div class="save-content">
        <h3>পরে দরকার হতে পারে — ভিডিওটি এখনই Save করে রাখুন!</h3>
        <p>ভবিষ্যতে সহজেই খুঁজে পেতে নিচের Bookmark অপশনে ক্লিক করে রাখুন।</p>
      </div>
    </div>

    <!-- Floating Facebook Comment Bubble -->
    <div class="comment-bubble-card">
      <div class="comment-avatar">🤖</div>
      <div class="comment-box">
        <div class="comment-header">ByteBangla Automated Assistant</div>
        <div class="comment-main">💬 কমেন্টে লিখুন 'AI'</div>
        <div class="comment-sub">অফিসিয়াল টুল লিঙ্ক ও স্টেপ-বাই-স্টেপ গাইড সরাসরি আপনার ইনবক্সে চলে যাবে! 🚀</div>
      </div>
    </div>
  </div>

  <div class="bottom-caption-card">
    <div class="caption-pill">⚡ ফ্রি রিসোর্স অ্যাক্সেস</div>
    <div class="caption-text">${data.phase4Cta}</div>
  </div>
</body>
</html>
`;
}

/**
 * Renders all 4 dynamic reel scene frames to disk at 1080x1920 (9:16 vertical)
 */
export async function renderDynamicReelScenes(
  data: DynamicReelSceneData,
  outputDir: string,
  chromePath: string = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
): Promise<DynamicReelSceneFrames> {
  ensureDir(outputDir);
  const scene1Path = path.join(outputDir, 'scene1_problem.png');
  const scene2Path = path.join(outputDir, 'scene2_reveal.png');
  const scene3Path = path.join(outputDir, 'scene3_solution.png');
  const scene4Path = path.join(outputDir, 'scene4_cta.png');

  console.log(`[Media Service] 🎨 Rendering 4-Scene Synced 1080x1920 Frames for: "${data.topic}"...`);

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920 });

    // Scene 1: The Problem State (0s – 5s)
    const html1 = buildScene1ProblemHtml(data);
    await page.setContent(html1, { waitUntil: 'domcontentloaded' });
    const buf1 = await page.screenshot({ type: 'png' });
    fs.writeFileSync(scene1Path, buf1);

    // Scene 2: The Tool Reveal (5s – 12s)
    const html2 = buildScene2RevealHtml(data);
    await page.setContent(html2, { waitUntil: 'domcontentloaded' });
    const buf2 = await page.screenshot({ type: 'png' });
    fs.writeFileSync(scene2Path, buf2);

    // Scene 3: The Live Solution & Shortcut (12s – 22s)
    const html3 = buildScene3SolutionHtml(data);
    await page.setContent(html3, { waitUntil: 'domcontentloaded' });
    const buf3 = await page.screenshot({ type: 'png' });
    fs.writeFileSync(scene3Path, buf3);

    // Scene 4: Viral Save & CTA State (22s – 30s)
    const html4 = buildScene4CtaHtml(data);
    await page.setContent(html4, { waitUntil: 'domcontentloaded' });
    const buf4 = await page.screenshot({ type: 'png' });
    fs.writeFileSync(scene4Path, buf4);

    console.log(`[Media Service] ✅ All 4 dynamic synced scenes rendered to disk.`);

    return {
      scene1Path,
      scene2Path,
      scene3Path,
      scene4Path,
    };
  } finally {
    await browser.close();
  }
}

