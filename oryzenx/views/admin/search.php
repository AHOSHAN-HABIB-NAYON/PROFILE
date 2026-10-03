<?php /** @var string $q @var array $res */
$sections = [
    'users' => ['fa-solid fa-users', fn($r) => [url('/admin/users/' . $r['id']), $r['name'], $r['email']]],
    'payments' => ['fa-solid fa-wallet', fn($r) => [url('/admin/payments/' . $r['id']), '#' . $r['id'] . ' · ' . $r['name'] . ' · ' . money($r['amount'], $r['currency']), $r['transaction_id'] . ' · ' . t('status.' . $r['status'])]],
    'orders' => ['fa-solid fa-receipt', fn($r) => [$r['payment_id'] ? url('/admin/payments/' . $r['payment_id']) : url('/admin/payments'), $r['order_no'], $r['service_title'] . ' · ' . t('status.' . $r['status'])]],
    'posts' => ['fa-solid fa-newspaper', fn($r) => [url('/admin/posts/' . $r['id']), $r['title'], t('status.' . $r['status'])]],
    'services' => ['fa-solid fa-layer-group', fn($r) => [url('/admin/services/' . $r['id']), $r['title'], '/' . $r['slug']]],
    'messages' => ['fa-solid fa-inbox', fn($r) => [url('/admin/messages/' . $r['id']), $r['subject'], $r['name']]],
];
?>
<div class="admin-head"><h1><?= e(t('admin.search')) ?></h1></div>
<form class="filter-bar" method="get" action="<?= e(url('/admin/search')) ?>">
    <div class="input-icon grow"><i class="fa-solid fa-magnifying-glass"></i><input class="input" type="search" name="q" value="<?= e($q) ?>" placeholder="<?= e(t('admin.search_ph')) ?>" autofocus minlength="2"></div>
    <button class="btn btn-primary" type="submit"><?= e(t('search.go')) ?></button>
</form>
<?php if ($q !== '' && !array_filter($res)): ?><div class="card empty"><i class="fa-solid fa-magnifying-glass"></i><?= e(t('js.no_results')) ?></div><?php endif; ?>
<div class="admin-grid">
<?php foreach ($sections as $key => [$icon, $fn]): if (empty($res[$key])) continue; ?>
    <section class="card">
        <h2 class="card-title mb-1"><i class="<?= $icon ?> text-primary"></i> <?= e(t('admin.' . $key)) ?> <span class="badge"><?= num(count($res[$key])) ?></span></h2>
        <div class="list"><?php foreach ($res[$key] as $r): [$href, $title, $sub] = $fn($r); ?>
            <a class="list-item" href="<?= e($href) ?>"><span class="grow" style="min-width:0"><span class="title truncate" style="display:block"><?= e($title) ?></span><span class="sub truncate" style="display:block"><?= e($sub) ?></span></span></a>
        <?php endforeach; ?></div>
    </section>
<?php endforeach; ?>
</div>
