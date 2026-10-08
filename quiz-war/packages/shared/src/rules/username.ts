export const USERNAME_REGEX = /^[\p{L}\p{N}_.]{3,20}$/u;

/** Small built-in list; admins can extend it via the `blocked_words` table. */
export const RESERVED_USERNAMES = ['admin', 'administrator', 'moderator', 'quizwar', 'support', 'system', 'ai', 'bot'];

export function isValidUsername(name: string): boolean {
  return USERNAME_REGEX.test(name) && !RESERVED_USERNAMES.includes(name.toLowerCase());
}
