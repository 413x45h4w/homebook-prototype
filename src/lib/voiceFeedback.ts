import type { CategoryId, VoiceFeedback } from './types';
import { uid } from './time';

export const WHISPER_WINDOW_SEC = 30;
export const MAX_TRANSCRIBE_SEC = 10 * 60;

export type { VoiceFeedback };

export interface VoiceFeedbackInput {
  spId: string;
  transcript: string;
  audioId: string;
  mimeType: string;
  source: 'recording' | 'upload';
  rating?: number;
  category?: CategoryId;
  visitId?: string;
  durationSec?: number;
}

export function createVoiceFeedback(
  input: VoiceFeedbackInput,
  now = new Date(),
): { ok: true; note: VoiceFeedback } | { ok: false; reason: string } {
  const transcript = input.transcript.replace(/\s+/g, ' ').trim();
  if (!input.spId.trim()) return { ok: false, reason: 'Choose a provider.' };
  if (!transcript) return { ok: false, reason: 'The transcript is empty. Record, upload, or type what you meant.' };
  if (!input.audioId.trim()) return { ok: false, reason: 'The audio clip is missing.' };
  const rating =
    typeof input.rating === 'number' && input.rating >= 1 && input.rating <= 5 ? Math.round(input.rating) : undefined;
  return {
    ok: true,
    note: {
      id: uid('voice'),
      kind: 'voice',
      spId: input.spId,
      visitId: input.visitId,
      createdAt: now.toISOString(),
      transcript,
      rating,
      category: input.category,
      audioId: input.audioId,
      mimeType: input.mimeType || 'audio/webm',
      durationSec: input.durationSec,
      source: input.source,
    },
  };
}

/** Append-only. Earlier notes are copied through unchanged. */
export function appendVoiceFeedback(notes: VoiceFeedback[], note: VoiceFeedback): VoiceFeedback[] {
  if (notes.some((item) => item.id === note.id)) return notes;
  return [...notes, note];
}

export function chunkPcm(
  samples: Float32Array,
  sampleRate: number,
  windowSec = WHISPER_WINDOW_SEC,
  maxSec = MAX_TRANSCRIBE_SEC,
): { chunks: Float32Array[]; truncated: boolean } {
  const rate = Math.max(1, sampleRate);
  const maxSamples = Math.floor(maxSec * rate);
  const truncated = samples.length > maxSamples;
  const usable = truncated ? samples.subarray(0, maxSamples) : samples;
  const window = Math.max(1, Math.floor(windowSec * rate));
  const chunks: Float32Array[] = [];
  for (let index = 0; index < usable.length; index += window) {
    chunks.push(usable.subarray(index, Math.min(usable.length, index + window)));
  }
  return { chunks, truncated };
}

export function joinTranscripts(parts: string[]): string {
  return parts
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ');
}

export function pickRecorderMime(isSupported: (mime: string) => boolean): string {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac'];
  return types.find((type) => isSupported(type)) ?? '';
}

const AUDIO_EXT = /\.(m4a|mp3|wav|webm|caf|aac|ogg|mp4|mpeg)$/i;

export function isAudioFile(file: { type: string; name: string }): boolean {
  if (file.type.startsWith('audio/')) return true;
  return AUDIO_EXT.test(file.name);
}
