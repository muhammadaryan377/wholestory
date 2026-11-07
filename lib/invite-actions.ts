import { Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { buildInviteUrl, inviteMessage } from './invite-links';

/** Every target app receives the same text and one HTTPS URL in the native share sheet. */
export async function shareStoryInvite(title: string, code: string) {
  const url = buildInviteUrl(code);
  return Share.share(
    { message: inviteMessage(title, url), title: 'Whole Stories invitation' },
    { subject: 'Invitation to Whole Stories', dialogTitle: 'Share story invitation' },
  );
}

export async function copyStoryInvite(code: string) {
  const url = buildInviteUrl(code);
  await Clipboard.setStringAsync(url);
  return url;
}
