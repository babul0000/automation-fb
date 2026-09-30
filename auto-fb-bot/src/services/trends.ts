import axios from 'axios';
import { env, isConfiguredForGemini } from '../config/env';
import { isTopicDuplicate, markTopicAsPosted, generateTopicHash } from '../utils/hash';
import { saveTopic } from './db';
import { getLearningFeedbackPrompt } from './learning';

export interface DiscoveredTopic {
  title: string;
  category: string;
  source?: string;
  utilityScore: number;
  recencyScore: number;
  shareabilityScore: number;
  finalScore: number;
  hash: string;
}

const FALLBACK_CURATED_TOPICS = [
  'দৈনন্দিন কাজের সময় বাঁচাতে সেরা ৫টি ফ্রি AI টুল যা প্রত্যেকের ব্যবহার করা উচিত',
  'ChatGPT-র এমন ৩টি সুপার প্রম্পট যা আপনার ফ্রিল্যান্সিং ও ইমেইল রাইটিং গতি ৩ গুণ বাড়াবে',
  'বাংলা ভয়েস থেকে নিখুঁত টেক্সট কনভার্ট করার সেরা AI টুলস এবং মোবাইল ট্রিকস',
  'Canva AI এবং Gamma App দিয়ে মাত্র ৩ মিনিটে প্রফেশনাল প্রেজেন্টেশন স্লাইড বানানোর সহজ উপায়',
  'গুগল শিটস (Google Sheets) এ AI ফর্মুলা দিয়ে ডাটা এন্ট্রির জটিল কাজ অটোমেশন করার টেকনিক',
  'Claude 3.5 ও ChatGPT-র মধ্যে পার্থক্য: কোডিং ও কন্টেন্ট রাইটিংয়ে কোনটা কখন ব্যবহার করবেন?',
  'Notion AI দিয়ে পড়াশোনা, প্রোজেক্ট এবং ডেইলি রুটিন ট্র্যাক করার আল্টিমেট গাইডলাইন',
  'Perplexity AI কীভাবে প্রথাগত গুগল সার্চের চেয়ে দ্রুত ও সঠিক রিসার্চ তথ্য এনে দেয়',
  'ল্যাপটপ বা পিসি স্লো হয়ে গেছে? পারফরম্যান্স দ্বিগুণ করতে ৩টি প্রয়োজনীয় উইন্ডোজ অপ্টিমাইজেশন সেটিংস',
  'বড় সাইজের যেকোনো পিডিএফ (PDF) ও বই AI দিয়ে বাংলায় সামারি করার সহজ উপায়',
  'ফেসবুক পেজ ও ব্যক্তিগত জিমেইল একাউন্ট হ্যাকিং থেকে নিরাপদ রাখতে ৩টি মাস্ট-হ্যাভ সিকিউরিটি স্টেপ',
  'Make.com বা Zapier দিয়ে কোনো কোডিং ছাড়াই দৈনন্দিন সোশ্যাল মিডিয়া পোস্ট অটোমেট করার পদ্ধতি',
];

/**
 * Calculates a composite score for a topic based on Master Plan criteria:
 * Practical Utility (40%), Novelty/Recency (30%), Shareability (30%)
 */
export function calculateTopicScore(utility: number, recency: number, shareability: number): number {
  const u = Math.min(100, Math.max(0, utility));
  const r = Math.min(100, Math.max(0, recency));
  const s = Math.min(100, Math.max(0, shareability));
  return Math.round(u * 0.4 + r * 0.3 + s * 0.3);
}

/**
 * Discovers and ranks trending topics using Gemini AI with Google Search Grounding across:
 * 1. Product Hunt (Top AI products trending this week)
 * 2. Reddit (Viral discussions in r/ChatGPT & r/ArtificialInteligence)
 * 3. Hugging Face & GitHub (Trending open-source AI tools)
 */
export async function discoverTopTrendingTopic(slotCategory?: string): Promise<DiscoveredTopic> {
  console.log(`[Trend Engine] 🔍 Initiating live multi-source AI trend research ${slotCategory ? `for slot category: "${slotCategory}"` : '(Product Hunt, Reddit, Hugging Face)'}...`);

  if (isConfiguredForGemini()) {
    const learningMemory = await getLearningFeedbackPrompt();

    const categoryDirective = slotCategory
      ? `\nSPECIAL EDITORIAL FOCUS FOR THIS SLOT:\nTheme / Target Niche: "${slotCategory}". Prioritize finding breakthroughs, guides, or viral tools matching this exact category.\n`
      : '';

    const prompt = `You are the lead tech intelligence researcher for "ByteBangla".
${learningMemory}
${categoryDirective}
LIVE WEB RESEARCH INSTRUCTIONS:
Search the web right now for today's and this week's most viral and trending AI announcements from:
1. Product Hunt: Top rated AI tools and launches of the week.
2. Reddit: Viral discussions & tools praised on r/ChatGPT and r/ArtificialInteligence.
3. Hugging Face & GitHub: Trending open-source tools, spaces, and productivity workflows.

Discover 5 fresh, high-utility, and practical topics in Bengali.
Target audience: Bengali students, freelancers, software developers, and professionals.
Focus on: Free alternatives, prompt engineering secrets, automated workflows, and instant time-savers.

Return ONLY a valid JSON array of 5 objects without markdown backticks:
[
  {
    "title": "বাংলায় আকর্ষণীয় ও সুনির্দিষ্ট টপিকের নাম (যেমন: Product Hunt-এ ১ নম্বরে থাকা এই ফ্রি AI টুলটি দিয়ে ৩ মিনিটে স্লাইড তৈরি করুন)",
    "category": "Product Hunt Trending" or "Reddit Viral AI" or "Hugging Face / OpenSource AI" or "AI Productivity Hacks",
    "source": "Product Hunt" or "Reddit" or "Hugging Face" or "Tech News",
    "utilityScore": 80 to 100,
    "recencyScore": 85 to 100,
    "shareabilityScore": 80 to 100
  }
]`;

    const modelsToTry = [
      process.env.GEMINI_MODEL || 'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
    ];

    for (const model of modelsToTry) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
        
        // Attempt with Google Search Grounding for real-time live web facts
        let requestBody: any = {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          tools: [{ googleSearch: {} }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1200 },
        };

        let response: any;
        try {
          response = await axios.post(endpoint, requestBody, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000,
          });
        } catch (groundingError: any) {
          // If search grounding fails or is restricted, retry without tools
          console.warn(`[Trend Engine Notice] Search Grounding notice (${groundingError.message}). Retrying standard AI inference...`);
          delete requestBody.tools;
          response = await axios.post(endpoint, requestBody, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 25000,
          });
        }

        const raw = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (raw) {
          const cleaned = raw.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
          const items: any[] = JSON.parse(cleaned);

          if (Array.isArray(items) && items.length > 0) {
            // Rank candidates by composite score (Utility 40%, Recency 30%, Shareability 30%)
            const candidates: DiscoveredTopic[] = items.map((item) => {
              const finalScore = calculateTopicScore(
                item.utilityScore || 85,
                item.recencyScore || 90,
                item.shareabilityScore || 85
              );
              return {
                title: item.title,
                category: item.category || 'AI Tools',
                source: item.source || 'Product Hunt & Web',
                utilityScore: item.utilityScore || 85,
                recencyScore: item.recencyScore || 90,
                shareabilityScore: item.shareabilityScore || 85,
                finalScore,
                hash: generateTopicHash(item.title),
              };
            });

            candidates.sort((a, b) => b.finalScore - a.finalScore);

            // Find first non-duplicate topic
            for (const cand of candidates) {
              if (!isTopicDuplicate(cand.title)) {
                markTopicAsPosted(cand.title);
                await saveTopic({
                  title: cand.title,
                  titleHash: cand.hash,
                  category: cand.category,
                  score: cand.finalScore,
                  status: 'DISCOVERED',
                });
                console.log(`[Trend Engine] 🏆 Selected Top Fresh Topic from [${cand.source}] (Score: ${cand.finalScore}): "${cand.title}"`);
                return cand;
              }
              console.log(`[Trend Engine] ⏭️ Skipping duplicate topic: "${cand.title}"`);
            }
          }
        }
      } catch (err: any) {
        console.warn(`[Trend Engine Warning] AI discovery with model ${model} failed: ${err.message}. Trying next...`);
      }
    }
  }

  // Fallback to curated topics if AI discovery is unavailable or all candidates are duplicates
  console.log('[Trend Engine] 💡 Selecting from curated evergreen ByteBangla topics...');
  for (const topic of FALLBACK_CURATED_TOPICS) {
    if (!isTopicDuplicate(topic)) {
      const hash = markTopicAsPosted(topic);
      const fallbackTopic: DiscoveredTopic = {
        title: topic,
        category: 'AI Productivity',
        source: 'Curated Evergreen',
        utilityScore: 90,
        recencyScore: 85,
        shareabilityScore: 90,
        finalScore: 88,
        hash,
      };
      await saveTopic({
        title: topic,
        titleHash: hash,
        category: fallbackTopic.category,
        score: fallbackTopic.finalScore,
        status: 'DISCOVERED',
      });
      return fallbackTopic;
    }
  }

  // If literally every topic has been posted, pick random one
  const fallback = FALLBACK_CURATED_TOPICS[Math.floor(Math.random() * FALLBACK_CURATED_TOPICS.length)];
  return {
    title: fallback,
    category: 'AI Productivity',
    source: 'Curated',
    utilityScore: 85,
    recencyScore: 80,
    shareabilityScore: 85,
    finalScore: 83,
    hash: generateTopicHash(fallback),
  };
}
