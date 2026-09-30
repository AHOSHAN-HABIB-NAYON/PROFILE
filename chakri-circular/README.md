# চাকরি সার্কুলার — UI/UX প্রোটোটাইপ

`index.html` is a self-contained, clickable, mobile-first prototype of **cakricircular.com**: the public site and the admin panel share one brand, one data set and one promotion engine. Open it in any browser. On desktop it shows a screen index, a live phone and a spec panel. At phone width it becomes the app itself.

Changes made in the admin panel (promotion gap, promotion on/off, maintenance mode, category order, notice expiry, moderator permissions) are reflected on the public site immediately.

## Brand

| Token | Light | Dark | Use |
|---|---|---|---|
| `--green` | `#0B8457` | `#2FB982` | Primary actions, active states, brand |
| `--blue` | `#1D63D8` | `#629AF5` | Secondary actions, "প্রমোটেড" indicator |
| `--gold` | `#A8740A` | `#E4B653` | "প্রিমিয়াম" indicator only |
| `--bg` / `--surface` | `#F3F7F5` / `#FFF` | `#0A1311` / `#111C19` | Green-tinted neutrals, not plain grey |
| `--red` / `--orange` | status | status | Deadline near, errors, "নতুন" |

- Type: **Noto Sans Bengali** (body/UI) and **Baloo Da 2** (brand name, hero, 404, ranking numbers only).
- Bengali numerals and Bengali month names everywhere on the public site (`৩০ সেপ্টেম্বর ২০২৬`).
- Radius 10/14/20px, one soft shadow level, no decorative imagery. Organisation logos are rendered as seals, so there are no heavy images in the feed.
- Dark mode is a separate palette (dark green-black surfaces, raised cards, muted secondary text), not an inversion.

## No ad banners: posts are the promotional inventory

A post can be **সাধারণ**, **প্রমোটেড** or **প্রিমিয়াম**. Promoted posts use the same job card with only a small badge (blue star for promoted, gold crown and a faint warm tint for premium).

Feed algorithm (`buildFeed` in `index.html`):

1. Active promotions = `promo.on` AND `start ≤ now ≤ end` AND post is published. Expired ones automatically drop back to normal posts.
2. Sort by priority (3 → 1), premium before promoted on ties.
3. Walk the normal posts. After every `gap` posts, insert the next promotion in round-robin order, skipping any that already reached `max` appearances on that page.
4. Short lists (search results, filtered categories) that never reach a slot still show matching promoted posts once, at the end.

`gap` comes from **Admin → Settings → Promotion** or **Admin → প্রমোশন**: `4 / 5 / 6 / Custom` (default 4). The admin promotion screen shows a live feed preview (`পোস্ট ১ … পোস্ট ৪, ★ প্রমোটেড, পোস্ট ৫ …`).

## Screens

**Public:** হোম, ক্যাটাগরি, ক্যাটাগরির পোস্ট, খুঁজুন (live filtering with category / বিভাগ / জেলা / date), ট্রেন্ডিং, পোস্ট ডিটেইল (live countdown, apply, PDF, share, save, reminder, report), নোটিশ (new/old tabs, auto-expiry, optional sound), রিপোর্ট (honeypot plus a one-minute rate limit), সেভ করা চাকরি (with deadline reminders), আমাদের সম্পর্কে, যোগাযোগ, গোপনীয়তা নীতি, শর্তাবলী, ৪০৪, মেইনটেন্যান্স (logged-in admins can still view the real site). Overlays: drawer with dark-mode toggle, share sheet, push-permission prompt, reminder sheet. The footer holds the email subscription, PWA install card, team, links and contact.

**Admin:** লগইন (remember me, Google login), ড্যাশবোর্ড, পোস্ট তালিকা, পোস্ট এডিটর (basic info / content / media / SEO with a Google preview / promotion), প্রমোশন, ক্যাটাগরি (order, enable), নোটিশ (expiry, publish, delete expired), রিপোর্ট (review, resolve, delete), অটোমেশন (pipeline `Source → Check Duplicate → OpenAI → Rewrite → Draft → Admin Review`, never auto-publishes, with live logs), টিম ও পারমিশন (RBAC: switch the "লগইন" dropdown on the dashboard to a moderator and the menu shrinks), অ্যানালিটিক্স, সেটিংস (12 sections incl. maintenance, admin path, SMTP, OpenAI, geo lookup), প্রোফাইল.

## Implementation notes for production

- One Node.js process (Hostinger shared hosting). Server-rendered HTML for the first load, then AJAX navigation with the History API, so back/forward keeps working. Prefetch on hover or touch.
- Automation runs on an in-app scheduler with optional cron. Logs stream to the admin panel via SSE.
- Images are WebP with `srcset` and `loading="lazy"`. Inline critical CSS.
- SEO: Organization, WebSite + SearchAction, JobPosting (detail), NewsArticle (notices), BreadcrumbList. Bengali slugs (`/চাকরি/বাংলাদেশ-পুলিশ-কনস্টেবল-নিয়োগ-২০২৬`), sitemap, robots.txt, canonical, OG/Twitter cards, Google verification.
- Maintenance mode returns 503 with `Retry-After` to visitors and bypasses it for authenticated admins.
