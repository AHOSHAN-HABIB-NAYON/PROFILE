package com.ahoshan.dourbaj;

import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;

/**
 * The runner: physics (jump, double jump, slide, fast fall) and a jointed,
 * procedurally animated figure. All sizes scale with the screen height.
 */
final class Player {

    private static final int SKIN = 0xFFF1C27D;
    private static final int HAIR = 0xFF2D1B10;
    private static final int SHIRT = 0xFF1E8C45;
    private static final int SHIRT_DOT = 0xFFE53935;
    private static final int SHORTS = 0xFF283593;
    private static final int SHOE = 0xFFFAFAFA;
    private static final int SHOE_SOLE = 0xFFE53935;
    private static final int HEADBAND = 0xFFE53935;

    static final float SLIDE_TIME = 0.62f;

    float x;
    float y;
    float vy;
    boolean onGround = true;
    boolean dead;

    private float unit;
    private float gravity;
    private float jumpSpeed;
    private int jumpsUsed;
    private float slideTimer;
    private boolean slideQueued;
    private float flipTimer;
    private float runPhase;
    private float deadAngle;
    private float landSquash;

    final RectF hitbox = new RectF();

    void resize(float screenHeight, float startX, float groundY) {
        unit = screenHeight;
        gravity = unit * 3.4f;
        jumpSpeed = unit * 1.42f;
        x = startX;
        y = groundY;
    }

    void reset(float groundY) {
        y = groundY;
        vy = 0;
        onGround = true;
        dead = false;
        jumpsUsed = 0;
        slideTimer = 0;
        slideQueued = false;
        flipTimer = 0;
        deadAngle = 0;
        landSquash = 0;
    }

    boolean isSliding() {
        return slideTimer > 0;
    }

    /** @return 1 for a jump, 2 for a double jump, 0 if no jump was possible. */
    int jump() {
        if (dead) {
            return 0;
        }
        if (onGround) {
            vy = -jumpSpeed;
            onGround = false;
            jumpsUsed = 1;
            slideTimer = 0;
            slideQueued = false;
            return 1;
        }
        if (jumpsUsed < 2) {
            vy = -jumpSpeed * 0.88f;
            jumpsUsed = 2;
            flipTimer = 0.42f;
            return 2;
        }
        return 0;
    }

    /** @return true if a slide started (or a fast fall into one). */
    boolean slide() {
        if (dead) {
            return false;
        }
        if (onGround) {
            boolean started = slideTimer <= 0;
            slideTimer = SLIDE_TIME;
            return started;
        }
        vy = Math.max(vy, jumpSpeed * 1.3f);
        slideQueued = true;
        return true;
    }

    void kill() {
        dead = true;
        slideTimer = 0;
        vy = -jumpSpeed * 0.55f;
        onGround = false;
    }

    /** @return true on the frame the runner lands. */
    boolean update(float dt, float groundY, float speed) {
        boolean landed = false;
        runPhase += dt * (8f + speed / unit * 3.5f);
        landSquash = Math.max(0, landSquash - dt * 5f);
        flipTimer = Math.max(0, flipTimer - dt);

        if (dead) {
            deadAngle = Math.min(deadAngle + dt * 420f, 100f);
        }

        if (!onGround) {
            vy += gravity * dt;
            y += vy * dt;
            if (y >= groundY) {
                y = groundY;
                vy = 0;
                onGround = true;
                jumpsUsed = 0;
                flipTimer = 0;
                landSquash = 1f;
                landed = true;
                if (slideQueued && !dead) {
                    slideTimer = SLIDE_TIME * 0.8f;
                }
                slideQueued = false;
            }
        } else if (slideTimer > 0) {
            slideTimer -= dt;
        }

        updateHitbox();
        return landed;
    }

    private void updateHitbox() {
        if (slideTimer > 0) {
            hitbox.set(x - unit * 0.06f, y - unit * 0.085f, x + unit * 0.05f, y);
        } else {
            hitbox.set(x - unit * 0.032f, y - unit * 0.2f, x + unit * 0.032f, y - unit * 0.01f);
        }
    }

    // ------------------------------------------------------------- drawing

    void drawShadow(Canvas c, Paint p, float groundY) {
        float lift = Util.clamp((groundY - y) / (unit * 0.4f), 0f, 1f);
        float w = unit * 0.065f * (1f - lift * 0.55f);
        p.setColor(Util.withAlpha(0xFF000000, (int) (70 * (1f - lift * 0.6f))));
        c.drawOval(x - w, groundY + unit * 0.004f, x + w, groundY + unit * 0.022f, p);
    }

    void draw(Canvas c, Paint p) {
        float s = unit * 0.0105f;

        // Joint angles in radians, measured from straight down; positive swings forward.
        float hipY;
        float torso;
        float fThigh, fShin, bThigh, bShin;
        float fUpper, fFore, bUpper, bFore;

        if (dead) {
            hipY = -9f * s;
            torso = -0.4f;
            fThigh = 1.2f; fShin = 0.6f; bThigh = 0.6f; bShin = 0.2f;
            fUpper = 2.6f; fFore = 2.9f; bUpper = -2.4f; bFore = -2.0f;
        } else if (slideTimer > 0) {
            hipY = -3.4f * s;
            torso = -1.12f;
            fThigh = 1.5f; fShin = 1.45f; bThigh = 1.9f; bShin = 0.6f;
            fUpper = -0.5f; fFore = 0.1f; bUpper = -1.2f; bFore = -0.7f;
        } else if (!onGround) {
            hipY = -9.4f * s;
            torso = 0.15f;
            if (vy < 0) {
                fThigh = 1.25f; fShin = -0.35f; bThigh = -0.35f; bShin = -1.25f;
                fUpper = 2.5f; fFore = 2.9f; bUpper = -0.9f; bFore = -0.3f;
            } else {
                fThigh = 0.55f; fShin = 0.05f; bThigh = -0.2f; bShin = -0.75f;
                fUpper = 1.6f; fFore = 2.2f; bUpper = -1.3f; bFore = -0.8f;
            }
        } else {
            float sin = (float) Math.sin(runPhase);
            float cos = (float) Math.cos(runPhase);
            hipY = (-9.3f + 0.8f * Math.abs(sin) + landSquash * 1.4f) * s;
            torso = 0.2f + landSquash * 0.15f;
            fThigh = 0.85f * sin;
            fShin = fThigh - (0.25f + 1.25f * Math.max(0f, cos));
            bThigh = -0.85f * sin;
            bShin = bThigh - (0.25f + 1.25f * Math.max(0f, -cos));
            fUpper = -0.95f * sin;
            fFore = fUpper + 1.45f;
            bUpper = 0.95f * sin;
            bFore = bUpper + 1.45f;
        }

        c.save();
        c.translate(x, y);
        if (dead) {
            c.rotate(-deadAngle, 0, hipY);
        } else if (flipTimer > 0) {
            c.rotate(-(1f - flipTimer / 0.42f) * 360f, 0, hipY - 3f * s);
        }

        float hipX = 0;
        float torsoLen = 7f * s;
        float shX = hipX + (float) Math.sin(torso) * torsoLen;
        float shY = hipY - (float) Math.cos(torso) * torsoLen;

        float thigh = 4.8f * s;
        float shin = 4.7f * s;
        float upper = 3.7f * s;
        float fore = 3.5f * s;

        p.setStyle(Paint.Style.STROKE);
        p.setStrokeCap(Paint.Cap.ROUND);
        p.setStrokeJoin(Paint.Join.ROUND);

        // Far side limbs, shaded darker for depth.
        drawLeg(c, p, hipX, hipY, bThigh, thigh, bShin, shin, s, 0.28f);
        drawArm(c, p, shX, shY, bUpper, upper, bFore, fore, s, 0.28f);

        // Torso: shorts then shirt with the red-circle chest badge.
        p.setStrokeWidth(5.4f * s);
        p.setColor(SHORTS);
        float midX = hipX + (shX - hipX) * 0.3f;
        float midY = hipY + (shY - hipY) * 0.3f;
        c.drawLine(hipX, hipY, midX, midY, p);
        p.setStrokeWidth(5.8f * s);
        p.setColor(SHIRT);
        c.drawLine(midX, midY, shX, shY, p);
        p.setStyle(Paint.Style.FILL);
        p.setColor(SHIRT_DOT);
        float dotX = hipX + (shX - hipX) * 0.62f + (float) Math.cos(torso) * 0.9f * s;
        float dotY = hipY + (shY - hipY) * 0.62f + (float) Math.sin(torso) * 0.9f * s;
        c.drawCircle(dotX, dotY, 1.35f * s, p);

        drawHead(c, p, shX, shY, torso, s);

        p.setStyle(Paint.Style.STROKE);
        drawLeg(c, p, hipX, hipY, fThigh, thigh, fShin, shin, s, 0f);
        drawArm(c, p, shX, shY, fUpper, upper, fFore, fore, s, 0f);

        p.setStyle(Paint.Style.FILL);
        c.restore();
    }

    private void drawLeg(Canvas c, Paint p, float hx, float hy, float a1, float l1, float a2, float l2,
                         float s, float shade) {
        float kx = hx + (float) Math.sin(a1) * l1;
        float ky = hy + (float) Math.cos(a1) * l1;
        float fx = kx + (float) Math.sin(a2) * l2;
        float fy = ky + (float) Math.cos(a2) * l2;

        p.setStrokeWidth(3.2f * s);
        p.setColor(Util.darken(SHORTS, shade));
        float mx = hx + (kx - hx) * 0.55f;
        float my = hy + (ky - hy) * 0.55f;
        c.drawLine(hx, hy, mx, my, p);
        p.setColor(Util.darken(SKIN, shade));
        p.setStrokeWidth(2.5f * s);
        c.drawLine(mx, my, kx, ky, p);
        c.drawLine(kx, ky, fx, fy, p);

        // Shoe points along the foot, perpendicular-ish to the shin.
        float footA = a2 + 1.45f;
        float tx = fx + (float) Math.sin(footA) * 2.4f * s;
        float ty = fy + (float) Math.cos(footA) * 2.4f * s;
        p.setStrokeWidth(2.9f * s);
        p.setColor(Util.darken(SHOE, shade));
        c.drawLine(fx, fy, tx, ty, p);
        p.setStrokeWidth(1.1f * s);
        p.setColor(Util.darken(SHOE_SOLE, shade));
        float ox = (float) Math.sin(a2) * 1.2f * s;
        float oy = (float) Math.cos(a2) * 1.2f * s;
        c.drawLine(fx + ox, fy + oy, tx + ox, ty + oy, p);
    }

    private void drawArm(Canvas c, Paint p, float sx, float sy, float a1, float l1, float a2, float l2,
                         float s, float shade) {
        float ex = sx + (float) Math.sin(a1) * l1;
        float ey = sy + (float) Math.cos(a1) * l1;
        float hx = ex + (float) Math.sin(a2) * l2;
        float hy = ey + (float) Math.cos(a2) * l2;

        p.setStrokeWidth(2.7f * s);
        p.setColor(Util.darken(SHIRT, shade));
        float mx = sx + (ex - sx) * 0.45f;
        float my = sy + (ey - sy) * 0.45f;
        c.drawLine(sx, sy, mx, my, p);
        p.setStrokeWidth(2.1f * s);
        p.setColor(Util.darken(SKIN, shade));
        c.drawLine(mx, my, ex, ey, p);
        c.drawLine(ex, ey, hx, hy, p);
    }

    private void drawHead(Canvas c, Paint p, float shX, float shY, float torso, float s) {
        float neck = 3.3f * s;
        float cx = shX + (float) Math.sin(torso) * neck;
        float cy = shY - (float) Math.cos(torso) * neck;
        float r = 2.9f * s;

        p.setStyle(Paint.Style.FILL);
        p.setColor(HAIR);
        c.drawCircle(cx - 0.35f * s, cy - 0.3f * s, r, p);
        p.setColor(SKIN);
        c.drawCircle(cx + 0.3f * s, cy + 0.25f * s, r * 0.9f, p);

        c.save();
        c.rotate((float) Math.toDegrees(torso), cx, cy);
        p.setColor(HEADBAND);
        c.drawRect(cx - r * 0.95f, cy - r * 0.55f, cx + r * 0.85f, cy - r * 0.2f, p);
        // Headband tails flutter behind.
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(0.8f * s);
        float flutter = (float) Math.sin(runPhase * 1.3f) * 0.8f * s;
        c.drawLine(cx - r * 0.9f, cy - r * 0.38f, cx - r * 1.8f, cy - r * 0.2f + flutter, p);
        c.drawLine(cx - r * 0.9f, cy - r * 0.38f, cx - r * 1.65f, cy + r * 0.15f - flutter, p);
        p.setStyle(Paint.Style.FILL);
        p.setColor(0xFF1A1A1A);
        c.drawCircle(cx + r * 0.5f, cy + r * 0.05f, 0.42f * s, p);
        p.setColor(Util.darken(SKIN, 0.25f));
        c.drawRect(cx + r * 0.35f, cy + r * 0.48f, cx + r * 0.72f, cy + r * 0.56f, p);
        c.restore();
    }
}
