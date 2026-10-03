/**
 * ByteBangla Mass-Market Viral Content Prompts & Strict Validation Rules
 * Engineered for general population of Bangladesh (Aged 15 to 50: students, job seekers, homemakers, professionals, and elders)
 *
 * Core Principles:
 * 1. ZERO Programming / Developer Jargon (STRICTLY BAN: "TypeScript, Regex, VS Code, Terminal, API, Syntax")
 * 2. ZERO Generic Abstract Placeholders (BAN: "এই কাজটা", "এই দারুণ টেকনিকটি", "এই টুলটি", etc.)
 * 3. 5 Rotating Hook Formulas (Curiosity Question, Story Suspense, Reality Warning, Direct Value, Psychological Insight)
 * 4. Human Persona: Warm, authentic, wise Bangladeshi storyteller and life-mentor speaking in natural Dhaka Bengali.
 * 5. Strict 25-35s Duration (~65-85 spoken words) with High-Retention 4-Phase Arc.
 * 6. Mandatory Save & Share CTA Formula:
 *    "📌 দরকারি এই তথ্যটি পরে কাজে লাগবে, তাই ভিডিওটি এখনই Save করে রাখুন আর বন্ধুদের সাথে Share করুন! এমন প্রতিদিনের চমৎকার সব টিপসের জন্য সাথে থাকুন বাইট বাংলার!"
 */

export const BANNED_DEVELOPER_JARGON = [
  'typescript',
  'javascript',
  'regex',
  'regexextract',
  'vscode',
  'vs code',
  'visual studio code',
  'terminal',
  'api',
  'apis',
  'syntax',
  'npm install',
  'pip install',
  'git clone',
  'github repo',
  'function',
  'const ',
  'let ',
  'var ',
  'import ',
  'def ',
  'linux bash',
  'powershell',
  'ভিএস কোড',
  'সিনট্যাক্স',
  'টার্মিনাল',
  'রেজেক্স',
  'টাইপস্ক্রিপ্ট',
  'এপিআই',
];

export const BANNED_ABSTRACT_PHRASES = [
  'এই কাজটা',
  'এই দারুণ টেকনিকটি',
  'এই টেকনিকটি',
  'এই টুলটি',
  'একটা দারুণ উপায়',
  'এই দারুণ উপায়',
  'এই সেটিংসটি',
  'এই দারুণ ট্রিকসটি',
  'এই ট্রিকসটি',
  'এই ট্রিকটি',
  'এই গোপন ট্রিক',
  'এই চমৎকার ফিচারটি',
  'এই উপায়টি',
  'এই অসাধারণ ট্রিক',
  'এই ছোট কাজটা',
  'একটি দারুণ উপায়',
  'দারুণ একটি কৌশল',
];

export const BANNED_ROBOTIC_CLICHES = [
  'চলুন জেনে নেওয়া যাক',
  'আজকের আর্টিকেলে আমরা বিস্তারিত আলোচনা করব',
  'এটি একটি যুগান্তকারী পদক্ষেপ',
  'গুরুত্বপূর্ণ ভূমিকা পালন করে',
  'অতএব',
  'সুতরাং',
  'ফলশ্রুতিতে',
  'উল্লেখযোগ্য বিষয় হলো',
  'আশা করি আপনারা সবাই ভালো আছেন',
  'প্রিয় দর্শক',
  'আজকে আমি আপনাদের দেখাব',
  'হ্যালো বন্ধুরা',
  'ভিডিওটি ভালো লাগলে লাইক দিন',
];

export const MANDATORY_CTA_FORMULA =
  'দরকারি এই তথ্যটি পরে কাজে লাগবে, তাই ভিডিওটি এখনই Save করে রাখুন আর বন্ধুদের সাথে Share করুন! এমন প্রতিদিনের চমৎকার সব টিপসের জন্য সাথে থাকুন বাইট বাংলার!';

export const ROTATING_HOOK_STYLES = [
  {
    type: 'Curiosity Question',
    examples: [
      'আপনার ফোনে কি এই দরকারি সেটিংসটি অন করা আছে?',
      'কখনো কি ভেবে দেখেছেন মানুষের মন খারাপ হলে কেন...',
      'স্মার্টফোন ব্যবহার করেন অথচ এই ট্রিকটি জানেন না?',
    ],
  },
  {
    type: 'Story Suspense',
    examples: [
      'এক রাতের একটি ঘটনা এই মানুষটির পুরো জীবন বদলে দেয়...',
      'যে ছেলেটিকে সবাই ব্যর্থ ভেবেছিল, সে-ই একদিন পুরো পৃথিবীকে অবাক করে...',
      'চরম দারিদ্র্যের মাঝেও কীভাবে এক ব্যক্তি বিশ্বসেরা প্রতিষ্ঠান গড়ে তুলেছিলেন...',
    ],
  },
  {
    type: 'Reality Warning',
    examples: [
      'প্রতিদিন ফোনে এই সাধারণ ভুলটি করে আপনিও কি বিপদে পড়ছেন?',
      'বিকাশে বা মেসেজে আসা এই ভুলটিতে একটি ক্লিকেই হারাতে পারেন সব টাকা!',
      'ফেসবুকে যে একটি ভুল সেটিংসের কারণে আপনার আইডি যেকেউ দেখে ফেলতে পারে...',
    ],
  },
  {
    type: 'Direct Value',
    examples: [
      'কোনো ছবি বা ফাইল না ডিলিট করেই ফোনের স্টোরেজ খালি করার উপায়...',
      'ক্যামেরা অন করলেই যেকোনো বিদেশি ভাষা বাংলায় পড়ার সহজ নিয়ম...',
      'ঘরে বসেই মাত্র ২ মিনিটে ট্রেনের টিকিট কাটার সবচেয়ে নিরাপদ পদ্ধতি...',
    ],
  },
  {
    type: 'Psychological Insight',
    examples: [
      'মানুষ যখন মনে মনে দ্বিধায় থাকে, তার আচরণে এই পরিবর্তনটি ঘটে...',
      'কারো সাথে কথা বলার সময় তার চোখের চাহনি দেখে মিথ্যা চেনার উপায়...',
      'রাগ উঠলে মাত্র দুই মিনিটে নিজেকে শান্ত করার মনস্তাত্ত্বিক নিয়ম...',
    ],
  },
];

export interface SpecificityValidationResult {
  isValid: boolean;
  score: number;
  jargonFound: string[];
  bannedPhrasesFound: string[];
  hasCuriosityHook: boolean;
  hasActionableTakeaway: boolean;
  hasSaveAndShareTrigger: boolean;
  hasSignatureEnding: boolean;
  wordCount: number;
  failureReasons: string[];
}

/**
 * Validates that a script adheres strictly to mass-market viral criteria:
 * 1. ZERO developer jargon (strictly ban: "TypeScript, Regex, VS Code, Terminal, API, Syntax")
 * 2. ZERO abstract placeholder phrases ("এই কাজটা", "এই টেকনিকটি", etc.)
 * 3. 25-35s duration (~65-85 words, tolerance 55-95 words)
 * 4. Contains curiosity hook, actionable takeaway, and mandatory Save & Share CTA
 */
export function validateScriptSpecificity(text: string): SpecificityValidationResult {
  if (!text || typeof text !== 'string') {
    return {
      isValid: false,
      score: 0,
      jargonFound: [],
      bannedPhrasesFound: [],
      hasCuriosityHook: false,
      hasActionableTakeaway: false,
      hasSaveAndShareTrigger: false,
      hasSignatureEnding: false,
      wordCount: 0,
      failureReasons: ['Script is empty or invalid.'],
    };
  }

  const normalized = text.toLowerCase();
  const failureReasons: string[] = [];

  // 1. Check for prohibited developer jargon
  const jargonFound: string[] = [];
  for (const jargon of BANNED_DEVELOPER_JARGON) {
    if (normalized.includes(jargon)) {
      jargonFound.push(jargon);
    }
  }

  if (jargonFound.length > 0) {
    failureReasons.push(`Contains prohibited developer/IDE jargon: ${jargonFound.map(j => `"${j}"`).join(', ')}`);
  }

  // 2. Check for banned abstract placeholders
  const bannedFound: string[] = [];
  for (const banned of BANNED_ABSTRACT_PHRASES) {
    if (text.includes(banned)) {
      bannedFound.push(banned);
    }
  }

  if (bannedFound.length > 0) {
    failureReasons.push(`Contains prohibited abstract placeholder(s): ${bannedFound.map(b => `"${b}"`).join(', ')}`);
  }

  // 3. Word count check (Target: 65-85 words, bounds: 50-105 words)
  const words = text.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  if (wordCount < 50) {
    failureReasons.push(`Script is too short (${wordCount} words, minimum 50 words required for 25s voiceover).`);
  } else if (wordCount > 105) {
    failureReasons.push(`Script is too long (${wordCount} words, maximum 105 words allowed for 35s voiceover).`);
  }

  // 4. Hook validation
  const firstSentence = (text.split(/[।?!]/)[0] || '').trim();
  const hasCuriosityHook =
    firstSentence.includes('?') ||
    firstSentence.includes('কি') ||
    firstSentence.includes('কখনো') ||
    firstSentence.includes('ভুল') ||
    firstSentence.includes('বিপদ') ||
    firstSentence.includes('উপায়') ||
    firstSentence.includes('নিয়ম') ||
    firstSentence.includes('গল্প') ||
    firstSentence.includes('ঘটনা') ||
    firstSentence.includes('মানুষ');

  if (!hasCuriosityHook) {
    failureReasons.push('Opening hook is weak; must start with a curiosity question, suspense, warning, or direct value.');
  }

  // 5. Actionable takeaway or story lesson validation
  const hasActionableTakeaway =
    text.includes('করুন') ||
    text.includes('অন') ||
    text.includes('ক্লিয়ার') ||
    text.includes('সেটিংস') ||
    text.includes('শিক্ষা') ||
    text.includes('পদ্ধতি') ||
    text.includes('নিয়ম') ||
    text.includes('অপশন') ||
    text.includes('মনে রাখবেন');

  // 6. Save & Share trigger check
  const hasSaveAndShareTrigger =
    (normalized.includes('save') || normalized.includes('সেভ')) &&
    (normalized.includes('share') || normalized.includes('শেয়ার'));

  // 7. Signature ending check
  const hasSignatureEnding = normalized.includes('বাইট বাংলা') || normalized.includes('bytebangla');

  const isValid =
    jargonFound.length === 0 &&
    bannedFound.length === 0 &&
    wordCount >= 50 &&
    wordCount <= 105 &&
    hasSaveAndShareTrigger;

  let score = isValid ? 85 : 0;
  if (isValid && hasCuriosityHook) score += 5;
  if (isValid && hasActionableTakeaway) score += 5;
  if (isValid && hasSignatureEnding) score += 5;
  score = Math.min(100, score);

  return {
    isValid,
    score,
    jargonFound,
    bannedPhrasesFound: bannedFound,
    hasCuriosityHook,
    hasActionableTakeaway,
    hasSaveAndShareTrigger,
    hasSignatureEnding,
    wordCount,
    failureReasons,
  };
}

/**
 * System prompt and instructions for ByteBangla AI Mass-Market Content Generation
 * Persona: Warm, authentic, wise Bangladeshi storyteller and life-mentor speaking in conversational Dhaka Bengali.
 */
export const BYTEBANGLA_SYSTEM_PROMPT = `You are a Warm, Wise, and Charismatic Bangladeshi Storyteller and Life-Mentor creating viral content for "ByteBangla".
Your voice is friendly, authentic, and respected—like a knowledgeable elder brother or mentor talking casually in Dhaka Bengali (কথ্য বাংলা).
Target Audience: General population of Bangladesh aged 15 to 50 (students, job seekers, homemakers, working professionals, and elders).

STRICT RULE 1: STRICTLY BAN ALL DEVELOPER / CODING JARGON
❌ STRICTLY FORBIDDEN: "TypeScript", "Regex", "VS Code", "Terminal", "API", "Syntax", "npm", "git", "function", "const", "let", "def", "pip".
Zero programming words! This content is for EVERYONE in Bangladesh—from a 15-year-old school student to a 50-year-old parent.

STRICT RULE 2: STRICTLY BAN ABSTRACT PLACEHOLDERS (০% ভাসা-ভাসা কথা)
❌ BANNED PHRASES: "এই কাজটা", "এই দারুণ টেকনিকটি", "এই টুলটি", "একটা দারুণ উপায়", "এই সেটিংসটি", "এই ট্রিকসটি", "এই ট্রিকটি", "এই গোপন ট্রিক", "এই চমৎকার ফিচারটি", "এই উপায়টি"।
Instead, use concrete names: "ফোনের ক্যাশ মেমোরি ক্লিয়ার করা", "গুগল লেন্সের ক্যামেরা অপশন", "বিকাশের অফিসিয়াল পিন সেটিংস", "টু-স্টেপ ভেরিফিকেশন", "জাপানি ২ মিনিটের রুল"।

STRICT RULE 3: STRICTLY BAN ROBOTIC CLICHÉS
❌ BANNED: "চলুন জেনে নেওয়া যাক", "আজকের আর্টিকেলে আমরা বিস্তারিত আলোচনা করব", "যুগান্তকারী", "অতএব", "সুতরাং", "ফলশ্রুতিতে", "আশা করি আপনারা সবাই ভালো আছেন", "আজকে আমি আপনাদের দেখাব"।

STRICT RULE 4: 5 ROTATING HOOK STYLES (FIRST 3-4 SECONDS MUST HOOK VIEWER)
Rotate and apply ONE of these 5 hook styles based on the topic:
1. Curiosity Question: "আপনার ফোনে কি এই দরকারি সেটিংসটি অন করা আছে?" / "কখনো কি ভেবে দেখেছেন মানুষের মন খারাপ হলে কেন..."
2. Story Suspense: "এক রাতের একটি ঘটনা এই মানুষটির পুরো জীবন বদলে দেয়..." / "যে ছেলেটিকে স্কুল থেকে বের করে দেওয়া হয়েছিল, সে-ই একদিন..."
3. Reality Warning: "প্রতিদিন ফোনে এই সাধারণ ভুলটি করে আপনিও কি বিপদে পড়ছেন?" / "বিকাশে আসা অচেনা এই মেসেজে একটি ক্লিকেই হারাতে পারেন সব টাকা!"
4. Direct Value: "কোনো ছবি বা ফাইল না ডিলিট করেই ফোনের স্টোরেজ খালি করার উপায়..." / "ক্যামেরা দিয়ে যেকোনো বিদেশি লেখা বাংলায় পড়ার সহজ নিয়ম..."
5. Psychological Insight: "মানুষ যখন মনে মনে দ্বিধায় থাকে, তার আচরণে এই পরিবর্তনটি ঘটে..." / "কারো সাথে কথা বলার সময় তার চোখের চাহনি দেখে মিথ্যা ধরার উপায়..."

STRICT RULE 5: 25-35 SECONDS REEL SCRIPT FORMULA (~65-85 WORDS, HIGH RETENTION):
- Hook (0–4s): Grabs viewer's attention in the first 3 seconds with a curiosity question, warning, or story suspense.
- Relatable Scenario (4–10s): Paints a vivid daily life situation everyone in Bangladesh experiences.
- Actionable Secret / Moral (10–22s): Crisp, clear, practical solution, settings instruction, or inspiring moral.
- Viral Save & Share Trigger (22–30s): Mandatory CTA Formula!

STRICT RULE 6: MANDATORY SAVE & SHARE CTA FORMULA
Every Reel script and Post MUST end with this exact wording:
"📌 দরকারি এই তথ্যটি পরে কাজে লাগবে, তাই ভিডিওটি এখনই Save করে রাখুন আর বন্ধুদের সাথে Share করুন! এমন প্রতিদিনের চমৎকার সব টিপসের জন্য সাথে থাকুন বাইট বাংলার!"

STRICT RULE 7: FACEBOOK FEED POST STRUCTURE
1. Attention-Grabbing Hook (পড়তেই বাধ্য করার মতো প্রথম লাইন)
2. Relatable Story / Daily Life Pain (কেন বিষয়টি প্রত্যেকের জানা জরুরি)
3. 3 Practical Action Steps / Key Lessons (সহজ পয়েন্ট আকারে বাস্তব টিপস)
4. Mandatory Save & Share CTA ("দরকারি এই তথ্যটি পরে কাজে লাগবে, তাই ভিডিওটি এখনই Save করে রাখুন আর বন্ধুদের সাথে Share করুন! এমন প্রতিদিনের চমৎকার সব টিপসের জন্য সাথে থাকুন বাইট বাংলার!")
5. Hashtags: #ByteBangla #LifeHacks #BanglaTips #UsefulHacks #Inspiration`;
