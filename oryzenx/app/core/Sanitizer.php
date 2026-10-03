<?php
/** Allow-list HTML sanitizer for rich editor content (posts, service descriptions). */
final class Sanitizer
{
    private const TAGS = ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'a', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote',
        'code', 'pre', 'img', 'span', 'div', 'hr', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'mark', 'sub', 'sup'];
    private const ATTRS = ['a' => ['href', 'title', 'target'], 'img' => ['src', 'alt', 'width', 'height'], 'span' => ['class'], 'i' => ['class'], 'code' => ['class'], 'td' => ['colspan'], 'th' => ['colspan']];

    public static function html(string $html): string
    {
        if (trim($html) === '') return '';
        $doc = new DOMDocument();
        libxml_use_internal_errors(true);
        $doc->loadHTML('<?xml encoding="UTF-8"><div id="__root">' . $html . '</div>', LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_NONET);
        libxml_clear_errors();
        $root = $doc->getElementById('__root');
        if (!$root) return e(strip_tags($html));
        self::clean($root);
        $out = '';
        foreach ($root->childNodes as $c) $out .= $doc->saveHTML($c);
        return $out;
    }

    private static function clean(DOMNode $node): void
    {
        for ($i = $node->childNodes->length - 1; $i >= 0; $i--) {
            $c = $node->childNodes->item($i);
            if ($c instanceof DOMComment || $c instanceof DOMProcessingInstruction) { $node->removeChild($c); continue; }
            if (!$c instanceof DOMElement) continue;
            $tag = strtolower($c->tagName);
            if (in_array($tag, ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'svg', 'math', 'link', 'meta', 'base'], true)) {
                $node->removeChild($c); continue;
            }
            self::clean($c);
            if (!in_array($tag, self::TAGS, true)) {
                while ($c->firstChild) $node->insertBefore($c->firstChild, $c);
                $node->removeChild($c);
                continue;
            }
            $allowed = self::ATTRS[$tag] ?? [];
            for ($a = $c->attributes->length - 1; $a >= 0; $a--) {
                $attr = $c->attributes->item($a);
                $name = strtolower($attr->name);
                $val = trim($attr->value);
                if (!in_array($name, $allowed, true)) { $c->removeAttribute($attr->name); continue; }
                if (in_array($name, ['href', 'src'], true) && !preg_match('#^(https?://|/|mailto:|tel:|\#)#i', $val)) { $c->removeAttribute($attr->name); continue; }
                if ($name === 'class') $c->setAttribute('class', preg_replace('/[^a-z0-9\- ]/i', '', $val));
            }
            if ($tag === 'a') {
                $c->setAttribute('rel', 'noopener nofollow');
                if ($c->getAttribute('target') !== '') $c->setAttribute('target', '_blank');
            }
            if ($tag === 'img') $c->setAttribute('loading', 'lazy');
        }
    }
}
