import fs from 'fs';
import path from 'path';
import axios from 'axios';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { EdgeTTS } from 'node-edge-tts';
import { renderTopGlassBadge, renderReelCoverThumbnail, renderReelSubtitleCards, SubtitleCardPhrase } from './media';
import { env, isConfiguredForGemini } from '../config/env';

// Configure FFMPEG & FFPROBE binaries
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

export interface WordCue {
  part: string;
  start: number; // in milliseconds
  end: number;   // in milliseconds
}

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
  phase1Hook?: string;
  phase2Solution?: string;
  phase3Steps?: string;
  phase4Cta?: string;
  toolBrand?: string;
  practicalSnippet?: string;
  snippetType?: 'CODE' | 'FORMULA' | 'PROMPT' | 'SHORTCUT';
  targetAudience?: 'OFFICE' | 'STUDENTS' | 'FREELANCERS' | string;
  toolName?: string;
  pillarCategory?: string;
  twoWordHook?: string;
  actionKeycap?: string;
  actionLabel?: string;
}

export interface GeneratedReel {
  videoPath: string;
  videoBuffer: Buffer;
  durationSeconds: number;
  voiceModel: string;
  coverThumbnailPath?: string;
  coverThumbnailBuffer?: Buffer;
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
 * Formats milliseconds into ASS timestamp (h:mm:ss.cc)
 */
function formatAssTimestamp(ms: number): string {
  const safeMs = Math.max(0, Math.round(ms));
  const totalSec = Math.floor(safeMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const cs = Math.floor((safeMs % 1000) / 10);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/**
 * Builds non-overlapping, center-safe zone subtitle phrases displaying 2-3 words at a time.
 * Position: Center Safe Zone (1080x1920 canvas).
 * Style: Large bold single line, 75px, bright yellow (#FFE600) with solid black outline.
 * Maximum 2-3 words per line with zero text collision.
 */
export function buildSyncedSubtitlePhrases(
  cues: WordCue[],
  totalDurationSec: number
): SubtitleCardPhrase[] {
  const phrases: SubtitleCardPhrase[] = [];
  let currentGroup: WordCue[] = [];

  for (let i = 0; i < cues.length; i++) {
    currentGroup.push(cues[i]);
    const wordText = cues[i].part.trim();
    const hasPunctuation = /[।?!,]$/.test(wordText);
    const nextCue = cues[i + 1];
    const isLongPause = nextCue && nextCue.start - cues[i].end > 250;
    const isLast = i === cues.length - 1;

    const charCount = currentGroup.reduce((acc, c) => acc + c.part.trim().length, 0);

    // Strictly maximum 2 to 3 words per line for large 75px font with zero collision (single line)
    if (
      currentGroup.length >= 3 ||
      charCount >= 18 ||
      (currentGroup.length >= 2 && (hasPunctuation || isLongPause)) ||
      isLast
    ) {
      const phraseText = currentGroup
        .map((c) => c.part.trim())
        .join(' ')
        .replace(/\s+/g, ' ')
        .replace(/[।?!,]+/g, '')
        .trim();
      const startMs = currentGroup[0].start;
      const endMs = Math.min(totalDurationSec * 1000, currentGroup[currentGroup.length - 1].end);

      if (phraseText.length > 0) {
        phrases.push({ text: phraseText, startMs, endMs });
      }
      currentGroup = [];
    }
  }

  // Adjust timing to strictly PREVENT overlapping:
  // Each subtitle is completely cleared before the next phrase renders
  for (let i = 0; i < phrases.length; i++) {
    const cur = phrases[i];
    const next = phrases[i + 1];
    if (next) {
      if (cur.endMs >= next.startMs) {
        cur.endMs = Math.max(cur.startMs + 150, next.startMs - 40);
      } else if (next.startMs - cur.endMs < 60) {
        cur.endMs = next.startMs - 40;
      }
    } else {
      cur.endMs = Math.min(totalDurationSec * 1000, cur.endMs + 150);
    }
  }

  return phrases;
}

/**
 * Builds non-overlapping ASS subtitles (legacy fallback)
 */
export function buildSyncedWordSubtitlesAss(
  cues: WordCue[],
  totalDurationSec: number,
  outputAssPath: string
): void {
  const phrases = buildSyncedSubtitlePhrases(cues, totalDurationSec);

  const assHeader = `[Script Info]
Title: ByteBangla Synced Kinetic Reel Subtitles
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ReelSubtitle,Hind Siliguri,75,&H0000FFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,5.5,2.5,2,40,40,960,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const dialogueLines = phrases.map((p) => {
    const startStr = formatAssTimestamp(p.startMs);
    const endStr = formatAssTimestamp(p.endMs);
    return `Dialogue: 0,${startStr},${endStr},ReelSubtitle,,0,0,0,,${p.text}`;
  });

  fs.writeFileSync(outputAssPath, assHeader + dialogueLines.join('\n') + '\n', 'utf8');
}

/**
 * Synthesizes 100% natural, human-like Bengali voiceover with word timestamp cues.
 */
export async function generateHumanBengaliVoiceover(
  fullSpeech: string,
  outputAudioPath: string,
  voice: string = 'bn-BD-PradeepNeural',
  rate: string = '+8%'
): Promise<{ duration: number; model: string; wordCues: WordCue[] }> {
  // 1. Aggressively sanitize speech text
  let clean = fullSpeech
    .replace(/(?:[১-৯0-9]+[\.\)\/]\s*)/g, ' ')
    .replace(/(?:ধাপ|স্টেপ|টিপস?|পয়েন্ট|step)\s*[১-৯0-9]+[:\s-]*/gi, ' ')
    .replace(/(?:প্রথমত|দ্বিতীয়ত|তৃতীয়ত)[,:\s-]*/g, ' ')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/[#*~_`\[\]\(\)\{\}]/g, ' ')
    .replace(/[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}👉👇🔥✨🚀💡🤯🎥🤖📢💥🎯👑🌟]/gu, '')
    .replace(/!+/g, '!')
    .replace(/\?+/g, '?')
    .replace(/।+/g, '।')
    .replace(/\s+/g, ' ')
    .trim();

  // Deduplicate CTA
  const sentenceList = clean.split(/(?<=[।?!])/).map((s) => s.trim()).filter(Boolean);
  const filteredSentences: string[] = [];
  for (let i = 0; i < sentenceList.length; i++) {
    const s = sentenceList[i];
    const isLast = i === sentenceList.length - 1;
    if (!isLast && (s.includes('কমেন্টে AI') || s.includes('কমেন্টে ai') || (s.includes('ফলো করুন') && s.includes('বাইট বাংলা')))) {
      continue;
    }
    filteredSentences.push(s);
  }
  const cleanSpeech = filteredSentences.join(' ').replace(/\s+/g, ' ').trim();

  // Primary for Bengali Reels: Microsoft Edge Neural Voice (bn-BD-PradeepNeural / bn-BD-NabanitaNeural)
  // Provides exact millisecond word timestamps for non-overlapping subtitle sync
  const isEdgeVoice = voice.startsWith('bn-BD-') || !['Puck', 'Aoede', 'Kore', 'Fenrir'].includes(voice);

  if (isEdgeVoice) {
    try {
      const edgeVoice = voice.startsWith('bn-BD-') ? voice : 'bn-BD-PradeepNeural';
      console.log(`[Video Engine] 🎙️ Synthesizing Microsoft Edge Neural Voice (${edgeVoice}, speed: ${rate}, timeout: 60s)...`);
      const tts = new EdgeTTS({
        voice: edgeVoice,
        rate,
        pitch: '+0Hz',
        saveSubtitles: true,
        timeout: 60000,
      });

      let edgeSuccess = false;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          await tts.ttsPromise(cleanSpeech, outputAudioPath);
          if (fs.existsSync(outputAudioPath) && fs.statSync(outputAudioPath).size > 1000) {
            edgeSuccess = true;
            break;
          }
        } catch (attemptErr: any) {
          if (attempt === 2) throw attemptErr;
          console.warn(`[Video Engine Notice] Edge TTS attempt ${attempt} notice: ${attemptErr.message || attemptErr}. Retrying in 2s...`);
          await new Promise((r) => setTimeout(r, 2000));
        }
      }

      if (edgeSuccess && fs.existsSync(outputAudioPath) && fs.statSync(outputAudioPath).size > 1000) {
        const duration = await getAudioDuration(outputAudioPath);
        let wordCues: WordCue[] = [];
        const subJsonPath = outputAudioPath + '.json';
        if (fs.existsSync(subJsonPath)) {
          try {
            const raw = JSON.parse(fs.readFileSync(subJsonPath, 'utf8'));
            if (Array.isArray(raw) && raw.length > 0) {
              wordCues = raw
                .map((c: any) => ({
                  part: String(c.part || '').trim(),
                  start: Number(c.start || 0),
                  end: Number(c.end || 0),
                }))
                .filter((c) => c.part.length > 0);
            }
          } catch {}
        }

        if (wordCues.length === 0) {
          const words = cleanSpeech.split(/\s+/).filter(Boolean);
          const totalMs = duration * 1000;
          const wordDurationMs = totalMs / (words.length || 1);
          wordCues = words.map((w, idx) => ({
            part: w,
            start: Math.round(idx * wordDurationMs),
            end: Math.round((idx + 1) * wordDurationMs),
          }));
        }

        return { duration, model: `Microsoft Edge Neural (${edgeVoice})`, wordCues };
      }
    } catch (azureErr: any) {
      const errMsg = azureErr?.message || String(azureErr || 'Edge TTS timeout/error');
      console.warn(`[Video Engine Notice] Primary Edge voice notice: ${errMsg}`);
    }
  }

  // Secondary / Optional: Google Gemini Neural Voice (if explicitly requested)
  if (isConfiguredForGemini() && ['Puck', 'Aoede', 'Kore', 'Fenrir'].includes(voice)) {
    try {
      const selectedVoice = voice;
      console.log(`[Video Engine] 🎙️ Synthesizing Human Voice with Google Gemini TTS (${selectedVoice})...`);
      const ttsEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${env.GEMINI_API_KEY}`;

      const response = await axios.post(
        ttsEndpoint,
        {
          contents: [{ role: 'user', parts: [{ text: `Read aloud the following text in natural, friendly Bangladeshi Bengali: ${cleanSpeech}` }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: selectedVoice,
                },
              },
            },
          },
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: 25000 }
      );

      const part = response.data?.candidates?.[0]?.content?.parts?.[0];
      if (part?.inlineData?.data) {
        const audioBuffer = Buffer.from(part.inlineData.data, 'base64');
        const tempPcmPath = path.join(path.dirname(outputAudioPath), `gemini_tts_${Date.now()}.pcm`);
        fs.writeFileSync(tempPcmPath, audioBuffer);

        await new Promise<void>((resolve, reject) => {
          ffmpeg(tempPcmPath)
            .inputFormat('s16le')
            .inputOptions(['-ar 24000', '-ac 1'])
            .outputOptions(['-c:a libmp3lame', '-b:a 192k'])
            .save(outputAudioPath)
            .on('end', () => {
              try { fs.unlinkSync(tempPcmPath); } catch {}
              resolve();
            })
            .on('error', (err) => {
              try { fs.unlinkSync(tempPcmPath); } catch {}
              reject(err);
            });
        });

        if (fs.existsSync(outputAudioPath) && fs.statSync(outputAudioPath).size > 1000) {
          const duration = await getAudioDuration(outputAudioPath);
          console.log(`[Video Engine] ✨ Google Gemini Voice synthesized! Duration: ${duration.toFixed(1)}s`);

          // Proportional word cues for Gemini TTS
          const words = cleanSpeech.split(/\s+/).filter(Boolean);
          const totalMs = duration * 1000;
          const wordDurationMs = totalMs / (words.length || 1);
          const wordCues: WordCue[] = words.map((w, idx) => ({
            part: w,
            start: Math.round(idx * wordDurationMs),
            end: Math.round((idx + 1) * wordDurationMs),
          }));

          return { duration, model: `Google Gemini Neural Voice (${selectedVoice})`, wordCues };
        }
      }
    } catch (geminiTtsErr: any) {
      console.warn(`[Video Engine Notice] Gemini TTS fallback to Edge Neural: ${geminiTtsErr.message}`);
    }
  }
  // Backup fallback
  try {
    const fallbackVoice = voice.includes('Pradeep') ? 'bn-BD-NabanitaNeural' : 'bn-BD-PradeepNeural';
    console.log(`[Video Engine] 🎙️ Synthesizing fallback Edge Voice (${fallbackVoice}, timeout: 60s)...`);
    const tts = new EdgeTTS({ voice: fallbackVoice, rate, pitch: '+0Hz', saveSubtitles: true, timeout: 60000 });
    await tts.ttsPromise(cleanSpeech, outputAudioPath);
    if (fs.existsSync(outputAudioPath) && fs.statSync(outputAudioPath).size > 1000) {
      const duration = await getAudioDuration(outputAudioPath);
      let wordCues: WordCue[] = [];
      const subJsonPath = outputAudioPath + '.json';
      if (fs.existsSync(subJsonPath)) {
        try {
          const raw = JSON.parse(fs.readFileSync(subJsonPath, 'utf8'));
          if (Array.isArray(raw)) {
            wordCues = raw.map((c: any) => ({
              part: String(c.part || '').trim(),
              start: Number(c.start || 0),
              end: Number(c.end || 0),
            })).filter((c) => c.part.length > 0);
          }
        } catch {}
      }

      if (wordCues.length === 0) {
        const words = cleanSpeech.split(/\s+/).filter(Boolean);
        const totalMs = duration * 1000;
        const wordDurationMs = totalMs / (words.length || 1);
        wordCues = words.map((w, idx) => ({
          part: w,
          start: Math.round(idx * wordDurationMs),
          end: Math.round((idx + 1) * wordDurationMs),
        }));
      }

      return { duration, model: `Microsoft Edge Neural (${fallbackVoice})`, wordCues };
    }
  } catch (backupErr: any) {
    const bMsg = backupErr?.message || String(backupErr || 'Fallback timeout');
    console.warn(`[Video Engine Notice] Backup Edge voice error: ${bMsg}`);
  }

  // Final emergency fallback: Gemini Neural Voice if Edge TTS network fails
  if (isConfiguredForGemini()) {
    try {
      console.log(`[Video Engine] 🎙️ Attempting Emergency Google Gemini Neural Voice (Puck)...`);
      const ttsEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${env.GEMINI_API_KEY}`;

      const response = await axios.post(
        ttsEndpoint,
        {
          contents: [{ role: 'user', parts: [{ text: `Read aloud the following text in natural, friendly Bangladeshi Bengali: ${cleanSpeech}` }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: 'Puck',
                },
              },
            },
          },
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: 25000 }
      );

      const part = response.data?.candidates?.[0]?.content?.parts?.[0];
      if (part?.inlineData?.data) {
        const audioBuffer = Buffer.from(part.inlineData.data, 'base64');
        const tempPcmPath = path.join(path.dirname(outputAudioPath), `gemini_tts_${Date.now()}.pcm`);
        fs.writeFileSync(tempPcmPath, audioBuffer);

        await new Promise<void>((resolve, reject) => {
          ffmpeg(tempPcmPath)
            .inputFormat('s16le')
            .inputOptions(['-ar 24000', '-ac 1'])
            .outputOptions(['-c:a libmp3lame', '-b:a 192k'])
            .save(outputAudioPath)
            .on('end', () => {
              try { fs.unlinkSync(tempPcmPath); } catch {}
              resolve();
            })
            .on('error', (err) => {
              try { fs.unlinkSync(tempPcmPath); } catch {}
              reject(err);
            });
        });

        if (fs.existsSync(outputAudioPath) && fs.statSync(outputAudioPath).size > 1000) {
          const duration = await getAudioDuration(outputAudioPath);
          const words = cleanSpeech.split(/\s+/).filter(Boolean);
          const totalMs = duration * 1000;
          const wordDurationMs = totalMs / (words.length || 1);
          const wordCues: WordCue[] = words.map((w, idx) => ({
            part: w,
            start: Math.round(idx * wordDurationMs),
            end: Math.round((idx + 1) * wordDurationMs),
          }));

          return { duration, model: 'Google Gemini Neural Voice (Emergency Fallback)', wordCues };
        }
      }
    } catch (gErr: any) {
      console.warn(`[Video Engine Notice] Emergency Gemini TTS error: ${gErr?.message || gErr}`);
    }
  }

  throw new Error('Voice synthesis failed: All Microsoft Edge and Gemini Neural audio providers timed out or were unreachable.');
}

/**
 * Scans candidate directories for realistic, cinematic B-roll video files (.mp4, .mov, .webm).
 * Strictly excludes any abstract color-bars, rainbow stripes, cartoonish patterns, or synthetic test loops.
 */
export function getAvailableMediaVideos(): string[] {
  const candidateDirs = [
    path.resolve(process.cwd(), 'assets', 'videos'),
    path.resolve(__dirname, '..', '..', 'assets', 'videos'),
    path.resolve(process.cwd(), 'auto-fb-bot', 'assets', 'videos'),
    path.resolve(process.cwd(), '..', 'media'),
    path.resolve(process.cwd(), 'media'),
    'C:\\project file\\FACEBOOK-AUTOMATION\\media',
    path.resolve(__dirname, '../../../../media'),
    path.resolve(__dirname, '../../../media'),
  ];

  const blacklistedPattern = /color|rainbow|stripe|test|loop|smpte|bars|abstract|cartoon|dummy|synthetic/i;
  const seen = new Set<string>();
  const validVideos: string[] = [];

  for (const dir of candidateDirs) {
    if (fs.existsSync(dir)) {
      try {
        const files = fs
          .readdirSync(dir)
          .filter((f) => /\.(mp4|mov|webm)$/i.test(f))
          .filter((f) => !blacklistedPattern.test(f))
          .map((f) => path.join(dir, f));

        for (const file of files) {
          const base = path.basename(file).toLowerCase();
          if (seen.has(base)) continue;
          try {
            const stats = fs.statSync(file);
            // Must be genuine realistic B-roll footage (> 500 KB to avoid corrupt/empty clips)
            if (stats.size > 500 * 1024) {
              seen.add(base);
              validVideos.push(file);
            }
          } catch {}
        }
      } catch {}
    }
  }

  return validVideos;
}

let lastSelectedVideoIndex = 0;
let lastSelectedVideoPath = '';

/**
 * Curated 4K vertical photography themes for instant fallback
 */
export const CURATED_THEMES: Record<string, string[]> = {
  security: [
    'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=1080&h=1920&fit=crop&q=85',
    'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1080&h=1920&fit=crop&q=85',
    'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1080&h=1920&fit=crop&q=85',
  ],
  mobile: [
    'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=1080&h=1920&fit=crop&q=85',
    'https://images.unsplash.com/photo-1555774698-0b77e0d5fac6?w=1080&h=1920&fit=crop&q=85',
    'https://images.unsplash.com/photo-1511707171634-5f897ff02560?w=1080&h=1920&fit=crop&q=85',
  ],
  lifestyle: [
    'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=1080&h=1920&fit=crop&q=85',
    'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1080&h=1920&fit=crop&q=85',
    'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1080&h=1920&fit=crop&q=85',
  ],
  story: [
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1080&h=1920&fit=crop&q=85',
    'https://images.unsplash.com/photo-1499209974431-9dddcece7f88?w=1080&h=1920&fit=crop&q=85',
    'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1080&h=1920&fit=crop&q=85',
  ],
  tech: [
    'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1080&h=1920&fit=crop&q=85',
    'https://images.unsplash.com/photo-1531482615713-2afd69097998?w=1080&h=1920&fit=crop&q=85',
    'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1080&h=1920&fit=crop&q=85',
  ],
  default: [
    'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1080&h=1920&fit=crop&q=85',
    'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=1080&h=1920&fit=crop&q=85',
    'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1080&h=1920&fit=crop&q=85',
  ],
};

export function getThemeByTopic(topic: string, pillarCategory?: string): string[] {
  const lower = `${topic} ${pillarCategory || ''}`.toLowerCase();
  if (
    lower.includes('বিকাশ') ||
    lower.includes('ব্যাংক') ||
    lower.includes('scam') ||
    lower.includes('সিকিউরিটি') ||
    lower.includes('security') ||
    lower.includes('হ্যাক') ||
    lower.includes('জালিয়াতি')
  ) {
    return CURATED_THEMES.security;
  }
  if (
    lower.includes('মোবাইল') ||
    lower.includes('স্টোরেজ') ||
    lower.includes('ফোন') ||
    lower.includes('মেমোরি') ||
    lower.includes('phone') ||
    lower.includes('storage')
  ) {
    return CURATED_THEMES.mobile;
  }
  if (
    lower.includes('ট্রেন') ||
    lower.includes('টিকিট') ||
    lower.includes('গ্যাস') ||
    lower.includes('ভ্রমণ') ||
    lower.includes('travel') ||
    lower.includes('life')
  ) {
    return CURATED_THEMES.lifestyle;
  }
  if (
    lower.includes('গল্প') ||
    lower.includes('story') ||
    lower.includes('জীবনী') ||
    lower.includes('অনুপ্রেরণা') ||
    lower.includes('psychology')
  ) {
    return CURATED_THEMES.story;
  }
  if (
    lower.includes('ai') ||
    lower.includes('টুল') ||
    lower.includes('tech') ||
    lower.includes('ভিডিও') ||
    lower.includes('edit')
  ) {
    return CURATED_THEMES.tech;
  }
  return CURATED_THEMES.default;
}

/**
 * Derives 3 photorealistic, topic-specific 9:16 visual prompts
 */
export function deriveTopicVisualPrompts(topic: string, pillarCategory?: string): [string, string, string] {
  const query = `${topic} ${pillarCategory || ''}`.toLowerCase();

  if (
    query.includes('বিকাশ') ||
    query.includes('ব্যাংক') ||
    query.includes('টাকা') ||
    query.includes('জালিয়াতি') ||
    query.includes('scam') ||
    query.includes('কল')
  ) {
    return [
      'Concerned person looking at incoming suspicious phone call on modern smartphone screen, vertical 9:16, cinematic dramatic moody lighting, 8k render, strictly no text',
      'Cybersecurity digital shield protecting smartphone with glowing neon lock and security verification checkmark, vertical 9:16, dark background, 8k render, strictly no text',
      'Relieved smiling person holding smartphone safely in hand with secure verified icon on screen, vertical 9:16, soft ambient lighting, 8k render, strictly no text',
    ];
  }
  if (
    query.includes('স্টোরেজ') ||
    query.includes('মেমোরি') ||
    query.includes('মোবাইল') ||
    query.includes('ফোন') ||
    query.includes('ফাস্ট') ||
    query.includes('storage')
  ) {
    return [
      'Modern smartphone in hand displaying low storage warning full memory meter, vertical 9:16, clean studio lighting, 8k render, strictly no text',
      'Futuristic digital data cleaning animation wiping junk files and cache memory inside glowing smartphone, vertical 9:16, neon blue trails, 8k render, strictly no text',
      'Super fast ultra responsive glowing smartphone in hand with lightning speed neon particle streaks, vertical 9:16, modern aesthetic, 8k render, strictly no text',
    ];
  }
  if (
    query.includes('ফেসবুক') ||
    query.includes('প্রাইভেসি') ||
    query.includes('ছবি') ||
    query.includes('সিকিউরিটি') ||
    query.includes('হ্যাক') ||
    query.includes('facebook')
  ) {
    return [
      'Mysterious silhouette looking at glowing social media interface on screen in dark room, vertical 9:16, cinematic cyberpunk lighting, 8k render, strictly no text',
      'Modern smartphone displaying high-tech holographic security lock and encrypted privacy shield settings, vertical 9:16, neon orange and cyan, 8k render, strictly no text',
      'Confident happy person holding secure smartphone with green shield emblem, vertical 9:16, warm friendly lighting, 8k render, strictly no text',
    ];
  }
  if (
    query.includes('ট্রেন') ||
    query.includes('টিকিট') ||
    query.includes('ভ্রমণ') ||
    query.includes('ম্যাপ') ||
    query.includes('travel')
  ) {
    return [
      'Passenger waiting at modern train station platform holding smartphone checking live booking, vertical 9:16, cinematic travel photography, 8k render, strictly no text',
      'Smartphone screen showing fast digital train ticket booking route map confirmation, vertical 9:16, neon highlights, 8k render, strictly no text',
      'Happy traveler smiling aboard high speed modern train with scenic landscape outside window, vertical 9:16, golden hour sunlight, 8k render, strictly no text',
    ];
  }
  if (
    query.includes('গ্যাস') ||
    query.includes('সিলিন্ডার') ||
    query.includes('ভোক্তা') ||
    query.includes('অধিকার') ||
    query.includes('দাম')
  ) {
    return [
      'Red LPG gas cylinder in clean modern domestic kitchen with digital price check on smartphone, vertical 9:16, natural home lighting, 8k render, strictly no text',
      'Official consumer protection digital scales and fair pricing authority verified emblem, vertical 9:16, clean professional lighting, 8k render, strictly no text',
      'Happy Bangladeshi family smiling in modern kitchen with safe energy supply, vertical 9:16, warm cozy lighting, 8k render, strictly no text',
    ];
  }
  if (
    query.includes('গল্প') ||
    query.includes('জীবন') ||
    query.includes('সফল') ||
    query.includes('অনুপ্রেরণা') ||
    query.includes('story')
  ) {
    return [
      'Thoughtful person sitting by window at sunrise contemplating future goals, vertical 9:16, inspirational cinematic golden hour lighting, 8k render, strictly no text',
      'Person working hard with determination under study lamp late at night, vertical 9:16, warm moody cinematic lighting, 8k render, strictly no text',
      'Triumphant joyful person standing at scenic mountain overlook celebrating breakthrough success, vertical 9:16, majestic sunset sky, 8k render, strictly no text',
    ];
  }

  // Default general tech & life-hack prompts
  return [
    `Engaging modern scene representing ${topic}, vertical 9:16, professional studio cinematic lighting, ultra-high resolution, strictly no text, no watermark`,
    `Futuristic smart technology solution and digital innovation for ${topic}, vertical 9:16, glowing cyan and amber accents, 8k render, strictly no text`,
    `Happy person holding modern smartphone achieving instant success with technology, vertical 9:16, vibrant studio lighting, strictly no text`,
  ];
}

/**
 * Downloads a pristine 9:16 vertical visual frame using Pollinations AI with resilient fallback
 */
export async function fetchNarrativeFrame(
  prompt: string,
  seed: number,
  destPath: string,
  themeUrls: string[],
  slideIndex: number = 0
): Promise<void> {
  const browserHeaders = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
  };

  // 1. Primary: Pollinations AI (High quality, 720x1280 vertical 9:16)
  try {
    const encoded = encodeURIComponent(prompt);
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=720&height=1280&nologo=true&seed=${seed}`;
    const res = await axios.get(url, {
      headers: browserHeaders,
      responseType: 'arraybuffer',
      timeout: 18000,
    });
    if (res.data && res.data.length > 3000) {
      fs.writeFileSync(destPath, Buffer.from(res.data));
      console.log(`[Video Engine] 🎨 AI narrative frame ${slideIndex + 1} generated successfully via Pollinations AI.`);
      return;
    }
  } catch (err: any) {
    console.warn(`[Video Engine Notice] AI frame ${slideIndex + 1} Pollinations notice: ${err.message}. Trying curated theme fallback...`);
  }

  // 2. Curated theme photography fallback
  const candidates = [
    themeUrls[slideIndex % themeUrls.length],
    ...themeUrls,
    ...CURATED_THEMES.default,
  ];

  for (const candidateUrl of candidates) {
    try {
      const res = await axios.get(candidateUrl, {
        headers: browserHeaders,
        responseType: 'arraybuffer',
        timeout: 15000,
      });
      if (res.data && res.data.length > 2000) {
        fs.writeFileSync(destPath, Buffer.from(res.data));
        console.log(`[Video Engine] 📷 Curated theme photo frame ${slideIndex + 1} downloaded.`);
        return;
      }
    } catch {}
  }

  // 3. Fallback: Local assets
  const localFallbacks = getAvailableMediaVideos();
  if (localFallbacks.length > 0) {
    try {
      const fallbackVid = localFallbacks[slideIndex % localFallbacks.length];
      const ffmpegBin = ffmpegInstaller?.path || 'ffmpeg';
      const { execSync } = require('child_process');
      execSync(`"${ffmpegBin}" -y -ss 0.5 -i "${fallbackVid}" -vframes 1 "${destPath}"`, { stdio: 'ignore' });
      if (fs.existsSync(destPath)) return;
    } catch {}
  }

  // 4. Last resort: Dark gradient canvas
  const ffmpegBin = ffmpegInstaller?.path || 'ffmpeg';
  const { execSync } = require('child_process');
  execSync(`"${ffmpegBin}" -f lavfi -i "color=c=0x0f172a:s=1080x1920:d=1,format=yuv420p" -vframes 1 -y "${destPath}"`, { stdio: 'ignore' });
}

/**
 * Renders lightweight Ken Burns dynamic camera motion for a single scene
 * Engineered with ultrafast preset, 2 threads, and pre-scaling to prevent cloud memory OOM
 */
export function renderKenBurnsScene(
  imgPath: string,
  durationSec: number,
  outPath: string,
  motionType: 'zoomIn' | 'zoomOut' | 'panUp'
): Promise<string> {
  const frames = Math.max(15, Math.round(durationSec * 30));
  let filter = `zoompan=z='min(zoom+0.0010,1.15)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30`;
  if (motionType === 'zoomOut') {
    filter = `zoompan=z='max(1.15-0.0010*on,1.0)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30`;
  } else if (motionType === 'panUp') {
    filter = `zoompan=z=1.08:d=${frames}:x='iw/2-(iw/zoom/2)':y='max(ih-(ih/zoom)-(on*0.4),0)':s=1080x1920:fps=30`;
  }

  return new Promise<string>((resolve, reject) => {
    ffmpeg(imgPath)
      .loop(durationSec)
      .videoFilters([
        'scale=1080:1920:force_original_aspect_ratio=increase',
        'crop=1080:1920',
        filter,
      ])
      .outputOptions([
        `-t ${durationSec}`,
        '-pix_fmt yuv420p',
        '-c:v libx264',
        '-preset ultrafast',
        '-threads 2',
        '-r 30',
      ])
      .save(outPath)
      .on('end', () => resolve(outPath))
      .on('error', (err: any) => reject(err));
  });
}

/**
 * Prepares 3 Narrative AI Visual Scenes matching the topic and compiles them into a seamless motion background
 */
export async function prepareNarrativeMotionBackground(
  topic: string,
  pillarCategory: string | undefined,
  imagePrompts: string[] | undefined,
  totalDurationSec: number,
  tempDir: string
): Promise<{ bgVideoPath: string; firstFramePath: string }> {
  const themeUrls = getThemeByTopic(topic, pillarCategory);
  const derivedPrompts = deriveTopicVisualPrompts(topic, pillarCategory);

  const p1 = imagePrompts?.[0] || derivedPrompts[0];
  const p2 = imagePrompts?.[1] || derivedPrompts[1];
  const p3 = imagePrompts?.[2] || derivedPrompts[2];

  const slide1Path = path.join(tempDir, 'slide1.jpg');
  const slide2Path = path.join(tempDir, 'slide2.jpg');
  const slide3Path = path.join(tempDir, 'slide3.jpg');

  const seed = Math.floor(Math.random() * 900000);
  console.log(`[Video Engine] 🎨 Preparing 3 narrative AI visual frames for "${topic}"...`);

  await Promise.all([
    fetchNarrativeFrame(p1, seed, slide1Path, themeUrls, 0),
    fetchNarrativeFrame(p2, seed + 1, slide2Path, themeUrls, 1),
    fetchNarrativeFrame(p3, seed + 2, slide3Path, themeUrls, 2),
  ]);

  // Dynamic Pacing Breakdown (Hook ~25%, Solution ~50%, CTA ~25%)
  const hookDur = Math.max(2.5, Math.round(totalDurationSec * 0.25 * 10) / 10);
  const bodyDur = Math.max(4.0, Math.round(totalDurationSec * 0.50 * 10) / 10);
  const ctaDur = Math.max(2.5, Math.round((totalDurationSec - hookDur - bodyDur) * 10) / 10);

  console.log(
    `[Video Engine] 🎞️ Pacing breakdown: Hook (${hookDur}s) | Solution (${bodyDur}s) | CTA (${ctaDur}s) [Total: ${totalDurationSec.toFixed(1)}s]`
  );

  const v1 = path.join(tempDir, 'scene1.mp4');
  const v2 = path.join(tempDir, 'scene2.mp4');
  const v3 = path.join(tempDir, 'scene3.mp4');

  await renderKenBurnsScene(slide1Path, hookDur, v1, 'zoomIn');
  await renderKenBurnsScene(slide2Path, bodyDur, v2, 'zoomOut');
  await renderKenBurnsScene(slide3Path, ctaDur, v3, 'zoomIn');

  const concatListPath = path.join(tempDir, 'motion_concat.txt');
  fs.writeFileSync(
    concatListPath,
    [
      `file '${v1.replace(/\\/g, '/')}'`,
      `file '${v2.replace(/\\/g, '/')}'`,
      `file '${v3.replace(/\\/g, '/')}'`,
    ].join('\n')
  );

  return { bgVideoPath: concatListPath, firstFramePath: slide1Path };
}

/**
 * Dynamically picks a video from `./media/` (fallback mode):
 * 1. Matches toolBrand, pillar category, or topic keyword if found in filename
 * 2. Prioritizes vertical 9:16 videos (e.g. 2160_4096 or 2160_3840)
 * 3. Rotational selection ensuring consecutive posts NEVER repeat the same video file
 */
export function selectMediaBackgroundVideo(toolBrand?: string, topic?: string): string {
  let videos = getAvailableMediaVideos();
  if (videos.length === 0) {
    console.warn(`[Video Engine Warning] No realistic background video files found. Generating dynamic 1080x1920 fallback video...`);
    const fallbackDir = path.resolve(process.cwd(), 'data', 'temp_reels');
    if (!fs.existsSync(fallbackDir)) fs.mkdirSync(fallbackDir, { recursive: true });
    const fallbackPath = path.join(fallbackDir, 'synthetic_bg.mp4');
    if (!fs.existsSync(fallbackPath)) {
      const ffmpegBin = ffmpegInstaller?.path || 'ffmpeg';
      try {
        const { execSync } = require('child_process');
        execSync(`"${ffmpegBin}" -f lavfi -i "color=c=0x090d16:s=1080x1920:d=35,format=yuv420p" -c:v libx264 -preset ultrafast -y "${fallbackPath}"`, { stdio: 'ignore', timeout: 30000 });
      } catch (err: any) {
        console.warn(`[Video Engine Warning] Fallback video creation failed: ${err.message}`);
      }
    }
    if (fs.existsSync(fallbackPath)) {
      return fallbackPath;
    }
    throw new Error('No realistic background video files found in media directories.');
  }

  // Exclude last used video to strictly guarantee no consecutive repetitions
  const availablePool = videos.length > 1 && lastSelectedVideoPath
    ? videos.filter((v) => v !== lastSelectedVideoPath)
    : videos;

  const query = `${toolBrand || ''} ${topic || ''}`.toLowerCase();

  // 1. Check if filename matches keyword
  const keywordMatches = availablePool.filter((v) => {
    const base = path.basename(v).toLowerCase();
    if (toolBrand && base.includes(toolBrand.toLowerCase())) return true;
    const words = query.split(/\s+/).filter((w) => w.length > 3);
    return words.some((w) => base.includes(w));
  });

  if (keywordMatches.length > 0) {
    const picked = keywordMatches[Math.floor(Math.random() * keywordMatches.length)];
    lastSelectedVideoPath = picked;
    console.log(`[Video Engine] 🎯 Matched keyword realistic video: "${path.basename(picked)}"`);
    return picked;
  }

  // 2. Prioritize vertical portrait videos (e.g. 2160_4096, 2160_3840) if available
  const verticalVideos = availablePool.filter((v) => {
    const base = path.basename(v);
    return base.includes('2160_4096') || base.includes('2160_3840');
  });

  const pool = verticalVideos.length > 0 ? verticalVideos : availablePool;

  // 3. Rotational selection across pool
  const picked = pool[lastSelectedVideoIndex % pool.length];
  lastSelectedVideoIndex = (lastSelectedVideoIndex + 1) % pool.length;
  lastSelectedVideoPath = picked;
  console.log(`[Video Engine] 🎬 Selected realistic cinematic B-roll: "${path.basename(picked)}"`);
  return picked;
}

/**
 * Selects background music track matching the detected topic category and mood:
 * - bgm_curious.mp3 (curiosity, mysteries, scams, and hidden facts)
 * - bgm_inspiring.mp3 (biographical, motivational, and true inspirational stories)
 * - bgm_upbeat.mp3 (smartphone hacks, daily life tips, consumer rights, viral tools)
 * Fallback: ambient_tech_bg.mp3 (or data/bg_music.mp3)
 */
export function selectBackgroundMusicByMood(category?: string, topic?: string): string {
  const audioDir = path.resolve(process.cwd(), 'assets', 'audio');
  const query = `${category || ''} ${topic || ''}`.toLowerCase();

  let targetFileName = 'bgm_upbeat.mp3';

  if (
    query.includes('গল্প') ||
    query.includes('story') ||
    query.includes('inspiring') ||
    query.includes('inspirational') ||
    query.includes('জীবনী') ||
    query.includes('কালাম') ||
    query.includes('নজরুল') ||
    query.includes('অনুপ্রেরণা')
  ) {
    targetFileName = 'bgm_inspiring.mp3';
  } else if (
    query.includes('রহস্য') ||
    query.includes('হ্যাক') ||
    query.includes('scam') ||
    query.includes('সিকিউরিটি') ||
    query.includes('security') ||
    query.includes('সুরক্ষা') ||
    query.includes('curious') ||
    query.includes('গোপন') ||
    query.includes('সত্য') ||
    query.includes('ফাঁস')
  ) {
    targetFileName = 'bgm_curious.mp3';
  } else {
    // Smartphone hacks, consumer tips, everyday life tips, viral trends
    targetFileName = 'bgm_upbeat.mp3';
  }

  const preferredPath = path.join(audioDir, targetFileName);
  if (fs.existsSync(preferredPath)) {
    console.log(`[Video Engine] 🎵 Selected Mood BGM track: "${targetFileName}" for topic.`);
    return preferredPath;
  }

  const fallbackCandidates = [
    path.join(audioDir, 'ambient_tech_bg.mp3'),
    path.resolve(process.cwd(), 'data', 'bg_music.mp3'),
    path.resolve(process.cwd(), '..', 'data', 'bg_music.mp3'),
  ];

  for (const candidate of fallbackCandidates) {
    if (fs.existsSync(candidate)) {
      console.log(`[Video Engine] 🎵 Mood track "${targetFileName}" not found; smoothly falling back to "${path.basename(candidate)}"`);
      return candidate;
    }
  }

  return preferredPath;
}

/**
 * Probes whether the selected media video contains an audio track
 */
function hasAudioStream(videoPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!fs.existsSync(videoPath) || videoPath.endsWith('.txt')) {
      resolve(false);
      return;
    }
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err || !metadata || !metadata.streams) {
        resolve(false);
        return;
      }
      const hasAudio = metadata.streams.some((s) => s.codec_type === 'audio');
      resolve(hasAudio);
    });
  });
}

/**
 * Generates a polished, high-converting 9:16 vertical Facebook Reel (MP4)
 * Powered by:
 * 1. 3 Narrative AI-generated 9:16 visual scenes with Ken Burns dynamic motion matching the topic
 * 2. Top-center: Single sleek floating glass badge indicating the trend / topic
 * 3. Center Safe Zone: Large, bold, single-line kinetic subtitles (Hind Siliguri Bold, 75px, vibrant yellow with solid black outline)
 * 4. Microsoft Edge Neural Voiceover (bn-BD-PradeepNeural at +8% speed) with dynamic mood background music (-22dB)
 * 5. Dedicated High-Impact Reel Cover Thumbnail baked on Frame 0 for Facebook feed previews
 * 6. Persistent copy saved to data/reels/latest_reel.mp4 for immediate dashboard preview
 */
export async function generateReelVideo(input: ReelGenerationInput): Promise<GeneratedReel> {
  const tempDir = path.resolve(process.cwd(), 'data', 'temp_reels', `reel_${Date.now()}`);
  ensureDir(tempDir);

  const audioPath = path.join(tempDir, 'voiceover.mp3');
  const outputPath = path.join(tempDir, 'output_reel.mp4');

  console.log(`[Video Engine] 🎬 Initiating 100% Kinetic Narrative Reel for: "${input.topic}"...`);

  // 1. Synthesize Human Neural Voiceover with Word Timestamp Cues
  let speechText = '';
  if (input.fullScript && input.fullScript.trim().length > 25 && !input.fullScript.includes('...')) {
    speechText = input.fullScript.trim();
  } else {
    const p1 = input.phase1Hook || input.hookText || '';
    const p2 = input.phase2Solution || '';
    const p3 = input.phase3Steps || '';
    const p4 = input.phase4Cta || input.ctaText || '';
    speechText = [p1, p2, p3, p4].filter(Boolean).join('। ').replace(/।+/g, '।');
  }

  const voiceSelection = input.voice || 'bn-BD-PradeepNeural';
  const voiceRate = input.rate || '+8%';

  const {
    duration: exactDuration,
    model: voiceModel,
    wordCues,
  } = await generateHumanBengaliVoiceover(speechText, audioPath, voiceSelection, voiceRate);

  console.log(`[Video Engine] 🎙️ Voiceover generated (${exactDuration.toFixed(1)}s, ${wordCues.length} word cues, model: ${voiceModel})`);

  // 2. Render Synced High-Resolution 100% Unbroken Bengali Subtitle Cards via Puppeteer
  // Native OpenType text shaping guarantees ZERO broken ligatures (যুক্তাক্ষর, রেফ, য-ফলা)
  const phrases = buildSyncedSubtitlePhrases(wordCues, exactDuration);
  const subsDir = path.join(tempDir, 'subs');
  console.log(`[Video Engine] ✍️ Rendering ${phrases.length} Bengali Subtitle Cards (100% unbroken ligatures, 75px, bright yellow)...`);
  const { concatPath: subsConcatPath } = await renderReelSubtitleCards(phrases, exactDuration, subsDir);

  // 3. Render ONLY the Single Sleek Top Floating Glass Badge
  let badgeText = '🔥 আজকের ভাইরাল ট্রেন্ড';
  const topicLower = `${input.pillarCategory || ''} ${input.topic} ${input.headlineEn || ''}`.toLowerCase();
  if (
    topicLower.includes('সুরক্ষা') ||
    topicLower.includes('হ্যাক') ||
    topicLower.includes('বিকাশ') ||
    topicLower.includes('scam') ||
    topicLower.includes('security')
  ) {
    badgeText = '🛡️ অনলাইন নিরাপত্তা ও সতর্কতা';
  } else if (
    topicLower.includes('গল্প') ||
    topicLower.includes('story') ||
    topicLower.includes('কালাম') ||
    topicLower.includes('নজরুল')
  ) {
    badgeText = '📖 জীবন বদলে দেওয়া গল্প';
  } else if (
    topicLower.includes('সাইকোলজি') ||
    topicLower.includes('মনস্তত্ত্ব')
  ) {
    badgeText = '🧠 মনস্তত্ত্ব ও জীবনজ্ঞান';
  } else if (
    topicLower.includes('হ্যাক') ||
    topicLower.includes('লাইফ') ||
    topicLower.includes('মোবাইল')
  ) {
    badgeText = '💡 দরকারি লাইফ হ্যাক';
  } else if (input.actionLabel) {
    badgeText = `🔥 ${input.actionLabel}`;
  }

  const badgeOverlayPath = path.join(tempDir, 'badge_overlay.png');
  await renderTopGlassBadge(badgeText, badgeOverlayPath);

  // 4. Synthesize 3 Narrative Visual Scenes with Ken Burns Dynamic Camera Motion
  let motionBgPath = '';
  let bgFramePath = path.join(tempDir, 'bg_frame.jpg');

  try {
    const motion = await prepareNarrativeMotionBackground(
      input.topic,
      input.pillarCategory,
      input.imagePrompts,
      exactDuration,
      tempDir
    );
    motionBgPath = motion.bgVideoPath;
    if (fs.existsSync(motion.firstFramePath)) {
      bgFramePath = motion.firstFramePath;
    }
  } catch (motionErr: any) {
    console.warn(`[Video Engine Notice] Narrative AI motion notice: ${motionErr.message}. Falling back to local B-roll...`);
    motionBgPath = selectMediaBackgroundVideo(input.toolBrand, input.topic);
    await new Promise<void>((resolve) => {
      ffmpeg(motionBgPath)
        .seekInput(0.5)
        .frames(1)
        .outputOptions(['-q:v 2'])
        .save(bgFramePath)
        .on('end', () => resolve())
        .on('error', () => resolve());
    });
  }

  // 5. Enforce High-Impact Dedicated Reel Cover Thumbnail (output/cover.jpg)
  const outputCoverDir = path.resolve(process.cwd(), 'output');
  ensureDir(outputCoverDir);
  const dedicatedCoverPath = path.join(outputCoverDir, 'cover.jpg');
  const legacyCoverPath = path.join(outputCoverDir, 'cover_thumb.jpg');
  const coverHeadline = input.twoWordHook || input.hookText || input.topic;

  try {
    console.log(`[Video Engine] 🎨 Rendering High-Impact Dedicated Reel Cover Image (output/cover.jpg)...`);
    await renderReelCoverThumbnail({
      headline: coverHeadline,
      category: badgeText,
      bgFramePath: fs.existsSync(bgFramePath) ? bgFramePath : undefined,
      outputPath: dedicatedCoverPath,
    });
    if (fs.existsSync(dedicatedCoverPath)) {
      try {
        fs.copyFileSync(dedicatedCoverPath, legacyCoverPath);
      } catch {}
    }
  } catch (coverErr: any) {
    console.warn(`[Video Engine Warning] Dedicated cover rendering notice: ${coverErr.message}`);
    if (fs.existsSync(bgFramePath)) {
      try {
        fs.copyFileSync(bgFramePath, dedicatedCoverPath);
        fs.copyFileSync(bgFramePath, legacyCoverPath);
      } catch {}
    }
  }

  // 6. Dynamic Multi-Mood Background Music setup (-22dB / linear volume 0.08)
  const bgMusicPath = selectBackgroundMusicByMood(input.pillarCategory, input.topic);
  const videoHasAudio = await hasAudioStream(motionBgPath);

  // Relative paths for Windows FFmpeg filter compatibility
  const relConcat = path.relative(process.cwd(), subsConcatPath).replace(/\\/g, '/');
  const relBadge = path.relative(process.cwd(), badgeOverlayPath).replace(/\\/g, '/');
  const relCover = path.relative(process.cwd(), dedicatedCoverPath).replace(/\\/g, '/');

  console.log(`[Video Engine] 🚀 Compiling 1080x1920 Clean Kinetic MP4 Reel (Narrative AI Scenes + Bengali Subs + Mood BGM)...`);

  await new Promise<void>((resolve, reject) => {
    let command = ffmpeg();

    if (motionBgPath.endsWith('.txt')) {
      command = command.input(motionBgPath).inputOptions(['-f concat', '-safe 0']);
    } else {
      command = command.input(motionBgPath).inputOptions(['-stream_loop -1']);
    }

    command = command
      .input(relBadge)
      .input(relConcat)
      .inputOptions(['-f concat', '-safe 0'])
      .input(relCover)
      .input(audioPath);

    // Video filter:
    // 1. Scale/crop moving video to 1080x1920
    // 2. Overlay sleek top glass badge (Y:140px, 32px font)
    // 3. Overlay center safe kinetic subtitles (75px, bright yellow, solid black outline, 100% native Bengali shaping)
    // 4. GUARANTEE FRAME 0 COVER: Overlay dedicated high-impact cover at t=0 to 0.45s so Facebook Reels preview FORCES the cover thumbnail!
    const filterGraph: string[] = [
      `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30[bg]`,
      `[bg][1:v]overlay=0:0[vbadge]`,
      `[vbadge][2:v]overlay=0:0[vsub]`,
      `[3:v]scale=1080:1920[vcover]`,
      `[vsub][vcover]overlay=0:0:enable='between(t,0,0.45)'[vout]`,
    ];

    // Audio filter: Voiceover (input 4) mixed with dynamic mood BGM (input 5)
    if (bgMusicPath && fs.existsSync(bgMusicPath)) {
      command = command.input(bgMusicPath).inputOptions(['-stream_loop -1']);
      filterGraph.push(
        `[4:a]volume=1.35[voice]`,
        `[5:a]volume=0.08[bgmusic]`,
        `[voice][bgmusic]amix=inputs=2:duration=first:dropout_transition=2[aout]`
      );
    } else if (videoHasAudio) {
      filterGraph.push(
        `[4:a]volume=1.35[voice]`,
        `[0:a]volume=0.08[bgmusic]`,
        `[voice][bgmusic]amix=inputs=2:duration=first:dropout_transition=2[aout]`
      );
    } else {
      filterGraph.push(`[4:a]volume=1.35[aout]`);
    }

    command
      .complexFilter(filterGraph, ['vout', 'aout'])
      .outputOptions([
        '-c:v libx264',
        '-pix_fmt yuv420p',
        '-r 30',
        '-preset ultrafast',
        '-threads 2',
        '-c:a aac',
        '-b:a 192k',
        `-t ${exactDuration}`,
        '-movflags +faststart',
      ])
      .save(outputPath)
      .on('end', () => resolve())
      .on('error', (err: any) => reject(err));
  });

  let coverThumbnailBuffer: Buffer | undefined;
  const effectiveCover = fs.existsSync(dedicatedCoverPath) ? dedicatedCoverPath : legacyCoverPath;
  if (fs.existsSync(effectiveCover)) {
    try {
      coverThumbnailBuffer = fs.readFileSync(effectiveCover);
    } catch {}
  }

  // 7. Save persistent copy for Web Dashboard preview & immediate playback across all possible root directories
  const previewDirs = [
    path.resolve(process.cwd(), 'data', 'reels'),
    path.resolve(process.cwd(), 'auto-fb-bot', 'data', 'reels'),
    path.resolve(__dirname, '..', '..', 'data', 'reels'),
  ];

  let primaryPreviewVideo = outputPath;
  for (const pDir of previewDirs) {
    try {
      ensureDir(pDir);
      const vPath = path.join(pDir, 'latest_reel.mp4');
      const aPath = path.join(pDir, 'latest_audio.mp3');
      fs.copyFileSync(outputPath, vPath);
      if (fs.existsSync(audioPath)) {
        fs.copyFileSync(audioPath, aPath);
      }
      if (primaryPreviewVideo === outputPath) {
        primaryPreviewVideo = vPath;
      }
    } catch {}
  }
  console.log(`[Video Engine] 💾 Saved persistent preview to ${primaryPreviewVideo}`);

  const videoBuffer = fs.readFileSync(outputPath);
  console.log(
    `[Video Engine] ✅ 1080x1920 30FPS Narrative Reel synthesized successfully! (${(videoBuffer.length / (1024 * 1024)).toFixed(2)} MB, Duration: ${exactDuration.toFixed(1)}s)`
  );

  const cleanup = () => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        console.log(`[Video Engine] 🧹 Cleaned up temporary video working directory.`);
      }
    } catch {}
  };

  return {
    videoPath: fs.existsSync(primaryPreviewVideo) ? primaryPreviewVideo : outputPath,
    videoBuffer,
    durationSeconds: exactDuration,
    voiceModel,
    coverThumbnailPath: effectiveCover,
    coverThumbnailBuffer,
    cleanup,
  };
}
