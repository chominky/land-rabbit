import { ROOM_CODE_LENGTH } from './gameConfig';

// Exclude confusing characters: I, O, 0, 1
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}

export function normalizeQuestion(text: string): string {
  return text
    .replace(/\s+/g, '')
    .replace(/[?.!,;:'"(){}\[\]~`@#$%^&*+=<>/\\|_-]/g, '')
    .replace(/[은는이가을를의에서도와과로으며고지만]/g, '')
    .toLowerCase();
}
