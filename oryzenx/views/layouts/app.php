<?php
/** @var string $content @var array $page */
$user = auth();
require VIEWS . '/partials/head.php';
?>
<body class="layout-app">
<div id="progress" aria-hidden="true"></div>
<a class="skip-link" href="#main"><?= e(t('a11y.skip')) ?></a>
<?php require VIEWS . '/partials/header.php'; ?>
<div class="shell">
    <?php require VIEWS . '/partials/sidebar.php'; ?>
    <div class="shell-main">
        <main id="main" class="main" tabindex="-1">
            <?php if ($m = Session::flash('success')): ?><div class="alert alert-success" role="status"><i class="fa-solid fa-circle-check"></i> <?= e($m) ?></div><?php endif; ?>
            <?php if ($m = Session::flash('error')): ?><div class="alert alert-danger" role="alert"><i class="fa-solid fa-circle-exclamation"></i> <?= e($m) ?></div><?php endif; ?>
            <?= $content ?>
        </main>
        <?php require VIEWS . '/partials/footer.php'; ?>
    </div>
</div>
<?php require VIEWS . '/partials/bottomnav.php'; ?>
<?php require VIEWS . '/partials/chatbot.php'; ?>
<?php require VIEWS . '/partials/boot.php'; ?>
</body>
</html>
