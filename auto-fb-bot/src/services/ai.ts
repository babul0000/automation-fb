import axios from 'axios';
import { env, isConfiguredForGemini } from '../config/env';
import {
  BYTEBANGLA_SYSTEM_PROMPT,
  MANDATORY_CTA_FORMULA,
  validateScriptSpecificity,
  BANNED_ABSTRACT_PHRASES,
  BANNED_DEVELOPER_JARGON,
} from './prompts';

export interface ReelsScriptData {
  headlineEn: string;
  hookStyle: string;
  pillarCategory: string;
  hook: string;
  body: string;
  cta: string;
  fullScript: string;
  phase1Hook?: string;
  phase2Solution?: string;
  phase3Steps?: string;
  phase4Cta?: string;
  targetAudience?: string;
  actionKeycap?: string;
  actionLabel?: string;
  twoWordHook?: string;
}

export interface BanglaPostBundle {
  caption: string;
  firstComment: string;
  keywordTrigger: string;
  pillarCategory: string;
  pillarBadge?: string;
  floatingBadge?: string;
  twoWordHook?: string;
  actionKeycap?: string;
  actionLabel?: string;
  reelsScript?: ReelsScriptData;
  reelsVisualPrompts?: string[];
  // Legacy optional properties for backwards compatibility
  toolBrand?: string;
  toolName?: string;
  practicalSnippet?: string;
  snippetType?: 'CODE' | 'FORMULA' | 'PROMPT' | 'SHORTCUT';
  targetAudience?: 'OFFICE' | 'STUDENTS' | 'FREELANCERS';
}

interface GeminiResponse {
  candidates?: {
    content?: {
      parts?: { text: string }[];
    };
  }[];
}

/**
 * Sanitizes a script string by stripping any prohibited abstract placeholder phrases or jargon.
 */
function sanitizeAbstractPlaceholders(text: string): string {
  let cleaned = text;
  for (const banned of BANNED_ABSTRACT_PHRASES) {
    if (cleaned.includes(banned)) {
      if (banned === 'এই কাজটা') {
        cleaned = cleaned.replace(/এই কাজটা/g, 'এই প্রয়োজনীয় বিষয়টি');
      } else if (banned === 'এই দারুণ টেকনিকটি' || banned === 'এই টেকনিকটি') {
        cleaned = cleaned.replace(/এই দারুণ টেকনিকটি/g, 'এই দরকারি নিয়মটি');
      } else if (banned === 'এই টুলটি') {
        cleaned = cleaned.replace(/এই টুলটি/g, 'এই ফিচারটি');
      } else if (banned === 'একটা দারুণ উপায়' || banned === 'এই দারুণ উপায়') {
        cleaned = cleaned.replace(/একটি? দারুণ উপায়/g, 'সরাসরি এই কার্যকর পদ্ধতি');
      } else if (banned === 'এই সেটিংসটি') {
        cleaned = cleaned.replace(/এই সেটিংসটি/g, 'ফোনের এই সিকিউরিটি অপশন');
      } else {
        cleaned = cleaned.split(banned).join('এই পদ্ধতি');
      }
    }
  }

  // Strip developer jargon if accidentally generated
  for (const jargon of BANNED_DEVELOPER_JARGON) {
    if (cleaned.toLowerCase().includes(jargon)) {
      const reg = new RegExp(jargon, 'gi');
      cleaned = cleaned.replace(reg, '');
    }
  }

  return cleaned.trim();
}

/**
 * Ensures Phase 4 contains the mandatory Save & Share trigger and signature human ending.
 */
function enforceSaveAndSignature(ctaText: string): string {
  let result = ctaText;
  if (!result.includes('Save') && !result.includes('সেভ')) {
    result = `📌 দরকারি এই তথ্যটি পরে কাজে লাগবে, তাই ভিডিওটি এখনই Save করে রাখুন আর বন্ধুদের সাথে Share করুন! ` + result;
  }
  if (!result.includes('বাইট বাংলা') && !result.includes('ByteBangla')) {
    result = result.replace(/[!।]$/, '') + ` আর এমন সব ট্রেন্ডিং টেক আপডেটের জন্য সাথে থাকুন বাইট বাংলার!`;
  }
  return result;
}

/**
 * Generates an ultra-viral, mass-market Bengali Facebook post bundle:
 * 1. Targeted at general Bangladeshi population aged 15-50 (students, job seekers, homemakers, professionals, elders).
 * 2. 5 Rotating Hook formulas (Curiosity, Story Suspense, Reality Warning, Direct Value, Psychological Insight).
 * 3. 25-35s (~65-85 words) spoken Reels script with high retention arc.
 * 4. Mandatory Save & Share CTA formula.
 */
export async function generateBanglaPostBundle(topicPrompt: string): Promise<BanglaPostBundle> {
  if (!isConfiguredForGemini()) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  const prompt = `${BYTEBANGLA_SYSTEM_PROMPT}

Create an ultra-viral, mass-market, 100% human-toned post bundle for ByteBangla about this trending topic:
Topic: "${topicPrompt}"

STRICT MASS-MARKET VIRAL RULES:
1. TARGET AUDIENCE:
   General Bangladeshi population aged 15 to 50 (students, job seekers, homemakers, professionals, and elders).
   Language: Natural, conversational Dhaka Bengali (সহজ ও প্রাণবন্ত কথ্য ভাষা), like an engaging elder brother.

2. ZERO PROGRAMMING JARGON:
   ❌ STRICTLY BAN: "TypeScript", "Regex", "VS Code", "Terminal", "API", "Syntax", "npm", "git", "function", "const", "let".
   Focus on hot trends, mobile features, daily life utility, scam safety, or inspiring lessons.

3. 4-PHASE VIRAL SCRIPT FORMULA (25–30s, ~65–85 spoken words):
   - Phase 1 Viral Trend Hook (0–4s): Grab viewer attention immediately referencing the viral trend or curiosity.
     Example style: "আজকে সারা ফেসবুক জুড়ে যে বাংলাদেশ ভ্রমণ ম্যাপের ঝড় চলছে, মাত্র ১ মিনিটে কীভাবে বানাবেন দেখে নিন!"
   - Phase 2 Context (4–10s): Why everyone is talking about it or why this matters right now.
   - Phase 3 Actionable Solution (10–22s): Crisp, clear, step-by-step instructions or direct takeaway.
   - Phase 4 Mandatory CTA (22–30s): Must end with:
     "📌 দরকারি এই তথ্যটি পরে কাজে লাগবে, তাই ভিডিওটি এখনই Save করে রাখুন আর বন্ধুদের সাথে Share করুন! এমন সব ট্রেন্ডিং টেক আপডেটের জন্য সাথে থাকুন বাইট বাংলার!"

4. ORGANIC ENGAGEMENT FIRST COMMENT:
   The firstComment MUST ask an engaging question directly related to the trending topic to spark organic comments and replies!
   Example: "আপনার কি মনে হয় এই নতুন ফিচারটি সাধারণ মানুষের অনেক উপকারে আসবে? আপনি কি ইতিমধ্যে এটি ব্যবহার করেছেন? কমেন্টে জানান! 👇"

5. FLOATING GLASS BADGE:
   Provide "floatingBadge": A sleek short badge text (e.g. "🔥 আজকের ভাইরাল ট্রেন্ড" or "💡 দরকারি লাইফ হ্যাক" or "🛡️ অনলাইন সতর্কতা").

Return ONLY a valid JSON object without markdown code fences:
{
  "caption": "Complete Bengali Facebook post (Viral Hook ➔ Core Context ➔ 3 Actionable Steps ➔ Mandatory Save & Share CTA ➔ Hashtags, NO external URLs)",
  "firstComment": "An engaging question about this trending topic to trigger organic comments from viewers",
  "floatingBadge": "🔥 আজকের ভাইরাল ট্রেন্ড" or "💡 দরকারি লাইফ হ্যাক",
  "keywordTrigger": "TIPS",
  "pillarCategory": "Viral Bangladesh Trend" or "Smart Mobile & Life Hacks" or "Scam Alert & Digital Security" or "Inspiring True Stories & Figures" or "Human Psychology & Practical Wisdom",
  "twoWordHook": "২-৩ শব্দের আকর্ষণীয় হুক",
  "actionKeycap": "২-৩ শব্দের অ্যাকশন টেকঅ্যাওয়ে বা কী-ক্যাপ",
  "actionLabel": "ছোট অ্যাকশন লেবেল",
  "reelsScript": {
    "headlineEn": "3-5 word uppercase English headline for video (e.g. VIRAL BANGLADESH TREND, SMART PHONE HACK, DIGITAL SAFETY ALERT)",
    "hookStyle": "Viral Trend Hook" or "Curiosity Question" or "Story Suspense" or "Reality Warning" or "Direct Value",
    "pillarCategory": "Selected category name",
    "phase1Hook": "Phase 1 (0-4s): প্রথম ৩ সেকেন্ডেই দর্শককে ধরে রাখার ভাইরাল ট্রেন্ড হুক",
    "phase2Solution": "Phase 2 (4-10s): বাস্তব জীবনের প্রসঙ্গ ও কেন এটি এখন সবার জানা জরুরি",
    "phase3Steps": "Phase 3 (10-22s): সরাসরি সমাধান ও ধাপগুলো কী কী",
    "phase4Cta": "Phase 4 (22-30s): 📌 দরকারি এই তথ্যটি পরে কাজে লাগবে, তাই ভিডিওটি এখনই Save করে রাখুন আর বন্ধুদের সাথে Share করুন! এমন সব ট্রেন্ডিং টেক আপডেটের জন্য সাথে থাকুন বাইট বাংলার!",
    "hook": "Phase 1 text",
    "body": "Phase 2 and Phase 3 combined text",
    "cta": "Phase 4 text",
    "fullScript": "সম্পূর্ণ ২৫-৩০ সেকেন্ডের সাবলীল ডায়লগ (৬৫-৮৫ শব্দের ফ্লুয়েন্ট বাংলা, Phase 1 + Phase 2 + Phase 3 + Phase 4 মিলিয়ে)",
    "twoWordHook": "২-৩ শব্দের হুক",
    "actionKeycap": "কী-ক্যাপ টেক্সট",
    "actionLabel": "অ্যাকশন লেবেল"
  }
}`;

  const modelsToTry = [
    process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.5-flash',
    'gemma-4-26b-a4b-it',
    'gemini-flash-latest',
    'gemini-3.5-flash-lite',
  ];

  for (const model of modelsToTry) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
      console.log(`[AI Service] 📦 Generating Mass-Market Post Bundle with model "${model}"...`);

      const response = await axios.post<GeminiResponse>(
        endpoint,
        {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2000 },
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: 35000 }
      );

      const raw = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (raw) {
        const cleaned = raw.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
        const parsed = JSON.parse(cleaned);

        if (parsed.caption && parsed.reelsScript) {
          const phase1 = sanitizeAbstractPlaceholders(
            parsed.reelsScript?.phase1Hook ||
            parsed.reelsScript?.hook ||
            'আজকে সারা ফেসবুক জুড়ে যে বাংলাদেশ ভ্রমণ ম্যাপের ঝড় চলছে, মাত্র ১ মিনিটে কীভাবে বানাবেন দেখে নিন!'
          );
          const phase2 = sanitizeAbstractPlaceholders(
            parsed.reelsScript?.phase2Solution ||
            'সোশ্যাল মিডিয়ায় এখন সবাই নিজের ভ্রমণের রঙিন ম্যাপ শেয়ার করছেন এবং আপনিও খুব সহজে নিজেরটা তৈরি করতে পারবেন।'
          );
          const phase3 = sanitizeAbstractPlaceholders(
            parsed.reelsScript?.phase3Steps ||
            'সহজ এই কাজটি করুন—ভিজিট করুন ট্রাভেল ম্যাপ ওয়েবসাইটে, আপনার ভ্রমণের জেলাগুলো সিলেক্ট করুন আর ডাউনলোড বাটনে ক্লিক করুন।'
          );
          const phase4 = enforceSaveAndSignature(
            sanitizeAbstractPlaceholders(parsed.reelsScript?.phase4Cta || parsed.reelsScript?.cta || '') ||
            MANDATORY_CTA_FORMULA
          );

          let fullScript = parsed.reelsScript?.fullScript?.trim()
            ? sanitizeAbstractPlaceholders(parsed.reelsScript.fullScript.trim())
            : `${phase1} ${phase2} ${phase3} ${phase4}`;

          // Ensure mandatory CTA is incorporated
          if (!fullScript.includes('Save') && !fullScript.includes('সেভ')) {
            fullScript = fullScript.replace(phase4, '').trim() + ` ${phase4}`;
          }
          if (!fullScript.includes('বাইট বাংলা') && !fullScript.includes('ByteBangla')) {
            fullScript += ` এমন সব ট্রেন্ডিং টেক আপডেটের জন্য সাথে থাকুন বাইট বাংলার!`;
          }

          // If word count is outside range, guarantee balanced 4-phase assembly
          const words = fullScript.split(/\s+/);
          if (words.length < 50 || words.length > 100) {
            fullScript = `${phase1} ${phase2} ${phase3} ${phase4}`;
          }

          let finalCaption = sanitizeAbstractPlaceholders(parsed.caption.trim());
          if (!finalCaption.includes('সেভ') && !finalCaption.includes('Save')) {
            finalCaption += `\n\n📌 দরকারি এই তথ্যটি পরে কাজে লাগবে, তাই ভিডিওটি এখনই Save করে রাখুন আর বন্ধুদের সাথে Share করুন!`;
          }
          if (!finalCaption.includes('বাইট বাংলা')) {
            finalCaption += `\n\n💡 এমন সব ট্রেন্ডিং টেক আপডেটের জন্য সাথে থাকুন বাইট বাংলার!`;
          }

          const twoWordHook = parsed.twoWordHook || parsed.reelsScript?.twoWordHook || 'ভাইরাল ট্রেন্ড';
          const actionKeycap = parsed.actionKeycap || parsed.reelsScript?.actionKeycap || '১ মিনিটে সমাধান';
          const actionLabel = parsed.actionLabel || parsed.reelsScript?.actionLabel || 'ভাইরাল ফিচার';
          const pillarCategory = parsed.pillarCategory || 'Viral Bangladesh Trend';
          const floatingBadge = parsed.floatingBadge || '🔥 আজকের ভাইরাল ট্রেন্ড';

          console.log(`[AI Service] ✅ Generated mass-market bundle (${finalCaption.length} chars caption, ${fullScript.split(/\s+/).length} words script).`);

          return {
            caption: finalCaption,
            firstComment: parsed.firstComment?.trim() || 'আপনি কি ইতিমধ্যে এই ভাইরাল বিষয়টি দেখেছেন? আপনার কী মতামত কমেন্টে জানান! 👇',
            keywordTrigger: parsed.keywordTrigger || 'TIPS',
            pillarCategory,
            floatingBadge,
            twoWordHook,
            actionKeycap,
            actionLabel,
            practicalSnippet: actionKeycap,
            snippetType: 'SHORTCUT',
            reelsScript: {
              headlineEn: parsed.reelsScript?.headlineEn || 'VIRAL BANGLADESH TREND',
              hookStyle: parsed.reelsScript?.hookStyle || 'Viral Trend Hook',
              pillarCategory,
              hook: phase1,
              body: `${phase2} ${phase3}`,
              cta: phase4,
              phase1Hook: phase1,
              phase2Solution: phase2,
              phase3Steps: phase3,
              phase4Cta: phase4,
              fullScript,
              twoWordHook,
              actionKeycap,
              actionLabel,
            },
          };
        }
      }
    } catch (err: any) {
      console.warn(`[AI Service Warning] Model "${model}" notice: ${err.message}. Trying next model...`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // Fail-Safe Fallback: Return a guaranteed high-converting bundle if all remote LLMs fail/rate-limit
  console.warn(`[AI Service Warning] Remote AI models unavailable or rate-limited. Synthesizing guaranteed high-converting fallback bundle for topic: "${topicPrompt}"...`);
  const cleanTopic = (topicPrompt || 'স্মার্ট টেক হ্যাক').replace(/["'\\]/g, '').trim();
  const fallbackPhase1 = `আজকে আমরা জানবো ${cleanTopic} নিয়ে অত্যন্ত দরকারি ও গুরুত্বপূর্ণ কিছু তথ্য, যা আপনার প্রতিদিনের কাজে লাগবে!`;
  const fallbackPhase2 = `আমরা প্রতিদিন টেকনোলজি ব্যবহার করলেও এমন অনেক গোপন কৌশল ও সেটিংস রয়েছে যা আমাদের সময় বাঁচায় ও কাজকে সহজ করে তোলে।`;
  const fallbackPhase3 = `এই কৌশলটি সঠিকভাবে কাজে লাগাতে ফোনের সেটিংস বা সংশ্লিষ্ট অপশনটি ওপেন করুন, ফিচারটি সক্রিয় করুন এবং নিজের কাজকে দ্বিগুণ দ্রুত করুন।`;
  const fallbackPhase4 = `📌 দরকারি এই তথ্যটি পরে কাজে লাগবে, তাই ভিডিওটি এখনই Save করে রাখুন আর বন্ধুদের সাথে Share করুন! এমন সব ট্রেন্ডিং টেক আপডেটের জন্য সাথে থাকুন বাইট বাংলার!`;
  const fallbackFullScript = `${fallbackPhase1} ${fallbackPhase2} ${fallbackPhase3} ${fallbackPhase4}`;

  const fallbackCaption = `🔥 ${cleanTopic} — দরকারি তথ্য ও সহজ সমাধান!\n\nঅনেকেই এই সহজ বিষয়টি জানেন না, যার ফলে তাদের অনেক সময় অপচয় হয়। মাত্র ১ মিনিটেই জেনে নিন কীভাবে সহজ ধাপে এটি করবেন।\n\n📌 দরকারি এই তথ্যটি পরে কাজে লাগবে, তাই ভিডিওটি এখনই Save করে রাখুন আর বন্ধুদের সাথে Share করুন!\n\n💡 এমন সব ট্রেন্ডিং টেক আপডেটের জন্য সাথে থাকুন বাইট বাংলার!\n\n#ByteBangla #BanglaTips #TechTips #SmartHacks #Bangladesh`;

  return {
    caption: fallbackCaption,
    firstComment: `আপনার কি মনে হয় এই বিষয়টি সবার জানা প্রয়োজন? আপনার মতামত কমেন্টে জানান! 👇`,
    keywordTrigger: 'TIPS',
    pillarCategory: 'Smart Mobile & Life Hacks',
    floatingBadge: '💡 দরকারি টেক হ্যাক',
    twoWordHook: 'দরকারি টিপস',
    actionKeycap: '১ মিনিটে সমাধান',
    actionLabel: 'স্মার্ট সমাধান',
    practicalSnippet: '১ মিনিটে সমাধান',
    snippetType: 'SHORTCUT',
    reelsScript: {
      headlineEn: 'SMART TECH TIPS',
      hookStyle: 'Viral Trend Hook',
      pillarCategory: 'Smart Mobile & Life Hacks',
      hook: fallbackPhase1,
      body: `${fallbackPhase2} ${fallbackPhase3}`,
      cta: fallbackPhase4,
      phase1Hook: fallbackPhase1,
      phase2Solution: fallbackPhase2,
      phase3Steps: fallbackPhase3,
      phase4Cta: fallbackPhase4,
      fullScript: fallbackFullScript,
      twoWordHook: 'দরকারি টিপস',
      actionKeycap: '১ মিনিটে সমাধান',
      actionLabel: 'স্মার্ট সমাধান',
    },
  };
}
