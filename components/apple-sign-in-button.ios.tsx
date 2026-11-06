import * as AppleAuthentication from 'expo-apple-authentication';
import { ActivityIndicator, View } from 'react-native';

type Props = { onPress: () => void; disabled: boolean; busy: boolean };

export function AppleSignInButton({ onPress, disabled, busy }: Props) {
  return (
    <View style={{ marginVertical: 6 }}>
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={24}
        style={{ width: '100%', height: 50, opacity: disabled ? 0.6 : 1 }}
        onPress={() => { if (!disabled) onPress(); }}
      />
      {busy ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', right: 20, top: 15 }}
        >
          <ActivityIndicator color="#FFFFFF" size="small" />
        </View>
      ) : null}
    </View>
  );
}
