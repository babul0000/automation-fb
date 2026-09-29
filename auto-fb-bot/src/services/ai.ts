import axios from 'axios';
import { env, isConfiguredForGemini } from '../config/env';

export interface BanglaPostBundle {
  caption: string;
  firstComment: string;
  keywordTrigger: string;
}

/**
 * System persona and instructions for ByteBangla AI content generation
 * Optimized for Facebook Algorithm Reach Hack:
 * - NO external links in main caption (preserves 100% organic reach)
 * - Generates high-value First Comment with direct verified tool URLs
 * - Includes a viral Comment-to-DM keyword CTA
 */
const SYSTEM_PROMPT = `You are the lead content writer and verified tech researcher for "ByteBangla" (সহজ বাংলায় এআই ও টেকনোলজি টিপস).
Your mission is to craft engaging, high-value, educational, and 100% FACT-CHECKED technology and AI content in Bengali for Bangladeshi & Bengali-speaking professionals, students, and creators.

STRICT ALGORITHM & REACH RULES:
- DO NOT put external website URLs/links inside the main caption! (External links in caption destroy Facebook organic reach by 50%+).
- In the caption CTA, invite readers to check the FIRST COMMENT for direct links, and prompt them to comment a keyword (like "AI" or "PROMPT" or "LINK") to get the resource in their inbox.

Content Structure:
1. Catchy Hook (আকর্ষণীয় শিরোনাম/হুক): 1-2 lines with natural emojis stopping the scroll.
2. 3 Practical Bullet Points / Steps (বাস্তবসম্মত ৩টি টিপস/ধাপ): 3 clearly numbered practical takeaways in simple Bengali.
3. Call To Action (কল টু অ্যাকশন): Friendly invitation to save the post, tag colleagues, and comment "AI" to get the full guide.
4. Hashtags: Exactly these tags at the end: #ByteBangla #AITools #TechBangla #Productivity #BanglaTech`;

interface GeminiResponse {
  candidates?: {
    content?: {
      parts?: { text: string }[];
    };
  }[];
}

/**
 * Generates an engaging Bengali Facebook post along with a First Comment link bundle and lead-magnet keyword
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
  "keywordTrigger": "AI"
}`;

  const modelsToTry = [
    process.env.GEMINI_MODEL || 'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
  ];

  for (const model of modelsToTry) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
      console.log(`[AI Service] 📦 Generating Post & First-Comment Bundle with model "${model}"...`);

      const response = await axios.post<GeminiResponse>(
        endpoint,
        {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1400 },
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: 25000 }
      );

      const raw = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (raw) {
        const cleaned = raw.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
        const parsed = JSON.parse(cleaned);

        if (parsed.caption && parsed.firstComment) {
          console.log(`[AI Service] ✅ Generated post bundle (${parsed.caption.length} chars caption, ${parsed.firstComment.length} chars first comment).`);
          return {
            caption: parsed.caption.trim(),
            firstComment: parsed.firstComment.trim(),
            keywordTrigger: parsed.keywordTrigger || 'AI',
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
