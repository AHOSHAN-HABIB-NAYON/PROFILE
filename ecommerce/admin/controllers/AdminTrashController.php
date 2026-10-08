<?php
/**
 * Trash: restore or permanently delete soft-deleted records.
 */
final class AdminTrashController extends AdminController
{
    public function index(Request $r): Response
    {
        $type = (string)$r->get('type', '');
        return $this->page('trash', ['items' => Trash::items($type ?: null), 'type' => $type, 'types' => Trash::TYPES],
            ['title' => 'Trash', 'nav' => 'trash', 'page' => 'trash']);
    }

    public function restore(Request $r, string $type, string $id): Response
    {
        Trash::restore($type, (int)$id);
        return $this->done(ucfirst($type) . ' restored.');
    }

    public function purge(Request $r, string $type, string $id): Response
    {
        return Trash::purge($type, (int)$id) ? $this->done(ucfirst($type) . ' permanently deleted.') : $this->fail('Item not found in trash.', 404);
    }
}
