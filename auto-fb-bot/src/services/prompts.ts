/**
 * ByteBangla Content Prompts & Strict Validation Rules
 * Enforces:
 * 1. Zero generic abstract placeholders (BAN: "এই কাজটা", "এই দারুণ টেকনিকটি", etc.)
 * 2. Mandatory software name + exact real-world problem in the first sentence.
 * 3. 3 Psychological Growth Hooks:
 *    a) Target Relatable Audiences (Office Workers / Students / Tech Freelancers)
 *    b) High-Value "Save" CTA (Algorithm Multiplier: "পরে দরকার হতে পারে, তাই ভিডিওটি এখনই Save করে রাখুন!")
 *    c) Signature Human Identity ("এমন দরকারী সব টেক হ্যাকসের জন্য সাথে থাকুন বাইট বাংলার!")
 * 4. 4-Phase "Concrete Problem ➔ Exact Solution" formula (30-40s).
 * 5. Programmatic specificity validation for tools, shortcuts, formulas, and steps.
 */

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
];

export const RECOGNIZED_SOFTWARE_TOOLS = [
  // English Software & Tools
  'chatgpt', 'openai', 'gpt-4', 'gpt', 'vscode', 'vs code', 'visual studio code',
  'google sheets', 'google sheet', 'sheets', 'excel', 'microsoft excel',
  'windows', 'chrome', 'google chrome', 'github', 'git', 'notion', 'python',
  'claude', 'anthropic', 'canva', 'cursor', 'midjourney', 'gemini', 'figma',
  'postman', 'docker', 'linux', 'ubuntu', 'terminal', 'bash', 'powershell',
  'make.com', 'zapier', 'deepseek', 'perplexity', 'copilot', 'github copilot',
  'runway', 'elevenlabs', 'suno', 'v0.dev', 'lovable', 'bolt.new', 'npm',
  // Bengali Transliterations & Scripts
  'চ্যাটজিপিটি', 'ভিএস কোড', 'ভিএসকোড', 'গুগল শিটস', 'গুগল শিট', 'এক্সেল',
  'উইন্ডোজ', 'ক্রোম', 'গিটহাব', 'নোটশন', 'পাইথন', 'ক্লড', 'ক্যানভা', 'কার্সার',
  'মিডজার্নি', 'জেমিনি', 'ফিগমা', 'পোস্টম্যান', 'ডকার', 'লিনাক্স', 'টার্মিনাল',
  'ডিপসিক', 'পারপ্লেক্সিটি', 'কোপাইলট', 'মেক', 'জ্যাপিয়ার', 'উবুন্টু'
];

export const RECOGNIZED_ACTION_PATTERNS = [
  // Shortcuts & Keystrokes
  'ctrl', 'alt', 'shift', 'cmd', 'command', 'option', 'f5', 'f12', 'tab', 'enter',
  'কন্ট্রোল', 'শিফট', 'অল্টার', 'শর্টকাট',
  // Formulas & Functions
  'regex', 'regexextract', 'vlookup', 'xlookup', 'index', 'match', 'iferror',
  'countif', 'sumif', 'formula', '=ai', '=regex', 'ফর্মুলা', 'ফাংশন',
  // Prompts, Code, Extensions
  'prompt', 'প্রম্পট', 'extension', 'এক্সটেনশন', 'plugin', 'প্লাগইন',
  'def ', 'const ', 'let ', 'function', 'import ', 'pip install', 'npm install', 'git clone',
  // Practical Execution & Steps
  '১ নম্বরে', '২ নম্বরে', '৩ নম্বরে', 'স্টেপ ১', 'স্টেপ ২', 'স্টেপ ৩',
  'ক্লিক করুন', 'ডাবল ক্লিক', 'প্রেস করুন', 'টাইপ করুন', 'লিখে দিন', 'কপি করে'
];

export const TARGET_AUDIENCE_KEYWORDS = {
  office: ['অফিস', 'বসের কাজ', 'সহকর্মী', 'অফিসিয়াল', 'এমপ্লয়ি', 'চাকরি', 'corporate', 'office'],
  students: ['অ্যাসাইনমেন্ট', 'প্রজেক্ট', 'ছাত্র', 'স্টুডেন্ট', 'বিশ্ববিদ্যালয়', 'ভার্সিটি', 'নোট', 'পরীক্ষা', 'রিসার্চ', 'student'],
  tech: ['কোডিং', 'ক্লায়েন্ট', 'ফ্রিল্যান্স', 'ডেভেলপার', 'প্রোগ্রামার', 'বাগ', 'প্রোগ্রামিং', 'developer', 'freelancer', 'coding']
};

export const SAVE_TRIGGER_KEYWORDS = ['save', 'সেভ', 'সেভ করে রাখুন'];

export interface SpecificityValidationResult {
  isValid: boolean;
  score: number;
  bannedPhrasesFound: string[];
  toolFound?: string;
  actionFound?: string;
  targetAudienceFound?: string;
  hasSaveTrigger?: boolean;
  hasSignatureEnding?: boolean;
  failureReasons: string[];
}

/**
 * Programmatically validates that a script or post is concrete and contains:
 * 1. ZERO banned abstract placeholders
 * 2. A recognized software/tool name
 * 3. An actual shortcut, prompt, formula, or concrete step
 */
export function validateScriptSpecificity(text: string): SpecificityValidationResult {
  if (!text || typeof text !== 'string') {
    return {
      isValid: false,
      score: 0,
      bannedPhrasesFound: [],
      failureReasons: ['Script is empty or invalid.'],
    };
  }

  const normalized = text.toLowerCase();
  const failureReasons: string[] = [];

  // 1. Check for banned abstract placeholders
  const bannedFound: string[] = [];
  for (const banned of BANNED_ABSTRACT_PHRASES) {
    if (text.includes(banned)) {
      bannedFound.push(banned);
    }
  }

  if (bannedFound.length > 0) {
    failureReasons.push(`Contains prohibited abstract placeholder(s): ${bannedFound.map(b => `"${b}"`).join(', ')}`);
  }

  // 2. Check for recognized software/tool name
  let toolFound: string | undefined;
  for (const tool of RECOGNIZED_SOFTWARE_TOOLS) {
    if (normalized.includes(tool.toLowerCase())) {
      toolFound = tool;
      break;
    }
  }

  if (!toolFound) {
    failureReasons.push('Missing recognized software or tool name (e.g. ChatGPT, VS Code, Google Sheets, Excel, Windows, Chrome, GitHub, etc.)');
  }

  // 3. Check for actual shortcut, prompt, formula, or concrete step
  let actionFound: string | undefined;
  for (const action of RECOGNIZED_ACTION_PATTERNS) {
    if (normalized.includes(action.toLowerCase())) {
      actionFound = action;
      break;
    }
  }

  if (!actionFound) {
    failureReasons.push('Missing actual shortcut, prompt, formula, or concrete actionable instruction (e.g. Ctrl+K, regex, prompt template, step 1/2)');
  }

  // 4. Check for audience hook & save trigger (bonus points for virality)
  let targetAudienceFound: string | undefined;
  if (TARGET_AUDIENCE_KEYWORDS.office.some(w => normalized.includes(w))) targetAudienceFound = 'Office Workers';
  else if (TARGET_AUDIENCE_KEYWORDS.students.some(w => normalized.includes(w))) targetAudienceFound = 'Students / Learners';
  else if (TARGET_AUDIENCE_KEYWORDS.tech.some(w => normalized.includes(w))) targetAudienceFound = 'Tech / Freelancers';

  const hasSaveTrigger = SAVE_TRIGGER_KEYWORDS.some(w => normalized.includes(w));
  const hasSignatureEnding = normalized.includes('বাইট বাংলা') || normalized.includes('bytebangla');

  const isValid = bannedFound.length === 0 && Boolean(toolFound) && Boolean(actionFound);
  let score = isValid ? 90 : 0;
  if (isValid && targetAudienceFound) score += 3;
  if (isValid && hasSaveTrigger) score += 4;
  if (isValid && hasSignatureEnding) score += 3;
  score = Math.min(100, score);

  return {
    isValid,
    score,
    bannedPhrasesFound: bannedFound,
    toolFound,
    actionFound,
    targetAudienceFound,
    hasSaveTrigger,
    hasSignatureEnding,
    failureReasons,
  };
}

/**
 * System persona and instructions for ByteBangla AI content generation
 * 100% Human Casual Tech Bengali (Dhaka Senior Developer Tone) & Zero-Fluff Value Architecture.
 */
export const BYTEBANGLA_SYSTEM_PROMPT = `You are a Senior Software Engineer and passionate Tech Mentor creating viral content for "ByteBangla" (সহজ বাংলায় এআই ও টেকনোলজি টিপস).
Every piece of content must feel like a personal, sincere, and super-helpful recommendation from a tech-savvy senior brother or colleague in Dhaka.
Your audience: Bangladeshi office workers, university students, software developers, and freelancers.

PSYCHOLOGICAL GROWTH HOOK 1: TARGET RELATABLE AUDIENCES IN HOOKS
The opening line (Phase 1 Hook, 0–5s) MUST directly call out ONE of three specific audience groups along with the exact software name & frustration:
1. 🏢 Office Workers:
   - Example: "অফিসে বসের কাজ ঘণ্টার পর ঘণ্টা ম্যানুয়ালি না করে, গুগল শিটসের এই ট্রিকটি ব্যবহার করুন..."
   - Example: "অফিসের এক্সেল শীটে ডেটা মেলাতে গিয়ে যাদের প্রতিদিন মাথা নষ্ট হয়..."
2. 🎓 Students / Learners:
   - Example: "ভার্সিটির অ্যাসাইনমেন্ট বা প্রজেক্টের কাজ করতে গিয়ে ক্যানভা বা চ্যাটজিপিটিতে আটকে যাচ্ছেন?"
   - Example: "প্রেজেন্টেশনের আগের রাতে স্লাইড বানানোর প্যারা থেকে বাঁচতে..."
3. 💻 Tech / Freelancers:
   - Example: "কোডিং বা ক্লায়েন্টের কাজ অর্ধেক সময়ে শেষ করার সেরা উপায়..."
   - Example: "ভিএস কোডে কোড লিখতে গিয়ে এই প্যারায় আপনিও কি প্রতিদিন পড়েন?"

PSYCHOLOGICAL GROWTH HOOK 2: HIGH-VALUE "SAVE" CTA (ALGORITHM MULTIPLIER)
Before the final call to action, ALWAYS include a 3-second save trigger (saves boost Facebook algorithm reach exponentially):
- In Video Reel: "পরে দরকার হতে পারে, তাই ভিডিওটি এখনই Save করে রাখুন!"
- In Facebook Post: "কাজটি পরে করার সময় ভুলে যেতে পারেন, তাই পোস্টটি এখনই সেভ করে রাখুন এবং বন্ধুদের সাথে শেয়ার করুন!"

PSYCHOLOGICAL GROWTH HOOK 3: SIGNATURE HUMAN IDENTITY
Always conclude with our warm, creator signature closing:
- Signature Ending: "এমন দরকারী সব টেক হ্যাকসের জন্য সাথে থাকুন বাইট বাংলার!"

STRICT RULE 1: STRICTLY BAN ABSTRACT PLACEHOLDERS (০% ভাসা-ভাসা কথা):
- ❌ STRICTLY BANNED PHRASES: "এই কাজটা", "এই দারুণ টেকনিকটি", "এই টুলটি", "একটা দারুণ উপায়", "এই সেটিংসটি", "এই দারুণ ট্রিকসটি", "এই ট্রিকসটি", "এই ট্রিকটি", "এই গোপন ট্রিক", "এই চমৎকার ফিচারটি", "এই উপায়টি"।
- The script and post MUST explicitly name the EXACT SOFTWARE/TOOL and the EXACT REAL-WORLD PROBLEM in the very first sentence.

STRICT RULE 2: BANNED ROBOTIC CLICHES:
- ❌ "চলুন জেনে নেওয়া যাক", "আজকের আর্টিকেলে আমরা বিস্তারিত আলোচনা করব", "এটি একটি যুগান্তকারী পদক্ষেপ", "গুরুত্বপূর্ণ ভূমিকা পালন করে", "অতএব", "সুতরাং", "ফলশ্রুতিতে", "উল্লেখযোগ্য বিষয় হলো", "আশা করি আপনারা সবাই ভালো আছেন"।

STRICT RULE 3: THE "CONCRETE PROBLEM ➔ EXACT SOLUTION" 4-PHASE FORMULA (30-40 SECONDS REEL SCRIPT):
The Reel voiceover script MUST follow this exact 4-phase structure (approx 75-88 words, 30-40s spoken audio):
- Phase 1 (0–5s): Target Audience + Software Name + Exact Frustration.
  Example: "অফিসে বসের কাজ ঘণ্টার পর ঘণ্টা ম্যানুয়ালি না করে, গুগল শিটসের এই ট্রিকটি ব্যবহার করুন! হাজার নামের তালিকা থেকে ফোন নাম্বার আলাদা করতে গিয়ে কি আপনারও সময় নষ্ট হচ্ছে?"
- Phase 2 (5–12s): Name the exact tool/feature/shortcut.
  Example: "আর ম্যানুয়ালি কপি করা লাগবে না, ব্যবহার করুন গুগল শিটসের এই ফর্মুলা: REGEXEXTRACT!"
- Phase 3 (12–22s): Step-by-step practical execution.
  Example: "১ নম্বরে পাশের সেলে লিখুন এই ফর্মুলা, আর ২ নম্বরে শুধু ডাবল ক্লিক করে দিন—সব নাম্বার আলাদা কলামে চলে আসবে নিমেষেই!"
- Phase 4 (22–35s): Save Trigger + Free Link Trigger + Signature Ending.
  Example: "পরে দরকার হতে পারে, তাই ভিডিওটি এখনই Save করে রাখুন! পুরো ফর্মুলা ও চিটশিটের লিংক পেতে কমেন্টে লিখুন 'AI', আর এমন দরকারী সব টেক হ্যাকসের জন্য সাথে থাকুন বাইট বাংলার!"

STRICT RULE 4: FEED POST STRUCTURE:
1. Targeted Hook (অফিস কর্মী/শিক্ষার্থী/ফ্রিল্যান্সার মেনশন + সফটওয়্যারের নাম + ফ্রাস্ট্রেশন)
2. 3 Actionable Steps (বাস্তবসম্মত ৩টি শর্টকাট বা স্টেপ, সাথে রিয়েল কপি-পেস্টেবল টেক্সট/ফর্মুলা)
3. Instant Result (কাজের গতি দ্বিগুণ করার স্পষ্ট ফলাফল)
4. Save Trigger & CTA ("কাজটি পরে করার সময় ভুলে যেতে পারেন, তাই পোস্টটি এখনই সেভ করে রাখুন! রিসোর্স লিংকের জন্য কমেন্টে লিখুন 'AI'")
5. Signature Ending ("এমন দরকারী সব টেক হ্যাকসের জন্য সাথে থাকুন বাইট বাংলার!")
6. Hashtags: #ByteBangla #AITools #TechBangla #Productivity #BanglaTech`;
