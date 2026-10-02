import axios from 'axios';
import { env, isConfiguredForGemini } from '../config/env';
import { isTopicDuplicate, markTopicAsPosted, generateTopicHash, normalizeTitle } from '../utils/hash';
import { saveTopic, getAllPosts } from './db';
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

/**
 * 4 Required Content Pillars for ByteBangla
 */
export const CONTENT_PILLARS = [
  {
    id: 'ai_tools',
    nameEn: 'AI Tools & Productivity',
    nameBn: 'এআই টুলস ও প্রোডাক্টিভিটি',
    niche: 'Practical daily AI tools, ChatGPT prompt hacks, Claude tricks, time-saving free web utilities',
  },
  {
    id: 'web_dev',
    nameEn: 'Web Development / Coding Hacks',
    nameBn: 'ওয়েব ডেভেলপমেন্ট ও কোডিং হ্যাক্স',
    niche: 'Dev tools, GitHub trending open-source repos, VS Code extensions, AI coding assistants',
  },
  {
    id: 'automation',
    nameEn: 'Google Sheets & Tech Automation',
    nameBn: 'গুগল শিটস ও টেক অটোমেশন',
    niche: 'Google Sheets & Excel AI formulas, Make.com, Zapier workflows, automated spreadsheet data entry',
  },
  {
    id: 'career',
    nameEn: 'Career & Freelancing Tips',
    nameBn: 'ক্যারিয়ার ও ফ্রিল্যান্সিং টিপস',
    niche: 'Remote freelancing productivity, Upwork/Fiverr workflows, tech portfolio optimization, digital skills',
  },
];

export const FALLBACK_CURATED_TOPICS_BY_CATEGORY: Record<string, string[]> = {
  'AI Tools & Productivity': [
    'দৈনন্দিন কাজের সময় বাঁচাতে সেরা ৫টি ফ্রি AI টুল যা প্রত্যেকের ব্যবহার করা উচিত',
    'ChatGPT-র এমন ৩টি সুপার প্রম্পট যা আপনার ফ্রিল্যান্সিং ও ইমেইল রাইটিং গতি ৩ গুণ বাড়াবে',
    'বড় সাইজের যেকোনো পিডিএফ (PDF) ও বই AI দিয়ে বাংলায় সামারি করার সহজ উপায়',
    'Perplexity AI কীভাবে প্রথাগত গুগল সার্চের চেয়ে দ্রুত ও সঠিক রিসার্চ তথ্য এনে দেয়',
    'Canva AI এবং Gamma App দিয়ে মাত্র ৩ মিনিটে প্রফেশনাল প্রেজেন্টেশন স্লাইড বানানোর সহজ উপায়',
  ],
  'Web Development / Coding Hacks': [
    'VS Code-এর সেরা ৫টি এক্সটেনশন যা কোডারদের প্রোডাক্টিভিটি দ্বিগুণ করে দেয়',
    'Claude 3.5 Sonnet দিয়ে ফুল-স্ট্যাক অ্যাপ তৈরি করার স্টেপ-বাই-স্টেপ গাইডলাইন',
    'গিটহাবের (GitHub) টপ ৩টি ট্রেন্ডিং ওপেন-সোর্স এআই রিপো যা এখনই ট্রাই করা উচিত',
    'প্রোগ্রামিং শেখার জন্য সেরা ৩টি ইন্টারঅ্যাক্টিভ ফ্রি ওয়েবসাইট ও প্ল্যাটফর্ম',
    'কোনো জটিল কোড ছাড়াই মাত্র ১০ মিনিটে চমৎকার পোর্টফোলিও ওয়েবসাইট লাইভ করার উপায়',
  ],
  'Google Sheets & Tech Automation': [
    'গুগল শিটসে (Google Sheets) AI ফর্মুলা দিয়ে ডাটা এন্ট্রির জটিল কাজ অটোমেশন করার টেকনিক',
    'এক্সেল ও শিটসের সেরা ৩টি ম্যাজিক ফর্মুলা যা ঘণ্টার কাজ ১০ মিনিটে শেষ করে দেয়',
    'Make.com বা Zapier দিয়ে কোনো কোডিং ছাড়াই দৈনন্দিন সোশ্যাল মিডিয়া পোস্ট অটোমেট করার পদ্ধতি',
    'গুগল ড্রাইভ ও জিমেইলের স্মার্ট অটোমেশন ফিল্টার যা আপনার ইনবক্স রাখবে ১০০% পরিপাটি',
    'গুগল অ্যাপস স্ক্রিপ্ট (Apps Script) দিয়ে অটোমেটিক ইমেইল ও ডাটা রিপোর্ট পাঠানোর উপায়',
  ],
  'Career & Freelancing Tips': [
    'ফাইভার ও আপওয়ার্কে ক্লায়েন্ট পাওয়ার জন্য ৫টি আধুনিক প্রফেশনাল টেকনিক',
    'রিমোট জবের জন্য এআই দিয়ে নিখুঁত এটিএস-ফ্রেন্ডলি (ATS) রিজিউমি তৈরি করার গাইড',
    'ফ্রিল্যান্সারদের সময় ম্যানেজমেন্টের জন্য সেরা ৩টি ডিজিটাল টুল ও ক্যালেন্ডার সিস্টেম',
    'আন্তর্জাতিক ক্লায়েন্টদের সাথে স্মার্টলি কমিউনিকেট করতে সেরা এআই রাইটিং প্রম্পটস',
    'নিজের স্কিল আপগ্রেড করে টেক ইন্ডাস্ট্রিতে হাই-পেইং ক্যারিয়ার গড়ার কমপ্লিট রোডম্যাপ',
  ],
};

/**
 * Calculates a composite score for a topic
 */
export function calculateTopicScore(utility: number, recency: number, shareability: number): number {
  const u = Math.min(100, Math.max(0, utility));
  const r = Math.min(100, Math.max(0, recency));
  const s = Math.min(100, Math.max(0, shareability));
  return Math.round(u * 0.4 + r * 0.3 + s * 0.3);
}

/**
 * Automatically determines the next category in the round-robin rotation
 * by inspecting past posts in the local database.
 */
export async function getNextRotatedCategory(): Promise<string> {
  const allPosts = await getAllPosts();
  if (!allPosts || allPosts.length === 0) {
    return CONTENT_PILLARS[0].nameEn;
  }

  // Find category of last post by inspecting captions or stored topic
  const lastPost = allPosts[0];
  const lastCaption = (lastPost.caption || '').toLowerCase();

  let matchedIndex = 0;
  if (lastCaption.includes('কোড') || lastCaption.includes('github') || lastCaption.includes('programming') || lastCaption.includes('dev')) {
    matchedIndex = 1;
  } else if (lastCaption.includes('শিট') || lastCaption.includes('sheet') || lastCaption.includes('excel') || lastCaption.includes('অটোমেশন')) {
    matchedIndex = 2;
  } else if (lastCaption.includes('ক্যারিয়ার') || lastCaption.includes('ফ্রিল্যান্সিং') || lastCaption.includes('আপওয়ার্ক') || lastCaption.includes('রিমোট')) {
    matchedIndex = 3;
  }

  const nextIndex = (matchedIndex + 1) % CONTENT_PILLARS.length;
  const nextCategory = CONTENT_PILLARS[nextIndex].nameEn;
  console.log(`[Trend Engine] 🔄 Category Rotation: [${CONTENT_PILLARS[matchedIndex].nameEn}] ➔ [${nextCategory}]`);
  return nextCategory;
}

/**
 * Checks if a candidate topic shares significant keyword overlap (> 40%)
 * with ANY post published in the last 14 days.
 */
export async function isDuplicateInLast14Days(candidateTitle: string): Promise<boolean> {
  const allPosts = await getAllPosts();
  const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;

  const recentPosts = allPosts.filter((p) => {
    const pubTime = new Date(p.publishedAt).getTime();
    return !isNaN(pubTime) && pubTime >= fourteenDaysAgo;
  });

  const extractTokens = (text: string): Set<string> => {
    const clean = normalizeTitle(text);
    const stopWords = new Set(['এই', 'টি', 'কিভাবে', 'করুন', 'উপায়', 'সেরা', 'দিয়ে', 'মাত্র', 'নতুন', 'হ্যাক্স', 'টুল', 'টিপস']);
    return new Set(clean.split(' ').filter((w) => w.length > 2 && !stopWords.has(w)));
  };

  const candTokens = extractTokens(candidateTitle);
  if (candTokens.size === 0) return false;

  for (const post of recentPosts) {
    const postTokens = extractTokens(post.caption.slice(0, 100));
    let intersection = 0;
    candTokens.forEach((token) => {
      if (postTokens.has(token)) intersection++;
    });

    const overlap = intersection / candTokens.size;
    if (overlap >= 0.40) {
      console.log(`[Trend Engine] 🚫 14-Day De-duplication triggered (${Math.round(overlap * 100)}% overlap with recent post): "${candidateTitle.slice(0, 45)}..."`);
      return true;
    }
  }

  return false;
}

/**
 * Discovers and ranks trending topics adhering to:
 * 1. Category rotation across the 4 core pillars
 * 2. 14-day history check from store.json to prevent duplicate themes
 */
export async function discoverTopTrendingTopic(requestedCategory?: string): Promise<DiscoveredTopic> {
  const categoryToUse = requestedCategory || (await getNextRotatedCategory());

  console.log(`[Trend Engine] 🔍 Researching fresh topic for Category: "${categoryToUse}"...`);

  if (isConfiguredForGemini()) {
    const learningMemory = await getLearningFeedbackPrompt();

    const prompt = `You are the lead tech intelligence researcher for "ByteBangla".
${learningMemory}

MANDATORY EDITORIAL NICHE FOR THIS POST:
Category: "${categoryToUse}"

Task: Find 5 fresh, high-utility, and practical topics in Bengali exclusively within "${categoryToUse}".
Target audience: Bengali students, freelancers, software developers, and working professionals.
STRICT RULES:
- The topics MUST be distinctly different from one another.
- Do NOT repeat generic "video editing shorts" topics!
- Give concrete, actionable tool names, tricks, or step-by-step guides.

Return ONLY a valid JSON array of 5 objects without markdown backticks:
[
  {
    "title": "বাংলায় আকর্ষণীয় ও সুনির্দিষ্ট টপিকের নাম",
    "category": "${categoryToUse}",
    "source": "Product Hunt" or "Reddit" or "GitHub" or "Tech News",
    "utilityScore": 85 to 100,
    "recencyScore": 85 to 100,
    "shareabilityScore": 85 to 100
  }
]`;

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
            generationConfig: { temperature: 0.7, maxOutputTokens: 1200 },
          },
          { headers: { 'Content-Type': 'application/json' }, timeout: 25000 }
        );

        const raw = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (raw) {
          const cleaned = raw.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
          const items: any[] = JSON.parse(cleaned);

          if (Array.isArray(items) && items.length > 0) {
            const candidates: DiscoveredTopic[] = items.map((item) => {
              const finalScore = calculateTopicScore(
                item.utilityScore || 85,
                item.recencyScore || 90,
                item.shareabilityScore || 85
              );
              return {
                title: item.title,
                category: categoryToUse,
                source: item.source || 'Curated Web Intelligence',
                utilityScore: item.utilityScore || 85,
                recencyScore: item.recencyScore || 90,
                shareabilityScore: item.shareabilityScore || 85,
                finalScore,
                hash: generateTopicHash(item.title),
              };
            });

            candidates.sort((a, b) => b.finalScore - a.finalScore);

            // Check against both hash store AND 14-day history in store.json
            for (const cand of candidates) {
              const isRecentDuplicate = await isDuplicateInLast14Days(cand.title);
              const isHashDup = isTopicDuplicate(cand.title);

              if (!isRecentDuplicate && !isHashDup) {
                markTopicAsPosted(cand.title);
                await saveTopic({
                  title: cand.title,
                  titleHash: cand.hash,
                  category: cand.category,
                  score: cand.finalScore,
                  status: 'DISCOVERED',
                });
                console.log(`[Trend Engine] 🏆 Selected Top Fresh Topic [${cand.category}] (Score: ${cand.finalScore}): "${cand.title}"`);
                return cand;
              }
              console.log(`[Trend Engine] ⏭️ Skipping duplicate candidate: "${cand.title}"`);
            }
          }
        }
      } catch (err: any) {
        console.warn(`[Trend Engine Warning] AI discovery with model ${model} failed: ${err.message}. Trying next...`);
      }
    }
  }

  // Fallback to curated topics within the rotated category
  const fallbackList = FALLBACK_CURATED_TOPICS_BY_CATEGORY[categoryToUse] || FALLBACK_CURATED_TOPICS_BY_CATEGORY['AI Tools & Productivity'];
  console.log(`[Trend Engine] 💡 Selecting evergreen fallback from category: "${categoryToUse}"...`);

  for (const topic of fallbackList) {
    const isRecentDuplicate = await isDuplicateInLast14Days(topic);
    if (!isTopicDuplicate(topic) && !isRecentDuplicate) {
      const hash = markTopicAsPosted(topic);
      const fallbackTopic: DiscoveredTopic = {
        title: topic,
        category: categoryToUse,
        source: 'Curated Pillar Evergreen',
        utilityScore: 92,
        recencyScore: 88,
        shareabilityScore: 90,
        finalScore: 90,
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

  // If all are exhausted, take first non-duplicate or rotate
  const chosen = fallbackList[Math.floor(Math.random() * fallbackList.length)];
  return {
    title: chosen,
    category: categoryToUse,
    source: 'Curated Evergreen',
    utilityScore: 85,
    recencyScore: 80,
    shareabilityScore: 85,
    finalScore: 83,
    hash: generateTopicHash(chosen),
  };
}
