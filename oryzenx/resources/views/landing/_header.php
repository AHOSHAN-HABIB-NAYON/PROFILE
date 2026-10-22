<?php use OryzenX\Core\View; /** @var callable $e */
$home = View::url('');
$anchor = fn (string $id) => ($isLanding ?? false) ? '#' . $id : $home . '#' . $id;
$other = $locale === 'bn' ? 'en' : 'bn';
?>
<a class="skip-link" href="#main"><?= $e($t['skip_to_content']) ?></a>
<header class="site-header" data-header>
  <div class="container header-inner">
    <a class="brand" href="<?= $e($home) ?>" aria-label="OryzenX">
      <?php include __DIR__ . '/../partials/logo.php'; ?>
    </a>
    <nav class="primary-nav" id="primary-nav" aria-label="<?= $e($t['nav_menu']) ?>" data-nav>
      <ul>
        <li><a href="<?= $e($anchor('home')) ?>"><?= $e($t['nav_home']) ?></a></li>
        <li><a href="<?= $e($anchor('features')) ?>"><?= $e($t['nav_features']) ?></a></li>
        <li><a href="<?= $e($anchor('how')) ?>"><?= $e($t['nav_how']) ?></a></li>
        <li><a href="<?= $e($anchor('security')) ?>"><?= $e($t['nav_security']) ?></a></li>
        <li><a href="<?= $e($anchor('faq')) ?>"><?= $e($t['nav_faq']) ?></a></li>
        <li><a href="<?= $e($anchor('support')) ?>"><?= $e($t['nav_support']) ?></a></li>
      </ul>
      <div class="nav-actions-mobile">
        <a class="btn btn-primary btn-block" href="<?= $e(View::url('app/')) ?>"><?= $e($t['cta_open_app']) ?></a>
      </div>
    </nav>
    <div class="header-actions">
      <a class="lang-switch" href="?lang=<?= $e($other) ?>" hreflang="<?= $e($other) ?>" lang="<?= $e($other) ?>" aria-label="<?= $e($t['lang_switch']) ?>: <?= $other === 'bn' ? 'বাংলা' : 'English' ?>">
        <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>
        <span><?= $other === 'bn' ? 'বাংলা' : 'English' ?></span>
      </a>
      <button class="icon-btn theme-toggle" type="button" data-theme-toggle aria-label="<?= $e($t['theme_toggle']) ?>" title="<?= $e($t['theme_toggle']) ?>">
        <svg class="icon icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
        <svg class="icon icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
      </button>
      <a class="btn btn-outline btn-sm hide-sm" href="<?= $e(View::url('app/#/login')) ?>"><?= $e($t['cta_login']) ?></a>
      <a class="btn btn-primary btn-sm hide-sm" href="<?= $e(View::url('app/')) ?>"><?= $e($t['cta_open_app']) ?></a>
      <button class="icon-btn nav-toggle" type="button" aria-controls="primary-nav" aria-expanded="false" data-nav-toggle>
        <span class="sr-only" data-label-open><?= $e($t['nav_menu']) ?></span>
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></svg>
      </button>
    </div>
  </div>
</header>
