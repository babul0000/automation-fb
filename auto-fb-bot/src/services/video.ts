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
 * Dynamically picks a video from `./media/`:
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
 * Composites a transparent UI frame PNG on top of a 1080x1920 @ 30fps looped video
 */
function renderMotionSceneWithOverlay(
  bgVideoPath: string,
  scenePngPath: string,
  startOffsetSec: number,
  durationSec: number,
  outPath: string
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    ffmpeg()
      .input(bgVideoPath)
      .inputOptions([`-ss ${startOffsetSec}`, '-stream_loop -1'])
      .input(scenePngPath)
      .complexFilter(
        [
          '[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30,colorchannelmixer=rr=0.75:gg=0.75:bb=0.75[bg]',
          '[bg][1:v]overlay=0:0[vout]',
        ],
        ['vout']
      )
      .outputOptions([
        `-t ${durationSec}`,
        '-pix_fmt yuv420p',
        '-c:v libx264',
        '-r 30',
        '-preset ultrafast',
        '-threads 2',
      ])
      .save(outPath)
      .on('end', () => resolve(outPath))
      .on('error', (err: any) => reject(err));
  });
}

/**
 * Generates a polished, high-converting 9:16 vertical Facebook Reel (MP4)
 * Powered by:
 * 1. 100% Real High-Quality Moving Background Video dynamically picked from ./media/ (ZERO static image cards)
 * 2. Top-center: Single sleek floating glass badge indicating the trend / topic
 * 3. Center Safe Zone (MarginV: 920): Large, bold, single-line kinetic subtitles (Hind Siliguri Bold, 65px, vibrant yellow with 4px black outline)
 * 4. Microsoft Edge Neural Voiceover (bn-BD-PradeepNeural at +8% speed) with ambient background music (-22dB)
 */
export async function generateReelVideo(input: ReelGenerationInput): Promise<GeneratedReel> {
  const tempDir = path.resolve(process.cwd(), 'data', 'temp_reels', `reel_${Date.now()}`);
  ensureDir(tempDir);

  const audioPath = path.join(tempDir, 'voiceover.mp3');
  const outputPath = path.join(tempDir, 'output_reel.mp4');

  console.log(`[Video Engine] 🎬 Initiating 100% Kinetic Moving-Reel for: "${input.topic}"...`);

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

  // 3. Render ONLY the Single Sleek Top Floating Glass Badge (Zero ugly static cards)
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

  // 4. Select Local Moving Background Video from ./media/
  const motionBgPath = selectMediaBackgroundVideo(input.toolBrand, input.topic);

  // 5. Extract background frame from video at t=0.5s to generate custom cover
  const bgFramePath = path.join(tempDir, 'bg_frame.jpg');
  await new Promise<void>((resolve) => {
    ffmpeg(motionBgPath)
      .seekInput(0.5)
      .frames(1)
      .outputOptions(['-q:v 2'])
      .save(bgFramePath)
      .on('end', () => resolve())
      .on('error', () => resolve());
  });

  // 6. Enforce High-Impact Dedicated Reel Cover Thumbnail (output/cover.jpg)
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

  // 7. Dynamic Multi-Mood Background Music setup (-22dB / linear volume 0.08)
  const bgMusicPath = selectBackgroundMusicByMood(input.pillarCategory, input.topic);
  const videoHasAudio = await hasAudioStream(motionBgPath);

  // Relative paths for Windows FFmpeg filter compatibility
  const relConcat = path.relative(process.cwd(), subsConcatPath).replace(/\\/g, '/');
  const relBadge = path.relative(process.cwd(), badgeOverlayPath).replace(/\\/g, '/');
  const relCover = path.relative(process.cwd(), dedicatedCoverPath).replace(/\\/g, '/');

  console.log(`[Video Engine] 🚀 Compiling 1080x1920 Clean Kinetic MP4 Reel (Frame 0 Cover Baked + 75px Unbroken Bengali Subs + Mood BGM)...`);

  await new Promise<void>((resolve, reject) => {
    let command = ffmpeg()
      .input(motionBgPath)
      .inputOptions(['-stream_loop -1'])
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

  const videoBuffer = fs.readFileSync(outputPath);
  console.log(
    `[Video Engine] ✅ 1080x1920 30FPS Clean Kinetic Reel synthesized successfully! (${(videoBuffer.length / (1024 * 1024)).toFixed(2)} MB, Duration: ${exactDuration.toFixed(1)}s)`
  );

  const cleanup = () => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  };

  return {
    videoPath: outputPath,
    videoBuffer,
    durationSeconds: exactDuration,
    voiceModel,
    coverThumbnailPath: effectiveCover,
    coverThumbnailBuffer,
    cleanup,
  };
}
