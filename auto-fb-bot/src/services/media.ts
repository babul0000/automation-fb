/**
 * Automated Media & Banner Generation Service for ByteBangla
 * Uses Pollinations Flux AI for instant, high-converting visual cards and multi-slide carousels
 */

export interface BannerResult {
  imageUrl: string;
  prompt: string;
  seed: number;
}

/**
 * Builds an optimized English visual prompt based on the Bengali tech topic
 */
export function buildTechBannerPrompt(topicTitle: string, slideType: 'cover' | 'features' | 'branding' = 'cover'): string {
  const sanitizedTopic = topicTitle
    .replace(/[।.,\/#!$%\^&\*;:{}=\-_`~()?"'–—]/g, ' ')
    .trim();

  if (slideType === 'features') {
    return `Clean modern 3D infographic illustration for "${sanitizedTopic}", 3 glowing holographic workflow steps, sleek tech interface elements, glowing neon cyan and purple accents, isometric dark futuristic workstation, 16:9 ratio, ultra-crisp, 8k render`;
  }

  if (slideType === 'branding') {
    return `Futuristic tech summary card, glowing neon cyan 'ByteBangla' emblem, digital productivity badges, dark obsidian studio lighting, floating cybernetic tools, 16:9 ratio, ultra-premium aesthetic, 8k`;
  }

  return `Modern minimalist 3D dark-mode tech banner for "${sanitizedTopic}", glowing neon cyan and electric blue circuits, sleek futuristic digital productivity elements, dark obsidian background, clean floating geometric icons, 16:9 ratio, cinematic lighting, 8k resolution, ultra-crisp`;
}

/**
 * Generates a high-quality direct banner URL for a Facebook post
 */
export async function generatePostBanner(topicTitle: string): Promise<BannerResult> {
  const seed = Math.floor(Math.random() * 1000000);
  const prompt = buildTechBannerPrompt(topicTitle, 'cover');

  console.log(`[Media Service] 🎨 Crafting AI banner prompt for topic: "${topicTitle}"...`);

  const encodedPrompt = encodeURIComponent(prompt);
  const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1200&height=630&nologo=true&seed=${seed}&model=flux`;

  console.log(`[Media Service] ✅ Banner generated: ${imageUrl.substring(0, 95)}...`);

  return {
    imageUrl,
    prompt,
    seed,
  };
}

/**
 * Generates a 2-3 slide visual carousel for maximum Facebook reach and swipe engagement
 */
export async function generateCarouselSlides(topicTitle: string): Promise<BannerResult[]> {
  console.log(`[Media Service] 🎠 Generating 2-slide visual carousel for topic: "${topicTitle}"...`);

  const baseSeed = Math.floor(Math.random() * 900000);

  // Slide 1: Cover Card
  const coverPrompt = buildTechBannerPrompt(topicTitle, 'cover');
  const coverUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(coverPrompt)}?width=1200&height=630&nologo=true&seed=${baseSeed}&model=flux`;

  // Slide 2: Infographic Feature Workflow Card
  const featurePrompt = buildTechBannerPrompt(topicTitle, 'features');
  const featureUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(featurePrompt)}?width=1200&height=630&nologo=true&seed=${baseSeed + 1}&model=flux`;

  console.log(`[Media Service] ✅ 2 Carousel slides successfully generated.`);

  return [
    { imageUrl: coverUrl, prompt: coverPrompt, seed: baseSeed },
    { imageUrl: featureUrl, prompt: featurePrompt, seed: baseSeed + 1 },
  ];
}
