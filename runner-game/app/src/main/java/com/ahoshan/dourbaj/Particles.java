package com.ahoshan.dourbaj;

import android.graphics.Canvas;
import android.graphics.Paint;

/** A fixed pool of simple round particles: dust, sparkles and impact bursts. */
final class Particles {

    private static final int MAX = 220;

    private final float[] x = new float[MAX];
    private final float[] y = new float[MAX];
    private final float[] vx = new float[MAX];
    private final float[] vy = new float[MAX];
    private final float[] life = new float[MAX];
    private final float[] maxLife = new float[MAX];
    private final float[] size = new float[MAX];
    private final float[] gravity = new float[MAX];
    private final int[] color = new int[MAX];
    private int next;

    void spawn(float px, float py, float pvx, float pvy, float seconds, float radius, int argb, float g) {
        int i = next;
        next = (next + 1) % MAX;
        x[i] = px;
        y[i] = py;
        vx[i] = pvx;
        vy[i] = pvy;
        life[i] = seconds;
        maxLife[i] = seconds;
        size[i] = radius;
        color[i] = argb;
        gravity[i] = g;
    }

    void clear() {
        for (int i = 0; i < MAX; i++) {
            life[i] = 0;
        }
    }

    void update(float dt) {
        for (int i = 0; i < MAX; i++) {
            if (life[i] <= 0) {
                continue;
            }
            life[i] -= dt;
            vy[i] += gravity[i] * dt;
            x[i] += vx[i] * dt;
            y[i] += vy[i] * dt;
        }
    }

    void draw(Canvas c, Paint p) {
        for (int i = 0; i < MAX; i++) {
            if (life[i] <= 0) {
                continue;
            }
            float t = life[i] / maxLife[i];
            int alpha = (int) (((color[i] >>> 24) & 0xFF) * t);
            p.setColor(Util.withAlpha(color[i], alpha));
            c.drawCircle(x[i], y[i], size[i] * (0.4f + 0.6f * t), p);
        }
    }
}
