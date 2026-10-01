<?php
/**
 * Page rendering. A page file outputs its HTML fragment and sets metadata via
 * View::$meta. Full requests get the layout; SPA requests get JSON with only
 * the #app-content fragment (plus the shell when it changes).
 */
declare(strict_types=1);

final class View
{
    public static array $meta = [];

    public static function render(string $file, array $vars, string $shell, string $page, string $active = ''): void
    {
        self::$meta = [
            'title' => (string) setting('site_name', 'Probaho'),
            'description' => (string) setting('site_description'),
            'image' => '',
            'canonical' => '',
            'noindex' => false,
            'schema' => null,
            'back' => null,
        ];
        extract($vars, EXTR_SKIP);
        ob_start();
        require $file;
        $html = (string) ob_get_clean();
        $meta = self::$meta;
        $siteName = (string) setting('site_name', 'Probaho');
        $fullTitle = $meta['title'] === $siteName ? $siteName . ' — ' . setting('site_tagline') : $meta['title'] . ' | ' . $siteName;

        if (is_spa()) {
            $data = [
                'ok' => true,
                'title' => $fullTitle,
                'html' => $html,
                'shell' => $shell,
                'page' => $page,
                'active' => $active,
                'back' => $meta['back'],
                'heading' => $meta['heading'] ?? $meta['title'],
                'auth' => Auth::check(),
                'unread' => Auth::check() ? Notify::unreadCount(Auth::id()) : 0,
            ];
            if (($_SERVER['HTTP_X_SHELL'] ?? '') !== $shell) {
                $data['shellHtml'] = self::shell($shell, '<div id="app-content" class="app-content" data-page="' . e($page) . '"></div>', $active, $meta);
            }
            json_out($data);
        }

        header('Content-Type: text/html; charset=utf-8');
        header('Cache-Control: no-cache, private');
        $content = '<div id="app-content" class="app-content" data-page="' . e($page) . '">' . $html . '</div>';
        require ROOT . '/includes/layout.php';
        exit;
    }

    /** Render a shell (public/app/admin) around content. */
    public static function shell(string $shell, string $content, string $active, array $meta): string
    {
        ob_start();
        require ROOT . '/includes/shell_' . $shell . '.php';
        return (string) ob_get_clean();
    }
}
