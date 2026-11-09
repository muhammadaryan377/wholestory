import { SocialButton } from './social-button';
import { AppleLogo } from './brand-logos';

type Props = { onPress: () => void; disabled: boolean; busy: boolean };

// Android and web use the existing browser OAuth flow.
export function AppleSignInButton({ onPress, disabled, busy }: Props) {
  return <SocialButton title="Continue with Apple" dark logo={<AppleLogo size={20} />} onPress={onPress} disabled={disabled} busy={busy} />;
}
