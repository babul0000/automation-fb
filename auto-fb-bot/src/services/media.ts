import fs from 'fs';
import path from 'path';
import axios from 'axios';
import puppeteer from 'puppeteer-core';
import { Resvg } from '@resvg/resvg-js';
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
 * Extracts structured 3-step actionable data from Bengali topic for Single Master Infographic
 */
export async function extractInfographicDataWithAI(
  topicTitle: string,
  categoryOverride?: string
): Promise<InfographicData> {
  const fallback: InfographicData = {
    category: categoryOverride || '💡 স্মার্ট টিপস',
    headline: topicTitle.slice(0, 60),
    subhead: 'নিজের ও পরিবারের সুরক্ষায় ৩টি অত্যন্ত জরুরি নিয়ম',
    steps: [
      {
        num: '০১',
        title: 'অচেনা কল বা বার্তায় সতর্ক থাকুন',
        desc: 'অচেনা নম্বর থেকে পিন বা ওটিপি চাইলে কখনোই মুখে বলবেন না।',
      },
      {
        num: '০২',
        title: 'তাৎক্ষণিকভাবে নম্বর যাচাই করুন',
        desc: 'সরাসরি অফিশিয়াল কাস্টমার কেয়ার বা হেল্পলাইনে কল দিয়ে নিশ্চিত হোন।',
      },
      {
        num: '০৩',
        title: 'প্রয়োজনে দ্রুত ব্যবস্থা নিন',
        desc: 'সন্দেহ হলে অ্যাকাউন্ট সাময়িক ব্লক করুন এবং অভিযোগ দায়ের করুন।',
      },
    ],
    cta: 'দরকারি তথ্যটি বন্ধুদের সাথে Share করুন',
  };

  if (!isConfiguredForGemini()) {
    return fallback;
  }

  const prompt = `You are the lead visual infographic editor for "ByteBangla" (সহজ বাংলায় টেক টিপস ও ডিজিটাল সতর্কতা).
Analyze this topic: "${topicTitle}".
Create structured, high-value Bengali content for a Single High-Impact Master Infographic (1080x1350) for Facebook.

CRITICAL RULES:
1. ZERO CODE JARGON: Strictly NO programming code, NO terminal commands, NO "//", NO "git commit", NO developer syntax. Everything must be in crystal-clear, natural, everyday Bengali for general smartphone users (ages 15-50).
2. Exactly 3 High-Impact Cards:
   - Each card must have a punchy 4-7 word title in Bengali (for 30px bold display).
   - Each card must have a clear, actionable 1-2 sentence description explaining exactly what to do (for 24px clean display).
   - Focus on practical everyday utility (scam protection, mobile settings, useful web features, digital safety).

Return ONLY a valid JSON object without markdown fences:
{
  "category": "ছোট ক্যাটাগরি ইমোজি সহ (যেমন: 🚨 সাইবার সতর্কতা, 💡 মোবাইল ট্রিকস, ⚡ লাইফ হ্যাক, 🛡️ ডিজিটাল নিরাপত্তা)",
  "headline": "বড় ও বোল্ড আকর্ষণীয় বাংলা শিরোনাম (পেইন পয়েন্ট ও সমাধান, সর্বোচ্চ ৮-১২ শব্দ)",
  "subhead": "১ লাইনের সহজ প্রেক্ষাপট (যেমন: নিজেকে সুরক্ষিত রাখতে ৩টি অত্যন্ত জরুরি নিয়ম)",
  "steps": [
    { "num": "০১", "title": "স্টেপ ১ এর স্পষ্ট শিরোনাম", "desc": "সহজ ভাষায় বাস্তবসম্মত নির্দেশিকা যা যে কেউ অনুসরণ করতে পারে" },
    { "num": "০২", "title": "স্টেপ ২ এর স্পষ্ট শিরোনাম", "desc": "সহজ ভাষায় বাস্তবসম্মত নির্দেশিকা যা যে কেউ অনুসরণ করতে পারে" },
    { "num": "০৩", "title": "স্টেপ ৩ এর স্পষ্ট শিরোনাম", "desc": "সহজ ভাষায় বাস্তবসম্মত নির্দেশিকা যা যে কেউ অনুসরণ করতে পারে" }
  ],
  "cta": "দরকারি তথ্যটি বন্ধুদের সাথে Share করুন"
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
            category: parsed.category || categoryOverride || '💡 স্মার্ট টিপস',
            headline: parsed.headline,
            subhead: parsed.subhead || 'নিজের ও পরিবারের সুরক্ষায় ৩টি জরুরি নিয়ম',
            steps: parsed.steps.slice(0, 3).map((s: any, idx: number) => ({
              num: `০${idx + 1}`,
              title: s.title,
              desc: s.desc,
            })),
            cta: parsed.cta || 'দরকারি তথ্যটি বন্ধুদের সাথে Share করুন',
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
 * Dynamically resolves Chrome/Chromium executable path across Windows and Linux (Render/Cloud)
 */
export function getChromeExecutablePath(): string {
  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  const isWindows = process.platform === 'win32';
  if (isWindows) {
    const winPaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      `${process.env.LOCALAPPDATA || ''}\\Google\\Chrome\\Application\\chrome.exe`,
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ];
    for (const p of winPaths) {
      if (p && fs.existsSync(p)) return p;
    }
    return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  } else {
    // Linux / Render / Docker
    const linuxPaths = [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
    ];
    for (const p of linuxPaths) {
      if (fs.existsSync(p)) return p;
    }
    return process.env.CHROME_PATH || '/usr/bin/google-chrome-stable';
  }
}

/**
 * Zero-dependency native SVG renderer using @resvg/resvg-js and local HindSiliguri font.
 * Ensures 100% reliable rendering on cloud Linux containers (Render, Railway, Docker) where Chrome is not installed.
 */
export function renderInfographicWithResvg(
  data: InfographicData,
  width: number = 1080,
  height: number = 1350
): Buffer {
  const escapeXml = (str: string) =>
    (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

  const category = escapeXml(data.category || '💡 স্মার্ট টিপস');
  const headline = escapeXml(data.headline || '');
  const subhead = escapeXml(data.subhead || 'দরকারি ও জরুরি তথ্য');
  const cta = escapeXml(data.cta || 'দরকারি তথ্যটি বন্ধুদের সাথে Share করুন');

  const headlineWords = headline.split(' ');
  let line1 = headline;
  let line2 = '';
  if (headlineWords.length > 5) {
    const mid = Math.ceil(headlineWords.length / 2);
    line1 = headlineWords.slice(0, mid).join(' ');
    line2 = headlineWords.slice(mid).join(' ');
  }

  const cardColors = [
    { numBg: 'rgba(2, 132, 199, 0.25)', border: '#38bdf8', text: '#38bdf8' },
    { numBg: 'rgba(250, 204, 21, 0.25)', border: '#facc15', text: '#facc15' },
    { numBg: 'rgba(74, 222, 128, 0.25)', border: '#4ade80', text: '#4ade80' },
  ];

  const cardYStart = line2 ? 370 : 330;
  const cardHeight = 220;
  const cardGap = 32;

  let cardsSvg = '';
  data.steps.slice(0, 3).forEach((s, idx) => {
    const y = cardYStart + idx * (cardHeight + cardGap);
    const color = cardColors[idx % cardColors.length];
    const sTitle = escapeXml(s.title);
    const sDesc = escapeXml(s.desc);

    cardsSvg += `
      <g transform="translate(64, ${y})">
        <rect width="952" height="${cardHeight}" rx="22" fill="#0f172a" fill-opacity="0.9" stroke="rgba(255, 255, 255, 0.15)" stroke-width="1.5" />
        <rect x="28" y="45" width="70" height="70" rx="18" fill="${color.numBg}" stroke="${color.border}" stroke-width="2" />
        <text x="63" y="92" font-family="'Hind Siliguri', 'Kalpurush', sans-serif" font-size="34" font-weight="bold" fill="${color.text}" text-anchor="middle">${s.num}</text>
        <text x="125" y="75" font-family="'Hind Siliguri', 'Kalpurush', sans-serif" font-size="30" font-weight="bold" fill="#f8fafc">${sTitle}</text>
        <text x="125" y="125" font-family="'Hind Siliguri', 'Kalpurush', sans-serif" font-size="24" fill="#cbd5e1">${sDesc}</text>
      </g>
    `;
  });

  const svg = `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#0f1f38" />
      <stop offset="100%" stop-color="#030712" />
    </linearGradient>
    <radialGradient id="glow1" cx="20%" cy="10%" r="40%">
      <stop offset="0%" stop-color="#0284c7" stop-opacity="0.25" />
      <stop offset="100%" stop-color="#0284c7" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="glow2" cx="80%" cy="90%" r="40%">
      <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.2" />
      <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0" />
    </radialGradient>
  </defs>

  <rect width="${width}" height="${height}" fill="url(#bgGrad)" />
  <rect width="${width}" height="${height}" fill="url(#glow1)" />
  <rect width="${width}" height="${height}" fill="url(#glow2)" />

  <!-- Top Header -->
  <g transform="translate(64, 56)">
    <rect width="280" height="52" rx="26" fill="rgba(56, 189, 248, 0.15)" stroke="#38bdf8" stroke-width="1.5" />
    <text x="140" y="34" font-family="'Hind Siliguri', 'Kalpurush', sans-serif" font-size="22" font-weight="bold" fill="#38bdf8" text-anchor="middle">${category}</text>

    <g transform="translate(732, 0)">
      <rect width="220" height="52" rx="16" fill="rgba(15, 23, 42, 0.85)" stroke="rgba(255, 255, 255, 0.18)" stroke-width="1" />
      <circle cx="30" cy="26" r="5" fill="#38bdf8" />
      <text x="120" y="34" font-family="sans-serif" font-size="20" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="1.5">BYTEBANGLA</text>
    </g>
  </g>

  <!-- Headline -->
  <g transform="translate(64, 175)">
    <text x="0" y="45" font-family="'Hind Siliguri', 'Kalpurush', sans-serif" font-size="46" font-weight="bold" fill="#ffffff">${line1}</text>
    ${line2 ? `<text x="0" y="105" font-family="'Hind Siliguri', 'Kalpurush', sans-serif" font-size="46" font-weight="bold" fill="#ffffff">${line2}</text>` : ''}
    <text x="0" y="${line2 ? 155 : 95}" font-family="'Hind Siliguri', 'Kalpurush', sans-serif" font-size="24" fill="#94a3b8">${subhead}</text>
  </g>

  <!-- Cards -->
  ${cardsSvg}

  <!-- Footer CTA Bar -->
  <g transform="translate(64, 1210)">
    <rect width="952" height="74" rx="20" fill="#090d16" stroke="rgba(255, 255, 255, 0.16)" stroke-width="1.5" />
    <text x="32" y="46" font-family="'Hind Siliguri', 'Kalpurush', sans-serif" font-size="24" font-weight="bold" fill="#facc15">📌 ${cta}</text>
    <text x="910" y="46" font-family="sans-serif" font-size="22" font-weight="bold" fill="#38bdf8" text-anchor="end">⚡ ByteBangla</text>
  </g>
</svg>
`;

  const fontCandidates = [
    path.resolve(process.cwd(), 'assets', 'fonts', 'HindSiliguri-Bold.ttf'),
    path.resolve(__dirname, '..', '..', 'assets', 'fonts', 'HindSiliguri-Bold.ttf'),
  ];
  const existingFont = fontCandidates.find((f) => fs.existsSync(f));

  const resvgOptions: any = {
    fitTo: { mode: 'width', value: width },
  };

  if (existingFont) {
    resvgOptions.font = {
      fontFiles: [existingFont],
      defaultFontFamily: 'Hind Siliguri',
      loadSystemFonts: true,
    };
  }

  const resvg = new Resvg(svg, resvgOptions);
  return Buffer.from(resvg.render().asPng());
}

/**
 * Renders a pixel-perfect Single High-Impact Master Infographic (1080x1350 Portrait / 1080x1080 Square)
 * Features zero code jargon, large 30px card titles, 24px descriptions, category pill, and ByteBangla footer.
 */
export async function renderInfographicToPng(
  data: InfographicData,
  width: number = 1080,
  height: number = 1350,
  chromePath: string = getChromeExecutablePath()
): Promise<Buffer> {
  try {
    const browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height });

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@500;600;700;800&family=Outfit:wght@700;800;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: ${width}px;
      height: ${height}px;
      background: radial-gradient(circle at 50% 6%, #0f1f38 0%, #030712 100%);
      font-family: 'Hind Siliguri', 'Kalpurush', sans-serif;
      color: #FFFFFF;
      overflow: hidden;
      padding: 56px 64px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
    }
    .glow-blob-1 {
      position: absolute;
      width: 650px;
      height: 650px;
      border-radius: 50%;
      background: #0284c7;
      filter: blur(180px);
      opacity: 0.22;
      top: -120px;
      left: -100px;
      pointer-events: none;
    }
    .glow-blob-2 {
      position: absolute;
      width: 650px;
      height: 650px;
      border-radius: 50%;
      background: #8b5cf6;
      filter: blur(190px);
      opacity: 0.18;
      bottom: -100px;
      right: -100px;
      pointer-events: none;
    }

    /* Top Branding & Category Header */
    .header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: relative;
      z-index: 10;
      margin-bottom: 22px;
    }
    .category-pill {
      background: rgba(56, 189, 248, 0.15);
      border: 1.5px solid rgba(56, 189, 248, 0.45);
      color: #38bdf8;
      padding: 10px 24px;
      border-radius: 9999px;
      font-size: 24px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      box-shadow: 0 4px 20px rgba(56, 189, 248, 0.2);
    }
    .brand-badge {
      display: flex;
      align-items: center;
      gap: 10px;
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.14);
      padding: 10px 22px;
      border-radius: 16px;
    }
    .brand-badge-dot {
      width: 10px;
      height: 10px;
      background: #38bdf8;
      border-radius: 50%;
      box-shadow: 0 0 12px #38bdf8;
    }
    .brand-name {
      font-family: 'Outfit', sans-serif;
      font-size: 20px;
      font-weight: 800;
      color: #f8fafc;
      letter-spacing: 1.5px;
    }

    /* Headline Section */
    .hero {
      position: relative;
      z-index: 10;
      margin-bottom: 26px;
    }
    .headline {
      font-size: 48px;
      font-weight: 800;
      line-height: 1.25;
      color: #ffffff;
      text-shadow: 0 4px 24px rgba(0, 0, 0, 0.75);
      margin-bottom: 10px;
      letter-spacing: -0.3px;
    }
    .subhead {
      font-size: 25px;
      color: #94a3b8;
      font-weight: 500;
      line-height: 1.35;
    }

    /* 3 Actionable Step Cards (Zero Code Jargon) */
    .cards-container {
      display: flex;
      flex-direction: column;
      gap: 20px;
      position: relative;
      z-index: 10;
      flex: 1;
      justify-content: center;
      margin-bottom: 26px;
    }
    .card {
      background: rgba(15, 23, 42, 0.85);
      border: 1.5px solid rgba(255, 255, 255, 0.13);
      border-radius: 22px;
      padding: 26px 30px;
      display: flex;
      align-items: flex-start;
      gap: 24px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
      backdrop-filter: blur(12px);
    }
    .card-num {
      width: 68px;
      height: 68px;
      min-width: 68px;
      border-radius: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Hind Siliguri', 'Outfit', sans-serif;
      font-size: 32px;
      font-weight: 800;
      flex-shrink: 0;
    }
    .card:nth-child(1) .card-num {
      background: rgba(2, 132, 199, 0.18);
      border: 2px solid #38bdf8;
      color: #38bdf8;
      box-shadow: 0 0 18px rgba(56, 189, 248, 0.25);
    }
    .card:nth-child(2) .card-num {
      background: rgba(250, 204, 21, 0.18);
      border: 2px solid #facc15;
      color: #facc15;
      box-shadow: 0 0 18px rgba(250, 204, 21, 0.25);
    }
    .card:nth-child(3) .card-num {
      background: rgba(74, 222, 128, 0.18);
      border: 2px solid #4ade80;
      color: #4ade80;
      box-shadow: 0 0 18px rgba(74, 222, 128, 0.25);
    }
    .card-content {
      flex: 1;
    }
    .card-content h3 {
      font-size: 30px;
      font-weight: 700;
      margin-bottom: 8px;
      color: #f8fafc;
      line-height: 1.25;
    }
    .card-content p {
      font-size: 24px;
      color: #cbd5e1;
      font-weight: 400;
      line-height: 1.4;
    }

    /* Footer Bar */
    .cta-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #090d16;
      border: 1.5px solid rgba(255, 255, 255, 0.14);
      padding: 20px 32px;
      border-radius: 20px;
      position: relative;
      z-index: 10;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    }
    .cta-left {
      display: flex;
      align-items: center;
      gap: 14px;
      font-size: 25px;
      font-weight: 700;
      color: #facc15;
    }
    .cta-badge-icon {
      font-size: 24px;
    }
    .tag {
      font-family: 'Outfit', sans-serif;
      font-size: 22px;
      font-weight: 800;
      color: #38bdf8;
      letter-spacing: 0.5px;
    }
  </style>
</head>
<body>
  <div class="glow-blob-1"></div>
  <div class="glow-blob-2"></div>

  <!-- Header: Category Pill & Brand Badge -->
  <div class="header-row">
    <div class="category-pill">${data.category}</div>
    <div class="brand-badge">
      <div class="brand-badge-dot"></div>
      <span class="brand-name">BYTEBANGLA</span>
    </div>
  </div>

  <!-- Hero Section -->
  <div class="hero">
    <h1 class="headline">${data.headline}</h1>
    <p class="subhead">${data.subhead}</p>
  </div>

  <!-- 3 High-Impact Cards (Zero Code Jargon) -->
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

  <!-- Footer CTA Bar -->
  <div class="cta-bar">
    <div class="cta-left">
      <span class="cta-badge-icon">📌</span>
      <span>${data.cta || 'দরকারি তথ্যটি বন্ধুদের সাথে Share করুন'}</span>
    </div>
    <div class="tag">⚡ ByteBangla</div>
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
} catch (browserError: any) {
  console.warn(`[Media Service Warning] Puppeteer browser launch failed (${browserError.message}). Executing native SVG Resvg fallback...`);
  return renderInfographicWithResvg(data, width, height);
}
}

/**
 * Generates strictly ONE Single High-Impact Master Infographic (1080x1350)
 * Saves to output/single_post.png and data/posts/
 */
export async function generateSingleMasterInfographic(
  topicTitle: string,
  categoryOverride?: string
): Promise<BannerResult> {
  const seed = Math.floor(Math.random() * 1000000);
  console.log(`[Media Service] 🎨 Crafting Single Master Infographic (1080x1350) for: "${topicTitle}"...`);

  const infographicData = await extractInfographicDataWithAI(topicTitle, categoryOverride);
  const buffer = await renderInfographicToPng(infographicData, 1080, 1350);

  // 1. Save strictly to output/single_post.png as requested
  const outputDir = path.resolve(process.cwd(), 'output');
  ensureDir(outputDir);
  const singlePostPath = path.join(outputDir, 'single_post.png');
  fs.writeFileSync(singlePostPath, buffer);

  // 2. Also archive into data/posts for database history
  const postsDir = path.resolve(process.cwd(), 'data', 'posts');
  ensureDir(postsDir);
  const archivedFilename = `single_master_${Date.now()}_${seed}.png`;
  const archivedFilePath = path.join(postsDir, archivedFilename);
  fs.writeFileSync(archivedFilePath, buffer);

  console.log(`[Media Service] ✅ Single High-Impact Master Infographic generated: ${singlePostPath}`);

  return {
    imageUrl: singlePostPath,
    imagePath: singlePostPath,
    imageBuffer: buffer,
    prompt: `ByteBangla Single Master Infographic: ${topicTitle}`,
    seed,
    slideType: 'master_infographic',
  };
}

/**
 * Generates a high-converting, branded single Master Infographic banner for a Facebook post
 */
export async function generatePostBanner(topicTitle: string): Promise<BannerResult> {
  return generateSingleMasterInfographic(topicTitle);
}

/**
 * Compatibility wrapper: returns single high-impact master infographic as 1-element array
 */
export async function generateCarouselSlides(topicTitle: string): Promise<BannerResult[]> {
  const single = await generateSingleMasterInfographic(topicTitle);
  return [single];
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
  viral_trend: {
    id: 'viral_trend',
    badge: '🔥 আজকের ভাইরাল ট্রেন্ড',
    accentColor: '#F97316', // Orange
    glowColor: '#EA580C',
    defaultHook: 'ভাইরাল ট্রেন্ড!',
    defaultActionKeycap: '১ মিনিটে সমাধান',
    defaultActionLabel: 'নতুন ভাইরাল ফিচার',
    iconSvg: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 2c1.1 0 2 .9 2 2v1.1C17.6 8.5 20 12 20 16c0 4.4-3.6 8-8 8s-8-3.6-8-8c0-4 2.4-7.5 6-8.9V4c0-1.1.9-2 2-2z" fill="#F97316"/></svg>`,
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
  chromePath: string = getChromeExecutablePath()
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

/**
 * Renders a single sleek floating glass badge for the top-center of vertical Reels.
 * Pure transparent 1080x1920 canvas with ONLY the glass badge at Y=140px.
 * Zero ugly cards or blocking UI.
 */
export async function renderTopGlassBadge(
  badgeText: string = '🔥 আজকের ভাইরাল ট্রেন্ড',
  outPngPath: string,
  chromePath: string = getChromeExecutablePath()
): Promise<string> {
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@700&family=Outfit:wght@800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 1080px;
      height: 1920px;
      background: transparent;
      overflow: hidden;
      position: relative;
    }
    .top-floating-badge {
      position: absolute;
      top: 140px;
      left: 0;
      width: 1080px;
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 100;
    }
    .glass-pill {
      display: inline-flex;
      align-items: center;
      gap: 14px;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 2px solid rgba(255, 255, 255, 0.28);
      box-shadow: 0 12px 35px rgba(0, 0, 0, 0.7), 0 0 30px rgba(249, 115, 22, 0.3);
      padding: 14px 28px;
      border-radius: 9999px;
    }
    .badge-text {
      font-family: 'Hind Siliguri', 'Kalpurush', sans-serif;
      font-size: 32px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: 0.5px;
      text-shadow: 0 2px 8px rgba(0, 0, 0, 0.8);
    }
    .brand-tag {
      font-family: 'Outfit', sans-serif;
      font-size: 17px;
      font-weight: 800;
      color: #f97316;
      background: rgba(249, 115, 22, 0.18);
      border: 1.5px solid rgba(249, 115, 22, 0.5);
      padding: 3px 12px;
      border-radius: 12px;
      margin-left: 4px;
      letter-spacing: 1px;
    }
  </style>
</head>
<body>
  <div class="top-floating-badge">
    <div class="glass-pill">
      <span class="badge-text">${badgeText}</span>
      <span class="brand-tag">BYTEBANGLA</span>
    </div>
  </div>
</body>
</html>
`;

    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    const buffer = await page.screenshot({ type: 'png', omitBackground: true });
    fs.writeFileSync(outPngPath, buffer);
    console.log(`[Media Service] ✨ Rendered sleek top floating glass badge: "${badgeText}"`);
    return outPngPath;
  } finally {
    await browser.close();
  }
}

export interface ReelCoverOptions {
  headline: string;
  category?: string;
  bgFramePath?: string;
  outputPath?: string;
}

/**
 * Renders a dedicated 1080x1920 Viral Reel Cover Thumbnail (output/cover.jpg)
 * Features:
 * 1. Video background frame at t=2.5s with cinematic dark vignette
 * 2. Massive, bold Bengali headline in the middle (88px, vibrant yellow)
 * 3. Official ByteBangla brand badge at the bottom
 */
export async function renderReelCoverThumbnail(
  options: ReelCoverOptions,
  chromePath: string = getChromeExecutablePath()
): Promise<string> {
  const finalOutPath = options.outputPath || path.resolve(process.cwd(), 'output', 'cover.jpg');
  const outDir = path.dirname(finalOutPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  let bgDataUri = '';
  if (options.bgFramePath && fs.existsSync(options.bgFramePath)) {
    try {
      const buf = fs.readFileSync(options.bgFramePath);
      bgDataUri = `data:image/jpeg;base64,${buf.toString('base64')}`;
    } catch {}
  }

  // Shorten headline to punchy 5-7 words so it stays massive (88px) on mobile screens
  let cleanHeadline = (options.headline || 'আজকের ভাইরাল ট্রেন্ড ও টেক হ্যাক!')
    .replace(/[\"\'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleanHeadline.length > 40) {
    const parts = cleanHeadline.split(/[।?!,]/).map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0 && parts[0].length >= 10 && parts[0].length <= 40) {
      cleanHeadline = parts[0] + '!';
    } else {
      cleanHeadline = cleanHeadline.split(' ').slice(0, 6).join(' ') + '...';
    }
  }

  const badgeCategory = options.category || '🔥 আজকের ভাইরাল ট্রেন্ড';

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@700;800&family=Outfit:wght@800;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 1080px;
      height: 1920px;
      background: #090d16;
      overflow: hidden;
      position: relative;
      font-family: 'Hind Siliguri', sans-serif;
    }
    .bg-layer {
      position: absolute;
      top: 0;
      left: 0;
      width: 1080px;
      height: 1920px;
      object-fit: cover;
      z-index: 1;
      filter: brightness(0.65) contrast(1.15);
    }
    .vignette-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 1080px;
      height: 1920px;
      background: radial-gradient(circle at center, rgba(15, 23, 42, 0.2) 0%, rgba(15, 23, 42, 0.85) 80%, rgba(5, 8, 16, 0.98) 100%),
                  linear-gradient(180deg, rgba(15, 23, 42, 0.85) 0%, transparent 25%, transparent 65%, rgba(5, 8, 16, 0.95) 100%);
      z-index: 2;
    }
    .content-wrapper {
      position: relative;
      z-index: 10;
      width: 1080px;
      height: 1920px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: center;
      padding: 140px 60px 100px 60px;
    }
    /* Top Category Badge */
    .top-badge-container {
      display: flex;
      justify-content: center;
      width: 100%;
    }
    .glass-pill {
      display: inline-flex;
      align-items: center;
      gap: 14px;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(24px);
      border: 2px solid rgba(255, 255, 255, 0.28);
      box-shadow: 0 12px 35px rgba(0, 0, 0, 0.7), 0 0 30px rgba(249, 115, 22, 0.3);
      padding: 14px 28px;
      border-radius: 9999px;
    }
    .badge-text {
      font-size: 32px;
      font-weight: 700;
      color: #ffffff;
      text-shadow: 0 2px 8px rgba(0, 0, 0, 0.8);
    }
    .brand-tag {
      font-family: 'Outfit', sans-serif;
      font-size: 17px;
      font-weight: 800;
      color: #f97316;
      background: rgba(249, 115, 22, 0.22);
      border: 1.5px solid rgba(249, 115, 22, 0.6);
      padding: 3px 12px;
      border-radius: 12px;
      letter-spacing: 1px;
    }
    /* Center Stage Massive Hook Card */
    .hero-box {
      width: 100%;
      background: rgba(15, 23, 42, 0.82);
      backdrop-filter: blur(30px);
      -webkit-backdrop-filter: blur(30px);
      border: 3px solid rgba(250, 204, 21, 0.45);
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.9), 0 0 50px rgba(250, 204, 21, 0.2);
      border-radius: 40px;
      padding: 60px 45px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .curiosity-pill {
      display: inline-block;
      font-family: 'Outfit', sans-serif;
      background: linear-gradient(135deg, #ef4444, #f97316);
      color: #ffffff;
      font-size: 26px;
      font-weight: 800;
      letter-spacing: 1px;
      padding: 8px 24px;
      border-radius: 9999px;
      box-shadow: 0 8px 20px rgba(239, 68, 68, 0.4);
      margin-bottom: 24px;
      text-transform: uppercase;
    }
    .headline-text {
      font-size: 88px;
      font-weight: 800;
      line-height: 1.25;
      color: #facc15;
      text-shadow: 0 6px 25px rgba(0, 0, 0, 0.95), 0 0 40px rgba(250, 204, 21, 0.35);
      margin-bottom: 24px;
      word-break: break-word;
    }
    .action-sub {
      font-size: 32px;
      font-weight: 700;
      color: #38bdf8;
      letter-spacing: 0.5px;
      text-shadow: 0 3px 10px rgba(0, 0, 0, 0.9);
    }
    /* Bottom Brand Bar */
    .bottom-bar {
      width: 100%;
      background: rgba(15, 23, 42, 0.92);
      backdrop-filter: blur(20px);
      border: 1.5px solid rgba(255, 255, 255, 0.2);
      border-radius: 28px;
      padding: 20px 35px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 15px 40px rgba(0, 0, 0, 0.8);
    }
    .brand-left {
      display: flex;
      align-items: center;
      gap: 18px;
    }
    .brand-icon {
      width: 58px;
      height: 58px;
      border-radius: 18px;
      background: linear-gradient(135deg, #f97316, #e11d48);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      box-shadow: 0 6px 16px rgba(249, 115, 22, 0.4);
    }
    .brand-col {
      display: flex;
      flex-direction: column;
      text-align: left;
    }
    .brand-title {
      font-family: 'Outfit', sans-serif;
      font-size: 28px;
      font-weight: 900;
      color: #ffffff;
      letter-spacing: 1.5px;
    }
    .brand-slogan {
      font-size: 20px;
      font-weight: 600;
      color: #94a3b8;
    }
    .watch-pill {
      font-family: 'Outfit', sans-serif;
      font-size: 24px;
      font-weight: 800;
      background: rgba(250, 204, 21, 0.18);
      color: #facc15;
      border: 2px solid rgba(250, 204, 21, 0.5);
      padding: 10px 24px;
      border-radius: 9999px;
      letter-spacing: 1px;
    }
  </style>
</head>
<body>
  ${bgDataUri ? `<img class="bg-layer" src="${bgDataUri}" />` : ''}
  <div class="vignette-overlay"></div>

  <div class="content-wrapper">
    <div class="top-badge-container">
      <div class="glass-pill">
        <span class="badge-text">${badgeCategory}</span>
        <span class="brand-tag">BYTEBANGLA</span>
      </div>
    </div>

    <div class="hero-box">
      <div class="curiosity-pill">⚡ ১ মিনিটে সমাধান</div>
      <h1 class="headline-text">${cleanHeadline}</h1>
      <div class="action-sub">👉 এখনই পুরো ভিডিওটি দেখুন</div>
    </div>

    <div class="bottom-bar">
      <div class="brand-left">
        <div class="brand-icon">⚡</div>
        <div class="brand-col">
          <span class="brand-title">BYTEBANGLA</span>
          <span class="brand-slogan">সহজ বাংলায় ভাইরাল টেক ও লাইফ হ্যাকস</span>
        </div>
      </div>
      <div class="watch-pill">▶️ REEL</div>
    </div>
  </div>
</body>
</html>
`;

    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    const buffer = await page.screenshot({ type: 'jpeg', quality: 95 });
    fs.writeFileSync(finalOutPath, buffer);
    console.log(`[Media Service] 🌟 High-Impact Reel Cover rendered to: ${finalOutPath}`);
    return finalOutPath;
  } finally {
    await browser.close();
  }
}


