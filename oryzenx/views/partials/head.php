<?php
/** @var array $page */
$primary = (string)setting('color_primary');
$pal = Theme::palette();
$siteName = setting('site_name');
$favicon = setting('favicon') ? upload_url(setting('favicon')) : url('/icon-192.png?v=' . SystemController::iconVersion());
?><!doctype html>
<html lang="<?= e(lang()) ?>" data-theme="<?= e(setting('default_theme') === 'dark' ? 'dark' : 'light') ?>" data-layout="<?= e($page['layout']) ?>">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title><?= e($page['full_title']) ?></title>
<meta name="description" content="<?= e($page['description']) ?>">
<?php if ($page['keywords'] ?? ''): ?><meta name="keywords" content="<?= e($page['keywords']) ?>"><?php endif; ?>
<meta name="robots" content="<?= e($page['robots']) ?>">
<link rel="canonical" href="<?= e($page['canonical']) ?>">
<meta property="og:site_name" content="<?= e($siteName) ?>">
<meta property="og:type" content="<?= e($page['type']) ?>">
<meta property="og:title" content="<?= e($page['title'] ?: (setting('og_title') ?: $page['full_title'])) ?>">
<meta property="og:description" content="<?= e($page['description'] ?: setting('og_description')) ?>">
<meta property="og:url" content="<?= e($page['canonical']) ?>">
<?php $ogImage = $page['image'] ?: View::defaultImage(); ?>
<meta property="og:image" content="<?= e($ogImage) ?>">
<meta property="og:image:alt" content="<?= e($page['title'] ?: $siteName) ?>">
<meta property="og:locale" content="<?= lang() === 'bn' ? 'bn_BD' : 'en_US' ?>">
<?php if (!empty($page['published'])): ?><meta property="article:published_time" content="<?= e($page['published']) ?>"><meta property="article:modified_time" content="<?= e($page['modified']) ?>"><?php endif; ?>
<?php foreach (($page['tags'] ?? []) as $tag): ?><meta property="article:tag" content="<?= e($tag) ?>"><?php endforeach; ?>
<meta name="twitter:card" content="<?= e(setting('twitter_card') ?: 'summary_large_image') ?>">
<meta name="twitter:title" content="<?= e($page['title'] ?: $page['full_title']) ?>">
<meta name="twitter:description" content="<?= e($page['description']) ?>">
<meta name="twitter:image" content="<?= e($ogImage) ?>">
<?php if (setting('twitter_site')): ?><meta name="twitter:site" content="<?= e(setting('twitter_site')) ?>"><?php endif; ?>
<meta name="theme-color" content="<?= e(setting('pwa_theme_color') ?: $primary) ?>">
<meta name="ozx-base" content="<?= e(base_path()) ?>">
<meta name="csrf-token" content="<?= e(csrf_token()) ?>">
<?php $iv = SystemController::iconVersion(); ?>
<?php if (setting('pwa_enabled') === '1'): ?><link rel="manifest" href="<?= e(url('/manifest.json?v=' . $iv)) ?>"><?php endif; ?>
<meta name="application-name" content="<?= e(SystemController::appName()) ?>">
<meta name="apple-mobile-web-app-title" content="<?= e(SystemController::appName(true)) ?>">
<link rel="icon" href="<?= e($favicon) ?>">
<link rel="apple-touch-icon" href="<?= e(url('/icon-maskable.png?v=' . $iv)) ?>">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<script>
(function(){try{var d=document.documentElement,t=localStorage.getItem('ozx-theme');<?php if (setting('allow_dark') !== '1'): ?>t='light';<?php endif; ?>
if(!t&&<?= setting('default_theme') === 'auto' ? 'true' : 'false' ?>)t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
if(t)d.setAttribute('data-theme',t);var f=localStorage.getItem('ozx-fs');if(f&&f!=='sm')d.setAttribute('data-fs',f);}catch(e){}})();
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preconnect" href="https://cdnjs.cloudflare.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" referrerpolicy="no-referrer">
<link rel="stylesheet" href="<?= e(asset('css/base.css')) ?>">
<link rel="stylesheet" href="<?= e(asset('css/components.css')) ?>">
<link rel="stylesheet" href="<?= e(asset('css/layout.css')) ?>">
<link rel="stylesheet" href="<?= e(asset('css/chat.css')) ?>">
<link rel="stylesheet" href="<?= e(asset('css/logos.css')) ?>">
<?php foreach ($page['css'] as $css): ?><link rel="stylesheet" href="<?= e(asset("css/$css.css")) ?>" data-page-css><?php endforeach; ?>
<style>:root{--primary:<?= e($pal['primary']) ?>;--primary-dark:<?= e($pal['dark']) ?>;--primary-rgb:<?= e($pal['rgb']) ?>;--secondary:<?= e($pal['secondary']) ?>;--accent:<?= e($pal['accent']) ?>;--radius:<?= (int)setting('card_radius', 14) ?>px}</style>
<?php if (!empty($page['schema'])): ?><script type="application/ld+json"><?= json_encode($page['schema'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG) ?></script><?php endif; ?>
<script type="application/ld+json"><?= json_encode(['@context' => 'https://schema.org', '@type' => 'Organization', 'name' => $siteName, 'url' => base_url() . '/', 'logo' => abs_url(url('/icon-512.png')), 'email' => setting('contact_email'),
    'sameAs' => array_values(array_filter([setting('contact_facebook'), setting('social_x'), setting('social_linkedin'), setting('social_github'), setting('social_youtube')]))], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG) ?></script>
</head>
