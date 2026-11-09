import { validInviteCode } from './invite-links';

/**
 * What happened when someone tried to join a story with an invitation code.
 * - invalid / expired / private: the invitation can never work, so the saved invitation is cleared.
 * - signin / network / unknown: it may work later, so the saved invitation is kept and Try again is offered.
 */
export type JoinFailureKind = 'invalid' | 'expired' | 'private' | 'signin' | 'network' | 'unknown';

export type JoinFailure = {
  ok: false;
  kind: JoinFailureKind;
  title: string;
  message: string;
  /** Remove the saved invitation: it will never work. */
  clearPending: boolean;
  retryable: boolean;
};

export type JoinResult = { ok: true; storyId: string } | JoinFailure;

const FAILURES: Record<JoinFailureKind, { title: string; message: string; clearPending: boolean; retryable: boolean }> = {
  invalid: { title: 'This invitation isn’t valid', message: 'The link is wrong or was removed. Ask the story owner to send you a new one.', clearPending: true, retryable: false },
  expired: { title: 'This invitation has expired', message: 'Ask the story owner to send you a new invitation.', clearPending: true, retryable: false },
  private: { title: 'This story is private', message: 'Private stories can’t be joined with an invitation link.', clearPending: true, retryable: false },
  signin: { title: 'Please log in to join', message: 'Log in or create an account, and we’ll add you to the story.', clearPending: false, retryable: true },
  network: { title: 'Couldn’t reach Whole Story', message: 'Check your internet connection and try again. Your invitation is saved.', clearPending: false, retryable: true },
  unknown: { title: 'Couldn’t join this story', message: 'Something went wrong. Please try again. Your invitation is saved.', clearPending: false, retryable: true },
};

function failure(kind: JoinFailureKind): JoinFailure {
  return { ok: false, kind, ...FAILURES[kind] };
}

function errorText(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message ?? '');
  return '';
}

/** Turns the message from the join_story database function (or the network layer) into a clear outcome. */
export function classifyJoinError(error: unknown): JoinFailure {
  const text = errorText(error).toLowerCase();
  // Login problems first: "JWT expired" is an expired login session, not an expired invitation.
  if (/sign in|signed in|log in|not authenticated|jwt/.test(text)) return failure('signin');
  if (/expired|no longer (valid|available)/.test(text)) return failure('expired');
  if (/not valid|invalid|not found|does not exist/.test(text)) return failure('invalid');
  if (/private/.test(text)) return failure('private');
  if (/network|fetch|timeout|timed out|offline|connection|internet/.test(text)) return failure('network');
  return failure('unknown');
}

/**
 * Joins the story and keeps the saved invitation in the right state: it is removed once it has worked or can
 * never work, and kept when the problem may be temporary (no connection, not logged in yet).
 */
export async function completeInvite(
  code: string,
  join: (code: string) => Promise<string>,
  clearPending: (code: string) => Promise<void>,
): Promise<JoinResult> {
  const result = await joinInvite(code, join);
  if (result.ok || result.clearPending) await clearPending(code).catch(() => {});
  return result;
}

/** Joins the story that owns this code. `join` is the real database call (or a stand-in in tests). */
export async function joinInvite(code: unknown, join: (code: string) => Promise<string>): Promise<JoinResult> {
  if (!validInviteCode(code)) return failure('invalid');
  try {
    const storyId = await join(code);
    return typeof storyId === 'string' && storyId ? { ok: true, storyId } : failure('unknown');
  } catch (error) {
    return classifyJoinError(error);
  }
}
