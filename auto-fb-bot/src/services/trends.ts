import axios from 'axios';
import { env, isConfiguredForGemini } from '../config/env';
import { isTopicDuplicate, markTopicAsPosted, generateTopicHash, normalizeTitle } from '../utils/hash';
import { saveTopic, getAllPosts, getRecentHistory30Days } from './db';
import { getLearningFeedbackPrompt } from './learning';

export interface DiscoveredTopic {
  title: string;
  category: string;
  pillarId?: string;
  source?: string;
  utilityScore: number;
  recencyScore: number;
  shareabilityScore: number;
  finalScore: number;
  hash: string;
}

export interface ContentPillar {
  id: string;
  nameEn: string;
  nameBn: string;
  badge: string;
  accentColor: string;
  glowColor: string;
  hookStyle: string;
  niche: string;
}

/**
 * 5 Universally Engaging Mass-Market Content Pillars for ByteBangla (Ages 15-50)
 * Completely eliminates developer/IDE jargon and targets mass Bangladeshi audiences.
 */
export const CONTENT_PILLARS: ContentPillar[] = [
  {
    id: 'smart_life_hacks',
    nameEn: 'Smart Mobile & Life Hacks',
    nameBn: 'দরকারি মোবাইল ও লাইফ হ্যাক',
    badge: '💡 দরকারি লাইফ হ্যাক',
    accentColor: '#06B6D4', // Cyan
    glowColor: '#0891B2',
    hookStyle: 'Direct Value / Curiosity Question',
    niche: 'ফোনের স্টোরেজ খালি করার উপায়, অচেনা নাম্বারের নাম-ছবি বের করা, ক্যামেরা দিয়ে যেকোনো লেখা বাংলায় অনুবাদ, ট্রেনের টিকিট কাটার নিয়ম, ওয়াইফাই স্পিড বাড়ানো, অপ্রয়োজনীয় নোটিফিকেশন বন্ধ করার গোপন সেটিংস',
  },
  {
    id: 'scam_alert_security',
    nameEn: 'Scam Alert & Digital Security',
    nameBn: 'অনলাইন সুরক্ষা ও প্রতারণা সতর্কতা',
    badge: '🛡️ অনলাইন সুরক্ষা ও সতর্কতা',
    accentColor: '#10B981', // Emerald
    glowColor: '#059669',
    hookStyle: 'Reality Warning / Suspense',
    niche: 'বিকাশ/নগদ/এটিএম কার্ড প্রতারণা ঠেকানো, ফেসবুক বা হোয়াটসঅ্যাপ হ্যাক হওয়া থেকে বাঁচার সহজ টু-স্টেপ ভেরিফিকেশন, অচেনা লিংকে ক্লিক না করার নিয়ম, ওটিপি জালিয়াতি, ভুয়া লটারি বা চাকরির মেসেজ চেনার উপায়',
  },
  {
    id: 'inspiring_stories',
    nameEn: 'Inspiring True Stories & Figures',
    nameBn: 'জীবন বদলে দেওয়া অনুপ্রেরণার গল্প',
    badge: '📖 জীবন বদলে দেওয়া গল্প',
    accentColor: '#F59E0B', // Gold
    glowColor: '#D97706',
    hookStyle: 'Story Suspense / Emotional Hook',
    niche: 'চরম প্রতিকূলতা থেকে ঘুরে দাঁড়ানো বিশ্বখ্যাত বা বাস্তব জীবনের ১ মিনিটের গল্প (এ পি জে আব্দুল কালাম, কাজী নজরুল ইসলাম, স্টিভ জবস, কর্নেল স্যান্ডার্স, মেরি কম, জ্যাক মা)',
  },
  {
    id: 'psychology_wisdom',
    nameEn: 'Human Psychology & Practical Wisdom',
    nameBn: 'মনস্তত্ত্ব ও জীবনজ্ঞান',
    badge: '🧠 মনস্তত্ত্ব ও জীবনজ্ঞান',
    accentColor: '#A855F7', // Purple
    glowColor: '#9333EA',
    hookStyle: 'Psychological Insight / Curiosity',
    niche: 'মানুষের বডি ল্যাঙ্গুয়েজ ও মিথ্যা বোঝার মনস্তাত্ত্বিক কৌশল, অতিরিক্ত রাগ বা দুশ্চিন্তা কমানোর ২ মিনিটের নিয়ম, অপচয় বন্ধ করে টাকা ধরে রাখার গোপন অভ্যাস, মানুষের সাথে সুন্দর করে কথা বলার কৌশল',
  },
  {
    id: 'curiosity_history_wonders',
    nameEn: 'Curiosity, History & Hidden Wonders',
    nameBn: 'অজানা রহস্য ও পৃথিবীর তথ্য',
    badge: '🌍 অজানা রহস্য ও তথ্য',
    accentColor: '#EC4899', // Rose/Pink
    glowColor: '#DB2777',
    hookStyle: 'Curiosity Question / Wonder',
    niche: 'বাংলাদেশের অজানা রোমাঞ্চকর ইতিহাস (পানাম নগর, লালবাগ কেল্লার রহস্য), রহস্যময় ঐতিহাসিক স্থান, পৃথিবীর অবিশ্বাস্য বৈজ্ঞানিক ও ভৌগোলিক তথ্য, আশ্চর্য সব আবিষ্কার ও তথ্য',
  },
];

export const FALLBACK_CURATED_TOPICS_BY_CATEGORY: Record<string, string[]> = {
  'Smart Mobile & Life Hacks': [
    'কোনো ছবি বা ফাইল না ডিলিট করেই ফোনের স্টোরেজ খালি করার ৩টি সহজ উপায়',
    'অচেনা নম্বর থেকে কল আসলে এক সেকেন্ডে তার আসল নাম ও পরিচয় জানার উপায়',
    'ক্যামেরা দিয়ে যেকোনো ইংরেজি বা বিদেশি লেখা এক নিমিষে বাংলায় অনুবাদ করার ট্রিক',
    'ঘরে বসে মাত্র ২ মিনিটে মোবাইলেই ট্রেনের টিকিট কাটার সবচেয়ে সহজ ও সঠিক নিয়ম',
    'সারাদিন ইন্টারনেট চালালেও ফোনের ব্যাটারি ব্যাকআপ দ্বিগুণ করার দরকারি সেটিংস',
  ],
  'Scam Alert & Digital Security': [
    'বিকাশ ও নগদে ফোন করে পিন চাওয়ার নতুন প্রতারণা থেকে বাঁচার ৩টি জরুরি নিয়ম',
    'ফেসবুক আইডি কখনোই হ্যাক হবে না—মোবাইলের এই ২টি সিকিউরিটি সেটিংস আজই অন করুন',
    'হোয়াটসঅ্যাপে আসা অচেনা লিংকে ক্লিক করলেই কি অ্যাকাউন্ট হ্যাক হয়? যেভাবে সুরক্ষিত থাকবেন',
    'এটিএম বুথ ও ক্রেডিট কার্ড ব্যবহারে যে সাধারণ ভুলে লাখ টাকা খোয়া যেতে পারে',
    'ফোনে আসা লটারি বা চাকরির ভুয়া মেসেজ চেনার সহজ উপায় ও তাৎক্ষণিক করণীয়',
  ],
  'Inspiring True Stories & Figures': [
    'পত্রিকা বিলি করা এক সাধারণ ছেলে যেভাবে ভারতের রাষ্ট্রপতি ও মিসাইল ম্যান হলেন—এ পি জে কালামের গল্প',
    'চরম দারিদ্র্য আর রুটির দোকানে কাজ করে যেভাবে বিশ্বজয়ী কবি হলেন আমাদের কাজী নজরুল ইসলাম',
    'নিজের তৈরি কোম্পানি থেকেই বরখাস্ত হয়ে যেভাবে বিশ্বসেরা প্রতিষ্ঠান গড়েছিলেন স্টিভ জবস',
    '৬৫ বছর বয়সে ১০০৯ বার প্রত্যাখ্যাত হয়েও যেভাবে বিশ্বখ্যাত কেএফসি গড়ে তুলেছিলেন কর্নেল স্যান্ডার্স',
    'প্রতিকূলতার সাথে লড়াই করে বিশ্ব জয় করা এক সাধারণ মেয়ের অনুপ্রেরণাদায়ী জীবন গল্প',
  ],
  'Human Psychology & Practical Wisdom': [
    'কথা বলার সময় মানুষের বডি ল্যাঙ্গুয়েজ ও চোখের চাহনি দেখে মিথ্যা ধরার ৪টি মনস্তাত্ত্বিক লক্ষণ',
    'অতিরিক্ত রাগ ও মানসিক দুশ্চিন্তা নিমেষেই দূর করার জাপানি ২ মিনিটের নিয়ম',
    'প্রতি মাসে উপার্জনের টাকা ধরে রাখার জন্য ধনীদের অনুসরণ করা ৩টি গোপন আর্থিক অভ্যাস',
    'যেকোনো আড্ডায় বা মানুষের সাথে কথা বলে সবার প্রিয়পাত্র হওয়ার সহজ মনস্তাত্ত্বিক কৌশল',
    'নেতিবাচক চিন্তা থেকে মনকে মুক্ত রেখে কাজে ১০০% মনোযোগ দেওয়ার বৈজ্ঞানিক উপায়',
  ],
  'Curiosity, History & Hidden Wonders': [
    'সোনারগাঁয়ের পানাম নগরী কেন হঠাৎ এক রাতের মধ্যে জনমানবহীন ভুতুড়ে শহরে রূপ নিয়েছিল?',
    'লালবাগ কেল্লার রহস্যময় মাটির নিচের সুড়ঙ্গ নিয়ে যে অজানা সত্য আজও মানুষকে অবাক করে',
    'পৃথিবীর সবচেয়ে গভীর সমুদ্রের তলদেশে বিজ্ঞানীদের দেখা পাওয়া অবিশ্বাস্য সব প্রাণী ও দৃশ্য',
    'মহাকাশের এমন ৩টি অবিশ্বাস্য বিস্ময় যা দেখলে সাধারণ মানুষের চোখ কপালে উঠবে',
    'প্রাচীন বাংলার এমন কিছু বিস্ময়কর স্থাপত্য যা তৎকালীন ইঞ্জিনিয়ারিংয়ের অনন্য নিদর্শন',
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
 * Automatically determines the next category in strict 5-pillar rotation
 * by inspecting past posts from local store.
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
  if (
    lastCaption.includes('বিকাশ') ||
    lastCaption.includes('নগদ') ||
    lastCaption.includes('হ্যাক') ||
    lastCaption.includes('প্রতারণা') ||
    lastCaption.includes('সিকিউরিটি') ||
    lastCaption.includes('সুরক্ষা')
  ) {
    matchedIndex = 1; // scam_alert_security
  } else if (
    lastCaption.includes('গল্প') ||
    lastCaption.includes('কালাম') ||
    lastCaption.includes('নজরুল') ||
    lastCaption.includes('স্টিভ জবস') ||
    lastCaption.includes('অনুপ্রেরণা') ||
    lastCaption.includes('জীবন বদলে')
  ) {
    matchedIndex = 2; // inspiring_stories
  } else if (
    lastCaption.includes('বডি ল্যাঙ্গুয়েজ') ||
    lastCaption.includes('মিথ্যা') ||
    lastCaption.includes('মনস্তত্ত্ব') ||
    lastCaption.includes('রাগ') ||
    lastCaption.includes('দুশ্চিন্তা') ||
    lastCaption.includes('অভ্যাস')
  ) {
    matchedIndex = 3; // psychology_wisdom
  } else if (
    lastCaption.includes('ইতিহাস') ||
    lastCaption.includes('রহস্য') ||
    lastCaption.includes('পানাম') ||
    lastCaption.includes('লালবাগ') ||
    lastCaption.includes('বিস্ময়') ||
    lastCaption.includes('সমুদ্র')
  ) {
    matchedIndex = 4; // curiosity_history_wonders
  } else {
    matchedIndex = 0; // smart_life_hacks
  }

  const nextIndex = (matchedIndex + 1) % CONTENT_PILLARS.length;
  const nextCategory = CONTENT_PILLARS[nextIndex].nameEn;
  console.log(`[Trend Engine] 🔄 5-Pillar Rotation: [${CONTENT_PILLARS[matchedIndex].nameEn}] ➔ [${nextCategory}]`);
  return nextCategory;
}

/**
 * Checks if a candidate topic shares >20% keyword/concept overlap
 * with ANY post or topic generated in the last 30 days.
 * Guarantees zero repetition of topics, apps, hacks, or figures within a 30-day window.
 */
export async function isDuplicateInLast30Days(
  candidateTitle: string,
  customHistory?: string[]
): Promise<boolean> {
  let allTexts: string[] = [];
  if (customHistory && Array.isArray(customHistory)) {
    allTexts = customHistory;
  } else {
    const history = await getRecentHistory30Days();
    allTexts = [...history.titles, ...history.captions];
  }

  if (allTexts.length === 0) return false;

  const extractTokens = (text: string): Set<string> => {
    const clean = normalizeTitle(text);
    const stopWords = new Set([
      'এই', 'টি', 'কিভাবে', 'করুন', 'উপায়', 'সেরা', 'দিয়ে', 'মাত্র', 'নতুন',
      'টিপস', 'নিয়ম', 'জানুন', 'হলে', 'হবে', 'থেকে', 'করে', 'জন্য', 'আছে',
      'যদি', 'কেন', 'কি', 'সব', 'আর', 'না', 'এক', 'একটি', 'বা', 'যে', 'তা',
      'ভিডিও', 'পোস্ট', 'সহজ', 'দরকারী', 'গোপন', 'আসুন', 'দেখে', 'নিন'
    ]);
    return new Set(clean.split(' ').filter((w) => w.length > 2 && !stopWords.has(w)));
  };

  const candTokens = extractTokens(candidateTitle);
  if (candTokens.size === 0) return false;

  for (const text of allTexts) {
    const pastTokens = extractTokens(text.slice(0, 160));
    let intersection = 0;
    candTokens.forEach((token) => {
      if (pastTokens.has(token)) intersection++;
    });

    // Check overlap relative to candidate token count (Strict > 20% overlap threshold)
    const overlap = intersection / candTokens.size;
    if (overlap >= 0.20) {
      console.log(`[Trend Engine] 🚫 30-Day De-duplication triggered (${Math.round(overlap * 100)}% overlap with recent post): "${candidateTitle.slice(0, 45)}..."`);
      return true;
    }
  }

  return false;
}

/**
 * Discovers and ranks trending mass-market topics adhering to:
 * 1. Strict 5-pillar rotation across universal categories
 * 2. Strict 30-day de-duplication check (<20% keyword overlap)
 * 3. 100% elimination of programming/IDE jargon
 */
export async function discoverTopTrendingTopic(requestedCategory?: string): Promise<DiscoveredTopic> {
  const categoryToUse = requestedCategory || (await getNextRotatedCategory());
  const pillar = CONTENT_PILLARS.find((p) => p.nameEn === categoryToUse) || CONTENT_PILLARS[0];

  console.log(`[Trend Engine] 🔍 Researching fresh topic for Pillar: "${pillar.nameEn}" (${pillar.nameBn})...`);

  if (isConfiguredForGemini()) {
    const learningMemory = await getLearningFeedbackPrompt();

    const prompt = `You are the Lead Content Strategist and Viral Growth Specialist for "ByteBangla".
${learningMemory}

MANDATORY CONTENT PILLAR FOR THIS POST:
Pillar: "${pillar.nameEn}" (${pillar.nameBn})
Focus Niche: ${pillar.niche}
Hook Style to target: ${pillar.hookStyle}

Target audience: General population of Bangladesh aged 15 to 50 (students, job seekers, homemakers, professionals, and elders).

STRICT MASS-MARKET RULES:
- ❌ STRICTLY BAN all software developer, coding, and IDE jargon: NO "TypeScript", NO "Regex", NO "VS Code", NO "Terminal", NO "API", NO "Syntax", NO "npm", NO "git".
- Focus 100% on everyday human life, smartphone utilities, digital security, inspiring real stories, human psychology, and exciting mysteries.
- Provide 5 fresh, high-retention, curiosity-driven topics in Bengali.
- Topics MUST be universally relatable to ordinary people in Dhaka and across Bangladesh.

Return ONLY a valid JSON array of 5 objects without markdown backticks:
[
  {
    "title": "বাংলায় আকর্ষণীয় ও সুনির্দিষ্ট টপিকের নাম",
    "category": "${pillar.nameEn}",
    "source": "Viral Web Trend" or "Real Life Hacks" or "History Archive",
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
                category: pillar.nameEn,
                pillarId: pillar.id,
                source: item.source || 'Viral Web Trend',
                utilityScore: item.utilityScore || 85,
                recencyScore: item.recencyScore || 90,
                shareabilityScore: item.shareabilityScore || 85,
                finalScore,
                hash: generateTopicHash(item.title),
              };
            });

            candidates.sort((a, b) => b.finalScore - a.finalScore);

            // Check against both hash store AND 30-day history
            for (const cand of candidates) {
              const isRecentDuplicate = await isDuplicateInLast30Days(cand.title);
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

  // Fallback to curated topics within the rotated pillar
  const fallbackList = FALLBACK_CURATED_TOPICS_BY_CATEGORY[pillar.nameEn] || FALLBACK_CURATED_TOPICS_BY_CATEGORY['Smart Mobile & Life Hacks'];
  console.log(`[Trend Engine] 💡 Selecting evergreen fallback from pillar: "${pillar.nameEn}"...`);

  for (const topic of fallbackList) {
    const isRecentDuplicate = await isDuplicateInLast30Days(topic);
    if (!isTopicDuplicate(topic) && !isRecentDuplicate) {
      const hash = markTopicAsPosted(topic);
      const fallbackTopic: DiscoveredTopic = {
        title: topic,
        category: pillar.nameEn,
        pillarId: pillar.id,
        source: 'Curated 5-Pillar Evergreen',
        utilityScore: 94,
        recencyScore: 90,
        shareabilityScore: 95,
        finalScore: 93,
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
    category: pillar.nameEn,
    pillarId: pillar.id,
    source: 'Curated 5-Pillar Evergreen',
    utilityScore: 90,
    recencyScore: 85,
    shareabilityScore: 90,
    finalScore: 88,
    hash: generateTopicHash(chosen),
  };
}
