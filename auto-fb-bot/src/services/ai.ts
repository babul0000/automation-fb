import axios from 'axios';
import { env, isConfiguredForGemini } from '../config/env';
import {
  BYTEBANGLA_SYSTEM_PROMPT,
  validateScriptSpecificity,
  BANNED_ABSTRACT_PHRASES,
  RECOGNIZED_SOFTWARE_TOOLS,
} from './prompts';

export interface ReelsScriptData {
  headlineEn: string;
  hook: string; // Phase 1: Target Audience + Software name + exact frustration (0-5s)
  body: string; // Phase 2 + Phase 3: Tool/shortcut/formula + step-by-step (5-22s)
  cta: string;  // Phase 4: Save Trigger + Benefit/CTA + Signature Ending (22-35s)
  fullScript: string; // Complete 30-40s spoken dialogue (Phase 1 + 2 + 3 + 4, 75-88 words)
  phase1Hook?: string;
  phase2Solution?: string;
  phase3Steps?: string;
  phase4Cta?: string;
  targetAudience?: 'OFFICE' | 'STUDENTS' | 'FREELANCERS';
}

export interface BanglaPostBundle {
  caption: string;
  firstComment: string;
  keywordTrigger: string;
  toolBrand?: string; // 'chatgpt' | 'vscode' | 'github' | 'sheets' | 'notion' | 'python' | 'gemini' | 'claude'
  practicalSnippet?: string; // Real copy-pasteable formula, prompt, or code
  snippetType?: 'CODE' | 'FORMULA' | 'PROMPT' | 'SHORTCUT';
  targetAudience?: 'OFFICE' | 'STUDENTS' | 'FREELANCERS';
  reelsScript?: ReelsScriptData;
  reelsVisualPrompts?: string[];
}

interface GeminiResponse {
  candidates?: {
    content?: {
      parts?: { text: string }[];
    };
  }[];
}

/**
 * Sanitizes a script string by removing prohibited abstract placeholder phrases.
 */
function sanitizeAbstractPlaceholders(text: string): string {
  let cleaned = text;
  for (const banned of BANNED_ABSTRACT_PHRASES) {
    if (cleaned.includes(banned)) {
      if (banned === 'এই কাজটা') {
        cleaned = cleaned.replace(/এই কাজটা/g, 'এই ম্যানুয়ালি ডেটা গোছানোর কাজ');
      } else if (banned === 'এই দারুণ টেকনিকটি' || banned === 'এই টেকনিকটি') {
        cleaned = cleaned.replace(/এই দারুণ টেকনিকটি/g, 'এই শর্টকাট মেথড');
      } else if (banned === 'এই টুলটি') {
        cleaned = cleaned.replace(/এই টুলটি/g, 'সফটওয়্যারটির এই ফিচার');
      } else if (banned === 'একটা দারুণ উপায়' || banned === 'এই দারুণ উপায়') {
        cleaned = cleaned.replace(/একটি? দারুণ উপায়/g, 'সরাসরি এই ফর্মুলা');
      } else if (banned === 'এই সেটিংসটি') {
        cleaned = cleaned.replace(/এই সেটিংসটি/g, 'এই কনফিগ সেটিংস');
      } else {
        cleaned = cleaned.split(banned).join('এই পদ্ধতি');
      }
    }
  }
  return cleaned;
}

/**
 * Ensures Phase 4 contains the mandatory Save trigger and signature human ending.
 */
function enforceSaveAndSignature(ctaText: string): string {
  let result = ctaText;
  if (!result.includes('Save') && !result.includes('সেভ')) {
    result = `পরে দরকার হতে পারে, তাই ভিডিওটি এখনই Save করে রাখুন! ` + result;
  }
  if (!result.includes('বাইট বাংলা') && !result.includes('ByteBangla')) {
    result = result.replace(/!$/, '') + ` আর এমন দরকারী সব টেক হ্যাকসের জন্য সাথে থাকুন বাইট বাংলার!`;
  }
  return result;
}

/**
 * Generates an engaging Bengali Facebook post along with a First Comment link bundle,
 * copy-pasteable formula/prompt snippet, and a viral 30-40 second Facebook Reel voiceover script.
 * Incorporates 3 psychological growth hooks:
 * 1. Target Relatable Audiences (Office Workers / Students / Tech Freelancers)
 * 2. High-Value "Save" CTA (Algorithm Multiplier)
 * 3. Signature Human Identity ("এমন দরকারী সব টেক হ্যাকসের জন্য সাথে থাকুন বাইট বাংলার!")
 */
export async function generateBanglaPostBundle(topicPrompt: string): Promise<BanglaPostBundle> {
  if (!isConfiguredForGemini()) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  const prompt = `${BYTEBANGLA_SYSTEM_PROMPT}

Create a viral, high-value, 100% human-toned post bundle for ByteBangla about:
Topic: "${topicPrompt}"

CRITICAL MANDATORY PSYCHOLOGICAL GROWTH RULES:
1. TARGET RELATABLE AUDIENCES IN HOOKS:
   The video hook (Phase 1, 0–5s) MUST target one of three groups in spoken Bengali:
   - 🏢 Office Workers: (e.g., "অফিসে বসের কাজ ঘণ্টার পর ঘণ্টা ম্যানুয়ালি না করে, গুগল শিটসে এই ফর্মুলা ব্যবহার করুন...")
   - 🎓 Students/Learners: (e.g., "অ্যাসাইনমেন্ট বা প্রজেক্ট তৈরি করতে গিয়ে কি ক্যানভা বা শিটসে আটকে যাচ্ছেন?")
   - 💻 Tech/Freelancers: (e.g., "কোডিং বা ক্লায়েন্টের কাজ অর্ধেক সময়ে শেষ করার সেরা উপায়...")

2. HIGH-VALUE "SAVE" CTA (ALGORITHM MULTIPLIER):
   Before the final CTA, ALWAYS add the 3-second save trigger:
   - Reel script: "পরে দরকার হতে পারে, তাই ভিডিওটি এখনই Save করে রাখুন!"
   - Post caption: "কাজটি পরে করার সময় ভুলে যেতে পারেন, তাই পোস্টটি এখনই সেভ করে রাখুন এবং বন্ধুদের সাথে শেয়ার করুন!"

3. SIGNATURE HUMAN IDENTITY (Dhaka Senior Developer Tone):
   Every script and post MUST end with our warm creator signature:
   - "এমন দরকারী সব টেক হ্যাকসের জন্য সাথে থাকুন বাইট বাংলার!"

4. ZERO ABSTRACT PLACEHOLDERS:
   - ❌ BANNED: "এই কাজটা", "এই দারুণ টেকনিকটি", "এই টুলটি", "একটা দারুণ উপায়", "এই সেটিংসটি"।
   - Must explicitly name the real software (e.g. Google Sheets, VS Code, ChatGPT, Excel, Windows, Chrome, GitHub, Notion, Canva) AND the exact pain point in the FIRST sentence!

5. 30-40 SECONDS REEL SCRIPT FORMULA (75-88 words, Phase 1 ➔ 2 ➔ 3 ➔ 4):
   - Phase 1 (0–5s): Target Audience + Software Name + Frustration.
     Example: "অফিসে বসের কাজ ঘণ্টার পর ঘণ্টা ম্যানুয়ালি না করে, গুগল শিটসের এই ট্রিকটি ব্যবহার করুন! হাজার নামের তালিকা থেকে ফোন নাম্বার আলাদা করতে গিয়ে কি আপনারও সময় নষ্ট হচ্ছে?"
   - Phase 2 (5–12s): Exact Tool/Feature/Formula Name.
     Example: "আর ম্যানুয়ালি কপি করা লাগবে না, ব্যবহার করুন গুগল শিটসের এই ফর্মুলা: REGEXEXTRACT!"
   - Phase 3 (12–22s): Step-by-Step Instructions (Step 1, Step 2).
     Example: "১ নম্বরে পাশের সেলে লিখুন এই ফর্মুলা, আর ২ নম্বরে শুধু ডাবল ক্লিক করে দিন—সব নাম্বার আলাদা কলামে চলে আসবে নিমেষেই!"
   - Phase 4 (22–35s): Save Trigger + Comment CTA + Signature Ending.
     Example: "পরে দরকার হতে পারে, তাই ভিডিওটি এখনই Save করে রাখুন! পুরো ফর্মুলা ও চিটশিটের লিংক পেতে কমেন্টে লিখুন 'AI', আর এমন দরকারী সব টেক হ্যাকসের জন্য সাথে থাকুন বাইট বাংলার!"

Return ONLY a valid JSON object without markdown code fences:
{
  "caption": "The complete Bengali Facebook post adhering to the 5-part structure (Targeted Audience Hook with software name ➔ 3 Actionable Steps with concrete shortcuts ➔ Result ➔ Save Trigger & CTA to comment 'AI' ➔ Signature Ending, NO external URLs)",
  "firstComment": "The text for the FIRST COMMENT with verified tool URLs (like https://chatgpt.com, https://github.com, etc.) and a request to save the post",
  "keywordTrigger": "AI",
  "toolBrand": "chatgpt" or "vscode" or "github" or "sheets" or "notion" or "python" or "claude" or "gemini",
  "snippetType": "PROMPT" or "CODE" or "FORMULA" or "SHORTCUT",
  "practicalSnippet": "A concrete 1-2 line real copy-pasteable prompt, formula, or shortcut (e.g. '=REGEXEXTRACT(A2, \"[0-9]+\")' or 'Ctrl + Shift + P > Sort Lines')",
  "targetAudience": "OFFICE" or "STUDENTS" or "FREELANCERS",
  "reelsScript": {
    "headlineEn": "Catchy 3-5 word uppercase English headline for video badge (e.g. GOOGLE SHEETS HACK, CHATGPT FORMULA TRICK)",
    "targetAudience": "OFFICE" or "STUDENTS" or "FREELANCERS",
    "phase1Hook": "Phase 1 (0-5s): টার্গেট অডিয়েন্স (অফিস কর্মী/শিক্ষার্থী/ফ্রিল্যান্সার) + সফটওয়্যারের নাম + বিরক্তির বাস্তব সমস্যা",
    "phase2Solution": "Phase 2 (5-12s): আসল টুল/ফিচার/ফর্মুলা বা শর্টকাটের নাম (যেমন: আর ম্যানুয়ালি কপি করা লাগবে না, ব্যবহার করুন গুগল শিটসের এই ফর্মুলা: REGEXEXTRACT!)",
    "phase3Steps": "Phase 3 (12-22s): সরাসরি ১ ও ২ নম্বর স্টেপ-বাই-স্টেপ প্র্যাকটিক্যাল নির্দেশ",
    "phase4Cta": "Phase 4 (22-35s): সেভ ট্রিগার ('পরে দরকার হতে পারে, তাই ভিডিওটি এখনই Save করে রাখুন!') + কমেন্ট CTA ('কমেন্টে লিখুন AI') + সিগনেচার এন্ডিং ('এমন দরকারী সব টেক হ্যাকসের জন্য সাথে থাকুন বাইট বাংলার!')",
    "hook": "Phase 1 এর পুরো টেক্সট",
    "body": "Phase 2 এবং Phase 3 এর পুরো টেক্সট একসাথে",
    "cta": "Phase 4 এর পুরো টেক্সট",
    "fullScript": "সম্পূর্ণ ৩০-৪০ সেকেন্ডের সাবলীল ভয়েসওভার স্ক্রিপ্ট (Phase 1 + Phase 2 + Phase 3 + Phase 4 মিলিয়ে ৭৫-৮৮ শব্দের ফ্লুয়েন্ট টেক বাংলা, ০% রোবটিক শব্দ)"
  },
  "reelsVisualPrompts": [
    "Scene 1 Hook: Professional developer looking frustrated at computer screen with software UI, dark modern studio lighting, 9:16 vertical, no text, no watermark, 8k render",
    "Scene 2 Solution: Glowing futuristic software UI solving the task instantly with animated dataflow, 9:16 vertical, cyan accents, no text, 8k render",
    "Scene 3 Result: Modern smartphone displaying productivity success screen, 9:16 vertical, no text, 8k render"
  ]
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
      console.log(`[AI Service] 📦 Generating Concrete Post Bundle with model "${model}"...`);

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

        if (parsed.caption && parsed.firstComment) {
          // Extract Phase 1-4 with strict concrete fallbacks
          const phase1 = sanitizeAbstractPlaceholders(
            parsed.reelsScript?.phase1Hook ||
            parsed.reelsScript?.hook ||
            'অফিসে বসের কাজ ঘণ্টার পর ঘণ্টা ম্যানুয়ালি না করে, গুগল শিটসের এই ট্রিকটি ব্যবহার করুন! হাজার নামের তালিকা থেকে ফোন নাম্বার আলাদা করতে গিয়ে কি আপনারও সময় নষ্ট হচ্ছে?'
          );
          const phase2 = sanitizeAbstractPlaceholders(
            parsed.reelsScript?.phase2Solution ||
            'আর ম্যানুয়ালি কপি করা লাগবে না, ব্যবহার করুন গুগল শিটসের এই ফর্মুলা: REGEXEXTRACT!'
          );
          const phase3 = sanitizeAbstractPlaceholders(
            parsed.reelsScript?.phase3Steps ||
            '১ নম্বরে পাশের সেলে লিখুন এই ফর্মুলা, আর ২ নম্বরে শুধু ডাবল ক্লিক করে দিন—সব নাম্বার আলাদা কলামে চলে আসবে নিমেষেই!'
          );
          const rawPhase4 = parsed.reelsScript?.phase4Cta || parsed.reelsScript?.cta || '';
          const phase4 = enforceSaveAndSignature(
            sanitizeAbstractPlaceholders(rawPhase4) ||
            "পরে দরকার হতে পারে, তাই ভিডিওটি এখনই Save করে রাখুন! পুরো ফর্মুলা ও চিটশিটের লিংক পেতে কমেন্টে লিখুন 'AI', আর এমন দরকারী সব টেক হ্যাকসের জন্য সাথে থাকুন বাইট বাংলার!"
          );

          let fullScript = parsed.reelsScript?.fullScript?.trim()
            ? sanitizeAbstractPlaceholders(parsed.reelsScript.fullScript.trim())
            : `${phase1} ${phase2} ${phase3} ${phase4}`;

          // Ensure fullScript incorporates save trigger and signature ending
          if (!fullScript.includes('Save') && !fullScript.includes('সেভ')) {
            fullScript = fullScript.replace(phase4, '') + ` ${phase4}`;
          }
          if (!fullScript.includes('বাইট বাংলা') && !fullScript.includes('ByteBangla')) {
            fullScript += ` এমন দরকারী সব টেক হ্যাকসের জন্য সাথে থাকুন বাইট বাংলার!`;
          }

          // If fullScript somehow omitted phases or is too short, enforce complete 4-phase assembly
          if (fullScript.split(/\s+/).length < 30) {
            fullScript = `${phase1} ${phase2} ${phase3} ${phase4}`;
          }

          let finalCaption = sanitizeAbstractPlaceholders(parsed.caption.trim());
          if (!finalCaption.includes('সেভ') && !finalCaption.includes('Save')) {
            finalCaption += `\n\n📌 কাজটি পরে করার সময় ভুলে যেতে পারেন, তাই পোস্টটি এখনই সেভ করে রাখুন এবং বন্ধুদের সাথে শেয়ার করুন!`;
          }
          if (!finalCaption.includes('বাইট বাংলা')) {
            finalCaption += `\n\n💡 এমন দরকারী সব টেক হ্যাকসের জন্য সাথে থাকুন বাইট বাংলার!`;
          }

          console.log(`[AI Service] ✅ Generated viral post bundle (${finalCaption.length} chars caption, ${fullScript.split(/\s+/).length} words script).`);
          return {
            caption: finalCaption,
            firstComment: parsed.firstComment.trim(),
            keywordTrigger: parsed.keywordTrigger || 'AI',
            toolBrand: parsed.toolBrand || 'sheets',
            snippetType: parsed.snippetType || 'FORMULA',
            practicalSnippet: parsed.practicalSnippet || '=REGEXEXTRACT(A2, "[0-9]+")',
            targetAudience: parsed.targetAudience || 'OFFICE',
            reelsScript: {
              headlineEn: parsed.reelsScript?.headlineEn || 'VIRAL AI TECH TIPS',
              hook: phase1,
              body: `${phase2} ${phase3}`,
              cta: phase4,
              phase1Hook: phase1,
              phase2Solution: phase2,
              phase3Steps: phase3,
              phase4Cta: phase4,
              targetAudience: parsed.reelsScript?.targetAudience || 'OFFICE',
              fullScript,
            },
            reelsVisualPrompts: Array.isArray(parsed.reelsVisualPrompts) && parsed.reelsVisualPrompts.length >= 3
              ? parsed.reelsVisualPrompts
              : undefined,
          };
        }
      }
    } catch (err: any) {
      console.warn(`[AI Service Warning] Bundle generation on ${model} failed: ${err.message}. Trying next...`);
    }
  }

  // Fallback generation if JSON parse failed - 100% Concrete, 3 Psychological Hooks
  let plainCaption = '';
  try {
    plainCaption = await generateBanglaPost(topicPrompt);
  } catch {
    plainCaption = `অফিসে বসের কাজ ঘণ্টার পর ঘণ্টা ম্যানুয়ালি না করে, গুগল শিটসের এই ফর্মুলা ব্যবহার করুন!\n\nহাজার হাজার নামের তালিকা থেকে ফোন নাম্বার আলাদা করতে গিয়ে যাদের প্রতিদিন মাথা নষ্ট হয়, তাদের জন্য আজকের এই হ্যাক!\n\n১ নম্বরে পাশের সেলে লিখুন =REGEXEXTRACT(A2, "[0-9]+")\n২ নম্বরে ডাবল ক্লিক করে দিন—সব নাম্বার আলাদা কলামে চলে আসবে নিমেষেই!\n৩ নম্বরে ম্যানুয়াল ডেটা এন্ট্রিকে বিদায় জানান।\n\n📌 আপনার কাজের গতি ২-৩ গুণ বেড়ে যাবে!`;
  }
  const concreteHook = 'অফিসে বসের কাজ ঘণ্টার পর ঘণ্টা ম্যানুয়ালি না করে, গুগল শিটসের এই ফর্মুলাটি ব্যবহার করুন! হাজার হাজার নামের তালিকা থেকে ফোন নাম্বার আলাদা করতে গিয়ে কি আপনারও ঘণ্টার পর ঘণ্টা নষ্ট হচ্ছে?';
  const concreteBody = 'আর ম্যানুয়ালি কপি করা লাগবে না, ব্যবহার করুন গুগল শিটসের এই ফর্মুলা: REGEXEXTRACT! ১ নম্বরে পাশের সেলে লিখুন এই ফর্মুলা, আর ২ নম্বরে শুধু ডাবল ক্লিক করে দিন—সব নাম্বার আলাদা কলামে চলে আসবে নিমেষেই!';
  const concreteCta = "পরে দরকার হতে পারে, তাই ভিডিওটি এখনই Save করে রাখুন! পুরো ফর্মুলা ও চিটশিটের লিংক পেতে কমেন্টে লিখুন 'AI', আর এমন দরকারী সব টেক হ্যাকসের জন্য সাথে থাকুন বাইট বাংলার!";
  const concreteFull = `${concreteHook} ${concreteBody} ${concreteCta}`;

  return {
    caption: `${plainCaption}\n\n📌 কাজটি পরে করার সময় ভুলে যেতে পারেন, তাই পোস্টটি এখনই সেভ করে রাখুন এবং বন্ধুদের সাথে শেয়ার করুন!\n💡 এমন দরকারী সব টেক হ্যাকসের জন্য সাথে থাকুন বাইট বাংলার!`,
    firstComment: `🔗 আজকের পোস্টে উল্লেখিত দরকারি টুল ও চিটশিট রিসোর্স লিঙ্ক পেতে কমেন্টে "AI" লিখুন! বাইট বাংলার সাথেই থাকুন। 💡`,
    keywordTrigger: 'AI',
    toolBrand: 'sheets',
    snippetType: 'FORMULA',
    practicalSnippet: '=REGEXEXTRACT(A2, "[0-9]+")',
    targetAudience: 'OFFICE',
    reelsScript: {
      headlineEn: 'GOOGLE SHEETS HACK',
      hook: concreteHook,
      body: concreteBody,
      cta: concreteCta,
      phase1Hook: concreteHook,
      phase2Solution: 'আর ম্যানুয়ালি কপি করা লাগবে না, ব্যবহার করুন গুগল শিটসের এই ফর্মুলা: REGEXEXTRACT!',
      phase3Steps: '১ নম্বরে পাশের সেলে লিখুন এই ফর্মুলা, আর ২ নম্বরে শুধু ডাবল ক্লিক করে দিন—সব নাম্বার আলাদা কলামে চলে আসবে নিমেষেই!',
      phase4Cta: concreteCta,
      targetAudience: 'OFFICE',
      fullScript: concreteFull,
    },
  };
}

/**
 * Standard single string generator for backwards compatibility
 * Enforces concrete software name, target audience hook, save trigger, and signature ending.
 */
export async function generateBanglaPost(topicPrompt: string): Promise<string> {
  const modelsToTry = [
    process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash',
  ];

  const userQuery = `Write a high-value, thoroughly human-toned Facebook post in Bengali for ByteBangla about:
Topic: "${topicPrompt}"
Rules:
- Target one of 3 audiences in the opening hook: Office Workers, Students, or Tech Freelancers.
- STRICTLY BAN abstract placeholders: "এই কাজটা", "এই দারুণ টেকনিকটি", "এই টুলটি", "একটা দারুণ উপায়", "এই সেটিংসটি"।
- The very first line MUST name the exact software/tool and the exact pain point problem.
- Strictly ban robotic cliches ("চলুন জেনে নেওয়া যাক", "যুগান্তকারী", "অতএব", "ভূমিকা পালন করে").
- Give 3 concrete practical takeaways with actionable shortcuts/prompts/formulas.
- Include the High-Value Save trigger: "কাজটি পরে করার সময় ভুলে যেতে পারেন, তাই পোস্টটি এখনই সেভ করে রাখুন এবং বন্ধুদের সাথে শেয়ার করুন!"
- Include the Signature Ending: "এমন দরকারী সব টেক হ্যাকসের জন্য সাথে থাকুন বাইট বাংলার!"
- Do NOT include external web links in the caption.`;

  for (const model of modelsToTry) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
      const response = await axios.post<GeminiResponse>(
        endpoint,
        {
          contents: [{ role: 'user', parts: [{ text: `${BYTEBANGLA_SYSTEM_PROMPT}\n\n${userQuery}` }] }],
          generationConfig: { temperature: 0.6, maxOutputTokens: 1400 },
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: 25000 }
      );

      const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        return sanitizeAbstractPlaceholders(text.replace(/^```(markdown|text)?\n/i, '').replace(/\n```$/i, '').trim());
      }
    } catch (err: any) {
      // Continue to next model
    }
  }

  // Graceful fallback post text if offline
  return `অফিসে বসের কাজ ঘণ্টার পর ঘণ্টা ম্যানুয়ালি না করে, গুগল শিটসের এই ফর্মুলা ব্যবহার করুন!\n\nহাজার হাজার নামের তালিকা থেকে ফোন নাম্বার আলাদা করতে গিয়ে যাদের প্রতিদিন মাথা নষ্ট হয়, তাদের জন্য আজকের এই হ্যাক!\n\n১ নম্বরে পাশের সেলে লিখুন =REGEXEXTRACT(A2, "[0-9]+")\n২ নম্বরে ডাবল ক্লিক করে দিন—সব নাম্বার আলাদা কলামে চলে আসবে নিমেষেই!\n৩ নম্বরে ম্যানুয়াল কপি-পেস্ট বন্ধ করে স্মার্টলি সময় বাঁচান।\n\n📌 আপনার কাজের গতি ২-৩ গুণ বেড়ে যাবে!\n\n📌 কাজটি পরে করার সময় ভুলে যেতে পারেন, তাই পোস্টটি এখনই সেভ করে রাখুন এবং বন্ধুদের সাথে শেয়ার করুন!\n💡 এমন দরকারী সব টেক হ্যাকসের জন্য সাথে থাকুন বাইট বাংলার!`;
}
