<?php
use OryzenX\Core\View;
/** @var callable $e @var array $t */
$isLanding = true;
$icon = function (string $name) {
    $paths = [
        'chart' => '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m19 9-5 5-4-4-3 3"/>',
        'live' => '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
        'pnl' => '<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>',
        'history' => '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
        'loan' => '<path d="M11 15h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 17"/><path d="m7 21 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9"/><path d="m2 16 6 6"/><circle cx="16" cy="9" r="2.9"/><circle cx="6" cy="5" r="3"/>',
        'salary' => '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
        'verify' => '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
        'bell' => '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
        'lock' => '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
        'key' => '<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>',
        'users' => '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
        'database' => '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
        'device' => '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
        'audit' => '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m9 15 2 2 4-4"/>',
        'mail' => '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
        'phone' => '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
        'clock' => '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
        'arrow' => '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
        'chev' => '<path d="m6 9 6 6 6-6"/>',
    ];
    return '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' . ($paths[$name] ?? '') . '</svg>';
};
$features = [['chart', 'portfolio'], ['live', 'prices'], ['pnl', 'pnl'], ['history', 'history'], ['loan', 'loans'], ['salary', 'salary'], ['verify', 'verify'], ['bell', 'notify']];
$security = [['lock', 1], ['key', 2], ['users', 3], ['database', 4], ['device', 5], ['audit', 6]];
$base = rtrim($canonical, '/');
?><!doctype html>
<html lang="<?= $e($locale) ?>" dir="ltr">
<head>
<?php include __DIR__ . '/_head.php'; ?>
<title><?= $e($t['meta_title']) ?></title>
<meta name="description" content="<?= $e($t['meta_description']) ?>">
<link rel="canonical" href="<?= $e($locale === 'en' ? $canonical : $canonical . '?lang=bn') ?>">
<link rel="alternate" hreflang="en" href="<?= $e($canonical) ?>?lang=en">
<link rel="alternate" hreflang="bn" href="<?= $e($canonical) ?>?lang=bn">
<link rel="alternate" hreflang="x-default" href="<?= $e($canonical) ?>">
<meta property="og:type" content="website">
<meta property="og:site_name" content="OryzenX">
<meta property="og:title" content="<?= $e($t['meta_title']) ?>">
<meta property="og:description" content="<?= $e($t['meta_description']) ?>">
<meta property="og:url" content="<?= $e($canonical) ?>">
<meta property="og:image" content="<?= $e($base . '/assets/images/og-image.png') ?>">
<meta property="og:locale" content="<?= $locale === 'bn' ? 'bn_BD' : 'en_US' ?>">
<meta property="og:locale:alternate" content="<?= $locale === 'bn' ? 'en_US' : 'bn_BD' ?>">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json"><?= json_encode(['@context' => 'https://schema.org', '@type' => 'Organization', 'name' => 'OryzenX', 'url' => $canonical, 'logo' => $base . '/assets/images/icon-512.png'], JSON_UNESCAPED_SLASHES) ?></script>
</head>
<body>
<?php include __DIR__ . '/_header.php'; ?>
<main id="main">
  <section class="hero" id="home">
    <div class="container hero-grid">
      <div class="hero-copy">
        <p class="eyebrow"><?= $e($t['hero_eyebrow']) ?></p>
        <h1><?= $e($t['hero_title']) ?></h1>
        <p class="lead"><?= $e($t['hero_lead']) ?></p>
        <div class="hero-cta">
          <a class="btn btn-primary" href="<?= $e(View::url('app/')) ?>"><?= $e($t['cta_open_app']) ?> <?= $icon('arrow') ?></a>
          <a class="btn btn-outline" href="#features"><?= $e($t['cta_explore']) ?></a>
        </div>
        <p class="hero-note"><?= $e($t['hero_note']) ?></p>
      </div>
      <figure class="hero-visual" aria-label="<?= $e($t['preview_label']) ?>">
        <div class="device" aria-hidden="true">
          <div class="device-top"><span class="device-title"><?= $e($t['preview_title']) ?></span><span class="pill-live"><span class="dot"></span><?= $e($t['preview_updated']) ?></span></div>
          <div class="device-metric">
            <span class="device-label"><?= $e($t['preview_net']) ?></span>
            <span class="device-value skeleton-line w-60"></span>
            <span class="skeleton-line w-30"></span>
          </div>
          <svg class="device-chart" viewBox="0 0 300 90" preserveAspectRatio="none">
            <defs><linearGradient id="g1" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--primary)" stop-opacity=".22"/><stop offset="1" stop-color="var(--primary)" stop-opacity="0"/></linearGradient></defs>
            <path d="M0 70 L30 62 L60 66 L90 50 L120 54 L150 40 L180 46 L210 30 L240 36 L270 22 L300 26 L300 90 L0 90 Z" fill="url(#g1)"/>
            <path d="M0 70 L30 62 L60 66 L90 50 L120 54 L150 40 L180 46 L210 30 L240 36 L270 22 L300 26" fill="none" stroke="var(--primary)" stroke-width="2.2" vector-effect="non-scaling-stroke"/>
          </svg>
          <div class="device-label"><?= $e($t['preview_assets']) ?></div>
          <ul class="device-list">
            <?php foreach ([['SOL', '#9945FF'], ['ETH', '#627EEA'], ['XRP', '#23292F']] as [$s, $c]): ?>
            <li><span class="coin" style="background:<?= $e($c) ?>"><?= $e($s[0]) ?></span><span class="coin-sym"><?= $e($s) ?></span><span class="skeleton-line w-40"></span></li>
            <?php endforeach; ?>
          </ul>
        </div>
        <figcaption class="hero-caption"><?= $e($t['preview_caption']) ?></figcaption>
      </figure>
    </div>
  </section>

  <section class="section section-alt" id="markets" aria-labelledby="markets-title">
    <div class="container">
      <div class="section-head">
        <h2 id="markets-title"><span class="pill-live"><span class="dot"></span>LIVE</span> <?= $e($t['markets_title']) ?></h2>
        <p class="lead"><?= $e($t['markets_lead']) ?></p>
      </div>
      <div class="markets-card" data-markets
        data-endpoint="<?= $e(View::url('api/public/markets')) ?>"
        data-locale="<?= $e($locale) ?>"
        data-msg-unavailable="<?= $e($t['markets_unavailable']) ?>"
        data-msg-no-price="<?= $e($t['markets_no_price']) ?>"
        data-msg-stale="<?= $e($t['markets_stale']) ?>"
        data-msg-simulated="<?= $e($t['markets_simulated']) ?>"
        data-msg-updated="<?= $e($t['markets_updated']) ?>"
        data-msg-source="<?= $e($t['markets_source']) ?>"
        data-msg-just-now="<?= $e($t['markets_just_now']) ?>"
        data-msg-min-ago="<?= $e($t['markets_min_ago']) ?>">
        <div class="markets-head" aria-hidden="true">
          <span><?= $e($t['markets_col_asset']) ?></span><span><?= $e($t['markets_col_price']) ?></span><span><?= $e($t['markets_col_change']) ?></span>
        </div>
        <ul class="markets-list" data-markets-list aria-live="polite" aria-busy="true">
          <?php for ($i = 0; $i < 6; $i++): ?>
          <li class="market-row is-loading"><span class="coin skeleton-dot"></span><span class="skeleton-line w-40"></span><span class="skeleton-line w-30"></span></li>
          <?php endfor; ?>
        </ul>
        <p class="markets-meta" data-markets-meta><?= $e($t['markets_loading']) ?></p>
      </div>
      <p class="markets-note"><?= $e($t['markets_note']) ?></p>
    </div>
  </section>

  <section class="section" id="features" aria-labelledby="features-title">
    <div class="container">
      <div class="section-head">
        <h2 id="features-title"><?= $e($t['features_title']) ?></h2>
        <p class="lead"><?= $e($t['features_lead']) ?></p>
      </div>
      <ul class="feature-grid">
        <?php foreach ($features as [$ic, $k]): ?>
        <li class="feature">
          <span class="feature-icon"><?= $icon($ic) ?></span>
          <h3><?= $e($t['f_' . $k . '_title']) ?></h3>
          <p><?= $e($t['f_' . $k . '_body']) ?></p>
        </li>
        <?php endforeach; ?>
      </ul>
    </div>
  </section>

  <section class="section section-alt" id="how" aria-labelledby="how-title">
    <div class="container">
      <div class="section-head">
        <h2 id="how-title"><?= $e($t['how_title']) ?></h2>
        <p class="lead"><?= $e($t['how_lead']) ?></p>
      </div>
      <ol class="steps">
        <?php for ($i = 1; $i <= 4; $i++): ?>
        <li class="step">
          <span class="step-num num"><?= $locale === 'bn' ? ['১', '২', '৩', '৪'][$i - 1] : $i ?></span>
          <h3><?= $e($t['how_' . $i . '_title']) ?></h3>
          <p><?= $e($t['how_' . $i . '_body']) ?></p>
        </li>
        <?php endfor; ?>
      </ol>
    </div>
  </section>

  <section class="section" id="security" aria-labelledby="security-title">
    <div class="container">
      <div class="section-head">
        <h2 id="security-title"><?= $e($t['security_title']) ?></h2>
        <p class="lead"><?= $e($t['security_lead']) ?></p>
      </div>
      <ul class="security-grid">
        <?php foreach ($security as [$ic, $n]): ?>
        <li class="sec-item">
          <span class="sec-icon"><?= $icon($ic) ?></span>
          <div><h3><?= $e($t['s_' . $n . '_title']) ?></h3><p><?= $e($t['s_' . $n . '_body']) ?></p></div>
        </li>
        <?php endforeach; ?>
      </ul>
      <p class="disclaimer"><?= $e($t['security_disclaimer']) ?></p>
    </div>
  </section>

  <section class="section section-alt" id="faq" aria-labelledby="faq-title">
    <div class="container narrow">
      <div class="section-head"><h2 id="faq-title"><?= $e($t['faq_title']) ?></h2></div>
      <div class="faq">
        <?php for ($i = 1; $i <= 6; $i++): ?>
        <details class="faq-item"<?= $i === 1 ? ' open' : '' ?>>
          <summary><span><?= $e($t['faq_' . $i . '_q']) ?></span><?= $icon('chev') ?></summary>
          <div class="faq-body"><p><?= $e($t['faq_' . $i . '_a']) ?></p></div>
        </details>
        <?php endfor; ?>
      </div>
    </div>
  </section>

  <section class="section" id="support" aria-labelledby="support-title">
    <div class="container support-grid">
      <div>
        <h2 id="support-title"><?= $e($t['support_title']) ?></h2>
        <p class="lead"><?= $e($t['support_lead']) ?></p>
        <ul class="contact-list">
          <?php if ($supportEmail !== ''): ?><li><?= $icon('mail') ?><span><span class="muted"><?= $e($t['support_email_label']) ?></span><br><a href="mailto:<?= $e($supportEmail) ?>"><?= $e($supportEmail) ?></a></span></li><?php endif; ?>
          <?php if ($supportPhone !== ''): ?><li><?= $icon('phone') ?><span><span class="muted"><?= $e($t['support_phone_label']) ?></span><br><a href="tel:<?= $e(preg_replace('/[^0-9+]/', '', $supportPhone)) ?>"><?= $e($supportPhone) ?></a></span></li><?php endif; ?>
          <?php if ($supportHours !== ''): ?><li><?= $icon('clock') ?><span><span class="muted"><?= $e($t['support_hours_label']) ?></span><br><?= $e($supportHours) ?></span></li><?php endif; ?>
          <?php if ($supportEmail === '' && $supportPhone === ''): ?><li class="muted"><?= $e($t['support_no_contact']) ?></li><?php endif; ?>
        </ul>
        <div class="download-card" id="download">
          <h3><?= $e($t['download_title']) ?></h3>
          <p class="muted"><?= $e($t['download_lead']) ?></p>
          <div class="download-actions">
            <a class="btn btn-outline btn-sm" href="<?= $e(View::url('app/')) ?>"><?= $e($t['download_web']) ?></a>
            <?php if ($playStoreUrl !== '' || $apkUrl !== ''): ?>
              <a class="btn btn-primary btn-sm" href="<?= $e($playStoreUrl !== '' ? $playStoreUrl : $apkUrl) ?>" rel="noopener"><?= $e($t['cta_download']) ?></a>
            <?php else: ?>
              <span class="subtle small"><?= $e($t['download_soon']) ?></span>
            <?php endif; ?>
          </div>
        </div>
      </div>
      <form class="card support-form" data-support-form novalidate action="<?= $e(View::url('api/support')) ?>" method="post"
            data-msg-required="<?= $e($t['v_required']) ?>" data-msg-email="<?= $e($t['v_email']) ?>"
            data-msg-error="<?= $e($t['support_error']) ?>" data-msg-rate="<?= $e($t['support_rate_limited']) ?>" data-msg-sending="<?= $e($t['form_sending']) ?>">
        <input type="hidden" name="form_token" value="<?= $e($formToken) ?>">
        <div class="hp" aria-hidden="true"><label>Website<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
        <div class="field">
          <label for="s-name"><?= $e($t['form_name']) ?></label>
          <input id="s-name" name="name" type="text" required minlength="2" maxlength="120" autocomplete="name" aria-errormessage="s-name-err">
          <p class="field-error" id="s-name-err" data-default="<?= $e($t['v_min_name']) ?>"><?= $e($t['v_min_name']) ?></p>
        </div>
        <div class="field">
          <label for="s-email"><?= $e($t['form_email']) ?></label>
          <input id="s-email" name="email" type="email" required maxlength="190" autocomplete="email" inputmode="email" aria-errormessage="s-email-err">
          <p class="field-error" id="s-email-err" data-default="<?= $e($t['v_email']) ?>"><?= $e($t['v_email']) ?></p>
        </div>
        <div class="field">
          <label for="s-subject"><?= $e($t['form_subject']) ?></label>
          <input id="s-subject" name="subject" type="text" required minlength="3" maxlength="150" aria-errormessage="s-subject-err">
          <p class="field-error" id="s-subject-err" data-default="<?= $e($t['v_min_subject']) ?>"><?= $e($t['v_min_subject']) ?></p>
        </div>
        <div class="field">
          <label for="s-message"><?= $e($t['form_message']) ?></label>
          <span class="hint" id="s-message-hint"><?= $e($t['form_message_hint']) ?></span>
          <textarea id="s-message" name="message" rows="5" required minlength="10" maxlength="5000" aria-describedby="s-message-hint" aria-errormessage="s-message-err"></textarea>
          <p class="field-error" id="s-message-err" data-default="<?= $e($t['v_min_message']) ?>"><?= $e($t['v_min_message']) ?></p>
        </div>
        <div class="form-status" role="status" aria-live="polite" data-form-status></div>
        <button class="btn btn-primary btn-block" type="submit" data-submit><?= $e($t['form_submit']) ?></button>
      </form>
    </div>
  </section>
</main>
<?php include __DIR__ . '/_footer.php'; ?>
<script src="<?= $e(View::asset('js/landing.js')) ?>" defer></script>
</body>
</html>
