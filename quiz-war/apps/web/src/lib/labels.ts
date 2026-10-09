import type { IconName } from '../components/Icon';
import { tr } from './i18n';

const MODE: Record<string, [string, string, IconName]> = {
  duel: ['1 VS 1', '১ বনাম ১', 'swords'],
  duo: ['2 VS 2', '২ বনাম ২', 'users'],
  trio: ['3 VS 3', '৩ বনাম ৩', 'users-round'],
  squad: ['4 VS 4', '৪ বনাম ৪', 'shield'],
  solo: ['Solo practice', 'একা অনুশীলন', 'brain'],
  survival: ['Survival', 'সারভাইভাল', 'heart-pulse'],
  speed: ['Speed round', 'স্পিড রাউন্ড', 'bolt'],
  daily: ['Daily challenge', 'ডেইলি চ্যালেঞ্জ', 'calendar'],
};

export const modeLabel = (mode: string) => (MODE[mode] ? tr(MODE[mode][0], MODE[mode][1]) : mode);
export const modeIcon = (mode: string, type?: string): IconName => (type === 'ai' ? 'bot' : (MODE[mode]?.[2] ?? 'gamepad'));

const REASON: Record<string, [string, string]> = {
  cheating: ['Cheating', 'প্রতারণা / চিটিং'],
  abuse: ['Abuse or harassment', 'গালাগালি বা হয়রানি'],
  inappropriate_username: ['Inappropriate username', 'আপত্তিকর ইউজারনেম'],
  inappropriate_avatar: ['Inappropriate photo', 'আপত্তিকর ছবি'],
  exploit: ['Bug exploit', 'বাগের অপব্যবহার'],
  other: ['Something else', 'অন্য কিছু'],
};
export const reasonLabel = (r: string) => (REASON[r] ? tr(REASON[r][0], REASON[r][1]) : r);
