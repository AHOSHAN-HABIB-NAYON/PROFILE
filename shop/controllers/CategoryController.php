<?php
final class CategoryController
{
    public function index(): void
    {
        View::page('pages/categories', ['categories' => Category::active()], Seo::forPage('categories', [
            'title' => 'ক্যাটাগরি', 'page' => 'categories', 'cacheable' => true, 'nav' => 'categories',
        ]));
    }

    public function show(string $slug): void
    {
        $cat = Category::findBySlug($slug);
        if (!$cat) {
            Response::notFound();
        }
        (new ProductController())->index($cat);
    }
}
