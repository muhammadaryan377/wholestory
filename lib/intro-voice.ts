import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { Alert } from '@/lib/alert';

export type VoicePhase = 'idle' | 'recording' | 'recorded';

const OPTIONS = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };

/**
 * The "Try it" voice demo on the intro. Records a short clip, lets the person play it back and record again.
 * The clip only lives in the app's temporary cache: nothing is uploaded or saved to an account.
 */
export function useIntroVoice() {
  const recorder = useAudioRecorder(OPTIONS);
  const rec = useAudioRecorderState(recorder, 100);
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [uri, setUri] = useState<string | null>(null);
  const [clipMs, setClipMs] = useState(0);
  const busy = useRef(false);
  const player = useAudioPlayer(uri ? { uri } : null);
  const status = useAudioPlayerStatus(player);

  const start = useCallback(async () => {
    if (busy.current || recorder.isRecording) return;
    busy.current = true;
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Microphone not allowed', 'You can allow the microphone for Whole Story in your phone Settings.');
        return;
      }
      player.pause();
      setUri(null);
      setClipMs(0);
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setPhase('recording');
    } catch (error) {
      Alert.alert('Could not record', error instanceof Error ? error.message : 'Please try again.');
      setPhase('idle');
    } finally {
      busy.current = false;
    }
  }, [player, recorder]);

  const stop = useCallback(async () => {
    if (busy.current || !recorder.isRecording) return;
    busy.current = true;
    try {
      const ms = recorder.getStatus().durationMillis;
      await recorder.stop();
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      const out = recorder.uri;
      if (out) { setUri(out); setClipMs(ms); setPhase('recorded'); } else setPhase('idle');
    } catch (error) {
      Alert.alert('Could not stop recording', error instanceof Error ? error.message : 'Please try again.');
      setPhase('idle');
    } finally {
      busy.current = false;
    }
  }, [recorder]);

  const togglePlay = useCallback(async () => {
    if (!uri || !status.isLoaded) return;
    if (status.playing) { player.pause(); return; }
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration - 0.05)) await player.seekTo(0);
    player.play();
  }, [uri, status.isLoaded, status.playing, status.didJustFinish, status.duration, status.currentTime, player]);

  /** Called when the person leaves the voice page: stop any playback and finish a running recording (keeping the clip). */
  const leave = useCallback(() => {
    try { player.pause(); } catch { /* player already released */ }
    if (recorder.isRecording) void stop();
  }, [player, recorder, stop]);

  const latest = useRef({ player, recorder });
  useEffect(() => { latest.current = { player, recorder }; });
  useEffect(() => () => {
    const { player: p, recorder: r } = latest.current;
    try { p.pause(); } catch { /* already released */ }
    try { if (r.isRecording) void r.stop().catch(() => {}); } catch { /* already released */ }
    void setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
  }, []);

  const recording = phase === 'recording';
  const metering = typeof rec.metering === 'number' ? rec.metering : null;
  // metering is in dB (about -160 silent to 0 loudest); speech sits roughly between -50 and -5
  const level = recording ? (metering === null ? 0.5 : Math.min(1, Math.max(0, (metering + 50) / 45))) : 0;
  const progress = status.duration > 0 ? Math.min(1, status.currentTime / status.duration) : 0;

  return {
    phase,
    recording,
    playing: status.playing,
    level,
    progress,
    durationMs: recording ? rec.durationMillis : clipMs,
    start,
    stop,
    togglePlay,
    leave,
  };
}
