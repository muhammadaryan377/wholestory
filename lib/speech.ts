import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

/** Turns a recorded voice story into words, on the phone only. Returns '' if that isn't possible. */
export async function transcribeFile(uri: string, lang = 'en-GB'): Promise<string> {
  try {
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable() || !ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) return '';
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) return '';
    return await new Promise<string>(resolve => {
      let finalText = '', partial = '';
      const subs: { remove: () => void }[] = [];
      const finish = () => { subs.forEach(s => s.remove()); clearTimeout(timer); resolve((finalText + ' ' + partial).trim()); };
      const timer = setTimeout(() => { try { ExpoSpeechRecognitionModule.stop(); } catch {} finish(); }, 120000);
      subs.push(ExpoSpeechRecognitionModule.addListener('result', (e: any) => {
        const t = e?.results?.[0]?.transcript ?? '';
        if (e?.isFinal) { finalText += ' ' + t; partial = ''; } else partial = t;
      }));
      subs.push(ExpoSpeechRecognitionModule.addListener('end', () => finish()));
      subs.push(ExpoSpeechRecognitionModule.addListener('error', () => finish()));
      ExpoSpeechRecognitionModule.start({ lang, interimResults: true, continuous: true, requiresOnDeviceRecognition: true, audioSource: { uri } });
    });
  } catch {
    return '';
  }
}
