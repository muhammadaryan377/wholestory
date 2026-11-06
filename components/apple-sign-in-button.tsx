import { Btn } from './ui';

type Props = { onPress: () => void; disabled: boolean; busy: boolean };

// Android and web use the existing browser OAuth flow.
export function AppleSignInButton({ onPress, disabled, busy }: Props) {
  return <Btn title="Continue with Apple" kind="outline" onPress={onPress} disabled={disabled} busy={busy} />;
}
