<?php
/**
 * Static policy page. $html is already sanitized.
 * @var string $title @var string $html @var array $crumbs
 */
?>
<div class="static-page">
  <?= View::component('breadcrumb', ['crumbs' => $crumbs]) ?>
  <article class="card static-card">
    <h1 class="page-title"><?= e($title) ?></h1>
    <div class="rich"><?= $html ?></div>
  </article>
</div>
