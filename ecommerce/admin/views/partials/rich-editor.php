<?php
/**
 * Lightweight rich text editor (contenteditable + toolbar). Output is sanitized server-side.
 * @var string $name @var string $value @var string $id
 */
$tools = [
    ['bold', 'fa-solid fa-bold', 'Bold'], ['italic', 'fa-solid fa-italic', 'Italic'], ['underline', 'fa-solid fa-underline', 'Underline'],
    ['h2', 'fa-solid fa-heading', 'Heading'], ['h3', 'fa-solid fa-h', 'Subheading'], ['p', 'fa-solid fa-paragraph', 'Paragraph'],
    ['insertUnorderedList', 'fa-solid fa-list-ul', 'Bullet list'], ['insertOrderedList', 'fa-solid fa-list-ol', 'Numbered list'],
    ['link', 'fa-solid fa-link', 'Link'], ['image', 'fa-solid fa-image', 'Image'], ['table', 'fa-solid fa-table', 'Table'],
    ['removeFormat', 'fa-solid fa-text-slash', 'Clear formatting'], ['source', 'fa-solid fa-code', 'HTML source'],
];
?>
<div class="rte" data-rte data-upload="<?= e(url('/admin/editor/upload')) ?>">
  <div class="rte-toolbar" role="toolbar" aria-label="Formatting">
    <?php foreach ($tools as [$cmd, $ic, $label]): ?>
      <button type="button" class="rte-btn" data-rte-cmd="<?= e($cmd) ?>" aria-label="<?= e($label) ?>" title="<?= e($label) ?>"><i class="<?= e($ic) ?>" aria-hidden="true"></i></button>
    <?php endforeach; ?>
    <input type="file" accept="image/jpeg,image/png,image/webp" hidden data-rte-file>
  </div>
  <div class="rte-area rich" id="<?= e($id) ?>" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Description" data-rte-area><?= HtmlSanitizer::clean($value) ?></div>
  <textarea class="input rte-source" name="<?= e($name) ?>" rows="10" hidden data-rte-input><?= e(HtmlSanitizer::clean($value)) ?></textarea>
</div>
