import * as Linking from 'expo-linking';

/** Where the confirmation email returns to. Must be allowlisted in Supabase Auth > Redirect URLs. */
export const emailConfirmUrl = () => Linking.createURL('auth/confirm');
