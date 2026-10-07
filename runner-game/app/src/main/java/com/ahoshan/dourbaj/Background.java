package com.ahoshan.dourbaj;

import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Shader;

import java.util.Random;

/**
 * Parallax scenery: sky with a day/night cycle, sun and moon, stars, clouds,
 * two mountain ranges, a tree line and the scrolling ground.
 * Each layer is a seamless tile drawn twice and moved at its own speed.
 */
final class Background {

    // Day and night palettes for every layer.
    private static final int SKY_TOP_DAY = 0xFF3D8FD6;
    private static final int SKY_BOTTOM_DAY = 0xFFBFE6FF;
    private static final int SKY_TOP_NIGHT = 0xFF060A22;
    private static final int SKY_BOTTOM_NIGHT = 0xFF26325F;
    private static final int SUNSET = 0xFFFF8F5A;
    private static final int FAR_DAY = 0xFF86A9CC;
    private static final int FAR_NIGHT = 0xFF27345A;
    private static final int SNOW_DAY = 0xFFF2F7FF;
    private static final int SNOW_NIGHT = 0xFF8C9AC4;
    private static final int HILL_DAY = 0xFF5C9D5B;
    private static final int HILL_NIGHT = 0xFF1C3A30;
    private static final int TREE_DAY = 0xFF2E6B37;
    private static final int TREE_NIGHT = 0xFF10261C;
    private static final int TRUNK_DAY = 0xFF6D4C35;
    private static final int GRASS_DAY = 0xFF74C64E;
    private static final int GRASS_NIGHT = 0xFF2C5A2C;
    private static final int DIRT_DAY = 0xFF96612F;
    private static final int DIRT_NIGHT = 0xFF3A2616;

    private static final float FAR_SPEED = 0.08f;
    private static final float HILL_SPEED = 0.22f;
    private static final float TREE_SPEED = 0.5f;

    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint skyPaint = new Paint();
    private final Path farPath = new Path();
    private final Path snowPath = new Path();
    private final Path hillPath = new Path();
    private final Path tuftPath = new Path();
    private final Path scratch = new Path();
    private final RectF rect = new RectF();
    private final Random random = new Random(42);

    private int width;
    private int height;
    private float groundY;
    private float tileW;

    private float[] treeX = new float[0];
    private float[] treeH = new float[0];
    private boolean[] treePine = new boolean[0];
    private float[] cloudX = new float[0];
    private float[] cloudY = new float[0];
    private float[] cloudS = new float[0];
    private float[] starX = new float[0];
    private float[] starY = new float[0];
    private float[] starPhase = new float[0];
    private float[] pebbleX = new float[0];
    private float[] pebbleY = new float[0];
    private float[] pebbleR = new float[0];

    private int lastSkyTop;
    private int lastSkyBottom;

    void resize(int w, int h, float ground) {
        width = w;
        height = h;
        groundY = ground;
        tileW = Math.max(w, h * 2f);
        random.setSeed(42);

        buildMountains();
        buildTrees();
        buildClouds();
        buildStars();
        buildGround();
        lastSkyTop = 0;
    }

    private void buildMountains() {
        farPath.reset();
        snowPath.reset();
        hillPath.reset();
        float step = Math.max(4f, tileW / 240f);
        float snowLine = groundY - height * 0.36f;

        int count = (int) (tileW / step) + 2;
        float[] ridgeX = new float[count];
        float[] ridgeY = new float[count];
        int n = 0;

        farPath.moveTo(0, groundY);
        hillPath.moveTo(0, groundY);
        for (float x = 0; x <= tileW + 0.5f && n < count; x += step) {
            double u = 2 * Math.PI * x / tileW;
            // Integer frequencies keep both ends of the tile at the same height.
            float far = groundY - height * (0.30f
                    + 0.09f * (float) Math.sin(u * 2 + 0.6)
                    + 0.05f * (float) Math.sin(u * 5 + 1.3)
                    + 0.025f * (float) Math.abs(Math.sin(u * 11)));
            float hill = groundY - height * (0.13f
                    + 0.045f * (float) Math.sin(u * 3 + 2.0)
                    + 0.025f * (float) Math.sin(u * 7 + 0.4));
            farPath.lineTo(x, far);
            hillPath.lineTo(x, hill);
            ridgeX[n] = x;
            ridgeY[n] = far;
            n++;
        }

        // Snow caps: a band hugging each peak above the snow line, with a wavy lower edge.
        int i = 0;
        while (i < n) {
            if (ridgeY[i] >= snowLine) {
                i++;
                continue;
            }
            int start = i;
            while (i < n && ridgeY[i] < snowLine) {
                i++;
            }
            int end = i - 1;
            snowPath.moveTo(ridgeX[start], ridgeY[start]);
            for (int k = start + 1; k <= end; k++) {
                snowPath.lineTo(ridgeX[k], ridgeY[k]);
            }
            for (int k = end; k >= start; k--) {
                float depth = (snowLine - ridgeY[k]) * 0.55f;
                float wave = (float) Math.sin(ridgeX[k] * 0.09f) * height * 0.007f;
                snowPath.lineTo(ridgeX[k], ridgeY[k] + depth + wave);
            }
            snowPath.close();
        }
        farPath.lineTo(tileW, groundY);
        farPath.close();
        hillPath.lineTo(tileW, groundY);
        hillPath.close();
    }

    private void buildTrees() {
        int max = 64;
        float[] xs = new float[max];
        float[] hs = new float[max];
        boolean[] pine = new boolean[max];
        int count = 0;
        float x = random.nextFloat() * height * 0.1f;
        while (x < tileW && count < max) {
            xs[count] = x;
            hs[count] = height * (0.10f + random.nextFloat() * 0.10f);
            pine[count] = random.nextFloat() < 0.6f;
            count++;
            x += height * (0.07f + random.nextFloat() * 0.22f);
        }
        treeX = new float[count];
        treeH = new float[count];
        treePine = new boolean[count];
        System.arraycopy(xs, 0, treeX, 0, count);
        System.arraycopy(hs, 0, treeH, 0, count);
        System.arraycopy(pine, 0, treePine, 0, count);
    }

    private void buildClouds() {
        int count = 6;
        cloudX = new float[count];
        cloudY = new float[count];
        cloudS = new float[count];
        for (int i = 0; i < count; i++) {
            cloudX[i] = random.nextFloat() * (width + height);
            cloudY[i] = height * (0.08f + random.nextFloat() * 0.25f);
            cloudS[i] = height * (0.05f + random.nextFloat() * 0.04f);
        }
    }

    private void buildStars() {
        int count = 80;
        starX = new float[count];
        starY = new float[count];
        starPhase = new float[count];
        for (int i = 0; i < count; i++) {
            starX[i] = random.nextFloat() * width;
            starY[i] = random.nextFloat() * groundY * 0.75f;
            starPhase[i] = random.nextFloat() * 6.28f;
        }
    }

    private void buildGround() {
        int count = 46;
        pebbleX = new float[count];
        pebbleY = new float[count];
        pebbleR = new float[count];
        float dirtTop = groundY + height * 0.05f;
        for (int i = 0; i < count; i++) {
            pebbleX[i] = random.nextFloat() * width;
            pebbleY[i] = dirtTop + random.nextFloat() * (height - dirtTop);
            pebbleR[i] = height * (0.004f + random.nextFloat() * 0.007f);
        }

        // Grass blades along the top edge, in tile coordinates relative to groundY.
        tuftPath.reset();
        float blade = height * 0.022f;
        float x = 0;
        while (x < width) {
            float bh = blade * (0.6f + random.nextFloat() * 0.8f);
            tuftPath.moveTo(x, 1);
            tuftPath.lineTo(x + blade * 0.25f, -bh);
            tuftPath.lineTo(x + blade * 0.5f, 1);
            tuftPath.close();
            x += blade * (0.5f + random.nextFloat() * 1.6f);
        }
    }

    /**
     * @param scroll   total distance the ground has moved, in pixels
     * @param daylight 1 at noon, 0 at midnight
     */
    void draw(Canvas c, float scroll, float daylight, float clock) {
        float warmth = Util.clamp(1f - Math.abs(daylight - 0.42f) * 3.2f, 0f, 1f);

        drawSky(c, daylight, warmth);
        drawStars(c, daylight, clock);
        drawSunAndMoon(c, daylight, warmth);
        drawClouds(c, scroll, daylight, warmth, clock);

        int skyBottom = lastSkyBottom;
        int far = Util.lerpColor(Util.lerpColor(FAR_NIGHT, FAR_DAY, daylight), skyBottom, 0.25f);
        far = Util.lerpColor(far, SUNSET, warmth * 0.18f);
        drawTiled(c, farPath, scroll * FAR_SPEED, far);
        int snow = Util.lerpColor(Util.lerpColor(SNOW_NIGHT, SNOW_DAY, daylight), SUNSET, warmth * 0.3f);
        drawTiled(c, snowPath, scroll * FAR_SPEED, snow);

        int hill = Util.lerpColor(Util.lerpColor(HILL_NIGHT, HILL_DAY, daylight), skyBottom, 0.12f);
        drawTiled(c, hillPath, scroll * HILL_SPEED, hill);

        drawTrees(c, scroll * TREE_SPEED, daylight);
        drawGround(c, scroll, daylight);
    }

    private void drawSky(Canvas c, float daylight, float warmth) {
        int top = Util.lerpColor(SKY_TOP_NIGHT, SKY_TOP_DAY, daylight);
        int bottom = Util.lerpColor(SKY_BOTTOM_NIGHT, SKY_BOTTOM_DAY, daylight);
        bottom = Util.lerpColor(bottom, SUNSET, warmth * 0.85f);
        top = Util.lerpColor(top, 0xFF6A4C93, warmth * 0.35f);
        if (top != lastSkyTop || bottom != lastSkyBottom) {
            skyPaint.setShader(new LinearGradient(0, 0, 0, groundY, top, bottom, Shader.TileMode.CLAMP));
            lastSkyTop = top;
            lastSkyBottom = bottom;
        }
        c.drawRect(0, 0, width, groundY + 1, skyPaint);
    }

    private void drawStars(Canvas c, float daylight, float clock) {
        float visibility = Util.clamp(1f - daylight * 2.4f, 0f, 1f);
        if (visibility <= 0) {
            return;
        }
        for (int i = 0; i < starX.length; i++) {
            float tw = 0.55f + 0.45f * (float) Math.sin(clock * 2.2f + starPhase[i]);
            paint.setColor(Color.argb((int) (230 * visibility * tw), 255, 255, 240));
            c.drawCircle(starX[i], starY[i], height * 0.0025f * (0.7f + tw), paint);
        }
    }

    private void drawSunAndMoon(Canvas c, float daylight, float warmth) {
        float arc = height * 0.55f;
        float horizon = groundY - height * 0.08f;

        if (daylight > 0.12f) {
            float sx = width * 0.78f;
            float sy = horizon - arc * daylight;
            float r = height * 0.065f;
            int core = Util.lerpColor(0xFFFFF4C2, 0xFFFFB067, warmth);
            for (int i = 3; i >= 1; i--) {
                paint.setColor(Util.withAlpha(core, 28));
                c.drawCircle(sx, sy, r * (1f + i * 0.45f), paint);
            }
            paint.setColor(core);
            c.drawCircle(sx, sy, r, paint);
        }
        if (daylight < 0.35f) {
            float mx = width * 0.22f;
            float my = horizon - arc * (1f - daylight) * 0.9f;
            float r = height * 0.05f;
            int alpha = (int) (255 * Util.clamp((0.35f - daylight) * 5f, 0f, 1f));
            paint.setColor(Color.argb(alpha / 6, 220, 230, 255));
            c.drawCircle(mx, my, r * 1.8f, paint);
            paint.setColor(Color.argb(alpha, 236, 240, 255));
            c.drawCircle(mx, my, r, paint);
            paint.setColor(Color.argb(alpha / 3, 170, 180, 210));
            c.drawCircle(mx - r * 0.3f, my - r * 0.2f, r * 0.22f, paint);
            c.drawCircle(mx + r * 0.35f, my + r * 0.3f, r * 0.15f, paint);
            c.drawCircle(mx + r * 0.1f, my - r * 0.45f, r * 0.1f, paint);
        }
    }

    private void drawClouds(Canvas c, float scroll, float daylight, float warmth, float clock) {
        int base = Util.lerpColor(0xFF5A6488, Color.WHITE, daylight);
        base = Util.lerpColor(base, 0xFFFFD1B8, warmth * 0.6f);
        int shade = Util.darken(base, 0.12f);
        float span = width + height * 0.8f;
        for (int i = 0; i < cloudX.length; i++) {
            float s = cloudS[i];
            float drift = scroll * 0.04f + clock * height * 0.015f * (1f + i * 0.15f);
            float x = Util.wrap(cloudX[i] - drift, span) - height * 0.4f;
            float y = cloudY[i];

            paint.setColor(Util.withAlpha(shade, 220));
            rect.set(x - s * 1.6f, y - s * 0.2f, x + s * 1.7f, y + s * 0.55f);
            c.drawRoundRect(rect, s * 0.4f, s * 0.4f, paint);
            paint.setColor(Util.withAlpha(base, 235));
            c.drawCircle(x - s * 0.8f, y, s * 0.6f, paint);
            c.drawCircle(x, y - s * 0.35f, s * 0.85f, paint);
            c.drawCircle(x + s * 0.9f, y - s * 0.05f, s * 0.65f, paint);
            rect.set(x - s * 1.5f, y - s * 0.1f, x + s * 1.6f, y + s * 0.42f);
            c.drawRoundRect(rect, s * 0.3f, s * 0.3f, paint);
        }
    }

    private void drawTiled(Canvas c, Path path, float offset, int color) {
        paint.setColor(color);
        float start = -Util.wrap(offset, tileW);
        for (float x = start; x < width; x += tileW) {
            c.save();
            c.translate(x, 0);
            c.drawPath(path, paint);
            c.restore();
        }
    }

    private void drawTrees(Canvas c, float offset, float daylight) {
        int leaf = Util.lerpColor(TREE_NIGHT, TREE_DAY, daylight);
        int leafLight = Util.lerpColor(leaf, Color.WHITE, 0.12f * daylight);
        int trunk = Util.lerpColor(Util.darken(TRUNK_DAY, 0.7f), TRUNK_DAY, daylight);
        float start = -Util.wrap(offset, tileW);
        float base = groundY + height * 0.01f;

        for (float tile = start; tile < width + height * 0.2f; tile += tileW) {
            for (int i = 0; i < treeX.length; i++) {
                float x = tile + treeX[i];
                float th = treeH[i];
                if (x < -th || x > width + th) {
                    continue;
                }
                paint.setColor(trunk);
                c.drawRect(x - th * 0.05f, base - th * 0.35f, x + th * 0.05f, base, paint);
                if (treePine[i]) {
                    // Three stacked tiers, widest at the bottom; the top one catches the light.
                    for (int k = 2; k >= 0; k--) {
                        float tierTop = base - th * (1f - k * 0.2f);
                        float tierBottom = base - th * (0.55f - k * 0.15f);
                        float half = th * (0.17f + k * 0.07f);
                        scratch.reset();
                        scratch.moveTo(x, tierTop);
                        scratch.lineTo(x + half, tierBottom);
                        scratch.lineTo(x - half, tierBottom);
                        scratch.close();
                        paint.setColor(k == 0 ? leafLight : leaf);
                        c.drawPath(scratch, paint);
                    }
                } else {
                    float r = th * 0.3f;
                    paint.setColor(leaf);
                    c.drawCircle(x, base - th * 0.6f, r, paint);
                    c.drawCircle(x - r * 0.6f, base - th * 0.48f, r * 0.75f, paint);
                    c.drawCircle(x + r * 0.6f, base - th * 0.5f, r * 0.8f, paint);
                    paint.setColor(leafLight);
                    c.drawCircle(x - r * 0.25f, base - th * 0.7f, r * 0.45f, paint);
                }
            }
        }
    }

    private void drawGround(Canvas c, float scroll, float daylight) {
        int grass = Util.lerpColor(GRASS_NIGHT, GRASS_DAY, daylight);
        int dirt = Util.lerpColor(DIRT_NIGHT, DIRT_DAY, daylight);
        float grassH = height * 0.04f;

        paint.setColor(dirt);
        c.drawRect(0, groundY, width, height, paint);
        paint.setColor(Util.darken(dirt, 0.12f));
        c.drawRect(0, groundY + height * 0.11f, width, groundY + height * 0.125f, paint);

        paint.setColor(Util.darken(dirt, 0.22f));
        float start = -Util.wrap(scroll, width);
        for (int k = 0; k < 2; k++) {
            float ox = start + k * width;
            for (int i = 0; i < pebbleX.length; i++) {
                float x = ox + pebbleX[i];
                if (x > -20 && x < width + 20) {
                    c.drawCircle(x, pebbleY[i], pebbleR[i], paint);
                }
            }
        }

        paint.setColor(grass);
        c.drawRect(0, groundY, width, groundY + grassH, paint);
        paint.setColor(Util.darken(grass, 0.25f));
        c.drawRect(0, groundY + grassH, width, groundY + grassH + height * 0.008f, paint);
        paint.setColor(Util.lerpColor(grass, Color.WHITE, 0.18f));
        c.drawRect(0, groundY, width, groundY + height * 0.006f, paint);

        paint.setColor(Util.darken(grass, 0.08f));
        for (int k = 0; k < 2; k++) {
            c.save();
            c.translate(start + k * width, groundY);
            c.drawPath(tuftPath, paint);
            c.restore();
        }
    }
}
