# QUIZ WAR: product roadmap after Play Store launch

Written from the owner's requests (October 2026). This is the master list for the next updates. Nothing here is built yet.
Read this file before starting any of these updates.

- The Ludo details are in [ludo-plan.md](ludo-plan.md).
- Play Store link: https://play.google.com/store/apps/details?id=app.quizwar.bd (package `app.quizwar.bd`).

## Ground rules for every update (owner's words: "nothing old may break, the site must not get heavy")
- Never break existing features or data.
  - Database migrations are additive only.
  - Old app versions must keep working against the new server.
- Keep Hostinger light:
  - Voice/video media goes peer-to-peer (WebRTC); Cloudflare TURN is the relay.
  - Uploads are compressed on the phone before upload.
  - Media auto-deletes after 7 days.
  - Heavy pages are lazy-loaded so the first app load stays small.
- Every new feature gets an admin on/off switch.
- Bangla + English texts. No emoji in UI except mood reactions.
- Selling digital items/premium inside the Android app must use Google Play Billing (Play policy).
  - Coins earned in game can also unlock items.
  - Never sell outside Play for in-app digital goods.
  - Never offer real-money gambling or cash-out.

## Suggested order (each is one Play update)
1. **Launch polish:** Play Store links, rating prompt, result card, profile redesign, Home collections, quiz music/mic.
2. **Store + Premium:** Play Billing, badges, redeem, admin grants.
3. **Chat calls:** voice messages, 1:1 audio call, missed calls, call log.
4. **Ludo:** see ludo-plan.md, plus the store items.
5. **Video call:** later.

---

## 1. Launch polish

### Play Store everywhere (replace GitHub)
- The app's "update available" popup opens the Play Store listing, not the GitHub APK. Use the Play in-app update API when available, else open the Play link.
- The website "Open app" / "Install" banner goes to the Play Store. App Links still open the installed app.
- Admin "App update" settings default to the Play link.
- The GitHub `app-latest` release can stay for testers, but no user-facing link points there.

### Rating prompt
- Use the Google Play In-App Review API. Google controls how often it really shows.
- Ask only after good moments: a win, or after 5+ matches, at most once per 30 days. Never during a match.

### Win / defeat share card
- Keep the current design.
- Replace the website text with "Get it on Google Play" + "QUIZ WAR" + a small QR to the Play link.
- Keep the web address small at the bottom.

### Profile page redesign
The owner says the current profile looks messy. Clean layout:
- Cover + avatar + name + badges
- Level / XP bar
- Stats grid (matches, wins, win rate, streak)
- Achievements / cups
- Recent matches
- Action buttons in one row (Edit, Share, Friends)
- Same style for public profile.

### Home: remove mode shortcuts, add "Collections"
- Remove the Home tiles Duo 2v2, VS AI, Challenge, Solo practice, Survival, Speed round.
  - They are only shortcuts; the modes stay on the Battle page.
- New admin section "Home Collections":
  - Fields: name (bn/en), icon, colour, description, questions (manual / CSV), order, on/off, free or premium.
  - Example: "আগের বছরের BCS প্রশ্ন".
- Collections show on Home only, not in the Battle category picker.
- Tapping a collection shows the same options as tapping BCS Quiz today: quick battle, challenge a friend, room, solo practice.
- Owner wants collections (previous-year questions) to be premium.
- Each collection shows "সংগৃহীত প্রশ্ন, সরকারি উৎস নয়" (Play Misleading Claims).

### Quiz match: music and voice
- Music/sound toggle on the quiz game page.
- Music plays only in solo / vs AI. Playing against real people: no music (they may talk).
- Mic on/off (mute) in live player matches:
  - Turning it on lets you hear the opponent live.
  - Voice continues on the result page (so they can agree a rematch).
  - It stops when anyone goes Home or leaves.
- Voice tech, privacy and safety rules are the same as in ludo-plan.md (mic off by default, mute per player, report, no recording).

### Custom room (War room)
- Live voice + mute on the ready/lobby page only (before the match starts), so players can agree what to play.
- Every player can see the room settings live (category, count, time, difficulty) and ask the host to change them.
- Rejoin: if someone closes the app during a live match, reopening it puts them back into the match.

---

## 2. Store + Premium

### Store items (Play Billing products + some coin prices)
- **Badges:**
  - **Blue badge:** name it "Blue badge" or "Supporter badge". Do NOT call it "Verified", because selling a verified mark implies identity checks (deceptive).
  - **Premium badge:** gold seal, already exists as an admin-only badge.
- **Ludo:** board themes/designs, token colours/skins, dice skins. Premium, or purchasable.
- Most items can also be bought with game coins, at a high coin price (owner's rule).

### Premium subscription (Play Billing, monthly)
Includes:
- Home collections (previous-year questions)
- Audio calls in chat
- Voice messages in chat
- Sending photos in chat
- Video calls (when built)
- Premium badge

Text chat stays free.

### Redeem and grants
- Redeem screen: enter a code to get premium for N days.
- Admin can create codes, give premium to any user for N days, and see who redeemed.
- Monthly reward: the top 5 on the leaderboard get free premium automatically, or with one admin click.
- Premium granted by admin/redeem is separate from Play purchases; both just set `premium_until`.

### Billing tech
- Add the BILLING permission + Play Billing library.
  - The server verifies every purchase with the Google Play Developer API.
  - Real-time notifications (RTDN) via Pub/Sub.
- Play Console prerequisites are done:
  - Merchant account exists (Payments profile "Nayon Apps").
  - W-8BEN submitted (in review). No e-TIN; the owner chose to skip it.
  - Bank account: the owner will add it later.

---

## 3. Chat: voice messages and audio calls
- **Voice message (premium):** hold to record.
  - Compressed (Opus, low bitrate), max length (e.g. 2 min).
  - Plays in chat like other apps.
- **Photo sending (premium):** compressed on the phone (WebP, max ~1280px) before upload.
- **Video sending, if allowed later:** compress on the phone, with a short length and size limit.
- **Audio call (premium):** 1:1 call from the chat box, WebRTC + Cloudflare TURN.
  - Incoming call screen + push notification.
  - Missed call shows in the chat like a message ("Missed call").
  - Finished calls show "Audio call · 3 min 12 s" in the chat, like other apps.
- **Video call:** later.
- **Auto-delete:** voice messages, photos and videos are deleted from Hostinger after 7 days. The chat shows "expired".
  - Text keeps the existing 7-day purge.
- Report / block apply to calls and media too.

---

## 4. Ludo (summary, full detail in ludo-plan.md)
- A small, nice banner on Home (not too big).
- Modes:
  - Auto match 1v1, auto match 2v2
  - vs AI (easy / medium / hard)
  - Rooms 1v1 up to 4 players, and 2v2 teams.
  - Note: Ludo has at most 4 players; the owner's "4vs4" means up to 4 players / 2v2.
- Leaderboard, Store items, win/defeat card + share (same as quiz).
- Sounds only, no background music: dice roll, token move, capture, token home, win.
- Live voice + mute next to each player's profile and name.
- Ask to play again (rematch request).
- Leaving:
  - In 1v1, the player who leaves loses and the other wins.
  - In team games, the leaver's teammate takes over their turns.
  - When one teammate finishes, their remaining moves go to the partner (common Ludo rules).
- Rejoin a live match after closing the app.
- Every challenge/invite entry point first asks "Quiz or Ludo?" (list in ludo-plan.md).

---

## Google Play policy notes (from the policy email, Oct 2026)
- **Trader status:** declare it in Play Console from Nov 2026. The owner sells premium, so declare "Trader" (contact info is shown to EU users only).
- **Japan:** before selling anything, complete Japan's payments authorization (deadline Dec 1, 2026), or remove Japan from the production countries. Otherwise payouts are held globally.
- **App quality:** memory and code-optimization thresholds apply from Feb 2027. Keep the app light and check Android vitals each release.
- **Subscriptions:** any eligibility-based discount (e.g. a student plan) must clearly disclose its criteria, the verification process and the price after eligibility ends.
- Not used by our apps: Local network, Contacts, Location, All files access, Accessibility, SMS/Call log, crypto, AppFunctions.

## Play Console updates needed along the way
- **Data safety:**
  - Audio (voice chat/messages)
  - Photos/videos (chat media)
  - Purchase history (billing)
  - Say that media is deleted after 7 days and voice calls are not recorded.
- **Content rating:** users interact (chat, voice); digital purchases.
- **Privacy policy:** voice, media retention (7 days), purchases.
- **Store listing:** mention Ludo and premium after they ship.
