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
  targetAudience?: 'OFFICE' | 'STUDENTS' | 'FREELANCERS';
  toolName?: string;
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
 * Primary: Google Gemini 3.8/2.5 Flash Neural Voice.
 * Fallback: Microsoft Azure Neural Voice (bn-BD-NabanitaNeural).
 */
export async function generateHumanBengaliVoiceover(
  fullSpeech: string,
  outputAudioPath: string,
  voice: string = 'Puck',
  rate: string = '+6%'
): Promise<{ duration: number; model: string }> {
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

  // Primary: Google Gemini Neural Voice
  if (isConfiguredForGemini()) {
    try {
      const selectedVoice = ['Puck', 'Aoede', 'Kore', 'Fenrir'].includes(voice) ? voice : 'Puck';
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
          return { duration, model: `Google Gemini Neural Voice (${selectedVoice})` };
        }
      }
    } catch (geminiTtsErr: any) {
      console.warn(`[Video Engine Notice] Gemini TTS fallback to Edge Neural: ${geminiTtsErr.message}`);
    }
  }

  // Fallback: Microsoft Edge Neural Voice
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
      return { duration, model: `Microsoft Azure Neural (${edgeVoice})` };
    }
  } catch (azureErr: any) {
    console.warn(`[Video Engine Notice] Primary Azure voice error: ${azureErr.message}`);
  }

  // Backup fallback
  try {
    const tts = new EdgeTTS({ voice: 'bn-BD-PradeepNeural', rate, pitch: '+0Hz' });
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

/**
 * Renders subtle, cinematic camera motion (Ken Burns zoom/pan) on a 1080x1920 frame.
 */
function renderMotionScene(
  imgPath: string,
  durationSec: number,
  outPath: string,
  motionType: 'zoomIn' | 'zoomOut' | 'focusIn'
): Promise<string> {
  const frames = Math.round(durationSec * 30);
  let zoomFilter = `zoompan=z='min(zoom+0.0006,1.05)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30`;
  if (motionType === 'zoomOut') {
    zoomFilter = `zoompan=z='max(1.05-0.0006*on,1.0)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30`;
  } else if (motionType === 'focusIn') {
    zoomFilter = `zoompan=z='min(zoom+0.0004,1.03)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30`;
  }

  return new Promise<string>((resolve, reject) => {
    ffmpeg(imgPath)
      .loop(durationSec)
      .videoFilters([
        'scale=1120:1990:force_original_aspect_ratio=increase',
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
}

/**
 * Generates a polished, high-converting 9:16 vertical Facebook Reel (MP4)
 * Powered by 4-Scene Dynamic State-Driven Video Template synced with audio phases:
 * 1. Scene 1: The Problem State (0s – 5s)
 * 2. Scene 2: The Tool Reveal (5s – 12s)
 * 3. Scene 3: The Live Solution & Shortcut (12s – 22s)
 * 4. Scene 4: Viral Save & CTA State (22s – 30s)
 */
export async function generateReelVideo(input: ReelGenerationInput): Promise<GeneratedReel> {
  const tempDir = path.resolve(process.cwd(), 'data', 'temp_reels', `reel_${Date.now()}`);
  ensureDir(tempDir);

  const audioPath = path.join(tempDir, 'voiceover.mp3');
  const outputPath = path.join(tempDir, 'output_reel.mp4');

  console.log(`[Video Engine] 🎬 Initiating 100% Synced 4-Scene Bengali Reel for: "${input.topic}"...`);

  // 1. Synthesize Human Neural Voiceover
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

  const { duration: exactDuration, model: voiceModel } = await generateHumanBengaliVoiceover(
    speechText,
    audioPath,
    voiceSelection,
    voiceRate
  );

  // 2. Dynamic 4-Scene Pacing Breakdown Synchronized to Voice Duration
  // Scene 1 Problem: ~17% (~4.5s – 5.5s)
  // Scene 2 Tool Reveal: ~23% (~6.5s – 7.5s)
  // Scene 3 Live Solution: ~33% (~9.5s – 11.0s)
  // Scene 4 Viral Save & CTA: Remainder (~7.5s – 9.0s)
  const D = exactDuration;
  const dur1 = Math.max(3.5, Math.round(D * 0.17 * 10) / 10);
  const dur2 = Math.max(4.5, Math.round(D * 0.23 * 10) / 10);
  const dur3 = Math.max(7.0, Math.round(D * 0.33 * 10) / 10);
  const dur4 = Number((D - dur1 - dur2 - dur3).toFixed(2));

  console.log(
    `[Video Engine] 🎞️ 4-Scene Synced Pacing: Scene 1 Problem (${dur1}s) | Scene 2 Tool Reveal (${dur2}s) | Scene 3 Live Solution (${dur3}s) | Scene 4 Save/CTA (${dur4}s) [Total: ${exactDuration.toFixed(1)}s]`
  );

  // 3. Render 4 Distinct Full-Screen 1080x1920 State Frames with Puppeteer
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
        (input.bodyText ? input.bodyText.slice(0, 65) : 'এই স্মার্ট অফিশিয়াল টুলটি আজই ব্যবহার করুন'),
      phase3Steps:
        input.phase3Steps ||
        (input.bodyText ? input.bodyText.slice(65, 150) : 'সহজ শর্টকাট প্রেস করলেই ১ সেকেন্ডে সমাধান পেয়ে যাবেন'),
      phase4Cta: input.phase4Cta || input.ctaText || 'ভিডিওটি সেভ করে রাখুন এবং লিঙ্ক পেতে কমেন্টে AI লিখুন!',
    },
    tempDir
  );

  // 4. Render 4 Dynamic Motion Video Clips (1080x1920 at 30fps)
  console.log(`[Video Engine] 🎥 Rendering smooth camera motion for all 4 synced scenes...`);
  const v1 = path.join(tempDir, 'scene1.mp4');
  const v2 = path.join(tempDir, 'scene2.mp4');
  const v3 = path.join(tempDir, 'scene3.mp4');
  const v4 = path.join(tempDir, 'scene4.mp4');

  await renderMotionScene(sceneFrames.scene1Path, dur1, v1, 'zoomIn');
  await renderMotionScene(sceneFrames.scene2Path, dur2, v2, 'zoomOut');
  await renderMotionScene(sceneFrames.scene3Path, dur3, v3, 'zoomIn');
  await renderMotionScene(sceneFrames.scene4Path, dur4, v4, 'focusIn');

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

  // 5. Multiplex 4-Scene Motion Video with Voiceover and Ambient Tech Music
  const bgMusicPath = path.resolve(process.cwd(), 'assets', 'audio', 'ambient_tech_bg.mp3');
  const hasBgMusic = fs.existsSync(bgMusicPath);

  console.log(`[Video Engine] 🚀 Compiling 1080x1920 MP4 Video with 4-Scene Transitions & Audio Mix...`);

  await new Promise<void>((resolve, reject) => {
    let command = ffmpeg()
      .input(concatListPath)
      .inputOptions(['-f concat', '-safe 0'])
      .input(audioPath);

    if (hasBgMusic) {
      command = command
        .input(bgMusicPath)
        .complexFilter(
          [
            `[0:v]null[vout]`,
            `[1:a]volume=1.35[voice]`,
            `[2:a]volume=0.08[bg]`,
            `[voice][bg]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
          ],
          ['vout', 'aout']
        );
    } else {
      command = command.complexFilter(
        [
          `[0:v]null[vout]`,
          `[1:a]volume=1.35[aout]`,
        ],
        ['vout', 'aout']
      );
    }

    command
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
    `[Video Engine] ✅ 1080x1920 4-Scene Synced Reel synthesized successfully! (${(videoBuffer.length / (1024 * 1024)).toFixed(2)} MB)`
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
