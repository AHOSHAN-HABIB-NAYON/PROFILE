<?php use OryzenX\Core\View; /** @var callable $e @var array $t @var array $legal */
$doc = $legal[$page];
$isLanding = false;
?><!doctype html>
<html lang="<?= $e($locale) ?>">
<head>
<?php include __DIR__ . '/_head.php'; ?>
<title><?= $e($doc['title']) ?> — OryzenX</title>
<meta name="description" content="<?= $e($doc['sections'][0][1]) ?>">
<link rel="canonical" href="<?= $e($canonical . $page . ($locale === 'bn' ? '?lang=bn' : '')) ?>">
<link rel="alternate" hreflang="en" href="<?= $e($canonical . $page) ?>?lang=en">
<link rel="alternate" hreflang="bn" href="<?= $e($canonical . $page) ?>?lang=bn">
</head>
<body>
<?php include __DIR__ . '/_header.php'; ?>
<main id="main" class="legal">
  <div class="container narrow">
    <a class="back-link" href="<?= $e(View::url('')) ?>">← <?= $e($t['back_home']) ?></a>
    <h1><?= $e($doc['title']) ?></h1>
    <p class="subtle"><?= $e($t['last_updated']) ?>: <?= $e($legal['updated']) ?></p>
    <?php foreach ($doc['sections'] as $i => [$h, $p]): ?>
      <section aria-labelledby="sec-<?= $i ?>"><h2 id="sec-<?= $i ?>"><?= $e($h) ?></h2><p><?= $e($p) ?></p></section>
    <?php endforeach; ?>
    <p class="disclaimer"><?= $e($legal['review_note']) ?></p>
  </div>
</main>
<?php include __DIR__ . '/_footer.php'; ?>
<script src="<?= $e(View::asset('js/landing.js')) ?>" defer></script>
</body>
</html>
