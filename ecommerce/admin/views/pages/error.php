<?php
/**
 * @var int $status @var string $message
 */
?>
<div class="a-page">
  <?= View::render('admin:partials/empty', ['icon' => 'fa-solid fa-circle-exclamation', 'title' => $status === 404 ? 'Not found' : 'Something went wrong', 'text' => $message, 'cta' => 'Back to dashboard', 'href' => '/admin']) ?>
</div>
