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
    result = result.replace(/[!।]$/, '') + ` আর এমন প্রতিদিনের চমৎকার সব টিপসের জন্য সাথে থাকুন বাইট বাংলার!`;
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

Create a viral, mass-market, 100% human-toned post bundle for ByteBangla about:
Topic: "${topicPrompt}"

STRICT MASS-MARKET VIRAL RULES:
1. TARGET AUDIENCE:
   General Bangladeshi population aged 15 to 50 (students, job seekers, homemakers, professionals, and elders).
   Language: Natural, conversational Dhaka Bengali (কথ্য বাংলা), like a wise, helpful elder brother or life-mentor.

2. ZERO PROGRAMMING JARGON:
   ❌ STRICTLY BAN: "TypeScript", "Regex", "VS Code", "Terminal", "API", "Syntax", "npm", "git", "function", "const", "let".
   Focus on everyday life, mobile utilities, scam safety, inspiring stories, human psychology, or mysteries.

3. 25-35 SECONDS REEL SCRIPT FORMULA (~65-85 spoken words):
   - Phase 1 Hook (0–4s): Open with a powerful curiosity question, story suspense, reality warning, direct value, or psychological insight.
   - Phase 2 Relatable Scenario (4–10s): Paint a vivid daily life situation everyone in Bangladesh experiences.
   - Phase 3 Actionable Secret / Moral (10–22s): Crisp, clear, practical solution, settings instruction, or inspiring moral.
   - Phase 4 Mandatory CTA (22–30s): Must end with:
     "📌 দরকারি এই তথ্যটি পরে কাজে লাগবে, তাই ভিডিওটি এখনই Save করে রাখুন আর বন্ধুদের সাথে Share করুন! এমন প্রতিদিনের চমৎকার সব টিপসের জন্য সাথে থাকুন বাইট বাংলার!"

4. VISUAL BADGE & 3D PILL DATA:
   - "twoWordHook": 2-3 words punchy Bengali hook for Scene 1 (e.g. "ফোন মেমোরি ফুল?", "বিকাশ প্রতারণা সাবধান!", "অসম্ভব ঘুরে দাঁড়ানো", "মিথ্যা চেনার উপায়")
   - "actionKeycap": 2-3 words practical takeaway for Scene 3 (e.g. "ক্যাশ মেমোরি ক্লিয়ার", "2-Step Verification", "২ মিনিটের রুল", "পানাম নগর রহস্য")
   - "actionLabel": Short 2-4 words caption for Scene 3 (e.g. "১-ক্লিকে সমাধান", "জীবন বদলে দেওয়া শিক্ষা", "গোপন মনস্তাত্ত্বিক ট্রিক")

Return ONLY a valid JSON object without markdown code fences:
{
  "caption": "Complete Bengali Facebook post (Hook ➔ Relatable Story/Problem ➔ 3 Actionable Points/Lessons ➔ Mandatory Save & Share CTA ➔ Hashtags, NO external URLs)",
  "firstComment": "The text for the FIRST COMMENT with helpful practical tips, advice, and a friendly request to save the post",
  "keywordTrigger": "TIPS",
  "pillarCategory": "Smart Mobile & Life Hacks" or "Scam Alert & Digital Security" or "Inspiring True Stories & Figures" or "Human Psychology & Practical Wisdom" or "Curiosity, History & Hidden Wonders",
  "twoWordHook": "২-৩ শব্দের আকর্ষণীয় হুক",
  "actionKeycap": "২-৩ শব্দের অ্যাকশন টেকঅ্যাওয়ে বা কী-ক্যাপ",
  "actionLabel": "ছোট অ্যাকশন লেবেল",
  "reelsScript": {
    "headlineEn": "3-5 word uppercase English headline for video badge (e.g. SMART PHONE HACK, DIGITAL SAFETY ALERT, INSPIRING STORY, PSYCHOLOGY TRICK)",
    "hookStyle": "Curiosity Question" or "Story Suspense" or "Reality Warning" or "Direct Value" or "Psychological Insight",
    "pillarCategory": "Selected pillar name",
    "phase1Hook": "Phase 1 (0-4s): প্রথম ৩ সেকেন্ডেই দর্শককে ধরে রাখার শক্তিশালী হুক",
    "phase2Solution": "Phase 2 (4-10s): বাস্তব জীবনের পরিচিত সমস্যা বা পটভূমি",
    "phase3Steps": "Phase 3 (10-22s): সরাসরি সমাধান, সেটিংস নিয়ম বা অনুপ্রেরণাদায়ী শিক্ষা",
    "phase4Cta": "Phase 4 (22-30s): 📌 দরকারি এই তথ্যটি পরে কাজে লাগবে, তাই ভিডিওটি এখনই Save করে রাখুন আর বন্ধুদের সাথে Share করুন! এমন প্রতিদিনের চমৎকার সব টিপসের জন্য সাথে থাকুন বাইট বাংলার!",
    "hook": "Phase 1 text",
    "body": "Phase 2 and Phase 3 combined text",
    "cta": "Phase 4 text",
    "fullScript": "সম্পূর্ণ ২৫-৩৫ সেকেন্ডের সাবলীল ডায়লগ (৬৫-৮৫ শব্দের ফ্লুয়েন্ট বাংলা, Phase 1 + Phase 2 + Phase 3 + Phase 4 মিলিয়ে)",
    "twoWordHook": "২-৩ শব্দের হুক",
    "actionKeycap": "কী-ক্যাপ টেক্সট",
    "actionLabel": "অ্যাকশন লেবেল"
  }
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
      console.log(`[AI Service] 📦 Generating Mass-Market Post Bundle with model "${model}"...`);

      const response = await axios.post<GeminiResponse>(
        endpoint,
        {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2000 },
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: 25000 }
      );

      const raw = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (raw) {
        const cleaned = raw.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
        const parsed = JSON.parse(cleaned);

        if (parsed.caption && parsed.reelsScript) {
          const phase1 = sanitizeAbstractPlaceholders(
            parsed.reelsScript?.phase1Hook ||
            parsed.reelsScript?.hook ||
            'আপনার ফোনে কি এই দরকারি সেটিংসটি অন করা আছে? প্রতিদিন অজান্তেই আমরা এই ভুলটি করে বিপদে পড়ি।'
          );
          const phase2 = sanitizeAbstractPlaceholders(
            parsed.reelsScript?.phase2Solution ||
            'ফোনের স্টোরেজ ফুল হয়ে যাওয়া বা প্রতারণার মেসেজ পাওয়া আমাদের নিত্যদিনের বড় সমস্যা।'
          );
          const phase3 = sanitizeAbstractPlaceholders(
            parsed.reelsScript?.phase3Steps ||
            'সহজ এই কাজটি করুন—ফোনের সিকিউরিটি সেটিংস অন করে ক্যাশ মেমোরি ক্লিয়ার করে দিন।'
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
            fullScript += ` এমন প্রতিদিনের চমৎকার সব টিপসের জন্য সাথে থাকুন বাইট বাংলার!`;
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
            finalCaption += `\n\n💡 এমন প্রতিদিনের চমৎকার সব টিপসের জন্য সাথে থাকুন বাইট বাংলার!`;
          }

          const twoWordHook = parsed.twoWordHook || parsed.reelsScript?.twoWordHook || 'দরকারি তথ্য';
          const actionKeycap = parsed.actionKeycap || parsed.reelsScript?.actionKeycap || 'গোপন ট্রিক';
          const actionLabel = parsed.actionLabel || parsed.reelsScript?.actionLabel || '১-ক্লিকে সমাধান';
          const pillarCategory = parsed.pillarCategory || 'Smart Mobile & Life Hacks';

          console.log(`[AI Service] ✅ Generated mass-market bundle (${finalCaption.length} chars caption, ${fullScript.split(/\s+/).length} words script).`);

          return {
            caption: finalCaption,
            firstComment: parsed.firstComment?.trim() || '📌 দরকারি সব ট্রিকস ও টিপস বন্ধুদের সাথে শেয়ার করুন এবং পেজে লাইক দিয়ে পাশে থাকুন!',
            keywordTrigger: parsed.keywordTrigger || 'TIPS',
            pillarCategory,
            twoWordHook,
            actionKeycap,
            actionLabel,
            practicalSnippet: actionKeycap,
            snippetType: 'SHORTCUT',
            reelsScript: {
              headlineEn: parsed.reelsScript?.headlineEn || 'VIRAL LIFE HACK',
              hookStyle: parsed.reelsScript?.hookStyle || 'Curiosity Question',
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
      console.warn(`[AI Service Warning] Model "${model}" failed: ${err.message}. Trying next model...`);
    }
  }

  throw new Error('All AI generation models failed to generate content bundle.');
}
