<?php
/**
 * Category grid (/categories) and category product listing (/category/{slug}).
 */
final class CategoryController
{
    public function index(Request $r): Response
    {
        $categories = Category::activeWithCounts();
        $crumbs = [['হোম', '/'], ['ক্যাটাগরি', '/categories']];
        return View::page('pages/categories', ['categories' => $categories], [
            'title'       => 'সকল ক্যাটাগরি',
            'description' => 'সকল পণ্যের ক্যাটাগরি দেখুন — ' . setting('store_name'),
            'jsonld'      => [Seo::breadcrumbs($crumbs)],
            'styles'      => ['category'],
            'page'        => 'categories',
            'nav'         => 'categories',
        ]);
    }

    public function show(Request $r, string $slug): Response
    {
        $category = Category::findBySlug($slug);
        if (!$category) {
            throw new HttpException(404, 'ক্যাটাগরিটি পাওয়া যায়নি।');
        }
        $children = Category::children((int)$category['id']);
        $filters = Listing::filtersFrom($r);
        $filters['category_ids'] = array_merge([(int)$category['id']], array_map('intval', array_column($children, 'id')));
        $result = Product::listing($filters);

        $crumbs = [['হোম', '/'], ['ক্যাটাগরি', '/categories']];
        if ($category['parent_id'] && ($parent = Category::find((int)$category['parent_id']))) {
            $crumbs[] = [$parent['name'], '/category/' . $parent['slug']];
        }
        $crumbs[] = [$category['name'], '/category/' . $category['slug']];

        return Listing::page($r, [
            'title'       => $category['name'],
            'seo_title'   => $category['seo_title'] ?: $category['name'],
            'description' => $category['seo_description'] ?: ($category['description'] ? str_limit($category['description'], 160) : null),
            'category'    => $category,
            'children'    => $children,
            'result'      => $result,
            'filters'     => $filters,
            'base'        => '/category/' . $category['slug'],
            'extra_query' => [],
            'crumbs'      => $crumbs,
            'nav'         => 'categories',
        ]);
    }
}
