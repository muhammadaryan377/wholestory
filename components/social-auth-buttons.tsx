import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/typography';
import Svg, { Path } from 'react-native-svg';
import { Small } from './ui';
import { signInWithSocialProvider, type SocialProvider } from '@/lib/social-auth';
import { F } from '@/lib/theme';
import { openHome } from '@/lib/navigation';

export function SocialAuthButtons({ onError }: { onError: (message: string) => void }) {
  const [working, setWorking] = useState<SocialProvider | null>(null);

  const login = async (provider: SocialProvider) => {
    if (working) return;
    onError('');
    setWorking(provider);
    try {
      const complete = await signInWithSocialProvider(provider);
      if (complete) openHome();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Unable to sign in. Please try again.');
    } finally {
      setWorking(null);
    }
  };

  return (
    <>
      <Small style={{ textAlign: 'center', marginTop: 18, marginBottom: 6 }}>
        Or continue securely with
      </Small>
      {(['google', 'apple'] as const).map(provider => {
        const google = provider === 'google';
        const title = `Sign in with ${google ? 'Google' : 'Apple'}`;
        return (
          <Pressable
            key={provider}
            accessibilityRole="button"
            accessibilityLabel={title}
            accessibilityState={{ disabled: !!working, busy: working === provider }}
            disabled={!!working}
            onPress={() => void login(provider)}
            style={({ pressed }) => [styles.button, google ? styles.google : styles.apple, (pressed || !!working) && styles.dimmed]}
          >
            {google ? (
              <View style={styles.googleIcon}>
                <Svg width={26} height={26} viewBox="0 0 48 48">
                  <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
                  <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.03 46.98 31.87 46.98 24.55Z" />
                  <Path fill="#FBBC05" d="M10.53 28.59A14.41 14.41 0 0 1 9.77 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.87 23.87 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z" />
                  <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
                </Svg>
              </View>
            ) : (
              <Svg width={22} height={26} viewBox="0 0 24 24">
                <Path fill="#000" d="M17.05 12.536c.031 3.256 2.857 4.34 2.888 4.354-.024.076-.452 1.545-1.49 3.063-.898 1.312-1.83 2.62-3.298 2.647-1.442.027-1.905-.855-3.554-.855-1.648 0-2.163.828-3.528.882-1.417.054-2.496-1.419-3.401-2.726C2.717 17.23 1.232 12.17 3.259 8.754c1.007-1.696 2.807-2.77 4.76-2.797 1.488-.027 2.893.936 3.803.936.91 0 2.618-1.158 4.408-.988.75.031 2.857.303 4.21 2.284-.109.068-2.514 1.463-2.49 4.347h-.9ZM14.532 4.122c.752-.91 1.258-2.177 1.12-3.442-1.084.044-2.394.723-3.172 1.633-.697.805-1.308 2.094-1.143 3.328 1.209.094 2.443-.613 3.195-1.519Z" />
              </Svg>
            )}
            <Text style={[styles.label, google && styles.googleLabel]}>{title}</Text>
            {working === provider ? <ActivityIndicator style={styles.spinner} color={google ? '#fff' : '#000'} size="small" /> : null}
          </Pressable>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 6, borderWidth: 1, marginVertical: 6, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  google: { backgroundColor: '#4285F4', borderColor: '#4285F4', paddingLeft: 6 },
  apple: { backgroundColor: '#fff', borderColor: '#000' },
  googleIcon: { width: 42, height: 42, backgroundColor: '#fff', borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  label: { color: '#000', fontSize: 18, fontFamily: F.sansMedium, flexShrink: 1, textAlign: 'center' },
  googleLabel: { color: '#fff', flex: 1 },
  spinner: { marginLeft: 4 },
  dimmed: { opacity: 0.65 },
});
