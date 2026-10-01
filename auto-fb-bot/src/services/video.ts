import fs from 'fs';
import path from 'path';
import axios from 'axios';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { EdgeTTS } from 'node-edge-tts';

// Configure FFMPEG & FFPROBE binaries
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

export interface ReelGenerationInput {
  topic: string;
  hookText: string;
  bodyText: string;
  ctaText: string;
  fullScript?: string;
  imagePrompts?: string[];
  voice?: 'bn-BD-PradeepNeural' | 'bn-BD-NabanitaNeural';
  rate?: string;
}

export interface GeneratedReel {
  videoPath: string;
  videoBuffer: Buffer;
  durationSeconds: number;
  voiceModel: string;
  cleanup: () => void;
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Gets exact duration of audio file in seconds via ffprobe
 */
export function getAudioDuration(audioPath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(audioPath, (err, metadata) => {
      if (err || !metadata.format.duration) {
        resolve(12);
      } else {
        resolve(Math.max(5, Math.min(60, metadata.format.duration)));
      }
    });
  });
}

/**
 * Synthesizes ultra-realistic, fast-paced Bengali voiceover using Microsoft Edge Neural Voice
 * strictly using Microsoft Azure Deep Neural models (No robotic fallbacks).
 */
export async function generateHumanBengaliVoiceover(
  fullSpeech: string,
  outputAudioPath: string,
  voice: 'bn-BD-PradeepNeural' | 'bn-BD-NabanitaNeural' = 'bn-BD-PradeepNeural',
  rate: string = '+20%'
): Promise<{ duration: number; model: string }> {
  // 1. Aggressively sanitize speech text: remove bullet numbers, steps, URLs, emojis, and symbols
  let clean = fullSpeech
    // Remove numbered lists like "১.", "২.", "1.", "1)", "১)", "১/", "2/"
    .replace(/(?:[১-৯0-9]+[\.\)\/]\s*)/g, ' ')
    // Remove "ধাপ ১:", "স্টেপ ১:", "টিপ ১:", "পয়েন্ট ১:"
    .replace(/(?:ধাপ|স্টেপ|টিপস?|পয়েন্ট|step)\s*[১-৯0-9]+[:\s-]*/gi, ' ')
    // Remove "প্রথমত,", "দ্বিতীয়ত,", "তৃতীয়ত,"
    .replace(/(?:প্রথমত|দ্বিতীয়ত|তৃতীয়ত)[,:\s-]*/g, ' ')
    // Remove URLs
    .replace(/https?:\/\/\S+/gi, '')
    // Remove markdown / code artifacts
    .replace(/[#*~_`\[\]\(\)\{\}]/g, ' ')
    // Remove all emojis and symbols
    .replace(/[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}👉👇🔥✨🚀💡🤯🎥🤖📢💥🎯👑🌟]/gu, '')
    // Standardize punctuation marks
    .replace(/!+/g, '!')
    .replace(/\?+/g, '?')
    .replace(/।+/g, '।')
    .replace(/\s+/g, ' ')
    .trim();

  // 2. Sentence deduplication: Prevent CTA repetition (e.g. if CTA words appear in middle and end)
  const sentenceList = clean.split(/(?<=[।?!])/).map((s) => s.trim()).filter(Boolean);
  const filteredSentences: string[] = [];
  for (let i = 0; i < sentenceList.length; i++) {
    const s = sentenceList[i];
    const isLast = i === sentenceList.length - 1;
    // If not the last sentence, check if it contains end-of-video CTA keywords
    if (!isLast && (s.includes('কমেন্টে AI') || s.includes('কমেন্টে ai') || (s.includes('ফলো করুন') && s.includes('বাইট বাংলা')))) {
      continue; // Skip CTA if repeated before the end
    }
    filteredSentences.push(s);
  }
  const cleanSpeech = filteredSentences.join(' ').replace(/\s+/g, ' ').trim();

  // Primary Engine: Microsoft Azure Neural Voice
  try {
    console.log(`[Video Engine] 🎙️ Synthesizing Microsoft Azure Neural Voice (${voice}, speed: ${rate})...`);
    const tts = new EdgeTTS({
      voice,
      rate,
      pitch: '+0Hz',
    });

    await tts.ttsPromise(cleanSpeech, outputAudioPath);

    if (fs.existsSync(outputAudioPath) && fs.statSync(outputAudioPath).size > 1000) {
      const duration = await getAudioDuration(outputAudioPath);
      console.log(`[Video Engine] ✨ Azure Neural Voice synthesized successfully! Duration: ${duration.toFixed(1)}s`);
      return { duration, model: `Microsoft Azure Neural (${voice})` };
    }
  } catch (azureErr: any) {
    console.warn(`[Video Engine Notice] Primary voice notice (${azureErr.message}). Switching to backup Neural voice...`);
  }

  // Backup Engine: Microsoft Azure Alternative Neural Voice
  try {
    const backupVoice = voice === 'bn-BD-PradeepNeural' ? 'bn-BD-NabanitaNeural' : 'bn-BD-PradeepNeural';
    console.log(`[Video Engine] 🎙️ Synthesizing Alternative Azure Neural Voice (${backupVoice}, speed: ${rate})...`);
    const tts = new EdgeTTS({
      voice: backupVoice,
      rate,
      pitch: '+0Hz',
    });

    await tts.ttsPromise(cleanSpeech, outputAudioPath);

    if (fs.existsSync(outputAudioPath) && fs.statSync(outputAudioPath).size > 1000) {
      const duration = await getAudioDuration(outputAudioPath);
      console.log(`[Video Engine] ✨ Azure Alternative Voice synthesized! Duration: ${duration.toFixed(1)}s`);
      return { duration, model: `Microsoft Azure Neural (${backupVoice})` };
    }
  } catch (backupErr: any) {
    throw new Error(`Azure Neural Voice synthesis failed: ${backupErr.message}`);
  }

  throw new Error('Failed to generate neural audio.');
}

const CURATED_TECH_FRAMES = [
  'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1080&h=1920&fit=crop&q=85',
  'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=1080&h=1920&fit=crop&q=85',
  'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1080&h=1920&fit=crop&q=85',
  'https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?w=1080&h=1920&fit=crop&q=85',
  'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1080&h=1920&fit=crop&q=85',
  'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1080&h=1920&fit=crop&q=85',
];

/**
 * Downloads a high-converting, pristine 9:16 vertical tech frame
 */
async function fetchVerticalFrame(prompt: string, seed: number, destPath: string, frameIndex: number = 0): Promise<void> {
  const browserHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
  };

  // Try Pollinations AI first
  try {
    const encoded = encodeURIComponent(prompt);
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=576&height=1024&nologo=true&seed=${seed}`;
    const res = await axios.get(url, {
      headers: browserHeaders,
      responseType: 'arraybuffer',
      timeout: 10000,
    });
    if (res.data && res.data.length > 1000) {
      fs.writeFileSync(destPath, Buffer.from(res.data));
      return;
    }
  } catch (e: any) {
    // Switch to curated 4k frame
  }

  // Curated 4K tech photography fallback
  const curatedUrl = CURATED_TECH_FRAMES[frameIndex % CURATED_TECH_FRAMES.length];
  const res = await axios.get(curatedUrl, {
    headers: browserHeaders,
    responseType: 'arraybuffer',
    timeout: 20000,
  });
  fs.writeFileSync(destPath, Buffer.from(res.data));
}

/**
 * Generates a polished, high-converting 9:16 vertical Facebook Reel (MP4)
 * with fast-paced Microsoft Azure human voiceover and cinematic layout.
 */
export async function generateReelVideo(input: ReelGenerationInput): Promise<GeneratedReel> {
  const tempDir = path.resolve(process.cwd(), 'data', 'temp_reels', `reel_${Date.now()}`);
  ensureDir(tempDir);

  const audioPath = path.join(tempDir, 'voiceover.mp3');
  const outputPath = path.join(tempDir, 'output_reel.mp4');

  console.log(`[Video Engine] 🎬 Initiating 10/10 Polished Reel Pipeline for: "${input.topic}"...`);

  // 1. Synthesize Human Neural Voiceover
  let speechText = '';
  if (input.fullScript && input.fullScript.trim().length > 25 && !input.fullScript.includes('...')) {
    speechText = input.fullScript.trim();
  } else {
    // If body contains CTA words, strip them so CTA is not repeated twice
    let cleanBody = (input.bodyText || '').trim();
    if (input.ctaText) {
      cleanBody = cleanBody.replace(input.ctaText, '').trim();
      cleanBody = cleanBody.replace(/কমেন্টে\s*AI\s*লিখুন.*$/gi, '').trim();
      cleanBody = cleanBody.replace(/ফলো\s*করুন\s*বাইট\s*বাংলা.*$/gi, '').trim();
    }
    speechText = `${input.hookText}। ${cleanBody}। ${input.ctaText}`;
  }

  const voiceSelection = input.voice || 'bn-BD-PradeepNeural';
  const voiceRate = input.rate || '+20%';

  const { duration: exactDuration, model: voiceModel } = await generateHumanBengaliVoiceover(
    speechText,
    audioPath,
    voiceSelection,
    voiceRate
  );

  // 2. Prepare 3 Vertical Frames
  const seed = Math.floor(Math.random() * 900000);
  const slide1Path = path.join(tempDir, 'slide1.jpg');
  const slide2Path = path.join(tempDir, 'slide2.jpg');
  const slide3Path = path.join(tempDir, 'slide3.jpg');

  const prompt1 = input.imagePrompts?.[0] || 'Modern 3D futuristic cyber workstation with glowing holographic displays, vertical 9:16, dark studio lighting, no text, no watermark, 8k render';
  const prompt2 = input.imagePrompts?.[1] || 'Translucent glowing 3D AI neural chip and smart data streams, vertical 9:16, dark obsidian, no text, 8k render';
  const prompt3 = input.imagePrompts?.[2] || 'Ultra-modern 3D mobile tech interface with floating glassmorphic icons, vertical 9:16, no text, 8k render';

  console.log(`[Video Engine] 🎨 Preparing 3 high-impact 9:16 visual frames...`);
  await fetchVerticalFrame(prompt1, seed, slide1Path, 0);
  await fetchVerticalFrame(prompt2, seed + 1, slide2Path, 1);
  await fetchVerticalFrame(prompt3, seed + 2, slide3Path, 2);

  // 3. Dynamic Pacing Breakdown (Hook 25%, Core Solution 50%, Action CTA 25%)
  const hookDur = Math.max(2, Math.round(exactDuration * 0.25 * 10) / 10);
  const bodyDur = Math.max(3, Math.round(exactDuration * 0.50 * 10) / 10);
  const ctaDur = Math.max(2, Math.round((exactDuration - hookDur - bodyDur) * 10) / 10);

  console.log(`[Video Engine] 🎞️ Pacing breakdown: Hook (${hookDur}s) | Solution (${bodyDur}s) | CTA (${ctaDur}s) [Total: ${exactDuration.toFixed(1)}s]`);

  // Concat demuxer script
  const concatListPath = path.join(tempDir, 'slides.txt');
  const concatContent = [
    `file '${slide1Path.replace(/\\/g, '/')}'`,
    `duration ${hookDur}`,
    `file '${slide2Path.replace(/\\/g, '/')}'`,
    `duration ${bodyDur}`,
    `file '${slide3Path.replace(/\\/g, '/')}'`,
    `duration ${ctaDur}`,
    `file '${slide3Path.replace(/\\/g, '/')}'`,
  ].join('\n');
  fs.writeFileSync(concatListPath, concatContent);

  // 4. Compile Cinematic 1080x1920 MP4 Video with FFMPEG
  // Includes subtle dark top and bottom vignette overlays and volume boost
  console.log(`[Video Engine] 🚀 Compiling polished 1080x1920 MP4 video Reel...`);
  await new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input(concatListPath)
      .inputOptions(['-f concat', '-safe 0'])
      .input(audioPath)
      .outputOptions([
        '-c:v libx264',
        '-pix_fmt yuv420p',
        '-r 30',
        '-c:a aac',
        '-b:a 192k',
        '-af volume=1.4',
        '-shortest',
        '-vf scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,drawbox=y=0:h=220:color=black@0.4:t=fill,drawbox=y=ih-220:h=220:color=black@0.5:t=fill',
      ])
      .save(outputPath)
      .on('end', () => {
        console.log(`[Video Engine] ✅ 10/10 MP4 Reel compiled: ${outputPath}`);
        resolve();
      })
      .on('error', (err: any) => {
        console.error(`[Video Engine Error] FFMPEG failed:`, err.message);
        reject(err);
      });
  });

  const videoBuffer = fs.readFileSync(outputPath);

  // 5. Save a persistent copy for Dashboard preview & immediate playback
  const previewDir = path.resolve(process.cwd(), 'data', 'reels');
  ensureDir(previewDir);
  const previewVideoPath = path.join(previewDir, 'latest_reel.mp4');
  const previewAudioPath = path.join(previewDir, 'latest_audio.mp3');
  try {
    fs.copyFileSync(outputPath, previewVideoPath);
    fs.copyFileSync(audioPath, previewAudioPath);
    console.log(`[Video Engine] 💾 Saved persistent preview to ${previewVideoPath}`);
  } catch (copyErr: any) {
    console.warn(`[Video Engine Warning] Could not save preview copy: ${copyErr.message}`);
  }

  const cleanup = () => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        console.log(`[Video Engine] 🧹 Cleaned temporary reel files.`);
      }
    } catch (e: any) {
      // ignore
    }
  };

  return {
    videoPath: fs.existsSync(previewVideoPath) ? previewVideoPath : outputPath,
    videoBuffer,
    durationSeconds: exactDuration,
    voiceModel,
    cleanup,
  };
}
