import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { View } from 'react-native';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { viewUrl } from '@/lib/media';
import { C, F } from '@/lib/theme';
import type { MapCluster } from '@/lib/story-display';
import type { EventMapPin, StoryMapHandle, StoryMapProps } from './story-map-view';

export type { EventMapPin, StoryMapHandle, StoryMapProps };
export const STORY_MAP_AVAILABLE = true;

const PIN_WIDTH = 116, PIN_HEIGHT = 96;

/** Story titles can come from other people, so pins use text nodes rather than an HTML string. */
function pinElement(cluster: MapCluster, selected: boolean, photo: string | undefined) {
  const size = selected ? 64 : 56, ring = size + 6;
  const root = document.createElement('div');
  root.style.cssText = `width:${PIN_WIDTH}px;display:flex;flex-direction:column;align-items:center;padding-top:8px;cursor:pointer;`;
  const holder = document.createElement('div');
  holder.style.cssText = 'position:relative;';
  const circle = document.createElement('div');
  circle.style.cssText = `width:${ring}px;height:${ring}px;box-sizing:border-box;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 5px #0005;${selected ? `border:2px solid ${C.green};` : ''}`;
  const image = document.createElement(photo ? 'img' : 'div') as HTMLImageElement;
  image.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;background:${C.greenSoft};`;
  if (photo) { image.src = photo; image.alt = ''; }
  circle.append(image);
  const badge = document.createElement('div');
  badge.textContent = String(cluster.photos);
  badge.style.cssText = `position:absolute;top:-6px;right:-8px;min-width:26px;height:26px;box-sizing:border-box;padding:0 5px;border-radius:13px;border:2px solid #fff;background:${C.green};color:#fff;font:12px ${F.sansBold},sans-serif;display:flex;align-items:center;justify-content:center;`;
  holder.append(circle, badge);
  const label = document.createElement('div');
  label.textContent = cluster.label;
  label.style.cssText = `max-width:${PIN_WIDTH}px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${C.navy};font:13px ${F.sansBold},sans-serif;text-shadow:0 0 4px #fff,0 0 4px #fff;`;
  root.append(holder, label);
  return root;
}

export const StoryMapView = forwardRef<StoryMapHandle, StoryMapProps>(function StoryMapView({ region, clusters, selectedIds, eventPin, onZoomChange, onPick, onBackgroundPress }, ref) {
  const node = useRef<any>(null);
  const map = useRef<L.Map | null>(null);
  const pins = useRef<L.LayerGroup | null>(null);
  const you = useRef<L.CircleMarker | null>(null);
  const handlers = useRef({ onZoomChange, onPick, onBackgroundPress });
  const [urls, setUrls] = useState<Record<string, string>>({});
  const initial = useRef(region);
  useEffect(() => { handlers.current = { onZoomChange, onPick, onBackgroundPress }; });

  useEffect(() => {
    const r = initial.current;
    const instance = L.map(node.current as HTMLElement, { zoomControl: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(instance);
    instance.fitBounds([[r.latitude - r.latitudeDelta / 2, r.longitude - r.longitudeDelta / 2], [r.latitude + r.latitudeDelta / 2, r.longitude + r.longitudeDelta / 2]], { maxZoom: 12 });
    pins.current = L.layerGroup().addTo(instance);
    const report = () => {
      const bounds = instance.getBounds();
      handlers.current.onZoomChange({ latitudeDelta: bounds.getNorth() - bounds.getSouth(), longitudeDelta: bounds.getEast() - bounds.getWest() });
    };
    instance.on('zoomend', report);
    instance.on('click', () => handlers.current.onBackgroundPress());
    map.current = instance;
    report();
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(node.current as HTMLElement);
    return () => { observer.disconnect(); instance.remove(); map.current = null; pins.current = null; you.current = null; };
  }, []);

  useEffect(() => {
    let active = true;
    const missing = [...new Set(clusters.flatMap(cluster => cluster.cover ? [cluster.cover] : []))].filter(path => !urls[path]);
    if (missing.length) Promise.all(missing.map(path => viewUrl(path).then(url => [path, url] as const).catch(() => null))).then(found => {
      if (active) setUrls(current => ({ ...current, ...Object.fromEntries(found.filter(entry => entry !== null)) }));
    });
    return () => { active = false; };
  }, [clusters, urls]);

  useEffect(() => {
    const layer = pins.current;
    if (!layer) return;
    layer.clearLayers();
    for (const cluster of clusters) {
      const selected = cluster.stories.some(story => selectedIds.includes(story.id));
      const icon = L.divIcon({ html: pinElement(cluster, selected, cluster.cover ? urls[cluster.cover] : undefined), className: '', iconSize: [PIN_WIDTH, PIN_HEIGHT], iconAnchor: [PIN_WIDTH / 2, PIN_HEIGHT * 0.42] });
      L.marker([cluster.lat, cluster.lng], { icon, title: cluster.label }).on('click', () => handlers.current.onPick(cluster)).addTo(layer);
    }
    if (eventPin) {
      L.circleMarker([eventPin.lat, eventPin.lng], { radius: 9, color: '#fff', weight: 3, fillColor: C.green, fillOpacity: 1 })
        .bindTooltip(eventPin.label).addTo(layer);
    }
  }, [clusters, selectedIds, urls, eventPin]);

  useImperativeHandle(ref, () => ({
    zoom: factor => { if (factor < 1) map.current?.zoomIn(); else map.current?.zoomOut(); },
    focus: (lat, lng, factor = 1) => { const m = map.current; if (m) m.flyTo([lat, lng], factor < 1 ? m.getZoom() + 1.5 : m.getZoom(), { duration: 0.35 }); },
    focusRegion: (lat, lng, latDelta = 0.14) => {
      const m = map.current;
      if (m) m.flyTo([lat, lng], latDelta > 1 ? 4 : 11, { duration: 0.4 });
    },
    locate: (lat, lng) => {
      const m = map.current;
      if (!m) return;
      you.current?.remove();
      you.current = L.circleMarker([lat, lng], { radius: 8, color: '#fff', weight: 3, fillColor: C.blue, fillOpacity: 1 }).addTo(m);
      m.flyTo([lat, lng], 12, { duration: 0.4 });
    },
  }), []);

  return <View style={{ flex: 1, zIndex: 0 }}><View ref={node} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} /></View>;
});
