<?php
/**
 * Reusable view components shared by the public pages.
 */
declare(strict_types=1);

function logo_svg(int $size = 34): string
{
    return '<svg class="logo-mark" width="' . $size . '" height="' . $size . '" viewBox="0 0 48 48" aria-hidden="true">'
        . '<defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--a1)"/><stop offset="1" stop-color="var(--a2)"/></linearGradient></defs>'
        . '<path d="M24 3 42 13.5v21L24 45 6 34.5v-21Z" fill="none" stroke="url(#lg)" stroke-width="4" stroke-linejoin="round"/>'
        . '<path d="m19 18-6 6 6 6M29 18l6 6-6 6M26 15l-4 18" fill="none" stroke="url(#lg)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

function brand(): string
{
    $name = setting('site_name', 'CodeNexa');
    // Two-tone wordmark: split CamelCase names like "CodeNexa" / "TechSolutions".
    if (preg_match('/^([A-Z][a-z]+)([A-Z].*)$/u', $name, $m)) {
        $name = e($m[1]) . '<span class="grad-text">' . e($m[2]) . '</span>';
    } else {
        $name = e($name);
    }
    return '<a href="' . e(url()) . '" class="brand" data-link>' . logo_svg() . '<span>' . $name . '</span></a>';
}

function section_head(string $eyebrow, string $title, string $sub = '', string $linkText = '', string $link = ''): void
{
    ?>
    <div class="sec-head reveal">
        <div>
            <span class="eyebrow"><?= e($eyebrow) ?></span>
            <h2><?= e($title) ?></h2>
            <?php if ($sub): ?><p class="muted"><?= e($sub) ?></p><?php endif; ?>
        </div>
        <?php if ($linkText): ?>
            <a href="<?= e($link) ?>" class="link-arrow" data-link><?= e($linkText) ?> <i class="fa-solid fa-arrow-right"></i></a>
        <?php endif; ?>
    </div>
    <?php
}

function page_hero(string $title, string $sub = '', string $back = '', string $backText = ''): void
{
    ?>
    <section class="page-hero">
        <div class="container">
            <?php if ($back): ?>
                <a href="<?= e($back) ?>" class="back-link" data-link><i class="fa-solid fa-arrow-left"></i> <?= e($backText) ?></a>
            <?php endif; ?>
            <h1 class="reveal"><?= e($title) ?></h1>
            <?php if ($sub): ?><p class="muted reveal"><?= e($sub) ?></p><?php endif; ?>
        </div>
    </section>
    <?php
}

function services_grid(array $services, bool $searchable = false): void
{
    ?>
    <div class="grid services-grid"<?= $searchable ? ' data-search-list' : '' ?>>
        <?php foreach ($services as $i => $s): ?>
            <a href="<?= e(url('service', ['slug' => $s['slug']])) ?>" class="card service-card reveal" data-link
               style="--c:<?= e($s['color']) ?>;--d:<?= ($i % 4) * 60 ?>ms" data-search="<?= e(strtolower($s['title'] . ' ' . $s['summary'])) ?>">
                <span class="icon-tile"><i class="<?= e($s['icon']) ?>"></i></span>
                <h3><?= e($s['title']) ?></h3>
                <p class="muted"><?= e($s['summary']) ?></p>
                <span class="card-arrow"><i class="fa-solid fa-arrow-right"></i></span>
            </a>
        <?php endforeach; ?>
    </div>
    <?php if ($searchable): ?>
        <p class="empty muted" hidden><?= e(t('services.empty')) ?></p>
    <?php endif;
}

function mock_thumb(string $color, string $category): string
{
    $phone = $category === 'app';
    $html = '<div class="mock ' . ($phone ? 'mock-phone' : 'mock-web') . '" style="--c:' . e($color) . '" aria-hidden="true">';
    if ($phone) {
        for ($i = 0; $i < 3; $i++) {
            $html .= '<div class="phone"><i></i><b></b><b></b><span></span><span></span></div>';
        }
    } else {
        $html .= '<div class="win"><div class="bar"><i></i><i></i><i></i></div><div class="hero-b"></div><div class="row"><span></span><span></span><span></span></div></div>';
    }
    return $html . '</div>';
}

function portfolio_grid(array $projects, bool $filters = true): void
{
    if ($filters): ?>
        <div class="chips reveal" role="tablist" data-filter>
            <?php foreach (['all', 'web', 'app', 'uiux'] as $i => $f): ?>
                <button type="button" class="chip<?= $i === 0 ? ' active' : '' ?>" data-f="<?= $f ?>"><?= e(t('portfolio.' . $f)) ?></button>
            <?php endforeach; ?>
        </div>
    <?php endif; ?>
    <div class="grid portfolio-grid">
        <?php foreach ($projects as $i => $p): ?>
            <article class="card project-card reveal" data-cat="<?= e($p['category']) ?>" style="--d:<?= ($i % 3) * 70 ?>ms">
                <?= mock_thumb($p['color'], $p['category']) ?>
                <div class="project-body">
                    <h3><?= e($p['title']) ?></h3>
                    <span class="muted small"><?= e($p['label']) ?></span>
                    <?php if ($p['link']): ?>
                        <a href="<?= e($p['link']) ?>" target="_blank" rel="noopener" class="project-link" aria-label="<?= e($p['title']) ?>"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>
                    <?php endif; ?>
                </div>
            </article>
        <?php endforeach; ?>
    </div>
    <?php
}

function stats_strip(): void
{
    $stats = [
        ['stat_years', '+', 'stat.years', 'fa-solid fa-star'],
        ['stat_projects', '+', 'stat.projects', 'fa-solid fa-briefcase'],
        ['stat_clients', '+', 'stat.clients', 'fa-solid fa-users'],
        ['stat_satisfaction', '%', 'stat.satisfaction', 'fa-solid fa-shield-heart'],
    ];
    ?>
    <div class="stats">
        <?php foreach ($stats as $i => $s): ?>
            <div class="stat card reveal" style="--d:<?= $i * 70 ?>ms">
                <span class="stat-icon"><i class="<?= $s[3] ?>"></i></span>
                <div>
                    <strong><span data-count="<?= (int) setting($s[0], '0') ?>">0</span><?= $s[1] ?></strong>
                    <small class="muted"><?= e(t($s[2])) ?></small>
                </div>
            </div>
        <?php endforeach; ?>
    </div>
    <?php
}

function why_section(): void
{
    $items = [
        ['fa-solid fa-user-group', 'why.team'],
        ['fa-solid fa-tags', 'why.price'],
        ['fa-solid fa-truck-fast', 'why.time'],
        ['fa-solid fa-headset', 'why.support'],
    ];
    ?>
    <section class="section why">
        <div class="container why-wrap">
            <div>
                <h2 class="reveal"><?= e(t('why.title', ['site' => setting('site_name', 'CodeNexa')])) ?></h2>
                <p class="muted reveal"><?= e(t('why.text')) ?></p>
                <ul class="why-list">
                    <?php foreach ($items as $i => $it): ?>
                        <li class="reveal" style="--d:<?= $i * 70 ?>ms">
                            <span class="icon-round"><i class="<?= $it[0] ?>"></i></span>
                            <div><strong><?= e(t($it[1])) ?></strong><span class="muted"><?= e(t($it[1] . '_t')) ?></span></div>
                        </li>
                    <?php endforeach; ?>
                </ul>
            </div>
            <div class="why-art reveal" aria-hidden="true"><?= iso_art() ?></div>
        </div>
    </section>
    <?php
}

function pricing_section(array $plans): void
{
    if (!$plans) {
        return;
    }
    ?>
    <section class="section" id="pricing">
        <div class="container">
            <div class="sec-head center reveal">
                <div>
                    <h2><?= e(t('pricing.title')) ?></h2>
                    <p class="muted"><?= e(t('pricing.text')) ?></p>
                </div>
            </div>
            <div class="billing reveal" data-billing>
                <button type="button" class="active" data-b="monthly"><?= e(t('pricing.monthly')) ?></button>
                <button type="button" data-b="yearly"><?= e(t('pricing.yearly')) ?> <em><?= e(t('pricing.save')) ?></em></button>
                <span class="billing-pill"></span>
            </div>
            <div class="grid pricing-grid">
                <?php foreach ($plans as $i => $p): ?>
                    <div class="card plan reveal<?= $p['popular'] ? ' popular' : '' ?>" style="--d:<?= $i * 80 ?>ms">
                        <?php if ($p['popular']): ?><span class="badge"><?= e(t('pricing.popular')) ?></span><?php endif; ?>
                        <h3><?= e($p['name']) ?></h3>
                        <small class="muted"><?= e($p['tagline']) ?></small>
                        <div class="price">
                            <strong>$<span data-m="<?= (int) $p['monthly'] ?>" data-y="<?= (int) $p['yearly'] ?>"><?= (int) $p['monthly'] ?></span></strong>
                            <span class="muted per" data-m="<?= e(t('pricing.month')) ?>" data-y="<?= e(t('pricing.year')) ?>"><?= e(t('pricing.month')) ?></span>
                        </div>
                        <ul class="checks">
                            <?php foreach (lines((string) $p['features']) as $f): ?>
                                <li><i class="fa-solid fa-check"></i> <?= e($f) ?></li>
                            <?php endforeach; ?>
                        </ul>
                        <a href="<?= e(url('contact')) ?>" class="btn <?= $p['popular'] ? 'btn-primary' : 'btn-outline' ?> btn-block" data-link><?= e(t('pricing.cta')) ?></a>
                    </div>
                <?php endforeach; ?>
            </div>
        </div>
    </section>
    <?php
}

function team_grid(array $team): void
{
    ?>
    <div class="grid team-grid">
        <?php foreach ($team as $i => $m):
            $parts = preg_split('/\s+/', trim($m['name']));
            $ini = mb_strtoupper(mb_substr($parts[0], 0, 1) . (isset($parts[1]) ? mb_substr($parts[1], 0, 1) : ''));
            ?>
            <div class="card member reveal" style="--c:<?= e($m['color']) ?>;--d:<?= ($i % 4) * 70 ?>ms">
                <div class="avatar"><span><?= e($ini) ?></span></div>
                <h3><?= e($m['name']) ?></h3>
                <span class="muted small"><?= e($m['role']) ?></span>
            </div>
        <?php endforeach; ?>
    </div>
    <?php
}

function contact_section(): void
{
    ?>
    <section class="section contact" id="contact">
        <div class="container contact-wrap card">
            <div class="contact-info">
                <h2 class="reveal"><?= e(t('contact.title')) ?></h2>
                <p class="muted reveal"><?= e(t('contact.text')) ?></p>
                <ul class="info-list">
                    <li class="reveal"><span class="icon-round"><i class="fa-solid fa-envelope"></i></span><div><small class="muted"><?= e(t('contact.email')) ?></small><a href="mailto:<?= e(setting('email')) ?>"><?= e(setting('email')) ?></a></div></li>
                    <li class="reveal"><span class="icon-round"><i class="fa-solid fa-phone"></i></span><div><small class="muted"><?= e(t('contact.phone')) ?></small><a href="tel:<?= e(preg_replace('/[^\d+]/', '', setting('phone'))) ?>"><?= e(setting('phone')) ?></a></div></li>
                    <li class="reveal"><span class="icon-round"><i class="fa-solid fa-location-dot"></i></span><div><small class="muted"><?= e(t('contact.location')) ?></small><span><?= e(setting('address')) ?></span></div></li>
                </ul>
                <div class="contact-art reveal" aria-hidden="true">
                    <i class="fa-solid fa-paper-plane"></i>
                    <p class="script"><?= e(t('contact.tagline')) ?></p>
                </div>
            </div>
            <form class="contact-form reveal" data-contact novalidate>
                <div class="hp" aria-hidden="true"><input type="text" name="website" tabindex="-1" autocomplete="off"></div>
                <label><span><?= e(t('form.name')) ?> *</span>
                    <input type="text" name="name" required maxlength="120" placeholder="<?= e(t('form.name_ph')) ?>" autocomplete="name"></label>
                <label><span><?= e(t('form.email')) ?> *</span>
                    <input type="email" name="email" required maxlength="190" placeholder="<?= e(t('form.email_ph')) ?>" autocomplete="email"></label>
                <label><span><?= e(t('form.phone')) ?></span>
                    <input type="tel" name="phone" maxlength="40" placeholder="<?= e(t('form.phone_ph')) ?>" autocomplete="tel"></label>
                <label><span><?= e(t('form.message')) ?> *</span>
                    <textarea name="message" required maxlength="5000" rows="5" placeholder="<?= e(t('form.message_ph')) ?>"></textarea></label>
                <button type="submit" class="btn btn-primary btn-block" data-sending="<?= e(t('form.sending')) ?>">
                    <span><?= e(t('form.send')) ?></span> <i class="fa-solid fa-paper-plane"></i>
                </button>
            </form>
        </div>
    </section>
    <?php
}

function cta_band(): void
{
    ?>
    <section class="section">
        <div class="container">
            <div class="cta-band reveal">
                <div>
                    <h2><?= e(t('cta.title')) ?></h2>
                    <p><?= e(t('cta.text')) ?></p>
                </div>
                <a href="<?= e(url('contact')) ?>" class="btn btn-light" data-link><?= e(t('nav.quote')) ?> <i class="fa-solid fa-arrow-right"></i></a>
            </div>
        </div>
    </section>
    <?php
}

/** Isometric laptop + server illustration (inline SVG, no image requests). */
function iso_art(): string
{
    return <<<'SVG'
<svg viewBox="0 0 420 340" class="iso" role="presentation">
  <defs>
    <linearGradient id="ig1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--a1)"/><stop offset="1" stop-color="var(--a2)"/></linearGradient>
    <linearGradient id="ig2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--a2)" stop-opacity=".55"/><stop offset="1" stop-color="var(--a1)" stop-opacity=".05"/></linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
  </defs>
  <path d="M210 300 30 200l180-100 180 100Z" fill="url(#ig2)" opacity=".5"/>
  <path d="M210 290 60 205l150-85 150 85Z" fill="none" stroke="url(#ig1)" stroke-opacity=".5" stroke-dasharray="4 6"/>
  <g class="float-a">
    <path d="M140 210 230 160l70 40-90 50Z" fill="var(--surface)" stroke="url(#ig1)" stroke-width="2"/>
    <path d="M230 160 230 70l70 40v90Z" fill="var(--surface-2)" stroke="url(#ig1)" stroke-width="2"/>
    <g stroke="url(#ig1)" stroke-width="3" stroke-linecap="round">
      <path d="m242 95 18 10"/><path d="m242 108 34 19" opacity=".7"/><path d="m248 124 26 15" opacity=".5"/><path d="m242 136 40 23" opacity=".8"/><path d="m248 152 22 12" opacity=".5"/>
    </g>
  </g>
  <g class="float-b">
    <path d="M300 230v-60l40-22v60Z" fill="url(#ig1)" opacity=".9"/>
    <path d="M300 230v-60l-30-17v60Z" fill="var(--surface-2)" stroke="url(#ig1)"/>
    <path d="M270 153l30 17 40-22-30-17Z" fill="var(--surface)" stroke="url(#ig1)"/>
    <circle cx="318" cy="180" r="2.5" fill="#fff"/><circle cx="318" cy="198" r="2.5" fill="#fff"/><circle cx="318" cy="216" r="2.5" fill="#fff"/>
  </g>
  <g class="float-c">
    <circle cx="330" cy="70" r="30" fill="url(#ig1)" filter="url(#glow)" opacity=".6"/>
    <path d="M312 82a14 14 0 0 1 2-28 20 20 0 0 1 38 6 11 11 0 0 1-2 22Z" fill="url(#ig1)"/>
    <path d="m331 64 0 12m-6-6 6-6 6 6" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>
  </g>
  <g class="float-a" style="animation-delay:-2s">
    <rect x="72" y="92" width="64" height="40" rx="10" fill="var(--surface)" stroke="url(#ig1)" stroke-width="2"/>
    <text x="104" y="118" text-anchor="middle" font-size="16" font-weight="800" fill="url(#ig1)" font-family="Poppins,sans-serif">PHP</text>
  </g>
  <g class="float-b" style="animation-delay:-1s">
    <rect x="96" y="232" width="72" height="40" rx="10" fill="var(--surface)" stroke="url(#ig1)" stroke-width="2"/>
    <text x="132" y="258" text-anchor="middle" font-size="15" font-weight="800" fill="#22c55e" font-family="Poppins,sans-serif">node</text>
  </g>
</svg>
SVG;
}
