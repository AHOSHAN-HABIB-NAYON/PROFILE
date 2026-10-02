<?php
/** Admin: services & categories. */
defined('APP') || exit;
require_once ROOT . '/admin/_crud.php';
$tab = input('tab') === 'categories' ? 'categories' : 'services';
meta(['title' => 'Services']);
?>
<div class="page">
  <div class="adm-title"><h1>Services</h1><a class="btn btn-sm btn-soft" href="<?= e(url('/admin/products')) ?>"><i class="fa-solid fa-boxes-stacked"></i>Products</a></div>
  <nav class="tabs">
    <a class="tab <?= $tab === 'services' ? 'active' : '' ?>" href="<?= e(url('/admin/services')) ?>"><i class="fa-solid fa-layer-group"></i>Services</a>
    <a class="tab <?= $tab === 'categories' ? 'active' : '' ?>" href="<?= e(url('/admin/services?tab=categories')) ?>"><i class="fa-solid fa-folder"></i>Categories</a>
  </nav>
  <?php $tab === 'categories' ? crud_render('service_categories', '/admin/services?tab=categories') : crud_render('services', '/admin/services') ?>
</div>
