import * as Crypto from 'expo-crypto';

export function generateRequestId(): string {
  return Crypto.randomUUID();
}
