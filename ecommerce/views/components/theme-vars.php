<?php
/**
 * Admin-controlled brand colours injected as CSS custom properties.
 * Values are validated hex codes so they are safe inside <style>.
 */
$hex = static fn(string $key, string $fallback) => preg_match('/^#[0-9a-f]{6}$/i', (string)setting($key)) ? setting($key) : $fallback;
?>
<style>:root{--primary:<?= $hex('primary_color', '#4f46e5') ?>;--primary-dark:<?= $hex('primary_dark', '#4338ca') ?>;--secondary:<?= $hex('secondary_color', '#7c3aed') ?>;--accent:<?= $hex('accent_color', '#06b6d4') ?>}</style>
