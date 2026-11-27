import { chunkPcm, joinTranscripts, MAX_TRANSCRIBE_SEC } from './voiceFeedback';

/**
 * On-device transcription. Audio never leaves the browser.
 * The Whisper weights download from Hugging Face the first time
 * (no key, no paid API) and are reused for later memos.
 */
const MODEL_ID = 'Xenova/whisper-tiny.en';

export interface TranscribeProgress {
  label: string;
  percent: number | null;
}

type AsrPipeline = (
  audio: Float32Array,
  options?: { language?: string; task?: string },
) => Promise<{ text: string } | Array<{ text: string }>>;

let modelPromise: Promise<AsrPipeline> | null = null;

async function loadModel(onProgress: (progress: TranscribeProgress) => void): Promise<AsrPipeline> {
  if (!modelPromise) {
    modelPromise = (async () => {
      onProgress({ label: 'Loading the on-device speech model…', percent: null });
      const { pipeline, env } = await import('@huggingface/transformers');
      env.allowLocalModels = false;
      // One thread avoids SharedArrayBuffer, which GitHub Pages does not enable.
      if (env.backends.onnx.wasm) env.backends.onnx.wasm.numThreads = 1;
      const transcriber = await pipeline('automatic-speech-recognition', MODEL_ID, {
        device: 'wasm',
        dtype: 'q8',
        progress_callback: (info) => {
          if (info.status === 'progress') {
            onProgress({
              label: `Downloading ${info.file}`,
              percent: Math.round(info.progress),
            });
          } else if (info.status === 'initiate' || info.status === 'download') {
            onProgress({ label: 'Downloading the on-device speech model…', percent: null });
          } else if (info.status === 'ready') {
            onProgress({ label: 'Model ready', percent: 100 });
          }
        },
      });
      return transcriber as AsrPipeline;
    })().catch((error) => {
      modelPromise = null;
      throw error;
    });
  }
  return modelPromise;
}

export async function decodeTo16k(blob: Blob): Promise<Float32Array> {
  const audioContext = new AudioContext();
  try {
    const decoded = await audioContext.decodeAudioData(await blob.arrayBuffer());
    const length = Math.max(1, Math.ceil(decoded.duration * 16_000));
    const offline = new OfflineAudioContext(1, length, 16_000);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start(0);
    const rendered = await offline.startRendering();
    return rendered.getChannelData(0);
  } finally {
    await audioContext.close();
  }
}

export async function transcribeBlob(blob: Blob, onProgress: (progress: TranscribeProgress) => void): Promise<{ text: string; truncated: boolean }> {
  onProgress({ label: 'Reading the recording…', percent: null });
  const samples = await decodeTo16k(blob);
  const { chunks, truncated } = chunkPcm(samples, 16_000);
  if (chunks.length === 0 || samples.length < 16_000 * 0.3) {
    return { text: '', truncated: false };
  }
  const transcriber = await loadModel(onProgress);
  const parts: string[] = [];
  for (let index = 0; index < chunks.length; index += 1) {
    onProgress({
      label: chunks.length === 1 ? 'Transcribing…' : `Transcribing part ${index + 1} of ${chunks.length}…`,
      percent: Math.round((index / chunks.length) * 100),
    });
    const output = await transcriber(chunks[index], { language: 'english', task: 'transcribe' });
    const text = Array.isArray(output) ? output.map((item) => item.text).join(' ') : output.text;
    parts.push(text);
  }
  onProgress({ label: truncated ? `Transcribed the first ${MAX_TRANSCRIBE_SEC / 60} minutes.` : 'Transcript ready', percent: 100 });
  return { text: joinTranscripts(parts), truncated };
}
