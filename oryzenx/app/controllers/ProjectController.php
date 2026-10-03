<?php
/** Completed projects portfolio. */
final class ProjectController
{
    public function index(): void
    {
        $projects = DB::all('SELECT * FROM projects WHERE is_active = 1 ORDER BY sort_order, id DESC');
        $cats = array_values(array_unique(array_filter(array_map(fn($p) => trim((string)$p['category']), $projects))));
        $first = $projects[0]['image1'] ?? null;
        View::page('pages/projects', ['projects' => $projects, 'cats' => $cats], [
            'title' => t('projects.title'), 'nav' => 'projects', 'css' => ['projects', 'home'], 'description' => t('projects.meta', ['n' => count($projects)]),
            'image' => $first ? abs_url(upload_url($first)) : null,
            'keywords' => View::autoKeywords(array_merge($cats, array_column($projects, 'brand')), implode(' ', array_column($projects, 'tags'))),
        ]);
    }

    /** Non-empty images of a project, in order. */
    public static function images(array $p): array
    {
        return array_values(array_filter([$p['image1'], $p['image2'], $p['image3'], $p['image4'], $p['image5']]));
    }
}
