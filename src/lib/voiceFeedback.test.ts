import { describe, expect, it } from 'vitest';
import {
  appendVoiceFeedback,
  chunkPcm,
  createVoiceFeedback,
  isAudioFile,
  joinTranscripts,
  pickRecorderMime,
  type VoiceFeedback,
} from './voiceFeedback';

const base = {
  spId: 'sp-maria',
  transcript: '  She missed under the bed again.  ',
  audioId: 'aud-1',
  mimeType: 'audio/webm',
  source: 'recording' as const,
};

describe('createVoiceFeedback', () => {
  it('turns a transcript into an append-only voice note', () => {
    const now = new Date('2026-11-26T15:04:00.000Z');
    const result = createVoiceFeedback({ ...base, rating: 4.2, category: 'laundry' }, now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.note.kind).toBe('voice');
    expect(result.note.spId).toBe('sp-maria');
    expect(result.note.transcript).toBe('She missed under the bed again.');
    expect(result.note.rating).toBe(4);
    expect(result.note.category).toBe('laundry');
    expect(result.note.createdAt).toBe(now.toISOString());
    expect(result.note.audioId).toBe('aud-1');
    expect(result.note.id.startsWith('voice-')).toBe(true);
  });

  it('allows a note with no rating and no category', () => {
    const result = createVoiceFeedback({ ...base, rating: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.note.rating).toBeUndefined();
    expect(result.note.category).toBeUndefined();
  });

  it('rejects an empty transcript or a missing provider', () => {
    expect(createVoiceFeedback({ ...base, transcript: '   ' }).ok).toBe(false);
    expect(createVoiceFeedback({ ...base, spId: ' ' }).ok).toBe(false);
    expect(createVoiceFeedback({ ...base, audioId: '' }).ok).toBe(false);
  });
});

describe('appendVoiceFeedback', () => {
  it('keeps earlier notes and adds the new one at the end', () => {
    const first: VoiceFeedback = {
      id: 'voice-a',
      kind: 'voice',
      spId: 'sp-maria',
      createdAt: '2026-11-01T12:00:00.000Z',
      transcript: 'First memo',
      audioId: 'aud-a',
      mimeType: 'audio/webm',
      source: 'upload',
    };
    const second: VoiceFeedback = { ...first, id: 'voice-b', transcript: 'Second memo', createdAt: '2026-11-02T12:00:00.000Z' };
    const next = appendVoiceFeedback([first], second);
    expect(next).toHaveLength(2);
    expect(next[0]).toBe(first);
    expect(next[0].transcript).toBe('First memo');
    expect(next[1].transcript).toBe('Second memo');
    expect(appendVoiceFeedback(next, second)).toBe(next);
  });
});

describe('audio helpers', () => {
  it('splits long audio into 30 second windows and caps the length', () => {
    const samples = new Float32Array(16_000 * 45);
    const { chunks, truncated } = chunkPcm(samples, 16_000, 30, 600);
    expect(truncated).toBe(false);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(16_000 * 30);
    expect(chunks[1]).toHaveLength(16_000 * 15);

    const long = new Float32Array(16_000 * 700);
    const capped = chunkPcm(long, 16_000, 30, 600);
    expect(capped.truncated).toBe(true);
    expect(capped.chunks).toHaveLength(20);
  });

  it('joins transcript pieces and picks a recorder mime', () => {
    expect(joinTranscripts(['  hello ', '', 'there  '])).toBe('hello there');
    expect(pickRecorderMime((mime) => mime === 'audio/mp4')).toBe('audio/mp4');
    expect(pickRecorderMime(() => false)).toBe('');
    expect(isAudioFile({ type: '', name: 'Memo.m4a' })).toBe(true);
    expect(isAudioFile({ type: 'audio/mpeg', name: 'note' })).toBe(true);
    expect(isAudioFile({ type: 'image/png', name: 'photo.png' })).toBe(false);
  });
});
