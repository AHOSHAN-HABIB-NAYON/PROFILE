<?php
/** Admin: news posts (rich editor) & categories. */
defined('APP') || exit;
require_once ROOT . '/admin/_crud.php';
$tab = input('tab') === 'categories' ? 'categories' : 'posts';
meta(['title' => 'News']);
?>
<div class="page">
  <div class="adm-title"><h1>News</h1><a class="btn btn-sm btn-soft" href="<?= e(url('/news')) ?>" target="_blank" rel="noopener"><i class="fa-solid fa-eye"></i>View feed</a></div>
  <nav class="tabs">
    <a class="tab <?= $tab === 'posts' ? 'active' : '' ?>" href="<?= e(url('/admin/news')) ?>"><i class="fa-solid fa-newspaper"></i>Posts</a>
    <a class="tab <?= $tab === 'categories' ? 'active' : '' ?>" href="<?= e(url('/admin/news?tab=categories')) ?>"><i class="fa-solid fa-hashtag"></i>Categories</a>
  </nav>
  <?php $tab === 'categories' ? crud_render('news_categories', '/admin/news?tab=categories') : crud_render('news', '/admin/news') ?>
</div>
