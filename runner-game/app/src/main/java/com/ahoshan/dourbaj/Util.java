package com.ahoshan.dourbaj;

import android.graphics.Color;

final class Util {

    private Util() {
    }

    static float clamp(float v, float min, float max) {
        return v < min ? min : (v > max ? max : v);
    }

    static int lerpColor(int a, int b, float t) {
        t = clamp(t, 0f, 1f);
        int ar = Color.red(a), ag = Color.green(a), ab = Color.blue(a), aa = Color.alpha(a);
        return Color.argb(
                (int) (aa + (Color.alpha(b) - aa) * t),
                (int) (ar + (Color.red(b) - ar) * t),
                (int) (ag + (Color.green(b) - ag) * t),
                (int) (ab + (Color.blue(b) - ab) * t));
    }

    static int withAlpha(int color, int alpha) {
        return (color & 0x00FFFFFF) | (Util.clampInt(alpha, 0, 255) << 24);
    }

    static int darken(int color, float amount) {
        return lerpColor(color, Color.BLACK, amount);
    }

    static int clampInt(int v, int min, int max) {
        return v < min ? min : (v > max ? max : v);
    }

    /** Positive modulo, for wrapping scrolling layers. */
    static float wrap(float v, float size) {
        float r = v % size;
        return r < 0 ? r + size : r;
    }

    /** Formats a number with Bengali digits. */
    static String bn(int number) {
        String digits = Integer.toString(number);
        StringBuilder out = new StringBuilder(digits.length());
        for (int i = 0; i < digits.length(); i++) {
            char c = digits.charAt(i);
            out.append(c >= '0' && c <= '9' ? (char) ('০' + (c - '0')) : c);
        }
        return out.toString();
    }
}
