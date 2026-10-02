<label class="switch-row"><span><?= e($label) ?><?php if (!empty($hint)): ?><small><?= e($hint) ?></small><?php endif; ?></span>
  <span class="switch"><input type="hidden" name="<?= e($name) ?>" value="0"><input type="checkbox" name="<?= e($name) ?>" value="1"<?= !empty($checked) ? ' checked' : '' ?>><span></span></span></label>
