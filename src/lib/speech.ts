export interface SpeechAlternative {
  transcript: string;
}

export interface SpeechResult {
  isFinal: boolean;
  0: SpeechAlternative;
}

export interface SpeechResultEvent {
  results: ArrayLike<SpeechResult>;
}

export interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechWindow = Window & {
  SpeechRecognition?: new () => BrowserSpeechRecognition;
  webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
};

export function speechRecognitionCtor(): (new () => BrowserSpeechRecognition) | null {
  if (typeof window === 'undefined') return null;
  const host = window as SpeechWindow;
  return host.SpeechRecognition ?? host.webkitSpeechRecognition ?? null;
}

export function canRecordAudio(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
}

export function liveCaptionsAvailable(): boolean {
  return speechRecognitionCtor() !== null;
}
