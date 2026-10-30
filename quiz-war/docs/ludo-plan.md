# Ludo Online: agreed plan (build after Play Store production launch)

See also the master list [roadmap.md](roadmap.md) for store, premium, chat calls and the order of updates.

Status: planned only. No code yet. The owner asked to start this after QUIZ WAR is live on Google Play.

## Rules (same as common Ludo apps)
- Roll a 6 to bring a token out; a 6 gives another roll.
- Capturing a token gives an extra turn; the captured token goes back to its yard.
- Star squares are safe; two own tokens on one square form a block that cannot be captured.
- First to bring all 4 tokens home wins.
- Modes: Quick match 1v1 (random), Play with friends (room code / QR / invite, 2-4 players), 2 vs 2 team (partners opposite), vs Computer.
- Coins are game coins only (entry fee / prize). Never real money (Play gambling policy).
- A player who leaves or times out is played by the computer so the game never stops.

## Look (owner approved direction: Ludo King style, not a copy)
- Mockups: Ludo King-style board full width, dark blue patterned background.
- Four yellow-bordered blue player panels (2 above the board, 2 below) with avatar and a pink dice box.
- Silver pin tokens with a glossy colour ball and a ring at the base.
- No "Player 1..4" text inside the board; names only on the panels.
- Turn indicator: the active player's panel glows and only their dice is visible.
  - Dice rolls with a spin; movable tokens get a spinning dashed ring and bob.
  - Tokens hop cell by cell; a captured token slides home.
- Built with React (page, panels, menus) + SVG (board, tokens, dice) + CSS animations. No game engine.
- The server decides dice and validates every move (anti-cheat, rejoin support).

## Voice chat
- WebRTC peer-to-peer mesh (max 4 players).
- Signalling over the existing Socket.IO server on Hostinger.
- Cloudflare Realtime TURN for NAT relay: 1,000 GB/month free, then $0.05/GB.
  - The server issues short-lived TURN credentials.
  - Env: `CF_TURN_KEY_ID`, `CF_TURN_API_TOKEN`.
- Mic is off when joining; mic permission is asked with an explainer first.
- Next to each player: own mic on/off; others have a speaker icon.
  - The speaker icon mutes that player for me only; others still hear them.
  - Show toast "muted for you only".
- Speaking indicator: green glow and waves. Game music ducks while someone talks. Mic stops when the app is backgrounded.
- Report / block. Admin can disable a user's voice, turn voice on/off globally or for friends' rooms only, and see monthly GB used.
- Quick match with strangers: voice off by default; both must opt in.
- No recording or storage of voice.
- Play Console: Data safety must declare Audio (not stored), content rating "Users can interact", privacy policy text.

## Where Ludo appears in the app
1. Home: a big "Ludo Online" card under Quick battle. It opens Battle > Ludo tab.
2. Home > Quick battle > Find opponent opens a sheet: "Quiz battle" or "Ludo battle".
   - Optional "Remember my choice", changeable in Settings.
3. Battle page: tabs become `Quiz | Ludo`, replacing the mostly empty "Challenges" tab.
   - Quiz tab keeps everything that is in "Play" today.
   - Pending challenges show as a small card at the top of the tab only when there are any. Popups and notifications stay as they are.
4. Rank: `Quiz | Ludo` leaderboard tabs. Profile: Ludo stats. Admin: Ludo on/off, coin amounts, move timer.

## Every challenge / invite entry point must ask "Quiz or Ludo?" first
The owner's rule: nothing may start the wrong game. Each place below first opens a Quiz/Ludo chooser, then the existing settings for that game.
- `pages/Friends.tsx`: Challenge buttons on the friends list, online list and UID search result (all use `ChallengeSheet`).
- `pages/PublicProfile.tsx`: Challenge button (`ChallengeSheet`).
- `components/ChallengeSheet.tsx`: add a game-type step (Quiz / Ludo) at the top. The request carries `game: 'quiz' | 'ludo'`.
- `pages/Home.tsx`: "Challenge / Battle a friend" quick action and the Quick battle card.
- `pages/Result.tsx`: Rematch keeps the same game type as the finished match (no chooser needed). The share text "Challenge me" stays generic.
- `pages/WarRoom.tsx`: Quiz room invites stay quiz. The Ludo room has its own invite list.
- `components/Invites.tsx`: the incoming challenge popup must clearly show the game ("Quiz 1 VS 1" or "Ludo 1 VS 1") and open the right screen on Accept.
- Notifications and push text must name the game as well.
- Any new challenge entry point added later (e.g. from Chat) must use the same chooser.
