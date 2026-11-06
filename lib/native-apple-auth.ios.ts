import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';

/**
 * Use Apple's native iOS sheet and exchange its signed identity token with
 * Supabase. A fresh SHA-256 nonce prevents a captured token from being replayed.
 */
export async function signInWithNativeApple(): Promise<boolean> {
  if (!(await AppleAuthentication.isAvailableAsync())) {
    throw new Error('Sign in with Apple is not available on this device.');
  }

  const nonceBytes = await Crypto.getRandomBytesAsync(32);
  const rawNonce = Array.from(nonceBytes, byte => byte.toString(16).padStart(2, '0')).join('');
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (error) {
    // A person closing Apple's sheet is not an authentication failure.
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ERR_REQUEST_CANCELED') {
      return false;
    }
    throw error;
  }

  if (!credential.identityToken) {
    throw new Error('Apple did not return an identity token. Please try again.');
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
  });
  if (error) throw error;
  if (!data.session) throw new Error('Could not create a Supabase session after Apple sign in.');

  // Apple shares a name only on the first authorization. Preserve existing
  // profile metadata on subsequent sign-ins.
  const parts = [
    credential.fullName?.givenName,
    credential.fullName?.middleName,
    credential.fullName?.familyName,
  ].filter((part): part is string => Boolean(part?.trim()));
  if (parts.length && !data.user?.user_metadata?.full_name) {
    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        full_name: parts.join(' '),
        given_name: credential.fullName?.givenName ?? null,
        family_name: credential.fullName?.familyName ?? null,
      },
    });
    // Do not reject an otherwise successful login if the optional name update fails.
    if (updateError) console.warn('Could not save Apple display name:', updateError.message);
  }

  return true;
}
