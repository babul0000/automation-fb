import axios from 'axios';
import { env, isConfiguredForGemini } from '../config/env';

/**
 * Automated Media & Banner Generation Service for ByteBangla
 * Uses Gemini AI to direct high-converting, professional 3D visual art prompts
 * and Pollinations Flux AI for clean, award-winning, text-free imagery.
 */

export interface BannerResult {
  imageUrl: string;
  prompt: string;
  seed: number;
  slideType: string;
}

export interface VisualPromptsBundle {
  cover: string;
  features: string;
  summary: string;
}

/**
 * Intelligent concept mapper that generates aesthetic, text-free English visual prompts
 * from Bengali topic keywords if AI inference is bypassed or unavailable.
 */
export function buildFallbackVisualPrompts(topicTitle: string): VisualPromptsBundle {
  const lower = topicTitle.toLowerCase();

  let subject = 'futuristic AI neural processor core and smart holographic interface';
  let context = 'modern tech productivity workstation';

  if (lower.includes('pdf') || lower.includes('বই') || lower.includes('নোট') || lower.includes('ডকুমেন্ট')) {
    subject = 'translucent glowing 3D digital tablet displaying illuminated smart document layers with floating golden neural sparks';
    context = 'sleek minimalist designer desk with soft ambient studio lighting';
  } else if (lower.includes('chatgpt') || lower.includes('প্রম্পট') || lower.includes('claude') || lower.includes('gemini')) {
    subject = 'illuminated 3D glowing artificial intelligence brain core with crystalline cybernetic data streams';
    context = 'dark studio aesthetic with vibrant cyan and purple rim lighting';
  } else if (lower.includes('ভিডিও') || lower.includes('ইউটিউব') || lower.includes('youtube') || lower.includes('reels')) {
    subject = 'floating holographic 3D digital video playback interface with glowing futuristic waveforms and lens flare';
    context = 'high-tech cyberpunk editing studio with cinematic lighting';
  } else if (lower.includes('শিট') || lower.includes('excel') || lower.includes('sheets') || lower.includes('অটোমেশন')) {
    subject = 'isometric 3D glowing analytical data matrix with floating translucent holographic charts and glowing connectors';
    context = 'premium Apple-style clean workstation with ambient studio lighting';
  } else if (lower.includes('কোড') || lower.includes('coding') || lower.includes('প্রোগ্রামিং')) {
    subject = 'futuristic isometric developer workstation with glowing holographic code crystals and quantum processor';
    context = 'sleek dark obsidian aesthetic with emerald and electric blue accents';
  }

  const baseEnforcer = 'clean minimalist composition, Apple keynote aesthetic, octane 3D render, 8k resolution, cinematic lighting, photorealistic, strictly no text, no letters, no words, no watermark, no blur';

  return {
    cover: `Ultra-premium 3D render of ${subject}, ${context}, ${baseEnforcer}`,
    features: `High-tech visual workflow of 3 interconnected glowing holographic glass cards on sleek fiber-optic paths, ${context}, depth of field, ${baseEnforcer}`,
    summary: `Futuristic minimalist technology workspace with floating geometric 3D productivity icons and glowing ambient light, ${baseEnforcer}`,
  };
}

/**
 * Uses Gemini to understand the Bengali topic and generate 3 tailored, world-class English visual prompts.
 */
export async function generateVisualPromptsWithAI(topicTitle: string): Promise<VisualPromptsBundle> {
  if (!isConfiguredForGemini()) {
    return buildFallbackVisualPrompts(topicTitle);
  }

  const prompt = `You are the lead visual art director for "ByteBangla".
Analyze this Bengali tech topic: "${topicTitle}".
Extract the core tech subject (e.g. PDF AI summarizer, ChatGPT prompt secrets, Google Sheets automation, AI video generation, Coding assistant).

Create 3 DISTINCT, stunning English visual prompts for AI image generation (Pollinations Flux AI).
CRITICAL RULES FOR 10/10 QUALITY:
1. NEVER include Bengali text or request any text/letters in the image! (Diffusion models distort text into slop).
2. Use modern, premium aesthetics: Apple Keynote 3D product render, clean glassmorphism, studio lighting, isometric tech, dark obsidian background with vibrant highlights.
3. Every prompt MUST end with: "clean minimalist composition, 8k resolution, octane render, strictly no text, no letters, no words, no watermark, no blur".

Return ONLY a valid JSON object without markdown fences:
{
  "cover": "Visual prompt for Slide 1 (Iconic hero 3D render capturing the tool/topic essence)",
  "features": "Visual prompt for Slide 2 (Visual dataflow / workflow with interconnected glowing holographic cards)",
  "summary": "Visual prompt for Slide 3 (Futuristic clean workspace with floating 3D tech icons and ambient light)"
}`;

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;
    const response = await axios.post(
      endpoint,
      {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 600 },
      },
      { timeout: 15000 }
    );

    const raw = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (raw) {
      const cleaned = raw.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
      const parsed = JSON.parse(cleaned);
      if (parsed.cover && parsed.features && parsed.summary) {
        return {
          cover: parsed.cover,
          features: parsed.features,
          summary: parsed.summary,
        };
      }
    }
  } catch (err: any) {
    console.warn(`[Media Service Notice] AI Visual Prompt Generation fallback: ${err.message}`);
  }

  return buildFallbackVisualPrompts(topicTitle);
}

/**
 * Generates a high-quality direct banner URL for a Facebook post
 */
export async function generatePostBanner(topicTitle: string): Promise<BannerResult> {
  const seed = Math.floor(Math.random() * 1000000);
  const visualPrompts = await generateVisualPromptsWithAI(topicTitle);

  console.log(`[Media Service] 🎨 Crafting 100/100 AI banner for: "${topicTitle}"...`);
  const encodedPrompt = encodeURIComponent(visualPrompts.cover);
  const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=800&height=800&nologo=true&seed=${seed}`;

  console.log(`[Media Service] ✅ Banner generated: ${imageUrl.substring(0, 95)}...`);

  return {
    imageUrl,
    prompt: visualPrompts.cover,
    seed,
    slideType: 'cover',
  };
}

/**
 * Generates a branded 3-slide visual carousel with 100% clean, professional 3D art (NO distorted text)
 */
export async function generateCarouselSlides(topicTitle: string): Promise<BannerResult[]> {
  console.log(`[Media Service] 🎠 Generating 3-slide visual carousel for: "${topicTitle}"...`);

  const baseSeed = Math.floor(Math.random() * 900000);
  const visualPrompts = await generateVisualPromptsWithAI(topicTitle);

  // Slide 1: Iconic 3D Hero Render (1:1 Square)
  const coverUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(visualPrompts.cover)}?width=800&height=800&nologo=true&seed=${baseSeed}`;

  // Slide 2: Workflow & Feature Flow (1:1 Square)
  const featureUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(visualPrompts.features)}?width=800&height=800&nologo=true&seed=${baseSeed + 1}`;

  // Slide 3: Actionable Tech Summary Card (1:1 Square)
  const summaryUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(visualPrompts.summary)}?width=800&height=800&nologo=true&seed=${baseSeed + 2}`;

  console.log(`[Media Service] ✅ 3 Carousel slides generated with clean 3D art (No distorted text).`);

  return [
    { imageUrl: coverUrl, prompt: visualPrompts.cover, seed: baseSeed, slideType: 'cover' },
    { imageUrl: featureUrl, prompt: visualPrompts.features, seed: baseSeed + 1, slideType: 'features' },
    { imageUrl: summaryUrl, prompt: visualPrompts.summary, seed: baseSeed + 2, slideType: 'summary' },
  ];
}
