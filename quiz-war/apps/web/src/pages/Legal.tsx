import type { JSX } from 'react';
import { useParams } from 'react-router';
import { PageHeader } from '../components/AppShell';
import { Icon } from '../components/Icon';
import { useLang } from '../lib/i18n';

const UPDATED = 'November 2026';
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
          <li><b>Chat messages:</b> text, emoji, voice messages and photos you send to other players, with their reactions and read status. Messages are deleted automatically after 7 days (the app shows this in every chat); you can delete your own messages sooner, and moderators may remove reported messages.</li>
          <li><b>Calls and live voice:</b> audio and video calls with friends and live talk in quiz and Ludo games go directly between the players’ devices (WebRTC, encrypted). When a direct connection is not possible, the encrypted stream is relayed by Cloudflare. We never record or store call or voice audio or video. We keep only a short call record in the chat (who called, when, how long).</li>
          <li><b>Microphone:</b> only when you turn on your mic in a game, start or answer a call, or record a voice message. Listening to others never needs your mic.</li>
          <li><b>Camera:</b> only during a video call you start or answer, when you take a profile or chat photo, or while you scan a QR code. QR pictures are read on your device and never uploaded.</li>
          <li><b>Premium and purchases:</b> if you buy Premium, Google Play handles the payment. We receive only the purchase token, the plan and its expiry to turn Premium on; we never see your card or payment details.</li>
          <li><b>Invites and free trial:</b> the friend who invited you (if you enter an invite code), and a one-way hash of your device ID so that a phone can get the free trial or an invite reward only once.</li>
          <li><b>Notifications:</b> push tokens if you enable notifications (also used to ring you for incoming calls).</li>
        </ul>
        <h2>What is public</h2>
        <p>Your username, UID, photo, level, league, rating, game statistics, achievements and squad are visible to other players and on public profile/leaderboard pages. Your email address is never shown to other players.</p>
        <h2>How we use data</h2>
        <ul><li>To run matches, matchmaking, leaderboards, rewards, calls, voice and Premium.</li><li>To keep the game fair (anti-cheat, moderation of reports).</li><li>To secure accounts (rate limiting, suspicious login detection).</li><li>To send account emails (welcome, verification, password reset) and, if you keep the setting on, occasional activity emails (achievements, promotions, streaks). You can turn activity emails off in Settings → Email notifications.</li></ul>
        <p>We do not sell personal data. There are no third-party ad networks and no personalised ads; the app only shows occasional cards about our own other apps.</p>
        <h2>Retention & deletion</h2>
        <p>You can delete your account anytime in Settings → Delete account. We then delete your email, login methods, passkeys, photo, friends, notifications and squad membership. Match records are kept in anonymised form so other players’ history stays correct. Security logs are kept for up to 90 days. Backups roll over within 30 days.</p>
        <h2>Age</h2>
        <p>QUIZ WAR is for players aged 18 and above. We do not knowingly collect data from anyone under 18; if we learn an account belongs to a minor, we delete it. See our <a href="/legal/child-safety">Child Safety Standards</a>.</p>
        <h2>Service providers</h2>
        <p>We use Hostinger (servers and database), Google (sign-in, Google Play billing, push notifications through Firebase Cloud Messaging) and Cloudflare (call and voice relay). They process data only to provide these services.</p>
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
        <h2>Who can play</h2>
        <p>You must be 18 or older to use QUIZ WAR.</p>
        <h2>Your account</h2>
        <p>Keep your login secure. One person per account. You’re responsible for activity on your account.</p>
        <h2>Fair play</h2>
        <p>No cheating, bots, automation, exploiting bugs, account sharing for boosting, or match fixing. We may remove rewards, reset ratings, suspend or ban accounts that break these rules.</p>
        <h2>Virtual items</h2>
        <p>Coins, power-ups and cosmetics are a limited licence to use in the game, have no cash value and cannot be exchanged for money. QUIZ WAR contains no gambling or betting. Competitive rankings never depend on spending money.</p>
        <h2>Premium subscription</h2>
        <ul>
          <li>Premium (monthly or yearly) unlocks extra features such as audio and video calls, voice messages, photos in chat and talking live in games. Text chat and all games stay free.</li>
          <li>Payment is made through Google Play. The subscription renews automatically at the end of each period until you cancel it in Google Play → Payments & subscriptions. Cancelling stops the next renewal; Premium stays on until the paid period ends.</li>
          <li>Refunds follow Google Play’s refund policy. Prices are shown in the app before you buy and may change; a new price applies only from your next renewal after notice.</li>
          <li>Free trials, invite rewards, gift codes and monthly top-player rewards give Premium for a limited number of days. They have no cash value, can’t be transferred, and are limited to one free trial or invite reward per phone. We may cancel rewards gained by abuse (for example fake accounts).</li>
          <li>Premium never gives an advantage in ranked games.</li>
        </ul>
        <h2>Calls, voice and chat</h2>
        <p>Be respectful in calls, live voice and chat. Don’t record or share other players’ voice, video or photos without their consent. You can mute, block or report anyone. We may limit or remove access to calls, voice or chat for people who break these terms or the Community Guidelines.</p>
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
        <p>QUIZ WAR is for adults (18+). Play hard, play fair, be kind.</p>
        <ul>
          <li>No abusive, hateful, sexual or violent usernames, photos, bios, messages, voice or video.</li>
          <li>Never share sexual content or anything that involves a minor. We report child sexual abuse material to the authorities.</li>
          <li>No harassment or spamming challenges / friend requests.</li>
          <li>No cheating, scripts, multiple accounts to boost rating, or intentionally losing.</li>
          <li>Don’t share personal information — use your UID or QR to connect.</li>
        </ul>
        <p>Use Report on a profile, chat or match to tell us about problems. You can mute or block any player at any time.</p>
      </>
    ),
  },
  'child-safety': {
    title: 'Child Safety Standards',
    body: (
      <>
        <p>Last updated: {UPDATED}. QUIZ WAR: Bangladesh (app.quizwar.bd), published by Webtecit Apps, has zero tolerance for child sexual abuse and exploitation (CSAE) and child sexual abuse material (CSAM).</p>
        <h2>Our standards</h2>
        <ul>
          <li>QUIZ WAR is for adults aged 18 and above. Accounts found to belong to minors are removed.</li>
          <li>Any content, message, photo, voice or video that sexualises, grooms, exploits or endangers a child is strictly forbidden, as is any attempt to contact a child for such purposes.</li>
          <li>Accounts that break these rules are banned permanently and their content is removed.</li>
        </ul>
        <h2>How to report</h2>
        <ul>
          <li>In the app: use <b>Report</b> on a player’s profile, in a chat or after a match. You can also block the player at once.</li>
          <li>By email: <b>{CONTACT}</b> — write “Child safety” in the subject. We review child safety reports with top priority.</li>
        </ul>
        <h2>What we do</h2>
        <p>We review reports, remove violating content, ban the accounts involved, keep the evidence needed by law, and report confirmed CSAM to the relevant authorities, including the National Center for Missing & Exploited Children (NCMEC) and Bangladesh law enforcement. We comply with all applicable child safety laws.</p>
        <h2>Contact for child safety</h2>
        <p>Child safety point of contact: MD Ahoshan Habib Nayon, {CONTACT}</p>
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
    'সংক্ষেপে: আমরা শুধু খেলা চালানোর জন্য দরকারি তথ্য রাখি — ইমেইল, ইউজারনেম, ছবি (ঐচ্ছিক), ম্যাচের ফলাফল আর নিরাপত্তার জন্য লগইন তথ্য। কল, ভিডিও আর লাইভ কথা সরাসরি ফোনে ফোনে যায়, কখনো রেকর্ড হয় না। প্রিমিয়ামের পেমেন্ট Google Play নেয়, আপনার কার্ডের তথ্য আমরা দেখি না। আপনার ইমেইল কাউকে দেখানো হয় না, তথ্য বিক্রি করা হয় না, বাইরের কোনো বিজ্ঞাপন নেই। চ্যাটের মেসেজ ৭ দিন পর নিজে থেকে মুছে যায়। QUIZ WAR শুধু ১৮+ বয়সীদের জন্য। সেটিংস থেকে যেকোনো সময় অ্যাকাউন্ট মুছে ফেলতে পারবেন।',
  terms:
    'সংক্ষেপে: ১৮+ বয়সীদের জন্য। ন্যায্যভাবে খেলুন, চিটিং বা অন্যকে হয়রানি করবেন না। কয়েন শুধু খেলে অর্জন করা যায় — কেনা বা টাকায় রূপান্তর করা যায় না। প্রিমিয়াম Google Play দিয়ে কেনা হয়, প্রতি মাস/বছর নিজে থেকে রিনিউ হয়; Google Play থেকে যেকোনো সময় বন্ধ করা যায়। নিয়ম ভাঙলে অ্যাকাউন্ট স্থগিত হতে পারে।',
  'child-safety': 'সংক্ষেপে: শিশু নির্যাতন বা শিশুদের নিয়ে কোনো আপত্তিকর কিছু QUIZ WAR-এ একদম নিষিদ্ধ। এমন কিছু দেখলে অ্যাপে Report চাপুন বা support.quizwarbd@gmail.com-এ জানান। দোষী অ্যাকাউন্ট চিরতরে বন্ধ হবে এবং আইন অনুযায়ী কর্তৃপক্ষকে জানানো হবে।',
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
