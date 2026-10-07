package com.ahoshan.dourbaj;

import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;

/** Things in the runner's way: crates and rocks to jump, birds to slide under. */
final class Obstacle {

    static final int CRATE = 0;
    static final int CRATE_STACK = 1;
    static final int ROCK = 2;
    static final int BIRD = 3;

    private static final int WOOD = 0xFFC68642;
    private static final int WOOD_DARK = 0xFF8D5A2B;
    private static final int WOOD_EDGE = 0xFF5D3A1A;
    private static final int ROCK_COLOR = 0xFF8A8F98;
    private static final int ROCK_DARK = 0xFF5F646C;
    private static final int ROCK_LIGHT = 0xFFB4BAC4;
    private static final int BIRD_BODY = 0xFF37474F;
    private static final int BIRD_WING = 0xFF263238;
    private static final int BEAK = 0xFFFFB300;

    int type;
    /** Left edge and bottom edge in screen pixels. */
    float x;
    float bottom;
    float w;
    float h;
    /** Extra leftward speed (birds fly toward the runner). */
    float ownSpeed;
    float anim;
    boolean passed;

    final RectF hitbox = new RectF();

    private static final Path PATH = new Path();
    private static final RectF RECT = new RectF();

    void set(int kind, float left, float groundY, float unit) {
        type = kind;
        x = left;
        passed = false;
        anim = (float) Math.random() * 6f;
        ownSpeed = 0;
        switch (kind) {
            case CRATE_STACK:
                w = unit * 0.1f;
                h = unit * 0.2f;
                bottom = groundY;
                break;
            case ROCK:
                w = unit * 0.17f;
                h = unit * 0.085f;
                bottom = groundY + unit * 0.01f;
                break;
            case BIRD:
                w = unit * 0.1f;
                h = unit * 0.055f;
                bottom = groundY - unit * 0.165f;
                ownSpeed = unit * 0.25f;
                break;
            case CRATE:
            default:
                w = unit * 0.11f;
                h = unit * 0.11f;
                bottom = groundY;
                break;
        }
    }

    void update(float dt, float speed) {
        x -= (speed + ownSpeed) * dt;
        anim += dt;
        float insetX = w * (type == ROCK ? 0.16f : 0.12f);
        float insetY = h * 0.12f;
        hitbox.set(x + insetX, bottom - h + insetY, x + w - insetX, bottom - (type == BIRD ? insetY : 0));
    }

    void draw(Canvas c, Paint p, float unit) {
        switch (type) {
            case CRATE:
                drawCrate(c, p, x, bottom - h, w, h);
                break;
            case CRATE_STACK:
                float half = h / 2f;
                drawCrate(c, p, x, bottom - half, w, half);
                drawCrate(c, p, x + w * 0.06f, bottom - h, w * 0.88f, half);
                break;
            case ROCK:
                drawRock(c, p);
                break;
            case BIRD:
                drawBird(c, p, unit);
                break;
            default:
                break;
        }
    }

    private static void drawCrate(Canvas c, Paint p, float left, float top, float cw, float ch) {
        float edge = cw * 0.1f;
        float corner = cw * 0.06f;
        p.setStyle(Paint.Style.FILL);

        p.setColor(WOOD_EDGE);
        RECT.set(left, top, left + cw, top + ch);
        c.drawRoundRect(RECT, corner, corner, p);
        p.setColor(WOOD);
        RECT.set(left + edge * 0.45f, top + edge * 0.45f, left + cw - edge * 0.45f, top + ch - edge * 0.45f);
        c.drawRoundRect(RECT, corner, corner, p);

        // Plank seams.
        p.setColor(WOOD_DARK);
        for (int i = 1; i < 3; i++) {
            float py = top + ch * i / 3f;
            c.drawRect(left + edge, py - ch * 0.012f, left + cw - edge, py + ch * 0.012f, p);
        }

        // Frame and diagonal brace.
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeCap(Paint.Cap.ROUND);
        p.setStrokeWidth(edge);
        p.setColor(WOOD_DARK);
        RECT.set(left + edge, top + edge, left + cw - edge, top + ch - edge);
        c.drawRect(RECT, p);
        c.drawLine(left + edge, top + ch - edge, left + cw - edge, top + edge, p);

        p.setStyle(Paint.Style.FILL);
        p.setColor(0xFF4E342E);
        float nail = edge * 0.28f;
        c.drawCircle(left + edge, top + edge, nail, p);
        c.drawCircle(left + cw - edge, top + edge, nail, p);
        c.drawCircle(left + edge, top + ch - edge, nail, p);
        c.drawCircle(left + cw - edge, top + ch - edge, nail, p);

        p.setColor(0x30FFFFFF);
        c.drawRect(left + edge * 0.5f, top + edge * 0.5f, left + cw - edge * 0.5f, top + edge * 0.85f, p);
    }

    private void drawRock(Canvas c, Paint p) {
        float top = bottom - h;
        p.setStyle(Paint.Style.FILL);

        PATH.reset();
        PATH.moveTo(x, bottom);
        PATH.lineTo(x + w * 0.08f, top + h * 0.45f);
        PATH.lineTo(x + w * 0.3f, top + h * 0.08f);
        PATH.lineTo(x + w * 0.55f, top);
        PATH.lineTo(x + w * 0.8f, top + h * 0.2f);
        PATH.lineTo(x + w * 0.95f, top + h * 0.55f);
        PATH.lineTo(x + w, bottom);
        PATH.close();
        p.setColor(ROCK_COLOR);
        c.drawPath(PATH, p);

        PATH.reset();
        PATH.moveTo(x + w * 0.55f, top);
        PATH.lineTo(x + w * 0.8f, top + h * 0.2f);
        PATH.lineTo(x + w * 0.95f, top + h * 0.55f);
        PATH.lineTo(x + w, bottom);
        PATH.lineTo(x + w * 0.6f, bottom);
        PATH.lineTo(x + w * 0.62f, top + h * 0.4f);
        PATH.close();
        p.setColor(ROCK_DARK);
        c.drawPath(PATH, p);

        PATH.reset();
        PATH.moveTo(x + w * 0.12f, top + h * 0.45f);
        PATH.lineTo(x + w * 0.3f, top + h * 0.12f);
        PATH.lineTo(x + w * 0.5f, top + h * 0.06f);
        PATH.lineTo(x + w * 0.34f, top + h * 0.36f);
        PATH.close();
        p.setColor(ROCK_LIGHT);
        c.drawPath(PATH, p);

        // A little moss on top.
        p.setColor(0xFF6FA84B);
        c.drawCircle(x + w * 0.42f, top + h * 0.08f, h * 0.1f, p);
        c.drawCircle(x + w * 0.5f, top + h * 0.04f, h * 0.08f, p);
    }

    private void drawBird(Canvas c, Paint p, float unit) {
        float cx = x + w * 0.5f;
        float cy = bottom - h * 0.5f + (float) Math.sin(anim * 5f) * unit * 0.008f;
        float flap = (float) Math.sin(anim * 18f);
        p.setStyle(Paint.Style.FILL);

        // Far wing.
        PATH.reset();
        PATH.moveTo(cx + w * 0.05f, cy - h * 0.1f);
        PATH.lineTo(cx + w * 0.3f, cy - h * (0.2f + 0.9f * flap));
        PATH.lineTo(cx + w * 0.3f, cy);
        PATH.close();
        p.setColor(Util.darken(BIRD_WING, 0.3f));
        c.drawPath(PATH, p);

        p.setColor(BIRD_BODY);
        RECT.set(x + w * 0.1f, cy - h * 0.32f, x + w * 0.85f, cy + h * 0.32f);
        c.drawOval(RECT, p);
        c.drawCircle(x + w * 0.2f, cy - h * 0.12f, h * 0.3f, p);

        PATH.reset();
        PATH.moveTo(x + w * 0.8f, cy - h * 0.05f);
        PATH.lineTo(x + w * 1.05f, cy - h * 0.3f);
        PATH.lineTo(x + w * 1.0f, cy + h * 0.15f);
        PATH.close();
        c.drawPath(PATH, p);

        p.setColor(BEAK);
        PATH.reset();
        PATH.moveTo(x + w * 0.02f, cy - h * 0.2f);
        PATH.lineTo(x - w * 0.12f, cy - h * 0.06f);
        PATH.lineTo(x + w * 0.04f, cy - h * 0.0f);
        PATH.close();
        c.drawPath(PATH, p);

        p.setColor(0xFFFFFFFF);
        c.drawCircle(x + w * 0.16f, cy - h * 0.2f, h * 0.11f, p);
        p.setColor(0xFF000000);
        c.drawCircle(x + w * 0.14f, cy - h * 0.2f, h * 0.06f, p);

        // Near wing.
        PATH.reset();
        PATH.moveTo(cx - w * 0.1f, cy - h * 0.05f);
        PATH.lineTo(cx + w * 0.2f, cy - h * (0.1f + 1.2f * flap));
        PATH.lineTo(cx + w * 0.3f, cy + h * 0.1f);
        PATH.close();
        p.setColor(BIRD_WING);
        c.drawPath(PATH, p);
    }
}
