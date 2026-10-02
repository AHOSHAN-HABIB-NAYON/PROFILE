<?php
/** Whitelist sanitizer for the rich product description editor. */
final class HtmlSanitizer
{
    private const TAGS = [
        'h2' => [], 'h3' => [], 'h4' => [], 'p' => [], 'br' => [], 'strong' => [], 'b' => [], 'em' => [], 'i' => [], 'u' => [],
        'ul' => [], 'ol' => [], 'li' => [], 'blockquote' => [], 'mark' => [], 'hr' => [],
        'table' => [], 'thead' => [], 'tbody' => [], 'tr' => [], 'th' => ['colspan', 'rowspan'], 'td' => ['colspan', 'rowspan'],
        'a' => ['href', 'title'], 'img' => ['src', 'alt', 'width', 'height'], 'span' => [], 'div' => [], 'figure' => [], 'figcaption' => [],
    ];

    public static function clean(string $html): string
    {
        $html = trim($html);
        if ($html === '') {
            return '';
        }
        $doc = new DOMDocument('1.0', 'UTF-8');
        libxml_use_internal_errors(true);
        $doc->loadHTML('<?xml encoding="UTF-8"><div id="__root">' . $html . '</div>', LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_NONET);
        libxml_clear_errors();
        $root = $doc->getElementById('__root');
        if (!$root) {
            return '';
        }
        self::walk($root);
        $out = '';
        foreach ($root->childNodes as $child) {
            $out .= $doc->saveHTML($child);
        }
        return $out;
    }

    private static function walk(DOMNode $node): void
    {
        for ($i = $node->childNodes->length - 1; $i >= 0; $i--) {
            $child = $node->childNodes->item($i);
            if ($child instanceof DOMComment || $child instanceof DOMProcessingInstruction) {
                $node->removeChild($child);
                continue;
            }
            if (!$child instanceof DOMElement) {
                continue;
            }
            $tag = strtolower($child->tagName);
            if (in_array($tag, ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'svg', 'math', 'link', 'meta'], true)) {
                $node->removeChild($child);
                continue;
            }
            if ($tag === 'h1') {
                $tag = 'h2';
            }
            if (!isset(self::TAGS[$tag])) {
                // Unwrap unknown element but keep its text/children.
                self::walk($child);
                while ($child->firstChild) {
                    $node->insertBefore($child->firstChild, $child);
                }
                $node->removeChild($child);
                continue;
            }
            if ($tag !== strtolower($child->tagName)) {
                $new = $child->ownerDocument->createElement($tag);
                while ($child->firstChild) {
                    $new->appendChild($child->firstChild);
                }
                $node->replaceChild($new, $child);
                $child = $new;
            }
            $allowed = self::TAGS[$tag];
            foreach (iterator_to_array($child->attributes) as $attr) {
                $name = strtolower($attr->name);
                if (!in_array($name, $allowed, true)) {
                    $child->removeAttribute($attr->name);
                    continue;
                }
                if (in_array($name, ['href', 'src'], true)) {
                    $v = trim($attr->value);
                    $okHref = $name === 'href' && preg_match('#^(https?://|/|mailto:|tel:|\#)#i', $v);
                    $okSrc = $name === 'src' && preg_match('#^(/uploads/|https://)#i', $v);
                    if (!$okHref && !$okSrc) {
                        $child->removeAttribute($attr->name);
                    }
                }
            }
            if ($tag === 'a') {
                $child->setAttribute('rel', 'noopener nofollow');
                $child->setAttribute('target', '_blank');
            }
            if ($tag === 'img') {
                if (!$child->hasAttribute('src')) {
                    $node->removeChild($child);
                    continue;
                }
                $child->setAttribute('loading', 'lazy');
                $child->setAttribute('decoding', 'async');
            }
            self::walk($child);
        }
    }
}
