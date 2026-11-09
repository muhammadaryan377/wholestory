import { Platform, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { buildInviteUrl, inviteMessage } from './invite-links';

/** shared = handed to the share sheet, dismissed = the person closed it, copied = no share sheet here, so it was copied. */
export type ShareOutcome = 'shared' | 'dismissed' | 'copied';

/**
 * Every target app (WhatsApp, SMS, email, ...) receives the same text with one HTTPS URL.
 * On the web the browser's own share sheet is used when it exists, otherwise the invitation is copied.
 */
export async function shareStoryInvite(title: string, code: string): Promise<ShareOutcome> {
  const url = buildInviteUrl(code); // throws a clear message when invitation links are not configured
  const message = inviteMessage(title, url);

  if (Platform.OS === 'web') {
    const browser = (globalThis as { navigator?: { share?: (data: { title: string; text: string }) => Promise<void> } }).navigator;
    if (browser && typeof browser.share === 'function') {
      try {
        await browser.share({ title: 'Whole Story invitation', text: message });
        return 'shared';
      } catch (error) {
        if ((error as { name?: string })?.name === 'AbortError') return 'dismissed';
        // Any other failure: fall through to copying.
      }
    }
    await Clipboard.setStringAsync(message);
    return 'copied';
  }

  const result = await Share.share(
    { message, title: 'Whole Story invitation' },
    { subject: 'Invitation to Whole Story', dialogTitle: 'Share story invitation' },
  );
  return result.action === Share.dismissedAction ? 'dismissed' : 'shared';
}

export async function copyStoryInvite(code: string) {
  const url = buildInviteUrl(code);
  await Clipboard.setStringAsync(url);
  return url;
}
