import type { JSX } from 'react';
import { useParams } from 'react-router';
import { PageHeader } from '../components/AppShell';
import { Icon } from '../components/Icon';
import { useLang } from '../lib/i18n';

const UPDATED = 'October 2026';
const CONTACT = 'support.quizwarbd@gmail.com';

const DOCS: Record<string, { title: string; body: JSX.Element }> = {
  privacy: {
    title: 'Privacy Policy',
    body: (
      <>
        <p>Last updated: {UPDATED}. This policy explains what QUIZ WAR: Bangladesh (“we”) collects and why. We collect only what we need to run a fair multiplayer game.</p>
        <h2>What we collect</h2>
        <ul>
          <li><b>Account:</b> email address (if you sign up with email), a Google account identifier (if you use Google sign-in), a hashed password, and passkey public keys. We never see your fingerprint, face or screen lock.</li>
          <li><b>Profile:</b> username, optional photo and bio, your public Player ID (UID).</li>
          <li><b>Gameplay:</b> matches, answers, response times, scores, XP, coins, rating, achievements, friends, squads, reports you send.</li>
          <li><b>Security:</b> device/session information (platform, browser/app version), IP address and login history, used to protect your account and prevent cheating.</li>
          <li><b>Notifications:</b> push tokens if you enable notifications.</li>
          <li><b>Camera:</b> only while you scan a war-room QR code. The picture is read on your device and is never uploaded or stored.</li>
        </ul>
        <h2>What is public</h2>
        <p>Your username, UID, photo, level, league, rating, game statistics, achievements and squad are visible to other players and on public profile/leaderboard pages. Your email address is never shown to other players.</p>
        <h2>How we use data</h2>
        <ul><li>To run matches, matchmaking, leaderboards and rewards.</li><li>To keep the game fair (anti-cheat, moderation of reports).</li><li>To secure accounts (rate limiting, suspicious login detection).</li><li>To send account emails (welcome, verification, password reset) and, if you keep the setting on, occasional activity emails (achievements, promotions, streaks). You can turn activity emails off in Settings → Email notifications.</li></ul>
        <p>We do not sell personal data and do not show personalised ads.</p>
        <h2>Retention & deletion</h2>
        <p>You can delete your account anytime in Settings → Delete account. We then delete your email, login methods, passkeys, photo, friends, notifications and squad membership. Match records are kept in anonymised form so other players’ history stays correct. Security logs are kept for up to 90 days. Backups roll over within 30 days.</p>
        <h2>Children</h2>
        <p>QUIZ WAR is intended for players aged 13 and above.</p>
        <h2>Contact</h2>
        <p>Questions or data requests: {CONTACT}</p>
      </>
    ),
  },
  'delete-account': {
    title: 'Delete your QUIZ WAR account',
    body: (
      <>
        <p>QUIZ WAR: Bangladesh (Android app and quizwar.webtecit.com). You can delete your account and its data at any time.</p>
        <h2>Delete it yourself (instant)</h2>
        <ol>
          <li>Open the QUIZ WAR app or quizwar.webtecit.com and sign in.</li>
          <li>Go to <b>Profile → Settings → Delete account</b>.</li>
          <li>Confirm. Your account is deleted immediately.</li>
        </ol>
        <h2>Can't sign in? Ask us</h2>
        <p>Email <b>{CONTACT}</b> from the address you used to sign up, with the subject “Delete my account” and your Player ID (UID) if you know it. We delete the account within 7 days and reply to confirm.</p>
        <h2>What is deleted</h2>
        <p>Your email, password and login methods (Google, passkeys), profile photo and bio, friends, notifications, push tokens and squad membership.</p>
        <h2>What is kept</h2>
        <p>Match records stay in anonymised form (no name or email) so other players' history and leaderboards stay correct. Security logs are kept for up to 90 days; backups roll over within 30 days.</p>
      </>
    ),
  },
  terms: {
    title: 'Terms of Service',
    body: (
      <>
        <p>Last updated: {UPDATED}. By using QUIZ WAR you agree to these terms.</p>
        <h2>Your account</h2>
        <p>Keep your login secure. One person per account. You’re responsible for activity on your account.</p>
        <h2>Fair play</h2>
        <p>No cheating, bots, automation, exploiting bugs, account sharing for boosting, or match fixing. We may remove rewards, reset ratings, suspend or ban accounts that break these rules.</p>
        <h2>Virtual items</h2>
        <p>Coins, power-ups and cosmetics are a limited licence to use in the game, have no cash value and cannot be exchanged for money. QUIZ WAR contains no gambling or betting. Competitive rankings never depend on spending money.</p>
        <h2>Content</h2>
        <p>Usernames, photos and bios must follow the Community Guidelines. Questions are provided for entertainment and learning; we try to keep them accurate — report mistakes and we’ll fix them.</p>
        <h2>Service</h2>
        <p>The service is provided “as is”. Online battles require an internet connection. We may change features or end seasons with notice in the app.</p>
        <h2>Contact</h2><p>{CONTACT}</p>
      </>
    ),
  },
  guidelines: {
    title: 'Community Guidelines',
    body: (
      <>
        <p>QUIZ WAR is for everyone. Play hard, play fair, be kind.</p>
        <ul>
          <li>No abusive, hateful, sexual or violent usernames, photos or bios.</li>
          <li>No harassment or spamming challenges / friend requests.</li>
          <li>No cheating, scripts, multiple accounts to boost rating, or intentionally losing.</li>
          <li>Don’t share personal information — use your UID or QR to connect.</li>
        </ul>
        <p>Use Report on a profile or match to tell us about problems. You can block any player at any time.</p>
      </>
    ),
  },
  data: {
    title: 'Data handling',
    body: (
      <>
        <p>Data is transmitted over HTTPS and stored in our database with access limited to authorised staff. Passwords are hashed (scrypt); refresh tokens are stored hashed; Android refresh tokens are kept in the Android Keystore-backed secure storage.</p>
        <p>Admins can see game data and moderation information but never passwords, tokens or passkey secrets. Admin actions are recorded in an audit log.</p>
        <p>To request a copy of your data or deletion, use Settings or email {CONTACT}.</p>
      </>
    ),
  },
};

const BN_SUMMARY: Record<string, string> = {
  privacy:
    'সংক্ষেপে: আমরা শুধু খেলা চালানোর জন্য দরকারি তথ্য রাখি — ইমেইল, ইউজারনেম, ছবি (ঐচ্ছিক), ম্যাচের ফলাফল আর নিরাপত্তার জন্য লগইন তথ্য। আপনার ইমেইল কাউকে দেখানো হয় না, তথ্য বিক্রি করা হয় না, কোনো বিজ্ঞাপন নেই। সেটিংস থেকে যেকোনো সময় অ্যাকাউন্ট মুছে ফেলতে পারবেন।',
  terms:
    'সংক্ষেপে: ন্যায্যভাবে খেলুন, চিটিং বা অন্যকে হয়রানি করবেন না। কয়েন শুধু খেলে অর্জন করা যায় — কেনা বা টাকায় রূপান্তর করা যায় না। নিয়ম ভাঙলে অ্যাকাউন্ট স্থগিত হতে পারে।',
  'delete-account': 'সংক্ষেপে: অ্যাপ বা ওয়েবসাইটে লগইন করে প্রোফাইল → সেটিংস → অ্যাকাউন্ট মুছে ফেলুন চাপলেই সাথে সাথে অ্যাকাউন্ট মুছে যাবে। লগইন করতে না পারলে আপনার ইমেইল থেকে support.quizwarbd@gmail.com-এ "Delete my account" লিখে পাঠান, ৭ দিনের মধ্যে মুছে দেওয়া হবে।',
  guidelines: 'সংক্ষেপে: সবার প্রতি সম্মান দেখান, আপত্তিকর নাম বা ছবি ব্যবহার করবেন না, ভুল প্রশ্ন দেখলে রিপোর্ট করুন।',
};

export default function Legal() {
  const { doc = 'privacy' } = useParams();
  const d = DOCS[doc] ?? DOCS.privacy;
  const lang = useLang();
  return (
    <div className="page full legal">
      <PageHeader title={d.title} back />
      {lang === 'bn' && BN_SUMMARY[doc] && (
        <div className="card legal-summary">
          <Icon name="info" size={20} />
          <p>{BN_SUMMARY[doc]}</p>
        </div>
      )}
      <article className="card pad-lg">{d.body}</article>
    </div>
  );
}
