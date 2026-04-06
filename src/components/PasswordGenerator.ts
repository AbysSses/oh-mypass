/**
 * 随机密码生成器
 */

const CHARSETS = {
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  special: '!@#$%^&*()_+-=[]{}|;:,.<>?',
};

export type PasswordCharset = 'all' | 'alphanumeric' | 'alpha' | 'numeric';

export function generatePassword(length: number, charset: PasswordCharset): string {
  let chars = '';

  switch (charset) {
    case 'all':
      chars = CHARSETS.lowercase + CHARSETS.uppercase + CHARSETS.digits + CHARSETS.special;
      break;
    case 'alphanumeric':
      chars = CHARSETS.lowercase + CHARSETS.uppercase + CHARSETS.digits;
      break;
    case 'alpha':
      chars = CHARSETS.lowercase + CHARSETS.uppercase;
      break;
    case 'numeric':
      chars = CHARSETS.digits;
      break;
  }

  const array = new Uint32Array(length);
  crypto.getRandomValues(array);

  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[array[i] % chars.length];
  }

  return result;
}
