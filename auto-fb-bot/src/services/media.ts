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
  capcut: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="5" fill="#000000"/>
      <path d="M4 6.5C4 5.67 4.67 5 5.5 5H9.8L7.4 9.5H4V6.5Z" fill="#FFFFFF"/>
      <path d="M20 6.5C20 5.67 19.33 5 18.5 5H14.2L16.6 9.5H20V6.5Z" fill="#FFFFFF"/>
      <path d="M4 17.5C4 18.33 4.67 19 5.5 19H9.8L7.4 14.5H4V17.5Z" fill="#FFFFFF"/>
      <path d="M20 17.5C20 18.33 19.33 19 18.5 19H14.2L16.6 14.5H20V17.5Z" fill="#FFFFFF"/>
      <rect x="7.5" y="10.5" width="9" height="3" rx="1.5" fill="#00ED82"/>
    </svg>
  `,
  canva: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="canvaGrad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop stop-color="#00C4CC"/>
          <stop offset="1" stop-color="#7D2AE8"/>
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="11" fill="url(#canvaGrad)"/>
      <path d="M12.5 6.5C9.5 6.5 7.5 8.7 7.5 12C7.5 15.3 9.5 17.5 12.5 17.5C14.2 17.5 15.7 16.6 16.5 15.2L14.7 14.1C14.2 14.9 13.4 15.4 12.5 15.4C10.7 15.4 9.5 14 9.5 12C9.5 10 10.7 8.6 12.5 8.6C13.4 8.6 14.2 9.1 14.7 9.9L16.5 8.8C15.7 7.4 14.2 6.5 12.5 6.5Z" fill="white"/>
    </svg>
  `,
  premiere: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="5" fill="#00005B"/>
      <text x="5" y="16" font-family="'Outfit', sans-serif" font-weight="900" font-size="12" fill="#EA77FF">Pr</text>
    </svg>
  `,
  figma: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="2" width="8" height="6.6" rx="3.3" fill="#F24E1E"/>
      <rect x="12" y="2" width="8" height="6.6" rx="3.3" fill="#FF7262"/>
      <rect x="4" y="8.6" width="8" height="6.6" rx="3.3" fill="#A259FF"/>
      <circle cx="16" cy="12" r="3.3" fill="#1ABCFE"/>
      <path d="M4 18.6C4 16.8 5.5 15.3 7.3 15.3H12V20C12 21.8 10.5 23.3 8.7 23.3C6.9 23.3 4 21.8 4 18.6Z" fill="#0ACF83"/>
    </svg>
  `,
  deepseek: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="5" fill="#0284C7"/>
      <path d="M12 4C7.58 4 4 7.58 4 12C4 16.42 7.58 20 12 20C16.42 20 20 16.42 20 12C20 7.58 16.42 4 12 4ZM15 13H9V11H15V13Z" fill="white"/>
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

export type ToolCategory = 'VIDEO_EDITOR' | 'DESIGN_EDITOR' | 'SPREADSHEET' | 'CODE_EDITOR' | 'AI_CHAT' | 'PRODUCTIVITY';

export interface DynamicReelSceneData {
  topic: string;
  pillarCategory?: string;
  twoWordHook?: string;
  actionKeycap?: string;
  actionLabel?: string;
  toolBrand?: string;
  toolName?: string;
  practicalSnippet?: string;
  snippetType?: 'CODE' | 'FORMULA' | 'PROMPT' | 'SHORTCUT';
  targetAudience?: string;
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

export interface PillarTheme {
  id: string;
  badge: string;
  accentColor: string;
  glowColor: string;
  defaultHook: string;
  defaultActionKeycap: string;
  defaultActionLabel: string;
  iconSvg: string;
}

export const PILLAR_THEMES: Record<string, PillarTheme> = {
  smart_life_hacks: {
    id: 'smart_life_hacks',
    badge: '💡 দরকারি লাইফ হ্যাক',
    accentColor: '#06B6D4', // Cyan
    glowColor: '#0891B2',
    defaultHook: 'ফোন মেমোরি ফুল?',
    defaultActionKeycap: 'ক্যাশ মেমোরি ক্লিয়ার',
    defaultActionLabel: '১-ক্লিকে সমাধান',
    iconSvg: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.87-3.13-7-7-7z" fill="#06B6D4"/><path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1z" fill="#06B6D4"/></svg>`,
  },
  scam_alert_security: {
    id: 'scam_alert_security',
    badge: '🛡️ অনলাইন সুরক্ষা ও সতর্কতা',
    accentColor: '#10B981', // Emerald
    glowColor: '#059669',
    defaultHook: 'প্রতারণা সাবধান!',
    defaultActionKeycap: '2-Step Verification',
    defaultActionLabel: 'আইডি ১০০% সুরক্ষিত',
    iconSvg: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3z" fill="#10B981"/><path d="M10 15.5l-3.5-3.5 1.41-1.41L10 12.67l6.09-6.09 1.41 1.41L10 15.5z" fill="#FFFFFF"/></svg>`,
  },
  inspiring_stories: {
    id: 'inspiring_stories',
    badge: '📖 জীবন বদলে দেওয়া গল্প',
    accentColor: '#F59E0B', // Gold
    glowColor: '#D97706',
    defaultHook: 'অসম্ভব ঘুরে দাঁড়ানো',
    defaultActionKeycap: 'ইচ্ছাশক্তির জয়',
    defaultActionLabel: 'জীবন বদলে দেওয়া শিক্ষা',
    iconSvg: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 2l2.4 4.86 5.36.78-3.88 3.78.92 5.34L12 14.24l-4.8 2.52.92-5.34-3.88-3.78 5.36-.78L12 2z" fill="#F59E0B"/></svg>`,
  },
  psychology_wisdom: {
    id: 'psychology_wisdom',
    badge: '🧠 মনস্তত্ত্ব ও জীবনজ্ঞান',
    accentColor: '#A855F7', // Purple
    glowColor: '#9333EA',
    defaultHook: 'মিথ্যা চেনার উপায়',
    defaultActionKeycap: 'মনস্তাত্ত্বিক কৌশল',
    defaultActionLabel: '২ মিনিটের রুল',
    iconSvg: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L4.35 21l3.54-.93C9.28 20.64 10.6 21 12 21c4.97 0 9-4.03 9-9s-4.03-9-9-9z" fill="#A855F7"/><circle cx="9" cy="11" r="1.5" fill="#FFFFFF"/><circle cx="15" cy="11" r="1.5" fill="#FFFFFF"/></svg>`,
  },
  curiosity_history_wonders: {
    id: 'curiosity_history_wonders',
    badge: '🌍 অজানা রহস্য ও তথ্য',
    accentColor: '#EC4899', // Rose
    glowColor: '#DB2777',
    defaultHook: 'অজানা বিস্ময়!',
    defaultActionKeycap: 'ঐতিহাসিক রহস্য',
    defaultActionLabel: 'অবিশ্বাস্য সত্য',
    iconSvg: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#EC4899"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" stroke="#FFFFFF" stroke-width="2"/></svg>`,
  },
};

/**
 * Resolves the visual theme from the 5 universal mass-market pillars
 */
export function resolvePillarTheme(data: DynamicReelSceneData): PillarTheme {
  const text = `${data.pillarCategory || ''} ${data.topic || ''} ${data.phase1Hook || ''} ${data.toolBrand || ''}`.toLowerCase();

  if (
    text.includes('সুরক্ষা') ||
    text.includes('হ্যাক') ||
    text.includes('বিকাশ') ||
    text.includes('নগদ') ||
    text.includes('প্রতারণা') ||
    text.includes('scam') ||
    text.includes('security') ||
    text.includes('পিন')
  ) {
    return PILLAR_THEMES.scam_alert_security;
  }

  if (
    text.includes('গল্প') ||
    text.includes('কালাম') ||
    text.includes('নজরুল') ||
    text.includes('জবস') ||
    text.includes('স্যান্ডার্স') ||
    text.includes('inspiring') ||
    text.includes('story') ||
    text.includes('জীবনী') ||
    text.includes('অনুপ্রেরণা')
  ) {
    return PILLAR_THEMES.inspiring_stories;
  }

  if (
    text.includes('মনস্তত্ত্ব') ||
    text.includes('psychology') ||
    text.includes('বডি ল্যাঙ্গুয়েজ') ||
    text.includes('মিথ্যা') ||
    text.includes('রাগ') ||
    text.includes('দুশ্চিন্তা') ||
    text.includes('অভ্যাস') ||
    text.includes('টাকা ধরে')
  ) {
    return PILLAR_THEMES.psychology_wisdom;
  }

  if (
    text.includes('ইতিহাস') ||
    text.includes('রহস্য') ||
    text.includes('পানাম') ||
    text.includes('লালবাগ') ||
    text.includes('বিস্ময়') ||
    text.includes('সমুদ্র') ||
    text.includes('curiosity') ||
    text.includes('wonder') ||
    text.includes('পৃথিবী')
  ) {
    return PILLAR_THEMES.curiosity_history_wonders;
  }

  return PILLAR_THEMES.smart_life_hacks;
}

export function extractMassMarketHook(data: DynamicReelSceneData, theme: PillarTheme): string {
  if (data.twoWordHook && data.twoWordHook.trim().length > 0) {
    return data.twoWordHook.trim();
  }
  const text = `${data.topic} ${data.phase1Hook || ''}`.toLowerCase();
  if (text.includes('মেমোরি') || text.includes('স্টোরেজ')) return 'ফোন মেমোরি ফুল?';
  if (text.includes('অচেনা') || text.includes('নাম্বার')) return 'অচেনা নম্বর কল?';
  if (text.includes('অনুবাদ') || text.includes('ক্যামেরা')) return 'ক্যামেরা দিয়ে অনুবাদ!';
  if (text.includes('ট্রেন') || text.includes('টিকিট')) return 'ট্রেন টিকিট ট্রিক!';
  if (text.includes('ব্যাটারি') || text.includes('চার্জ')) return 'ব্যাটারি ব্যাকআপ দ্বিগুণ!';
  if (text.includes('বিকাশ') || text.includes('নগদ')) return 'বিকাশ প্রতারণা সাবধান!';
  if (text.includes('হ্যাক') || text.includes('আইডি')) return 'ফেসবুক হ্যাক রক্ষা!';
  if (text.includes('কালাম')) return 'এ পি জে কালাম';
  if (text.includes('নজরুল')) return 'বিদ্রোহী কবি নজরুল';
  if (text.includes('স্টিভ জবস') || text.includes('জবস')) return 'স্টিভ জবসের ঘুরে দাঁড়ানো';
  if (text.includes('মিথ্যা') || text.includes('চোখ')) return 'মিথ্যা চেনার গোপন নিয়ম!';
  if (text.includes('রাগ') || text.includes('দুশ্চিন্তা')) return 'রাগ কমানোর ২ মিনিট!';
  if (text.includes('পানাম')) return 'পানাম নগর রহস্য!';
  if (text.includes('লালবাগ')) return 'লালবাগ কেল্লার সুড়ঙ্গ!';

  return theme.defaultHook;
}

export function resolveMassMarketAction(
  data: DynamicReelSceneData,
  theme: PillarTheme
): { keycap: string; label: string } {
  if (data.actionKeycap && data.actionKeycap.trim().length > 0) {
    return {
      keycap: data.actionKeycap.trim(),
      label: data.actionLabel?.trim() || theme.defaultActionLabel,
    };
  }
  return {
    keycap: theme.defaultActionKeycap,
    label: theme.defaultActionLabel,
  };
}

// Brand preset fallback for backwards compatibility
export interface BrandPreset {
  brandKey: string;
  toolName: string;
  actionKeycap: string;
  actionLabel: string;
  accentColor: string;
  glowColor: string;
  defaultHook: string;
}

export const BRAND_PRESETS: Record<string, BrandPreset> = {
  canva: {
    brandKey: 'canva',
    toolName: 'Canva',
    actionKeycap: 'Magic Switch',
    actionLabel: '1-Click Auto Layout & Instant Resize',
    accentColor: '#00C4CC',
    glowColor: '#7D2AE8',
    defaultHook: 'ডিজাইন নষ্ট',
  },
  capcut: {
    brandKey: 'capcut',
    toolName: 'CapCut',
    actionKeycap: 'Ctrl + B',
    actionLabel: 'Auto Beat Sync & Split',
    accentColor: '#00ED82',
    glowColor: '#00ED82',
    defaultHook: 'ভিডিও কাটছাঁট',
  },
  default: {
    brandKey: 'default',
    toolName: 'Smart Life Hack',
    actionKeycap: 'গোপন ট্রিক',
    actionLabel: '১-ক্লিকে সমাধান',
    accentColor: '#06B6D4',
    glowColor: '#0891B2',
    defaultHook: 'দরকারি তথ্য',
  },
};

export function resolveBrandPreset(data: DynamicReelSceneData): BrandPreset {
  const brand = (data.toolBrand || '').toLowerCase().trim();
  if (brand.includes('canva')) return BRAND_PRESETS.canva;
  if (brand.includes('capcut')) return BRAND_PRESETS.capcut;
  return BRAND_PRESETS.default;
}

export function getSafeToolDisplayName(data: DynamicReelSceneData, preset: BrandPreset): string {
  return preset.toolName;
}

export interface ToolCategoryInfo {
  category: string;
  brandKey: string;
  toolName: string;
  fileName: string;
  tagTitle: string;
  errorBadge: string;
  warningTitle: string;
  warningDesc: string;
  shortcutKeys: string[];
  isFormula: boolean;
  shortcutLabel: string;
  solutionHighlight: string;
  accentColor: string;
  glowColor: string;
  descriptionText: string;
}

export function resolveToolCategoryInfo(data: DynamicReelSceneData): ToolCategoryInfo {
  const theme = resolvePillarTheme(data);
  return {
    category: theme.id,
    brandKey: theme.id,
    toolName: theme.badge,
    fileName: `${theme.id}_viral`,
    tagTitle: theme.badge,
    errorBadge: '⚠️ সাধারণ ভুল',
    warningTitle: '❌ সমস্যা সতর্কতা',
    warningDesc: '⚠️ অসতর্কতায় বড় ক্ষতি!',
    shortcutKeys: [theme.defaultActionKeycap],
    isFormula: false,
    shortcutLabel: theme.defaultActionLabel,
    solutionHighlight: '১০০% কার্যকর সমাধান',
    accentColor: theme.accentColor,
    glowColor: theme.glowColor,
    descriptionText: `${theme.badge} — ১ মিনিটে জেনে নিন দরকারি তথ্য!`,
  };
}

/**
 * Scene 1: The Problem State (Minimalist Floating Glass Pill + Bold 2-Word Hook)
 * Completely eliminates bulky windows. 100% transparent canvas.
 */
function buildScene1ProblemHtml(data: DynamicReelSceneData): string {
  const theme = resolvePillarTheme(data);
  const twoWordHook = extractMassMarketHook(data, theme);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@600;700;800&family=Outfit:wght@700;800;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 1080px;
      height: 1920px;
      background: transparent;
      font-family: 'Hind Siliguri', sans-serif;
      overflow: hidden;
      position: relative;
    }
    .focal-container {
      position: absolute;
      top: 260px;
      left: 0;
      right: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 0 40px;
    }
    .problem-pill {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 2px solid ${theme.accentColor};
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.75), 0 0 35px ${theme.glowColor}66;
      padding: 14px 40px;
      border-radius: 9999px;
      font-size: 28px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: 0.5px;
    }
    .problem-hook {
      margin-top: 20px;
      font-family: 'Hind Siliguri', sans-serif;
      font-size: 58px;
      font-weight: 800;
      line-height: 1.2;
      color: #ffffff;
      text-shadow: 0 4px 20px rgba(0, 0, 0, 0.9), 0 0 35px ${theme.glowColor}88;
      background: linear-gradient(180deg, #ffffff 30%, ${theme.accentColor} 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      max-width: 880px;
    }
  </style>
</head>
<body>
  <div class="focal-container">
    <div class="problem-pill">${theme.badge}</div>
    <div class="problem-hook">${twoWordHook}</div>
  </div>
</body>
</html>
`;
}

/**
 * Scene 2: The Core Reveal (Minimalist Floating Glowing Pill)
 * ONLY clean vector SVG icon + Pillar badge & sub-headline. 100% transparent.
 */
function buildScene2RevealHtml(data: DynamicReelSceneData): string {
  const theme = resolvePillarTheme(data);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@600;700;800&family=Outfit:wght@700;800;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 1080px;
      height: 1920px;
      background: transparent;
      font-family: 'Hind Siliguri', sans-serif;
      overflow: hidden;
      position: relative;
    }
    .focal-container {
      position: absolute;
      top: 260px;
      left: 0;
      right: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 0 40px;
    }
    .tool-pill {
      display: inline-flex;
      align-items: center;
      gap: 22px;
      background: rgba(15, 23, 42, 0.88);
      backdrop-filter: blur(28px);
      -webkit-backdrop-filter: blur(28px);
      border: 2.5px solid ${theme.accentColor};
      box-shadow: 0 16px 45px rgba(0, 0, 0, 0.75), 0 0 45px ${theme.glowColor}66;
      padding: 16px 44px;
      border-radius: 9999px;
    }
    .logo-box {
      width: 56px;
      height: 56px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      filter: drop-shadow(0 0 14px ${theme.glowColor}99);
    }
    .tool-title {
      font-family: 'Hind Siliguri', 'Outfit', sans-serif;
      font-size: 48px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: 0.5px;
      text-shadow: 0 4px 20px rgba(0, 0, 0, 0.9);
    }
    .tool-subbadge {
      margin-top: 18px;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      background: rgba(255, 255, 255, 0.08);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      padding: 8px 24px;
      border-radius: 20px;
      font-family: 'Hind Siliguri', sans-serif;
      font-size: 24px;
      font-weight: 700;
      color: #e2e8f0;
      text-shadow: 0 2px 10px rgba(0, 0, 0, 0.8);
    }
    .tool-subbadge .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: ${theme.accentColor};
      box-shadow: 0 0 12px ${theme.accentColor};
    }
  </style>
</head>
<body>
  <div class="focal-container">
    <div class="tool-pill">
      <div class="logo-box">
        ${theme.iconSvg}
      </div>
      <div class="tool-title">${theme.badge}</div>
    </div>
    <div class="tool-subbadge">
      <span class="dot"></span>
      <span>আসল তথ্য ও সমাধান</span>
    </div>
  </div>
</body>
</html>
`;
}

/**
 * Scene 3: The Action / Takeaway State (Sleek Floating 3D Keycap Pill)
 * ONLY sleek 3D keycap pill (e.g. [ ক্যাশ মেমোরি ক্লিয়ার ] or [ 2-Step Verification ] or [ ২ মিনিটের রুল ])
 * with a glowing border and subtitle. 100% transparent.
 */
function buildScene3SolutionHtml(data: DynamicReelSceneData): string {
  const theme = resolvePillarTheme(data);
  const action = resolveMassMarketAction(data, theme);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@600;700&family=Hind+Siliguri:wght@600;700;800&family=Outfit:wght@700;800;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 1080px;
      height: 1920px;
      background: transparent;
      font-family: 'Hind Siliguri', sans-serif;
      overflow: hidden;
      position: relative;
    }
    .focal-container {
      position: absolute;
      top: 260px;
      left: 0;
      right: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 0 40px;
    }
    .keycap-pill {
      display: inline-flex;
      align-items: center;
      gap: 16px;
      background: linear-gradient(180deg, rgba(30, 41, 59, 0.92) 0%, rgba(15, 23, 42, 0.96) 100%);
      backdrop-filter: blur(28px);
      -webkit-backdrop-filter: blur(28px);
      border: 2.5px solid ${theme.accentColor};
      border-bottom: 7px solid ${theme.glowColor};
      box-shadow: 0 18px 45px rgba(0, 0, 0, 0.75), 0 0 40px ${theme.glowColor}55;
      padding: 18px 48px;
      border-radius: 28px;
    }
    .key-badge {
      font-family: 'Hind Siliguri', 'Outfit', sans-serif;
      font-size: 48px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: 0.5px;
      text-shadow: 0 3px 14px rgba(0, 0, 0, 0.9), 0 0 25px ${theme.glowColor}99;
    }
    .action-caption {
      margin-top: 18px;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      background: rgba(15, 23, 42, 0.8);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      padding: 8px 26px;
      border-radius: 20px;
      font-family: 'Hind Siliguri', sans-serif;
      font-size: 24px;
      font-weight: 700;
      color: ${theme.accentColor};
      text-shadow: 0 2px 10px rgba(0, 0, 0, 0.8);
    }
    .action-caption .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: ${theme.accentColor};
      box-shadow: 0 0 10px ${theme.accentColor};
    }
  </style>
</head>
<body>
  <div class="focal-container">
    <div class="keycap-pill">
      <span class="key-badge">[ ${action.keycap} ]</span>
    </div>
    <div class="action-caption">
      <span class="dot"></span>
      <span>${action.label}</span>
    </div>
  </div>
</body>
</html>
`;
}

/**
 * Scene 4: Viral Save & Share CTA State (Minimalist Floating Pill)
 * A single minimalist pill: 🔖 Save করে রাখুন | বন্ধুদের Share করুন
 */
function buildScene4CtaHtml(data: DynamicReelSceneData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@600;700;800&family=Outfit:wght@700;800;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 1080px;
      height: 1920px;
      background: transparent;
      font-family: 'Hind Siliguri', sans-serif;
      overflow: hidden;
      position: relative;
    }
    .focal-container {
      position: absolute;
      top: 260px;
      left: 0;
      right: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 0 40px;
    }
    .cta-pill {
      display: inline-flex;
      align-items: center;
      gap: 16px;
      background: rgba(15, 23, 42, 0.9);
      backdrop-filter: blur(28px);
      -webkit-backdrop-filter: blur(28px);
      border: 2.5px solid #a855f7;
      box-shadow: 0 16px 45px rgba(0, 0, 0, 0.8), 0 0 45px rgba(168, 85, 247, 0.5);
      padding: 18px 46px;
      border-radius: 9999px;
      font-size: 34px;
      font-weight: 800;
      color: #f3e8ff;
      letter-spacing: 0.5px;
      text-shadow: 0 3px 16px rgba(0, 0, 0, 0.9);
      white-space: nowrap;
    }
    .brand-credit {
      margin-top: 18px;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      background: rgba(255, 255, 255, 0.08);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(168, 85, 247, 0.4);
      padding: 8px 24px;
      border-radius: 20px;
      font-family: 'Outfit', 'Hind Siliguri', sans-serif;
      font-size: 22px;
      font-weight: 700;
      color: #e9d5ff;
    }
    .brand-credit .verified-icon {
      width: 22px;
      height: 22px;
      display: inline-flex;
    }
  </style>
</head>
<body>
  <div class="focal-container">
    <div class="cta-pill">
      <span>🔖 Save করে রাখুন | বন্ধুদের Share করুন</span>
    </div>
    <div class="brand-credit">
      <span class="verified-icon">
        <svg viewBox="0 0 24 24" fill="#38BDF8">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
      </span>
      <span>ByteBangla • জীবন বদলে দেওয়া টিপস</span>
    </div>
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
    const buf1 = await page.screenshot({ type: 'png', omitBackground: true });
    fs.writeFileSync(scene1Path, buf1);

    // Scene 2: The Tool Reveal (5s – 12s)
    const html2 = buildScene2RevealHtml(data);
    await page.setContent(html2, { waitUntil: 'domcontentloaded' });
    const buf2 = await page.screenshot({ type: 'png', omitBackground: true });
    fs.writeFileSync(scene2Path, buf2);

    // Scene 3: The Live Solution & Shortcut (12s – 22s)
    const html3 = buildScene3SolutionHtml(data);
    await page.setContent(html3, { waitUntil: 'domcontentloaded' });
    const buf3 = await page.screenshot({ type: 'png', omitBackground: true });
    fs.writeFileSync(scene3Path, buf3);

    // Scene 4: Viral Save & CTA State (22s – 30s)
    const html4 = buildScene4CtaHtml(data);
    await page.setContent(html4, { waitUntil: 'domcontentloaded' });
    const buf4 = await page.screenshot({ type: 'png', omitBackground: true });
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

