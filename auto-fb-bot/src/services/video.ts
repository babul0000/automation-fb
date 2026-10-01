import fs from 'fs';
import path from 'path';
import axios from 'axios';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { EdgeTTS } from 'node-edge-tts';
import { env, isConfiguredForGemini } from '../config/env';

// Configure FFMPEG & FFPROBE binaries
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

export interface ReelGenerationInput {
  topic: string;
  headlineEn?: string;
  hookText: string;
  bodyText: string;
  ctaText: string;
  fullScript?: string;
  imagePrompts?: string[];
  voice?: string;
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
 * Synthesizes 100% natural, human-like Bengali voiceover.
 * Primary: Google Gemini 3.8 Flash Neural Voice (authentic creator tone & natural breathing).
 * Fallback: Microsoft Azure Neural Voice (bn-BD-NabanitaNeural at warm, natural speed).
 */
export async function generateHumanBengaliVoiceover(
  fullSpeech: string,
  outputAudioPath: string,
  voice: string = 'Puck',
  rate: string = '+6%'
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

  // 3. PRIMARY ENGINE: Google Gemini 3.8 Flash Neural Voice (Pure 100% Human Intonation)
  if (isConfiguredForGemini()) {
    try {
      const selectedVoice = ['Puck', 'Aoede', 'Kore', 'Fenrir'].includes(voice) ? voice : 'Puck';
      console.log(`[Video Engine] 🎙️ Synthesizing 100% Human Voice with Google Gemini 3.8 Flash TTS (${selectedVoice})...`);
      const ttsEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent?key=${env.GEMINI_API_KEY}`;
      
      const response = await axios.post(
        ttsEndpoint,
        {
          contents: [{ role: 'user', parts: [{ text: cleanSpeech }] }],
          generationConfig: {
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: selectedVoice,
                },
              },
            },
          },
        },
        { timeout: 25000 }
      );

      const part = response.data?.candidates?.[0]?.content?.parts?.[0];
      if (part?.inlineData?.data) {
        const audioBuffer = Buffer.from(part.inlineData.data, 'base64');
        fs.writeFileSync(outputAudioPath, audioBuffer);

        if (fs.existsSync(outputAudioPath) && fs.statSync(outputAudioPath).size > 1000) {
          const duration = await getAudioDuration(outputAudioPath);
          console.log(`[Video Engine] ✨ Gemini 3.8 Flash Human Voice synthesized! Duration: ${duration.toFixed(1)}s`);
          return { duration, model: `Google Gemini 3.8 Flash Neural (${selectedVoice} - 100% Human)` };
        }
      }
    } catch (geminiTtsErr: any) {
      console.warn(`[Video Engine Notice] Gemini TTS unavailable (${geminiTtsErr.message}). Switching to Microsoft Edge Neural fallback...`);
    }
  }

  // 4. SECONDARY ENGINE: Microsoft Azure Nabanita Neural (Female, smooth & natural tone)
  try {
    const edgeVoice = voice.includes('Neural') ? voice : 'bn-BD-NabanitaNeural';
    console.log(`[Video Engine] 🎙️ Synthesizing Microsoft Azure Neural Voice (${edgeVoice}, speed: ${rate})...`);
    const tts = new EdgeTTS({
      voice: edgeVoice,
      rate,
      pitch: '+0Hz',
    });

    await tts.ttsPromise(cleanSpeech, outputAudioPath);

    if (fs.existsSync(outputAudioPath) && fs.statSync(outputAudioPath).size > 1000) {
      const duration = await getAudioDuration(outputAudioPath);
      console.log(`[Video Engine] ✨ Azure Neural Voice synthesized! Duration: ${duration.toFixed(1)}s`);
      return { duration, model: `Microsoft Azure Neural (${edgeVoice})` };
    }
  } catch (azureErr: any) {
    console.warn(`[Video Engine Notice] Primary Azure voice notice (${azureErr.message}). Switching to alternative...`);
  }

  // 5. BACKUP ENGINE: Microsoft Azure Pradeep Neural
  try {
    console.log(`[Video Engine] 🎙️ Synthesizing Alternative Azure Neural Voice (bn-BD-PradeepNeural, speed: ${rate})...`);
    const tts = new EdgeTTS({
      voice: 'bn-BD-PradeepNeural',
      rate,
      pitch: '+0Hz',
    });

    await tts.ttsPromise(cleanSpeech, outputAudioPath);

    if (fs.existsSync(outputAudioPath) && fs.statSync(outputAudioPath).size > 1000) {
      const duration = await getAudioDuration(outputAudioPath);
      return { duration, model: 'Microsoft Azure Neural (bn-BD-PradeepNeural)' };
    }
  } catch (backupErr: any) {
    throw new Error(`Voice synthesis failed: ${backupErr.message}`);
  }

  throw new Error('Failed to generate neural audio.');
}

const CURATED_THEMES: Record<string, string[]> = {
  video: [
    'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=1080&h=1920&fit=crop&q=85',
    'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=1080&h=1920&fit=crop&q=85',
    'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1080&h=1920&fit=crop&q=85',
  ],
  code: [
    'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=1080&h=1920&fit=crop&q=85',
    'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=1080&h=1920&fit=crop&q=85',
    'https://images.unsplash.com/photo-1551650975-87deedd944c3?w=1080&h=1920&fit=crop&q=85',
  ],
  design: [
    'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=1080&h=1920&fit=crop&q=85',
    'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1080&h=1920&fit=crop&q=85',
    'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=1080&h=1920&fit=crop&q=85',
  ],
  default: [
    'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1080&h=1920&fit=crop&q=85',
    'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1080&h=1920&fit=crop&q=85',
    'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=1080&h=1920&fit=crop&q=85',
  ],
};

function getThemeByTopic(topic: string): string[] {
  const lower = topic.toLowerCase();
  if (lower.includes('ভিডিও') || lower.includes('video') || lower.includes('short') || lower.includes('রিল') || lower.includes('reel') || lower.includes('edit')) {
    return CURATED_THEMES.video;
  }
  if (lower.includes('code') || lower.includes('কোড') || lower.includes('প্রোগ্রামিং') || lower.includes('dev') || lower.includes('web')) {
    return CURATED_THEMES.code;
  }
  if (lower.includes('ছবির') || lower.includes('image') || lower.includes('design') || lower.includes('আর্ট') || lower.includes('art')) {
    return CURATED_THEMES.design;
  }
  return CURATED_THEMES.default;
}

/**
 * Downloads a high-converting, pristine 9:16 vertical tech frame
 */
async function fetchVerticalFrame(prompt: string, seed: number, destPath: string, themeFrames: string[], frameIndex: number = 0): Promise<void> {
  const browserHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
  };

  // 1. Try Pollinations AI first
  try {
    const encoded = encodeURIComponent(prompt);
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=576&height=1024&nologo=true&seed=${seed}`;
    const res = await axios.get(url, {
      headers: browserHeaders,
      responseType: 'arraybuffer',
      timeout: 12000,
    });
    if (res.data && res.data.length > 1000) {
      fs.writeFileSync(destPath, Buffer.from(res.data));
      return;
    }
  } catch (e: any) {
    // Switch to curated theme frame
  }

  // 2. Curated 4K theme photography fallback with resilient candidate loop
  const candidates = [
    themeFrames[frameIndex % themeFrames.length],
    ...themeFrames,
    ...CURATED_THEMES.default,
  ];

  for (const candidateUrl of candidates) {
    try {
      const res = await axios.get(candidateUrl, {
        headers: browserHeaders,
        responseType: 'arraybuffer',
        timeout: 15000,
      });
      if (res.data && res.data.length > 1000) {
        fs.writeFileSync(destPath, Buffer.from(res.data));
        return;
      }
    } catch (candidateErr: any) {
      // try next candidate
    }
  }

  throw new Error('Failed to download any visual frame.');
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

  const voiceSelection = input.voice || 'Puck';
  const voiceRate = input.rate || '+6%';

  const { duration: exactDuration, model: voiceModel } = await generateHumanBengaliVoiceover(
    speechText,
    audioPath,
    voiceSelection,
    voiceRate
  );

  // 2. Prepare 3 Vertical Frames with Narrative Structure
  const seed = Math.floor(Math.random() * 900000);
  const slide1Path = path.join(tempDir, 'slide1.jpg');
  const slide2Path = path.join(tempDir, 'slide2.jpg');
  const slide3Path = path.join(tempDir, 'slide3.jpg');

  const themeFrames = getThemeByTopic(input.topic);

  // Derive topic-specific prompts if not explicitly passed
  let p1 = input.imagePrompts?.[0];
  let p2 = input.imagePrompts?.[1];
  let p3 = input.imagePrompts?.[2];

  if (!p1 || !p2 || !p3) {
    const isVideoTopic = input.topic.includes('ভিডিও') || input.topic.includes('video') || input.topic.includes('রিল') || input.topic.includes('edit');
    if (isVideoTopic) {
      p1 = 'Content creator looking at video editing timeline on dual monitors, vertical 9:16, dark studio lighting, strictly no text, no watermark, 8k render';
      p2 = 'Futuristic glowing AI video editing interface auto cutting highlights from timeline, vertical 9:16, neon cyan accents, strictly no text, 8k render';
      p3 = 'Modern smartphone in hand playing viral vertical video short with high engagement hearts, vertical 9:16, strictly no text, 8k render';
    } else {
      p1 = `Modern professional person interacting with high-tech computer interface about ${input.topic}, vertical 9:16, dark studio lighting, strictly no text, 8k render`;
      p2 = `Futuristic glowing AI neural interface and smart data analytics, vertical 9:16, cyan accents, strictly no text, 8k render`;
      p3 = `Modern sleek smartphone displaying high tech viral AI app success, vertical 9:16, strictly no text, 8k render`;
    }
  }

  console.log(`[Video Engine] 🎨 Preparing 3 narrative-driven 9:16 visual frames...`);
  await fetchVerticalFrame(p1, seed, slide1Path, themeFrames, 0);
  await fetchVerticalFrame(p2, seed + 1, slide2Path, themeFrames, 1);
  await fetchVerticalFrame(p3, seed + 2, slide3Path, themeFrames, 2);

  // 3. Dynamic Pacing Breakdown (Hook 25%, Core Solution 50%, Action CTA 25%)
  const hookDur = Math.max(2, Math.round(exactDuration * 0.25 * 10) / 10);
  const bodyDur = Math.max(3, Math.round(exactDuration * 0.50 * 10) / 10);
  const ctaDur = Math.max(2, Math.round((exactDuration - hookDur - bodyDur) * 10) / 10);

  console.log(`[Video Engine] 🎞️ Pacing breakdown: Hook (${hookDur}s) | Solution (${bodyDur}s) | CTA (${ctaDur}s) [Total: ${exactDuration.toFixed(1)}s]`);

  // Helper to render Ken Burns dynamic camera motion for each scene
  const renderMotionScene = (imgPath: string, durationSec: number, outPath: string, zoomIn: boolean) => {
    const frames = Math.round(durationSec * 30);
    const zoomFilter = zoomIn
      ? `zoompan=z='min(zoom+0.0012,1.18)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30`
      : `zoompan=z='max(1.18-0.0012*on,1.0)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30`;

    return new Promise<string>((resolve, reject) => {
      ffmpeg(imgPath)
        .loop(durationSec)
        .videoFilters([
          'scale=1080:1920:force_original_aspect_ratio=increase',
          'crop=1080:1920',
          zoomFilter,
        ])
        .outputOptions([
          `-t ${durationSec}`,
          '-pix_fmt yuv420p',
          '-c:v libx264',
          '-r 30',
        ])
        .save(outPath)
        .on('end', () => resolve(outPath))
        .on('error', (err: any) => reject(err));
    });
  };

  console.log(`[Video Engine] 🎥 Rendering dynamic Ken Burns motion for 3 scenes...`);
  const v1 = path.join(tempDir, 'scene1.mp4');
  const v2 = path.join(tempDir, 'scene2.mp4');
  const v3 = path.join(tempDir, 'scene3.mp4');

  await renderMotionScene(slide1Path, hookDur, v1, true);
  await renderMotionScene(slide2Path, bodyDur, v2, false);
  await renderMotionScene(slide3Path, ctaDur, v3, true);

  const concatListPath = path.join(tempDir, 'motion_concat.txt');
  fs.writeFileSync(
    concatListPath,
    [
      `file '${v1.replace(/\\/g, '/')}'`,
      `file '${v2.replace(/\\/g, '/')}'`,
      `file '${v3.replace(/\\/g, '/')}'`,
    ].join('\n')
  );

  // 4. Compile Cinematic 1080x1920 MP4 Video with Modern Typography (NO ugly solid black boxes!)
  const rawHeadline = input.headlineEn || 'VIRAL AI TECH TIPS';
  const cleanHeadline = rawHeadline.replace(/['":]/g, '').trim().toUpperCase();

  const videoFilter = [
    // Top floating pill badge (semi-transparent rounded box just around text, clean ASCII bullet)
    "drawtext=fontfile='C\\:/Windows/Fonts/segoeuib.ttf':text='BYTEBANGLA  •  AI TOOL':fontsize=32:fontcolor=0x22D3EE:box=1:boxcolor=black@0.65:boxborderw=12:x=(w-text_w)/2:y=140",
    // Bold modern headline with strong drop-shadow (readable anywhere without obscuring background video)
    `drawtext=fontfile='C\\:/Windows/Fonts/segoeuib.ttf':text='${cleanHeadline}':fontsize=54:fontcolor=white:shadowcolor=black@0.85:shadowx=4:shadowy=4:x=(w-text_w)/2:y=240`,
    // Modern floating CTA badge at the lower third
    "drawtext=fontfile='C\\:/Windows/Fonts/segoeuib.ttf':text='COMMENT \"AI\" FOR DIRECT LINK':fontsize=36:fontcolor=0xFACC15:box=1:boxcolor=black@0.7:boxborderw=14:x=(w-text_w)/2:y=h-240",
  ].join(',');

  const bgMusicPath = path.resolve(process.cwd(), 'assets', 'audio', 'ambient_tech_bg.mp3');
  const hasBgMusic = fs.existsSync(bgMusicPath);

  console.log(`[Video Engine] 🚀 Compiling polished 1080x1920 MP4 with Voiceover${hasBgMusic ? ' + Ambient Tech Music' : ''}...`);

  await new Promise<void>((resolve, reject) => {
    let command = ffmpeg()
      .input(concatListPath)
      .inputOptions(['-f concat', '-safe 0'])
      .input(audioPath);

    if (hasBgMusic) {
      command = command.input(bgMusicPath).complexFilter([
        `[0:v]${videoFilter}[vout]`,
        `[1:a]volume=1.35[voice]`,
        `[2:a]volume=0.08[bg]`,
        `[voice][bg]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
      ]);
    } else {
      command = command
        .videoFilters(videoFilter)
        .audioFilters('volume=1.35');
    }

    const outputOpts = [
      '-c:v libx264',
      '-pix_fmt yuv420p',
      '-r 30',
      '-c:a aac',
      '-b:a 192k',
      '-shortest',
    ];

    if (hasBgMusic) {
      outputOpts.unshift('-map [vout]', '-map [aout]');
    }

    command
      .outputOptions(outputOpts)
      .save(outputPath)
      .on('end', () => {
        console.log(`[Video Engine] ✅ 10/10 Cinematic Motion Reel compiled: ${outputPath}`);
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
