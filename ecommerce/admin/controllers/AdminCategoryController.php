<?php
/**
 * Categories with visual Font Awesome icon picker or uploaded icon/image.
 */
final class AdminCategoryController extends AdminController
{
    public function index(Request $r): Response
    {
        $edit = $r->get('edit') ? Category::find((int)$r->get('edit')) : null;
        return $this->page('categories', [
            'rows' => Category::adminList(),
            'edit' => $edit,
            'parents' => DB::all('SELECT id, name FROM categories WHERE deleted_at IS NULL AND parent_id IS NULL ORDER BY sort_order, name'),
            'icons' => DB::all('SELECT icon_class, label, group_name, keywords FROM category_icons ORDER BY group_name, label'),
        ], ['title' => 'Categories', 'nav' => 'categories', 'page' => 'categories']);
    }

    public function save(Request $r): Response
    {
        $id = $r->int('id');
        $existing = $id ? Category::find($id) : null;
        if ($id && !$existing) {
            return $this->fail('Category not found.', 404);
        }
        $name = $r->str('name', 150);
        $slug = slugify($r->str('slug', 170) ?: $name);
        $this->validate(['name' => $name], ['name' => 'required|max:150'], ['name' => 'Name']);
        $parent = $r->int('parent_id') ?: null;
        if ($parent && ($parent === $id || !Category::find($parent))) {
            return $this->fail('Invalid parent category.');
        }
        $icon = $r->str('icon', 80);
        if ($icon !== '' && !preg_match('/^fa-(solid|regular|brands) fa-[a-z0-9-]+$/', $icon)) {
            return $this->fail('Invalid icon.');
        }
        $data = [
            'parent_id' => $parent,
            'name' => $name,
            'slug' => unique_slug('categories', $slug, $id),
            'description' => $this->strOrNull($r, 'description', 1000),
            'icon_type' => $r->str('icon_type', 10) === 'image' ? 'image' : 'fa',
            'icon' => $icon ?: 'fa-solid fa-tag',
            'is_free_delivery' => $r->bool('is_free_delivery') ? 1 : 0,
            'status' => $r->str('status', 10) === 'inactive' ? 'inactive' : 'active',
            'sort_order' => $r->int('sort_order', 0),
            'seo_title' => $this->strOrNull($r, 'seo_title', 191),
            'seo_description' => $this->strOrNull($r, 'seo_description', 300),
        ];
        if ($f = $r->file('image')) {
            $data['image'] = ImageService::storeSingle($f, 'categories', 400, 1.0);
            if ($existing && $existing['image']) {
                ImageService::deleteVariants($existing['image'], '', 'single');
            }
        }
        if ($f = $r->file('icon_image')) {
            $data['icon_image'] = ImageService::storeSingle($f, 'categories', 160, 1.0);
            if ($existing && $existing['icon_image']) {
                ImageService::deleteVariants($existing['icon_image'], '', 'single');
            }
        }
        if ($data['icon_type'] === 'image' && empty($data['icon_image']) && empty($existing['icon_image'])) {
            return $this->fail('Upload an icon image or choose a Font Awesome icon.');
        }
        if ($existing) {
            DB::update('categories', $data, 'id = ?', [$id]);
        } else {
            $id = DB::insert('categories', $data);
        }
        [$old, $new] = Audit::diff($existing ?? [], $data);
        Audit::log($existing ? 'category.update' : 'category.create', 'category', $id, $old ?: null, $new ?: null);
        Cache::catalogChanged();
        return $this->done($existing ? 'Category updated.' : 'Category created.', ['redirect' => url('/admin/categories')]);
    }

    public function delete(Request $r, string $id): Response
    {
        return Trash::softDelete('category', (int)$id) ? $this->done('Category moved to trash.') : $this->fail('Category not found.', 404);
    }
}
