<?php
final class TeamController
{
    public function index(): void
    {
        $team = DB::all('SELECT * FROM team_members WHERE is_active = 1 ORDER BY sort_order, id');
        View::page('pages/team', ['team' => $team], ['title' => t('team.title'), 'nav' => 'team', 'css' => ['team'], 'description' => t('team.sub')]);
    }

    public function show(string $id): void
    {
        $m = DB::row('SELECT * FROM team_members WHERE id = ? AND is_active = 1', [(int)$id]);
        if (!$m) throw new HttpException(t('error.404'), 404);
        View::page('pages/team-member', ['m' => $m], ['title' => $m['name'], 'nav' => 'team', 'css' => ['team'], 'description' => $m['role'] . ' — ' . $m['bio'],
            'image' => $m['photo'] ? abs_url(upload_url($m['photo'])) : null, 'page_key' => 'team-member', 'ref_id' => (int)$m['id']]);
    }
}
