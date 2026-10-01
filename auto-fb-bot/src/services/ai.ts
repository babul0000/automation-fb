import axios from 'axios';
import { env, isConfiguredForGemini } from '../config/env';

export interface ReelsScriptData {
  hook: string;
  body: string;
  cta: string;
  fullScript: string;
}

export interface BanglaPostBundle {
  caption: string;
  firstComment: string;
  keywordTrigger: string;
  reelsScript?: ReelsScriptData;
}

/**
 * System persona and instructions for ByteBangla AI content generation
 * Optimized for Facebook Algorithm Reach Hack:
 * - NO external links in main caption (preserves 100% organic reach)
 * - Generates high-value First Comment with direct verified tool URLs
 * - Includes a viral Comment-to-DM keyword CTA
 * - Generates viral 30-45s Facebook Reels / Shorts video script in Bengali
 */
const SYSTEM_PROMPT = `You are the lead content writer, creative director, and verified tech researcher for "ByteBangla" (সহজ বাংলায় এআই ও টেকনোলজি টিপস).
Your mission is to craft engaging, high-value, educational, and 100% FACT-CHECKED technology and AI content in Bengali for Bangladeshi & Bengali-speaking professionals, students, and creators.

STRICT ALGORITHM & REACH RULES:
- DO NOT put external website URLs/links inside the main caption! (External links in caption destroy Facebook organic reach by 50%+).
- In the caption CTA, invite readers to check the FIRST COMMENT for direct links, and prompt them to comment a keyword (like "AI" or "PROMPT" or "LINK") to get the resource in their inbox.

Content Structure:
1. Catchy Hook (আকর্ষণীয় শিরোনাম/হুক): 1-2 lines with natural emojis stopping the scroll.
2. 3 Practical Bullet Points / Steps (বাস্তবসম্মত ৩টি টিপস/ধাপ): 3 clearly numbered practical takeaways in simple Bengali.
3. Call To Action (কল টু অ্যাকশন): Friendly invitation to save the post, tag colleagues, and comment "AI" to get the full guide.
4. Hashtags: Exactly these tags at the end: #ByteBangla #AITools #TechBangla #Productivity #BanglaTech

VIRAL REELS VOICE RULES (১০/১০ ফ্লুয়েন্ট ক্রিয়েটর ডায়লগ):
- Speak in authentic conversational Bengali (একদম একজন জনপ্রিয় ইউটিউব বা রিল ক্রিয়েটরের মতো সাবলীল কথ্য ভাষা)।
- কড়া নিয়ম ১: হুক, বডি বা সিটিতে কখনোই '১.', '২.', '৩.', 'প্রথমত', 'দ্বিতীয়ত' বা কোনো পয়েন্ট নম্বর ব্যবহার করবেন না! এটি ভিডিওর ফ্লো নষ্ট করে দেয়।
- কড়া নিয়ম ২: বডি (body)-এর মধ্যে কখনোই কমেন্ট বা ফলো করার কথা লিখবেন না। কমেন্ট ও ফলো করার কথা শুধুমাত্র cta ফিল্ডে একবারই থাকবে।
- Hook (৩-৪ সেকেন্ড): মনোযোগ আকর্ষণকারী কৌতূহলী একটি বাক্য।
- Body (৬-৮ সেকেন্ড): কোনো নম্বর বা পয়েন্ট ছাড়া সরাসরি ১-২ বাক্যে মূল সমাধান বা টুলের কাজ।
- CTA (৩-৪ সেকেন্ড): "লিংক পেতে কমেন্টে AI লিখুন আর ফলো করুন বাইট বাংলা!"
- মোট শব্দের পরিমাণ: ২৫ থেকে ৩৫ শব্দের মধ্যে (১২-১৫ সেকেন্ডের ডায়লগ)।`;

interface GeminiResponse {
  candidates?: {
    content?: {
      parts?: { text: string }[];
    };
  }[];
}

/**
 * Generates an engaging Bengali Facebook post along with a First Comment link bundle, lead-magnet keyword,
 * and a viral 15-second Facebook Reel voiceover script.
 */
export async function generateBanglaPostBundle(topicPrompt: string): Promise<BanglaPostBundle> {
  if (!isConfiguredForGemini()) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  const prompt = `${SYSTEM_PROMPT}

Write a viral, high-value post bundle in Bengali for ByteBangla about:
Topic: "${topicPrompt}"

Return ONLY a valid JSON object without markdown code fences:
{
  "caption": "The complete Bengali Facebook post caption adhering to the 4-part structure (NO external URLs in caption, includes CTA to comment 'AI')",
  "firstComment": "The text for the FIRST COMMENT containing: 🔗 আজকের পোস্টে উল্লেখিত টুলগুলোর অফিসিয়াল ওয়েবসাইট লিংকসমূহ (List the verified tool names and their real URLs like https://chatgpt.com, https://claude.ai, etc.) এবং পোস্টটি সেভ করার অনুরোধ",
  "keywordTrigger": "AI",
  "reelsScript": {
    "hook": "১ লাইনের কৌতূহলী হুক (কোনো নম্বর বা পয়েন্ট ছাড়া)",
    "body": "১-২ লাইনের সরাসরি আকর্ষণীয় সমাধান (কোনো নম্বর ও কোনো কমেন্ট/ফলো কথা ছাড়া)",
    "cta": "লিংক পেতে এখনই কমেন্টে AI লিখুন আর ফলো করুন বাইট বাংলা!",
    "fullScript": "সম্পূর্ণ ১২-১৫ সেকেন্ডের সাবলীল ক্রিয়েটর ডায়লগ (হুক + বডি + সিটএ মিলে মোট ২৫-৩৫ শব্দ, কোনো রিপিট ছাড়া)"
  }
}`;

  const modelsToTry = [
    process.env.GEMINI_MODEL || 'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
  ];

  for (const model of modelsToTry) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
      console.log(`[AI Service] 📦 Generating Post, First-Comment & Reels Bundle with model "${model}"...`);

      const response = await axios.post<GeminiResponse>(
        endpoint,
        {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1800 },
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: 25000 }
      );

      const raw = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (raw) {
        const cleaned = raw.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
        const parsed = JSON.parse(cleaned);

        if (parsed.caption && parsed.firstComment) {
          console.log(`[AI Service] ✅ Generated post bundle with Reels script (${parsed.caption.length} chars caption).`);
          return {
            caption: parsed.caption.trim(),
            firstComment: parsed.firstComment.trim(),
            keywordTrigger: parsed.keywordTrigger || 'AI',
            reelsScript: parsed.reelsScript || {
              hook: `সহজ উপায়ে আজকের সেরা এআই ট্রিকস মিস করবেন না!`,
              body: `এই দারুণ টুলটি আপনার কাজের গতি বাড়িয়ে দেবে কয়েক গুণ।`,
              cta: `লিংক পেতে এখনই কমেন্টে AI লিখুন আর ফলো করুন বাইট বাংলা!`,
              fullScript: `সহজ উপায়ে আজকের সেরা এআই ট্রিকস মিস করবেন না! এই দারুণ টুলটি আপনার কাজের গতি বাড়িয়ে দেবে কয়েক গুণ। লিংক পেতে এখনই কমেন্টে AI লিখুন আর ফলো করুন বাইট বাংলা!`,
            },
          };
        }
      }
    } catch (err: any) {
      console.warn(`[AI Service Warning] Bundle generation on ${model} failed: ${err.message}. Trying next...`);
    }
  }

  // Fallback generation if JSON parse failed
  const plainCaption = await generateBanglaPost(topicPrompt);
  return {
    caption: plainCaption,
    firstComment: `🔗 আজকের পোস্টে উল্লেখিত টুলগুলোর অফিশিয়াল ওয়েবসাইট ও দরকারি রিসোর্স লিংক পেতে বাইট বাংলার সাথেই থাকুন! যেকোনো সমস্যায় কমেন্টে জানান। 💡`,
    keywordTrigger: 'AI',
    reelsScript: {
      hook: `সহজ বাংলায় আজকের সেরা এআই আপডেট!`,
      body: `এই টুলটি আজই ব্যবহার করে দেখুন আপনার সময় অনেক বাঁচবে।`,
      cta: `লিংক পেতে কমেন্টে AI লিখুন আর ফলো করুন বাইট বাংলা!`,
      fullScript: `সহজ বাংলায় আজকের সেরা এআই আপডেট! এই টুলটি আজই ব্যবহার করে দেখুন আপনার সময় অনেক বাঁচবে। লিংক পেতে কমেন্টে AI লিখুন আর ফলো করুন বাইট বাংলা!`,
    },
  };
}

/**
 * Standard single string generator for backwards compatibility
 */
export async function generateBanglaPost(topicPrompt: string): Promise<string> {
  const modelsToTry = [
    process.env.GEMINI_MODEL || 'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
  ];

  const userQuery = `Write a high-value, thoroughly fact-checked Facebook post in Bengali for ByteBangla about:
Topic: "${topicPrompt}"
Rules:
- Verify all tools exist.
- Adhere strictly to 4-part structure (Catchy Hook, 3 Practical Points, Call to Action, Hashtags).
- Do NOT include external web links in the caption.`;

  for (const model of modelsToTry) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
      const response = await axios.post<GeminiResponse>(
        endpoint,
        {
          contents: [{ role: 'user', parts: [{ text: `${SYSTEM_PROMPT}\n\n${userQuery}` }] }],
          generationConfig: { temperature: 0.6, maxOutputTokens: 1200 },
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: 25000 }
      );

      const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        return text.replace(/^```(markdown|text)?\n/i, '').replace(/\n```$/i, '').trim();
      }
    } catch (err: any) {
      // Continue to next model
    }
  }

  throw new Error('All Gemini generation attempts failed.');
}
