<?php
/** Admin: products (packages sold under each service). */
defined('APP') || exit;
require_once ROOT . '/admin/_crud.php';
meta(['title' => 'Products']);
?>
<div class="page">
  <div class="adm-title"><h1>Products</h1><a class="btn btn-sm btn-soft" href="<?= e(url('/admin/services')) ?>"><i class="fa-solid fa-layer-group"></i>Services</a></div>
  <p class="muted small">Each service can have several products with their own USD/BDT prices, discount, features, delivery time and support period. Customers buy products via <b>Buy Now</b>.</p>
  <?php crud_render('products', '/admin/products') ?>
</div>
