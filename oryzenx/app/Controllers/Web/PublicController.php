<?php
declare(strict_types=1);

namespace OryzenX\Controllers\Web;

use OryzenX\Controllers\Controller;
use OryzenX\Core\Config;
use OryzenX\Core\HttpException;
use OryzenX\Core\I18n;
use OryzenX\Core\Request;
use OryzenX\Core\Response;
use OryzenX\Core\View;
use OryzenX\Services\AuthService;
use OryzenX\Services\ContentService;
use OryzenX\Services\SettingsService;
use OryzenX\Services\SupportService;

final class PublicController extends Controller
{
    public function __construct(
        private ContentService $content,
        private SettingsService $settings,
        private SupportService $support,
        private AuthService $auth
    ) {
    }

    private function locale(Request $req): string
    {
        return I18n::detect($req);
    }

    private function withLangCookie(Request $req, Response $res, string $locale): Response
    {
        if (isset($req->query['lang']) && ($req->cookies['oryx_lang'] ?? '') !== $locale) {
            $res->cookie('oryx_lang', $locale, ['expires' => time() + 31536000, 'path' => '/', 'secure' => $req->isHttps(), 'samesite' => 'Lax']);
        }
        return $res;
    }

    private function common(string $locale): array
    {
        return [
            'locale' => $locale,
            't' => $this->content->landing($locale),
            'site' => $this->settings->get('site_name', 'OryzenX') ?: 'OryzenX',
            'supportEmail' => (string) $this->settings->get('support_email', ''),
            'supportPhone' => (string) $this->settings->get('support_phone', ''),
            'supportHours' => (string) $this->settings->get('support_hours', ''),
            'playStoreUrl' => (string) $this->settings->get('play_store_url', ''),
            'apkUrl' => (string) $this->settings->get('apk_download_url', ''),
            'canonical' => rtrim((string) Config::get('app_url', ''), '/') . '/',
            'brand' => (string) $this->settings->get('brand_primary', '#1A56DB'),
        ];
    }

    public function landing(Request $req): Response
    {
        $locale = $this->locale($req);
        $html = View::render('landing/index', $this->common($locale) + ['formToken' => SupportService::formToken()]);
        $res = Response::html($html);
        $res->header('Cache-Control', 'no-cache');
        $res->header('Vary', 'Cookie');
        return $this->withLangCookie($req, $res, $locale);
    }

    public function legal(Request $req): Response
    {
        $page = $req->params['page'] ?? '';
        if (!in_array($page, ['privacy', 'terms', 'risk'], true)) {
            throw HttpException::notFound();
        }
        $locale = $this->locale($req);
        $res = Response::html(View::render('landing/legal', $this->common($locale) + ['page' => $page, 'legal' => I18n::load($locale, 'legal') ?: I18n::load('en', 'legal')]));
        return $this->withLangCookie($req, $res, $locale);
    }

    public function supportSubmit(Request $req): Response
    {
        $locale = $this->locale($req);
        $id = $this->support->submit($req->json(), $req->ip(), null, $locale, 'website');
        return Response::ok(['ticket' => $id, 'message' => $this->content->landing($locale)['support_success'] ?? 'Thank you.']);
    }

    public function robots(Request $req): Response
    {
        $base = rtrim((string) Config::get('app_url', ''), '/');
        $body = "User-agent: *\nAllow: /\nDisallow: /app\nDisallow: /v2admin\nDisallow: /api/\nDisallow: /install\nDisallow: /verify-email\nDisallow: /reset-password\nSitemap: {$base}/sitemap.xml\n";
        return new Response($body, 200, ['Content-Type' => 'text/plain; charset=utf-8', 'Cache-Control' => 'public, max-age=86400']);
    }

    public function sitemap(Request $req): Response
    {
        $base = rtrim((string) Config::get('app_url', ''), '/');
        $urls = ['/', '/privacy', '/terms', '/risk'];
        $xml = '<?xml version="1.0" encoding="UTF-8"?>' . "\n" . '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">' . "\n";
        foreach ($urls as $u) {
            $loc = htmlspecialchars($base . $u, ENT_XML1);
            $xml .= "  <url><loc>{$loc}</loc>"
                . '<xhtml:link rel="alternate" hreflang="en" href="' . $loc . '?lang=en"/>'
                . '<xhtml:link rel="alternate" hreflang="bn" href="' . $loc . '?lang=bn"/>'
                . "<changefreq>monthly</changefreq></url>\n";
        }
        $xml .= "</urlset>\n";
        return new Response($xml, 200, ['Content-Type' => 'application/xml; charset=utf-8', 'Cache-Control' => 'public, max-age=86400']);
    }

    /** Android App Links verification (only when a signing fingerprint is configured). */
    public function assetLinks(Request $req): Response
    {
        $fp = (string) $this->settings->get('android_sha256', '');
        $pkg = (string) $this->settings->get('android_package', 'com.oryzenx.app');
        $data = $fp === '' ? [] : [[
            'relation' => ['delegate_permission/common.handle_all_urls'],
            'target' => ['namespace' => 'android_app', 'package_name' => $pkg, 'sha256_cert_fingerprints' => [$fp]],
        ]];
        return Response::json($data)->header('Cache-Control', 'public, max-age=3600');
    }

    public function health(Request $req): Response
    {
        // minimal liveness probe — no internal details
        try {
            \OryzenX\Core\App::get(\OryzenX\Core\Database::class)->value('SELECT 1');
            return Response::json(['status' => 'ok']);
        } catch (\Throwable) {
            return Response::json(['status' => 'unavailable'], 503);
        }
    }

    /** Public, non-sensitive configuration for the web and Android apps. */
    public function appConfig(Request $req): Response
    {
        $locale = $this->locale($req);
        return Response::ok([
            'site_name' => $this->settings->get('site_name', 'OryzenX'),
            'version' => Config::get('version', '1.0.0'),
            'locales' => ['en', 'bn'],
            'default_locale' => $this->settings->get('default_locale', 'en'),
            'registration_open' => $this->settings->bool('registration_open', true),
            'google_client_id' => $this->settings->googleClientIds()[0] ?? null,
            'google_enabled' => (bool) $this->settings->googleClientIds(),
            'identity_required' => $this->settings->bool('require_identity_verification', true),
            'support_email' => $this->settings->get('support_email') ?: null,
            'timezone' => $this->settings->timezone()->getName(),
            'demo_mode' => Config::demoMode(),
            'brand_primary' => $this->settings->get('brand_primary', '#1A56DB'),
            'strings' => $this->content->appStrings($locale),
            'locale' => $locale,
        ]);
    }

    public function strings(Request $req): Response
    {
        $loc = in_array($req->params['locale'] ?? '', I18n::LOCALES, true) ? $req->params['locale'] : 'en';
        return Response::ok($this->content->appStrings($loc))->header('Cache-Control', 'private, max-age=300');
    }

    public function userApp(Request $req): Response
    {
        return $this->shell($req, 'user');
    }

    public function adminApp(Request $req): Response
    {
        return $this->shell($req, 'admin');
    }

    private function shell(Request $req, string $kind): Response
    {
        $locale = $this->locale($req);
        $html = View::render('layouts/app', [
            'kind' => $kind,
            'locale' => $locale,
            'site' => $this->settings->get('site_name', 'OryzenX') ?: 'OryzenX',
            'strings' => $this->content->appStrings($locale),
            'googleClientId' => $this->settings->googleClientIds()[0] ?? null,
            'demo' => Config::demoMode(),
            'brand' => (string) $this->settings->get('brand_primary', '#1A56DB'),
        ]);
        $res = Response::html($html);
        $res->header('Cache-Control', 'no-store');
        $res->header('X-Robots-Tag', 'noindex, nofollow');
        return $res;
    }

    public function verifyEmail(Request $req): Response
    {
        $locale = $this->locale($req);
        $ok = false;
        $message = '';
        try {
            $this->auth->verifyEmailByToken((string) ($req->query['token'] ?? ''));
            $ok = true;
        } catch (HttpException $e) {
            $message = $e->getMessage();
        }
        $html = View::render('layouts/message', [
            'locale' => $locale,
            'title' => $ok ? I18n::t('app.email_verified_title') : I18n::t('app.email_verify_failed_title'),
            'message' => $ok ? I18n::t('app.email_verified_body') : $message,
            'ok' => $ok,
            'cta' => View::url('app/'),
            'ctaLabel' => I18n::t('app.open_app'),
        ]);
        return Response::html($html, $ok ? 200 : 400)->header('X-Robots-Tag', 'noindex');
    }

    public function resetPassword(Request $req): Response
    {
        $token = (string) ($req->query['token'] ?? '');
        return Response::redirect(View::url('app/#/reset-password?token=' . rawurlencode($token)));
    }
}
