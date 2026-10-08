<?php
/**
 * Home page banners: auto-cropped to 2:1 and saved as optimized WebP in 3 sizes.
 */
final class AdminBannerController extends AdminController
{
    public function index(Request $r): Response
    {
        $edit = $r->get('edit') ? DB::one('SELECT * FROM banners WHERE id = ? AND deleted_at IS NULL', [(int)$r->get('edit')]) : null;
        $rows = DB::all('SELECT * FROM banners WHERE deleted_at IS NULL ORDER BY sort_order, id');
        return $this->page('banners', ['rows' => $rows, 'edit' => $edit], ['title' => 'Banners', 'nav' => 'banners', 'page' => 'banners']);
    }

    public function save(Request $r): Response
    {
        $id = $r->int('id');
        $existing = $id ? DB::one('SELECT * FROM banners WHERE id = ? AND deleted_at IS NULL', [$id]) : null;
        if ($id && !$existing) {
            return $this->fail('Banner not found.', 404);
        }
        $link = $r->str('link', 255);
        if ($link !== '' && !preg_match('#^(https?://|/)#i', $link)) {
            return $this->fail('Link must start with / or https://');
        }
        $data = [
            'title' => $this->strOrNull($r, 'title', 191),
            'subtitle' => $this->strOrNull($r, 'subtitle', 300),
            'cta_text' => $this->strOrNull($r, 'cta_text', 60),
            'link' => $link ?: null,
            'is_active' => $r->bool('is_active') ? 1 : 0,
            'sort_order' => $r->int('sort_order', 0),
            'starts_at' => $this->dateOrNull($r, 'starts_at'),
            'ends_at' => $this->dateOrNull($r, 'ends_at'),
        ];
        if ($f = $r->file('image')) {
            $img = ImageService::storeVariants($f, 'banner');
            $data['image'] = $img['path'];
            $data['ext'] = $img['ext'];
            if ($existing && $existing['image']) {
                ImageService::deleteVariants($existing['image'], $existing['ext'], 'banner');
            }
        } elseif (!$existing) {
            return $this->fail('Please upload a banner image (wide images work best, e.g. 1600×800).');
        }
        if ($existing) {
            DB::update('banners', $data, 'id = ?', [$id]);
        } else {
            $id = DB::insert('banners', $data);
        }
        Audit::log($existing ? 'banner.update' : 'banner.create', 'banner', $id);
        Cache::catalogChanged();
        return $this->done('Banner saved.', ['redirect' => url('/admin/banners')]);
    }

    public function delete(Request $r, string $id): Response
    {
        return Trash::softDelete('banner', (int)$id) ? $this->done('Banner moved to trash.') : $this->fail('Banner not found.', 404);
    }
}
