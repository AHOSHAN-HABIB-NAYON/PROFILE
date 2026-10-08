<?php
/**
 * Full search results page (/search?q=…). Instant suggestions use /api/search.
 */
final class SearchController
{
    public function index(Request $r): Response
    {
        $q = mb_substr(trim(clean_text((string)$r->get('q', ''))), 0, 80);
        $filters = Listing::filtersFrom($r);
        $filters['q'] = $q;
        $result = $q !== '' ? Product::listing($filters) : ['items' => [], 'total' => 0, 'page' => 1, 'pages' => 1, 'per_page' => $filters['per_page']];
        if ($q !== '') {
            Analytics::record('searches', 1);
        }
        return Listing::page($r, [
            'title'       => $q !== '' ? '“' . $q . '” এর ফলাফল' : 'পণ্য খুঁজুন',
            'q'           => $q,
            'result'      => $result,
            'filters'     => $filters,
            'base'        => '/search',
            'extra_query' => ['q' => $q],
            'crumbs'      => [['হোম', '/'], ['সার্চ', '/search']],
            'nav'         => 'home',
        ]);
    }
}
