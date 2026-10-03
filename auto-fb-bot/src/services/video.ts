import fs from 'fs';
import path from 'path';
import axios from 'axios';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { EdgeTTS } from 'node-edge-tts';
import { env, isConfiguredForGemini } from '../config/env';
import { renderDynamicReelScenes, DynamicReelSceneData } from './media';

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
 * Builds non-overlapping, center-safe zone ASS subtitles displaying 3-5 words at a time.
 * Position: Y: ~920px (MarginV: 1000 from bottom in 1080x1920).
 * Style: Large bold Hind Siliguri, vibrant yellow text with 4.5px black outline.
 */
export function buildSyncedWordSubtitlesAss(
  cues: WordCue[],
  totalDurationSec: number,
  outputAssPath: string
): void {
  const phrases: { text: string; startMs: number; endMs: number }[] = [];
  let currentGroup: WordCue[] = [];

  for (let i = 0; i < cues.length; i++) {
    currentGroup.push(cues[i]);
    const wordText = cues[i].part.trim();
    const hasPunctuation = /[।?!,]$/.test(wordText);
    const nextCue = cues[i + 1];
    const isLongPause = nextCue && nextCue.start - cues[i].end > 350;
    const isLast = i === cues.length - 1;

    // Group into 3 to 5 words
    if (
      currentGroup.length >= 4 ||
      (currentGroup.length >= 3 && hasPunctuation) ||
      isLongPause ||
      isLast
    ) {
      const phraseText = currentGroup
        .map((c) => c.part.trim())
        .join(' ')
        .replace(/\s+/g, ' ')
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
        cur.endMs = Math.max(cur.startMs + 200, next.startMs - 50);
      } else if (next.startMs - cur.endMs < 120) {
        cur.endMs = next.startMs - 50;
      }
    } else {
      cur.endMs = Math.min(totalDurationSec * 1000, cur.endMs + 250);
    }
  }

  const assHeader = `[Script Info]
Title: ByteBangla Synced Reel Subtitles
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ReelSubtitle,Hind Siliguri,62,&H0000FFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4.5,2.5,2,40,40,920,1

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
  rate: string = '+6%'
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

      await tts.ttsPromise(cleanSpeech, outputAudioPath);

      if (fs.existsSync(outputAudioPath) && fs.statSync(outputAudioPath).size > 1000) {
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
 * Scans the project's `./media/` directory for all available video files (.mp4, .mov, .webm)
 */
export function getAvailableMediaVideos(): string[] {
  const candidateDirs = [
    path.resolve(process.cwd(), '..', 'media'),
    path.resolve(process.cwd(), 'media'),
    'C:\\project file\\FACEBOOK-AUTOMATION\\media',
    path.resolve(__dirname, '../../../../media'),
    path.resolve(__dirname, '../../../media'),
  ];

  for (const dir of candidateDirs) {
    if (fs.existsSync(dir)) {
      try {
        const files = fs
          .readdirSync(dir)
          .filter((f) => /\.(mp4|mov|webm)$/i.test(f))
          .map((f) => path.join(dir, f));
        if (files.length > 0) {
          return files;
        }
      } catch {}
    }
  }

  // Fallback to assets/videos if media/ is empty
  const fallbackDir = path.resolve(process.cwd(), 'assets', 'videos');
  if (fs.existsSync(fallbackDir)) {
    try {
      const files = fs
        .readdirSync(fallbackDir)
        .filter((f) => /\.(mp4|mov|webm)$/i.test(f))
        .map((f) => path.join(fallbackDir, f));
      if (files.length > 0) {
        return files;
      }
    } catch {}
  }

  return [];
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
  const videos = getAvailableMediaVideos();
  if (videos.length === 0) {
    throw new Error('No background video files found in ./media/ directory.');
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
    console.log(`[Video Engine] 🎯 Matched keyword video from ./media/: "${path.basename(picked)}"`);
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
  console.log(`[Video Engine] 🎬 Selected background video from ./media/: "${path.basename(picked)}"`);
  return picked;
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
        '-preset fast',
      ])
      .save(outPath)
      .on('end', () => resolve(outPath))
      .on('error', (err: any) => reject(err));
  });
}

/**
 * Generates a polished, high-converting 9:16 vertical Facebook Reel (MP4)
 * Powered by:
 * 1. True 30fps Video Motion Loops (Pexels / Curated Local MP4s)
 * 2. Transparent Dynamic Glassmorphism UI Cards (Puppeteer)
 * 3. 3-5 Word Non-Overlapping Single-Line Subtitles in Center Safe Zone
 * 4. Human Bengali Voiceover + Ambient Audio Mixing
 */
export async function generateReelVideo(input: ReelGenerationInput): Promise<GeneratedReel> {
  const tempDir = path.resolve(process.cwd(), 'data', 'temp_reels', `reel_${Date.now()}`);
  ensureDir(tempDir);

  const audioPath = path.join(tempDir, 'voiceover.mp3');
  const outputPath = path.join(tempDir, 'output_reel.mp4');

  console.log(`[Video Engine] 🎬 Initiating 100% Synced Motion-Reel for: "${input.topic}"...`);

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

  const voiceSelection = input.voice || 'Puck';
  const voiceRate = input.rate || '+6%';

  const {
    duration: exactDuration,
    model: voiceModel,
    wordCues,
  } = await generateHumanBengaliVoiceover(speechText, audioPath, voiceSelection, voiceRate);

  // 2. Dynamic 4-Scene Pacing Breakdown Synchronized to Voice Duration
  const D = exactDuration;
  const dur1 = Math.max(3.5, Math.round(D * 0.17 * 10) / 10);
  const dur2 = Math.max(4.5, Math.round(D * 0.23 * 10) / 10);
  const dur3 = Math.max(7.0, Math.round(D * 0.33 * 10) / 10);
  const dur4 = Number((D - dur1 - dur2 - dur3).toFixed(2));

  console.log(
    `[Video Engine] 🎞️ 4-Scene Synced Pacing: Scene 1 Problem (${dur1}s) | Scene 2 Tool Reveal (${dur2}s) | Scene 3 Live Solution (${dur3}s) | Scene 4 Save/CTA (${dur4}s) [Total: ${exactDuration.toFixed(1)}s]`
  );

  // 3. Generate Synced Non-Overlapping ASS Subtitles in Center Safe Zone
  const subtitlesPath = path.join(tempDir, 'subtitles.ass');
  buildSyncedWordSubtitlesAss(wordCues, exactDuration, subtitlesPath);

  // 4. Render 4 Distinct Transparent 1080x1920 UI Frames with Puppeteer
  const sceneFrames = await renderDynamicReelScenes(
    {
      topic: input.topic,
      toolBrand: input.toolBrand,
      toolName: input.toolName,
      practicalSnippet: input.practicalSnippet,
      snippetType: input.snippetType,
      targetAudience: input.targetAudience,
      phase1Hook: input.phase1Hook || input.hookText,
      phase2Solution:
        input.phase2Solution ||
        (input.bodyText ? input.bodyText.slice(0, 65) : 'এই স্মার্ট নিয়মটি আজই জেনে রাখুন'),
      phase3Steps:
        input.phase3Steps ||
        (input.bodyText ? input.bodyText.slice(65, 150) : 'সহজ নিয়ম মেনে চললেই সবসময় নিরাপদ থাকবেন'),
      phase4Cta: input.phase4Cta || input.ctaText || '📌 দরকারি এই তথ্যটি পরে কাজে লাগবে, তাই ভিডিওটি এখনই Save করে রাখুন আর বন্ধুদের সাথে Share করুন! এমন প্রতিদিনের চমৎকার সব টিপসের জন্য সাথে থাকুন বাইট বাংলার!',
      pillarCategory: input.pillarCategory,
      twoWordHook: input.twoWordHook,
      actionKeycap: input.actionKeycap,
      actionLabel: input.actionLabel,
    },
    tempDir
  );

  // 5. Select Local Moving Background Video from ./media/
  const motionBgPath = selectMediaBackgroundVideo(input.toolBrand, input.topic);

  // 6. Composite Transparent UI Frames onto Moving 30fps Video Clips from ./media/
  console.log(`[Video Engine] 🎥 Compositing transparent UI cards over moving background video from ./media/...`);
  const v1 = path.join(tempDir, 'scene1.mp4');
  const v2 = path.join(tempDir, 'scene2.mp4');
  const v3 = path.join(tempDir, 'scene3.mp4');
  const v4 = path.join(tempDir, 'scene4.mp4');

  await renderMotionSceneWithOverlay(motionBgPath, sceneFrames.scene1Path, 0, dur1, v1);
  await renderMotionSceneWithOverlay(motionBgPath, sceneFrames.scene2Path, 5, dur2, v2);
  await renderMotionSceneWithOverlay(motionBgPath, sceneFrames.scene3Path, 11, dur3, v3);
  await renderMotionSceneWithOverlay(motionBgPath, sceneFrames.scene4Path, 18, dur4, v4);

  const concatListPath = path.join(tempDir, 'motion_concat.txt');
  fs.writeFileSync(
    concatListPath,
    [
      `file '${v1.replace(/\\/g, '/')}'`,
      `file '${v2.replace(/\\/g, '/')}'`,
      `file '${v3.replace(/\\/g, '/')}'`,
      `file '${v4.replace(/\\/g, '/')}'`,
    ].join('\n')
  );

  // 7. Multiplex 4-Scene Motion Video with Word Subtitles, Voiceover and Ambient Audio
  const bgMusicPath = path.resolve(process.cwd(), 'assets', 'audio', 'ambient_tech_bg.mp3');
  const hasBgMusic = fs.existsSync(bgMusicPath);
  const videoHasAudio = await hasAudioStream(motionBgPath);

  // Use relative path to avoid any Windows colon escaping issues in FFmpeg filter
  const relAss = path.relative(process.cwd(), subtitlesPath).replace(/\\/g, '/');
  const relFonts = path.relative(process.cwd(), path.resolve(process.cwd(), 'assets', 'fonts')).replace(/\\/g, '/');

  console.log(`[Video Engine] 🚀 Compiling 1080x1920 MP4 Video with Center Subtitles & Audio Mix...`);

  await new Promise<void>((resolve, reject) => {
    let command = ffmpeg()
      .input(concatListPath)
      .inputOptions(['-f concat', '-safe 0'])
      .input(audioPath);

    const filterGraph: string[] = [
      `[0:v]subtitles=${relAss}:fontsdir=${relFonts}[vout]`,
    ];

    if (videoHasAudio) {
      // Mix the video's original ambient sound smoothly with voiceover
      command = command.input(motionBgPath).inputOptions(['-stream_loop -1']);
      filterGraph.push(
        `[1:a]volume=1.35[voice]`,
        `[2:a]volume=0.08[bg]`,
        `[voice][bg]amix=inputs=2:duration=first:dropout_transition=2[aout]`
      );
    } else if (hasBgMusic) {
      // Fallback ambient tech BGM
      command = command.input(bgMusicPath);
      filterGraph.push(
        `[1:a]volume=1.35[voice]`,
        `[2:a]volume=0.08[bg]`,
        `[voice][bg]amix=inputs=2:duration=first:dropout_transition=2[aout]`
      );
    } else {
      filterGraph.push(`[1:a]volume=1.35[aout]`);
    }

    command
      .complexFilter(filterGraph, ['vout', 'aout'])
      .outputOptions([
        '-c:v libx264',
        '-pix_fmt yuv420p',
        '-r 30',
        '-preset fast',
        '-c:a aac',
        '-b:a 192k',
        `-t ${exactDuration}`,
      ])
      .save(outputPath)
      .on('end', () => resolve())
      .on('error', (err: any) => reject(err));
  });

  const videoBuffer = fs.readFileSync(outputPath);
  console.log(
    `[Video Engine] ✅ 1080x1920 30FPS True-Motion Reel synthesized successfully! (${(videoBuffer.length / (1024 * 1024)).toFixed(2)} MB)`
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
    cleanup,
  };
}
