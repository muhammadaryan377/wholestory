import { SymbolView } from 'expo-symbols';
import { C } from '@/lib/theme';

/** SF Symbol name for iOS, Material Symbol name for Android and web. */
const ICONS = {
  search: ['magnifyingglass', 'search'],
  sliders: ['slider.horizontal.3', 'tune'],
  gear: ['gearshape', 'settings'],
  back: ['chevron.left', 'chevron_left'],
  arrowBack: ['arrow.left', 'arrow_back'],
  forward: ['chevron.right', 'chevron_right'],
  home: ['house', 'home'],
  book: ['book', 'menu_book'],
  calendar: ['calendar', 'calendar_today'],
  plane: ['airplane', 'flight'],
  people: ['person.2', 'group'],
  heart: ['heart', 'favorite'],
  star: ['star', 'star'],
  image: ['photo', 'image'],
  mic: ['mic', 'mic'],
  stack: ['square.stack.3d.up', 'layers'],
  pin: ['mappin.and.ellipse', 'location_on'],
  list: ['list.bullet', 'list'],
  more: ['ellipsis', 'more_horiz'],
  plus: ['plus', 'add'],
  minus: ['minus', 'remove'],
  info: ['info.circle', 'info'],
  locate: ['location', 'near_me'],
  tag: ['tag', 'sell'],
  close: ['xmark', 'close'],
  person: ['person', 'person'],
  camera: ['camera', 'photo_camera'],
  pencil: ['pencil', 'edit'],
  check: ['checkmark', 'check'],
  bell: ['bell', 'notifications'],
  lock: ['lock', 'lock'],
  download: ['square.and.arrow.down', 'download'],
  card: ['creditcard', 'credit_card'],
  memories: ['heart.slash', 'heart_broken'],
  shield: ['hand.raised', 'privacy_tip'],
  document: ['doc.text', 'description'],
  play: ['play.circle', 'play_circle'],
  mail: ['envelope', 'mail'],
  logout: ['rectangle.portrait.and.arrow.right', 'logout'],
  trash: ['trash', 'delete'],
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 18, color = C.ink }: { name: IconName; size?: number; color?: string }) {
  const [ios, material] = ICONS[name];
  return <SymbolView name={{ ios: ios as any, android: material as any, web: material as any }} tintColor={color} size={size} />;
}
