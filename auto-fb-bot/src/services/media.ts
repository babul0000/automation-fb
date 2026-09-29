/**
 * Automated Media & Banner Generation Service for ByteBangla
 * Uses Pollinations Flux AI for instant, high-converting visual cards,
 * branded 1:1 square carousels with ByteBangla watermark styling and cheatsheets.
 */

export interface BannerResult {
  imageUrl: string;
  prompt: string;
  seed: number;
  slideType: string;
}

/**
 * Builds an optimized English visual prompt with prominent ByteBangla watermark and cheatsheet layout
 */
export function buildTechBannerPrompt(
  topicTitle: string,
  slideType: 'cover' | 'features' | 'summary' = 'cover'
): string {
  const sanitizedTopic = topicTitle
    .replace(/[।.,\/#!$%\^&\*;:{}=\-_`~()?"'–—]/g, ' ')
    .trim();

  if (slideType === 'features') {
    return `Step-by-step visual tech guide and cheat-sheet infographic for "${sanitizedTopic}", 3 clearly numbered glowing holographic step cards (Step 1, Step 2, Step 3), sleek cybernetic workflow icons, dark obsidian background, prominent glowing glassmorphism watermark badge 'ByteBangla Tech Guide' in the lower corner, 1:1 square ratio, ultra-crisp typography, 8k render, award-winning UI design`;
  }

  if (slideType === 'summary') {
    return `Futuristic tech summary cheat-sheet card for "${sanitizedTopic}", floating 3D glowing AI software icons, sleek cybernetic workstation, prominent neon cyan and violet branding banner 'ByteBangla | সহজ বাংলায় এআই টিপস', 1:1 square ratio, dark studio lighting, ultra-premium aesthetic, 8k resolution`;
  }

  return `Modern minimalist 3D dark-mode tech banner for "${sanitizedTopic}", glowing neon cyan and electric blue circuits, sleek futuristic digital workstation, prominent glassmorphism holographic badge with 'ByteBangla' text in bottom corner, dark obsidian background, clean floating geometric icons, 1:1 square ratio, cinematic lighting, 8k resolution, ultra-crisp, no blur`;
}

/**
 * Generates a high-quality direct banner URL for a Facebook post
 */
export async function generatePostBanner(topicTitle: string): Promise<BannerResult> {
  const seed = Math.floor(Math.random() * 1000000);
  const prompt = buildTechBannerPrompt(topicTitle, 'cover');

  console.log(`[Media Service] 🎨 Crafting AI banner prompt for topic: "${topicTitle}"...`);

  const encodedPrompt = encodeURIComponent(prompt);
  const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1080&height=1080&nologo=true&seed=${seed}&model=flux`;

  console.log(`[Media Service] ✅ Banner generated: ${imageUrl.substring(0, 95)}...`);

  return {
    imageUrl,
    prompt,
    seed,
    slideType: 'cover',
  };
}

/**
 * Generates a branded 2-3 slide visual carousel with built-in ByteBangla watermark & cheatsheet layout
 */
export async function generateCarouselSlides(topicTitle: string): Promise<BannerResult[]> {
  console.log(`[Media Service] 🎠 Generating 3-slide branded visual carousel for: "${topicTitle}"...`);

  const baseSeed = Math.floor(Math.random() * 900000);

  // Slide 1: Branded Cover Card (1:1 Square)
  const coverPrompt = buildTechBannerPrompt(topicTitle, 'cover');
  const coverUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(coverPrompt)}?width=1080&height=1080&nologo=true&seed=${baseSeed}&model=flux`;

  // Slide 2: Infographic Feature Workflow Cheatsheet Card (1:1 Square)
  const featurePrompt = buildTechBannerPrompt(topicTitle, 'features');
  const featureUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(featurePrompt)}?width=1080&height=1080&nologo=true&seed=${baseSeed + 1}&model=flux`;

  // Slide 3: Actionable Summary Card with ByteBangla Branding Banner (1:1 Square)
  const summaryPrompt = buildTechBannerPrompt(topicTitle, 'summary');
  const summaryUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(summaryPrompt)}?width=1080&height=1080&nologo=true&seed=${baseSeed + 2}&model=flux`;

  console.log(`[Media Service] ✅ 3 Branded Carousel slides successfully generated.`);

  return [
    { imageUrl: coverUrl, prompt: coverPrompt, seed: baseSeed, slideType: 'cover' },
    { imageUrl: featureUrl, prompt: featurePrompt, seed: baseSeed + 1, slideType: 'features' },
    { imageUrl: summaryUrl, prompt: summaryPrompt, seed: baseSeed + 2, slideType: 'summary' },
  ];
}
