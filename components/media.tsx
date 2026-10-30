import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { C, F } from '@/lib/theme';
import { viewUrl, eventUrl } from '@/lib/media';
import { transcribeFile } from '@/lib/speech';
import { Btn, Field, Small, st } from './ui';
import type { Draft, Picked } from '@/lib/api';

export const fmt = (ms: number) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/** Reads the place and time saved in a photo, if there is one. */
export function fromAsset(a: ImagePicker.ImagePickerAsset): Picked {
  const ex: any = a.exif ?? {};
  const gps = ex['{GPS}'] ?? ex;
  let lat = gps.Latitude ?? gps.GPSLatitude, lng = gps.Longitude ?? gps.GPSLongitude;
  const latRef = gps.LatitudeRef ?? gps.GPSLatitudeRef, lngRef = gps.LongitudeRef ?? gps.GPSLongitudeRef;
  if (typeof lat === 'number' && latRef === 'S') lat = -lat;
  if (typeof lng === 'number' && lngRef === 'W') lng = -lng;
  const dt: string | undefined = ex['{Exif}']?.DateTimeOriginal ?? ex.DateTimeOriginal;
  const takenAt = dt ? dt.replace(/^(\d{4}):(\d{2}):(\d{2}) /, '$1-$2-$3T') : null;
  return { uri: a.uri, lat: typeof lat === 'number' ? lat : null, lng: typeof lng === 'number' ? lng : null, takenAt };
}

/** A photo stored in Wholestory (private story file or event file). */
export function Photo({ path, event, size = 96, style }: { path: string; event?: boolean; size?: number; style?: any }) {
  const [resolved, setResolved] = useState<{ path: string; uri: string } | null>(null);
  const uri = event ? eventUrl(path) : resolved?.path === path ? resolved.uri : '';
  useEffect(() => {
    let active = true;
    const resolve = event ? Promise.resolve(eventUrl(path)) : viewUrl(path);
    resolve.then(url => { if (active) setResolved({ path, uri: url }); }).catch(() => {});
    return () => { active = false; };
  }, [path, event]);
  return <Image source={uri ? { uri } : undefined} style={[{ width: size, height: size, borderRadius: 10, backgroundColor: '#E9E4D9' }, style]} contentFit="cover" transition={150} />;
}

export function VoicePlayer({ path, event, durationMs, transcript }: { path: string; event?: boolean; durationMs?: number | null; transcript?: string | null }) {
  const [resolved, setResolved] = useState<{ path: string; uri: string } | null>(null);
  const uri = event ? eventUrl(path) : resolved?.path === path ? resolved.uri : null;
  const [showWords, setShowWords] = useState(false);
  useEffect(() => {
    let active = true;
    const resolve = event ? Promise.resolve(eventUrl(path)) : viewUrl(path);
    resolve.then(url => { if (active) setResolved({ path, uri: url }); }).catch(() => {});
    return () => { active = false; };
  }, [path, event]);
  const player = useAudioPlayer(uri ? { uri } : null);
  const status = useAudioPlayerStatus(player);
  const playing = status.playing;
  return (
    <View>
      <Pressable onPress={async () => { await setAudioModeAsync({ playsInSilentMode: true }); if (playing) player.pause(); else { if (status.didJustFinish || status.currentTime >= (status.duration || 0)) player.seekTo(0); player.play(); } }}
        accessibilityLabel={playing ? 'Pause voice story' : 'Play voice story'}
        style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.greenSoft, borderRadius: 20, paddingVertical: 6, paddingLeft: 6, paddingRight: 14, alignSelf: 'flex-start', marginTop: 8 }}>
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
          <Text style={{ color: C.white, fontSize: 12 }}>{playing ? '❚❚' : '▶'}</Text>
        </View>
        <Text style={{ fontFamily: F.sansBold, color: C.green, fontSize: 13 }}>Voice story · {fmt(durationMs ?? (status.duration || 0) * 1000)}</Text>
      </Pressable>
      {transcript ? (
        <Pressable onPress={() => setShowWords(!showWords)}>
          {showWords ? <Text style={{ fontFamily: F.serifItalic, fontSize: 15, color: C.ink, marginTop: 6, lineHeight: 21 }}>“{transcript}”</Text>
            : <Small style={{ marginTop: 6, color: C.green }}>Show the words</Small>}
        </Pressable>
      ) : null}
    </View>
  );
}

/** Pick photos, record or type: used for new stories, story updates and event posts. */
export function Composer({ draft, setDraft, prompt }: { draft: Draft; setDraft: (d: Draft) => void; prompt?: string }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const rec = useAudioRecorderState(recorder, 250);
  const localPlayer = useAudioPlayer(draft.audioUri ? { uri: draft.audioUri } : null);
  const localStatus = useAudioPlayerStatus(localPlayer);
  const [listening, setListening] = useState(false);

  const pick = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 30, quality: 0.85, exif: true });
    if (!r.canceled) setDraft({ ...draft, photos: [...draft.photos, ...r.assets.map(fromAsset)] });
  };
  const camera = async () => {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) return Alert.alert('Camera not allowed', 'You can allow the camera for Wholestory in your phone Settings.');
    const r = await ImagePicker.launchCameraAsync({ quality: 0.85, exif: true });
    if (!r.canceled) setDraft({ ...draft, photos: [...draft.photos, ...r.assets.map(fromAsset)] });
  };
  const toggleRec = async () => {
    if (rec.isRecording) {
      await recorder.stop();
      const uri = recorder.uri, ms = rec.durationMillis;
      const next = { ...draft, audioUri: uri, durationMs: ms, transcript: '' };
      setDraft(next);
      if (uri) { setListening(true); const words = await transcribeFile(uri); setListening(false); if (words) setDraft({ ...next, transcript: words }); }
      return;
    }
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) return Alert.alert('Microphone not allowed', 'You can allow the microphone for Wholestory in your phone Settings.');
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
  };
  const removeVoice = () => Alert.alert('Delete this recording?', '', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => setDraft({ ...draft, audioUri: null, durationMs: 0, transcript: '' }) }]);

  return (
    <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        {draft.photos.map((p, i) => (
          <View key={p.uri + i}>
            <Image source={{ uri: p.uri }} style={{ width: 74, height: 74, borderRadius: 10 }} contentFit="cover" />
            <Pressable onPress={() => setDraft({ ...draft, photos: draft.photos.filter((_, j) => j !== i) })} accessibilityLabel="Remove photo"
              style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line }}>
              <Text style={{ fontSize: 12, color: C.ink }}>✕</Text>
            </Pressable>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn title="Choose photos" kind="outline" onPress={pick} style={{ flex: 1 }} />
        <Btn title="Camera" kind="outline" onPress={camera} style={{ flex: 0.6 }} />
      </View>
      <View style={[st.card, { alignItems: 'center', marginTop: 8 }]}>
        {prompt ? <Text style={{ fontFamily: F.serifItalic, fontSize: 16, color: C.ink, textAlign: 'center', marginBottom: 8 }}>“{prompt}”</Text> : null}
        <Pressable onPress={toggleRec} accessibilityLabel={rec.isRecording ? 'Stop recording' : 'Record your voice'}
          style={{ width: 86, height: 86, borderRadius: 43, backgroundColor: rec.isRecording ? C.red : '#C0533E', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: C.white, fontSize: rec.isRecording ? 22 : 30 }}>{rec.isRecording ? '■' : '🎙'}</Text>
        </Pressable>
        <Small style={{ marginTop: 8 }}>{rec.isRecording ? `Recording ${fmt(rec.durationMillis)} · tap to stop` : draft.audioUri ? `Recorded ${fmt(draft.durationMs)}` : 'Tap to tell it in your own voice'}</Small>
        {draft.audioUri && !rec.isRecording ? (
          <View style={{ flexDirection: 'row', gap: 18 }}>
            <Btn kind="link" title={localStatus.playing ? 'Pause' : 'Play it back'} onPress={async () => { await setAudioModeAsync({ playsInSilentMode: true }); if (localStatus.playing) localPlayer.pause(); else { localPlayer.seekTo(0); localPlayer.play(); } }} />
            <Pressable onPress={removeVoice} style={{ paddingVertical: 10 }}><Text style={{ fontFamily: F.sansMedium, color: C.red, textDecorationLine: 'underline' }}>Delete recording</Text></Pressable>
          </View>
        ) : null}
        {listening ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><ActivityIndicator color={C.green} /><Small>Turning your words into text…</Small></View> : null}
      </View>
      {draft.audioUri && draft.transcript ? (
        <Field label="Your words, from the recording (you can edit them)" multiline value={draft.transcript} onChangeText={t => setDraft({ ...draft, transcript: t })} />
      ) : null}
      <Field placeholder="Or write a few words…" multiline value={draft.text} onChangeText={t => setDraft({ ...draft, text: t })} />
    </View>
  );
}
