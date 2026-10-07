package com.ahoshan.dourbaj;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.view.HapticFeedbackConstants;
import android.view.MotionEvent;
import android.view.View;

import java.util.ArrayList;
import java.util.Random;

/**
 * "দৌড়বাজ" — an endless runner. Tap the right side to jump (twice for a
 * double jump), tap the left side or swipe down to slide. Dodge crates,
 * rocks and birds, collect coins, and see how far you get.
 */
public class RunnerView extends View {

    private static final int MENU = 0;
    private static final int PLAYING = 1;
    private static final int PAUSED = 2;
    private static final int DYING = 3;
    private static final int OVER = 4;

    private static final float DAY_CYCLE = 150f;
    private static final float DYING_TIME = 1.1f;
    private static final float HINT_TIME = 5f;
    private static final int COIN_SCORE = 10;

    private static final int ACCENT = 0xFFFF8F00;
    private static final int GREEN = 0xFF2E9D57;
    private static final int PANEL_TEXT = 0xFF263238;
    private static final int COIN = 0xFFFFC107;
    private static final int COIN_DARK = 0xFFE09400;

    private static final class Coin {
        float x;
        float y;
        float phase;
    }

    private final Random random = new Random();
    private final Background background = new Background();
    private final Player player = new Player();
    private final Particles particles = new Particles();
    private final Sfx sfx = new Sfx();
    private final SharedPreferences prefs;

    private final ArrayList<Obstacle> obstacles = new ArrayList<>();
    private final ArrayList<Obstacle> obstaclePool = new ArrayList<>();
    private final ArrayList<Coin> coins = new ArrayList<>();
    private final ArrayList<Coin> coinPool = new ArrayList<>();

    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint shade = new Paint();
    private final RectF rect = new RectF();
    private final RectF pauseButton = new RectF();
    private final RectF soundButton = new RectF();
    private final RectF primaryButton = new RectF();
    private final RectF secondaryButton = new RectF();
    private final Path path = new Path();

    private int w;
    private int h;
    private float groundY;

    private int state = MENU;
    private float stateTime;
    private float clock;
    private float dayTime = DAY_CYCLE * 0.22f;
    private float elapsed;
    private float speed;
    private float scroll;
    private float distance;
    private float nextSpawn;
    private float dustTimer;
    private float shake;
    private int coinCount;
    private int lastScore;
    private int best;
    private boolean newBest;

    private float downX;
    private float downY;
    private boolean swipeUsed;

    private boolean running;
    private long lastFrame;

    public RunnerView(Context context) {
        super(context);
        prefs = context.getSharedPreferences("runner", Context.MODE_PRIVATE);
        best = prefs.getInt("best", 0);
        sfx.muted = prefs.getBoolean("muted", false);
        text.setTypeface(Typeface.DEFAULT_BOLD);
        text.setTextAlign(Paint.Align.CENTER);
        setHapticFeedbackEnabled(true);
    }

    // ------------------------------------------------------------ lifecycle

    void resumeLoop() {
        running = true;
        lastFrame = 0;
        invalidate();
    }

    void pauseLoop() {
        if (state == PLAYING) {
            setState(PAUSED);
        }
        running = false;
    }

    void release() {
        sfx.release();
    }

    /** @return true if the back press was used by the game. */
    boolean onBack() {
        if (state == PLAYING) {
            setState(PAUSED);
            return true;
        }
        if (state == PAUSED || state == OVER) {
            goToMenu();
            return true;
        }
        return false;
    }

    @Override
    protected void onSizeChanged(int width, int height, int oldw, int oldh) {
        super.onSizeChanged(width, height, oldw, oldh);
        w = width;
        h = height;
        groundY = h * 0.8f;
        background.resize(w, h, groundY);
        player.resize(h, Math.max(w * 0.2f, h * 0.32f), groundY);
        shade.setShader(new LinearGradient(0, 0, 0, h,
                Color.argb(150, 0, 0, 20), Color.argb(60, 0, 0, 20), Shader.TileMode.CLAMP));
        if (state == PLAYING || state == DYING) {
            // A size change mid-run (rare: split screen) restarts cleanly.
            goToMenu();
        }
    }

    private void setState(int s) {
        state = s;
        stateTime = 0;
    }

    private void goToMenu() {
        clearWorld();
        player.reset(groundY);
        setState(MENU);
    }

    private void clearWorld() {
        obstaclePool.addAll(obstacles);
        obstacles.clear();
        coinPool.addAll(coins);
        coins.clear();
        particles.clear();
    }

    private void startGame() {
        clearWorld();
        player.reset(groundY);
        elapsed = 0;
        distance = 0;
        coinCount = 0;
        newBest = false;
        speed = h * 1.0f;
        nextSpawn = h * 2.2f;
        dayTime = DAY_CYCLE * 0.05f;
        shake = 0;
        setState(PLAYING);
    }

    // --------------------------------------------------------------- update

    private void update(float dt) {
        clock += dt;
        stateTime += dt;
        shake = Math.max(0, shake - dt);

        if (state == PAUSED) {
            return;
        }
        dayTime += dt;

        switch (state) {
            case MENU:
            case OVER:
                speed = h * 0.55f;
                scroll += speed * dt;
                if (state == MENU) {
                    player.update(dt, groundY, speed);
                    runDust(dt);
                }
                break;
            case PLAYING:
                updatePlaying(dt);
                break;
            case DYING:
                speed = Math.max(0, speed - h * 3f * dt);
                scroll += speed * dt;
                player.update(dt, groundY, 0);
                moveWorld(dt);
                if (stateTime > DYING_TIME) {
                    finishRun();
                }
                break;
            default:
                break;
        }
        particles.update(dt);
    }

    private void updatePlaying(float dt) {
        elapsed += dt;
        speed = h * (1.0f + Math.min(elapsed, 130f) * 0.011f);
        scroll += speed * dt;
        distance += speed * dt;

        if (player.update(dt, groundY, speed)) {
            for (int i = 0; i < 8; i++) {
                particles.spawn(player.x + (random.nextFloat() - 0.5f) * h * 0.06f, groundY,
                        -speed * 0.3f + (random.nextFloat() - 0.5f) * h * 0.4f, -h * (0.1f + random.nextFloat() * 0.25f),
                        0.4f, h * 0.012f, 0xC8D7B48A, h * 0.8f);
            }
        }
        runDust(dt);

        nextSpawn -= speed * dt;
        if (nextSpawn <= 0) {
            spawnObstacle();
        }

        moveWorld(dt);

        // Coins.
        float reach = h * 0.025f;
        for (int i = coins.size() - 1; i >= 0; i--) {
            Coin coin = coins.get(i);
            if (coin.x > player.hitbox.left - reach && coin.x < player.hitbox.right + reach
                    && coin.y > player.hitbox.top - reach && coin.y < player.hitbox.bottom + reach) {
                coinPool.add(coins.remove(i));
                coinCount++;
                sfx.coin();
                for (int k = 0; k < 7; k++) {
                    double a = random.nextDouble() * Math.PI * 2;
                    float v = h * (0.25f + random.nextFloat() * 0.35f);
                    particles.spawn(coin.x, coin.y, (float) Math.cos(a) * v - speed * 0.3f, (float) Math.sin(a) * v,
                            0.35f, h * 0.007f, 0xFFFFE082, 0);
                }
            }
        }

        // Obstacles.
        for (Obstacle o : obstacles) {
            if (RectF.intersects(o.hitbox, player.hitbox)) {
                crash();
                break;
            }
        }
    }

    private void moveWorld(float dt) {
        for (int i = obstacles.size() - 1; i >= 0; i--) {
            Obstacle o = obstacles.get(i);
            o.update(dt, speed);
            if (o.x + o.w < -h * 0.3f) {
                obstaclePool.add(obstacles.remove(i));
            }
        }
        for (int i = coins.size() - 1; i >= 0; i--) {
            Coin coin = coins.get(i);
            coin.x -= speed * dt;
            if (coin.x < -h * 0.1f) {
                coinPool.add(coins.remove(i));
            }
        }
    }

    private void runDust(float dt) {
        if (!player.onGround || player.dead) {
            return;
        }
        boolean sliding = player.isSliding();
        dustTimer -= dt;
        if (dustTimer > 0) {
            return;
        }
        dustTimer = sliding ? 0.025f : 0.09f;
        float fx = player.x + (sliding ? h * 0.04f : -h * 0.01f);
        particles.spawn(fx, groundY - h * 0.005f,
                -speed * (0.25f + random.nextFloat() * 0.2f), -h * (0.05f + random.nextFloat() * (sliding ? 0.25f : 0.12f)),
                sliding ? 0.3f : 0.4f, h * (sliding ? 0.008f : 0.011f), 0xAADCC39A, h * 0.5f);
    }

    private void spawnObstacle() {
        float gapSeconds = Math.max(0.9f, 1.5f - elapsed * 0.006f) + random.nextFloat() * 0.75f;
        nextSpawn = speed * gapSeconds;

        int type;
        float r = random.nextFloat();
        if (elapsed > 10f && r < 0.22f) {
            type = Obstacle.BIRD;
        } else {
            float g = random.nextFloat();
            if (elapsed > 6f && g < 0.3f) {
                type = Obstacle.CRATE_STACK;
            } else if (g < 0.65f) {
                type = Obstacle.CRATE;
            } else {
                type = Obstacle.ROCK;
            }
        }

        Obstacle o = obstaclePool.isEmpty() ? new Obstacle() : obstaclePool.remove(obstaclePool.size() - 1);
        float left = w + h * 0.1f;
        o.set(type, left, groundY, h);
        o.update(0, speed);
        obstacles.add(o);

        float c = random.nextFloat();
        if (type == Obstacle.BIRD) {
            if (c < 0.6f) {
                coinRow(left - h * 0.05f, groundY - h * 0.045f, 5);
            }
        } else if (c < 0.55f) {
            // An arc that follows a well-timed jump over the obstacle.
            float mid = left + o.w / 2f;
            float peak = type == Obstacle.CRATE_STACK ? 0.31f : 0.25f;
            for (int i = 0; i < 5; i++) {
                float k = (i - 2) / 2f;
                addCoin(mid + (i - 2) * h * 0.085f, groundY - h * (0.1f + (peak - 0.1f) * (1f - k * k)));
            }
        } else if (c < 0.85f) {
            coinRow(left + o.w + nextSpawn * 0.3f, groundY - h * 0.07f, 4 + random.nextInt(3));
        }
    }

    private void coinRow(float startX, float y, int count) {
        for (int i = 0; i < count; i++) {
            addCoin(startX + i * h * 0.075f, y);
        }
    }

    private void addCoin(float x, float y) {
        Coin coin = coinPool.isEmpty() ? new Coin() : coinPool.remove(coinPool.size() - 1);
        coin.x = x;
        coin.y = y;
        coin.phase = x * 0.01f;
        coins.add(coin);
    }

    private void crash() {
        player.kill();
        sfx.hit();
        shake = 0.35f;
        performHapticFeedback(HapticFeedbackConstants.LONG_PRESS);
        float cx = player.x;
        float cy = player.y - h * 0.1f;
        for (int i = 0; i < 22; i++) {
            double a = random.nextDouble() * Math.PI * 2;
            float v = h * (0.3f + random.nextFloat() * 0.6f);
            int color = i % 3 == 0 ? 0xFFFFFFFF : (i % 3 == 1 ? 0xFFFFC107 : 0xFFFF7043);
            particles.spawn(cx, cy, (float) Math.cos(a) * v, (float) Math.sin(a) * v,
                    0.6f, h * 0.012f, color, h * 1.2f);
        }
        setState(DYING);
    }

    private void finishRun() {
        lastScore = meters() + coinCount * COIN_SCORE;
        if (lastScore > best) {
            best = lastScore;
            newBest = true;
            prefs.edit().putInt("best", best).apply();
        }
        setState(OVER);
    }

    private int meters() {
        return (int) (distance / (h * 0.12f));
    }

    private float daylight() {
        return 0.5f + 0.5f * (float) Math.cos(2 * Math.PI * dayTime / DAY_CYCLE);
    }

    // ----------------------------------------------------------------- draw

    @Override
    protected void onDraw(Canvas canvas) {
        long now = System.nanoTime();
        float dt = lastFrame == 0 ? 0 : (now - lastFrame) / 1_000_000_000f;
        lastFrame = now;
        if (running && w > 0) {
            update(Math.min(dt, 1f / 30f));
        }
        if (w == 0) {
            return;
        }

        canvas.save();
        if (shake > 0) {
            float amount = h * 0.02f * (shake / 0.35f);
            canvas.translate((random.nextFloat() - 0.5f) * amount, (random.nextFloat() - 0.5f) * amount);
        }

        background.draw(canvas, scroll, daylight(), clock);
        drawCoins(canvas);
        for (Obstacle o : obstacles) {
            o.draw(canvas, paint, h);
        }
        paint.setStyle(Paint.Style.FILL);
        if (state != OVER) {
            player.drawShadow(canvas, paint, groundY);
            player.draw(canvas, paint);
        }
        particles.draw(canvas, paint);
        canvas.restore();

        switch (state) {
            case MENU:
                drawMenu(canvas);
                break;
            case PLAYING:
                drawHud(canvas);
                drawHints(canvas);
                break;
            case PAUSED:
                drawHud(canvas);
                drawPaused(canvas);
                break;
            case DYING:
                drawHud(canvas);
                break;
            case OVER:
                drawGameOver(canvas);
                break;
            default:
                break;
        }

        if (running) {
            postInvalidateOnAnimation();
        }
    }

    private void drawCoins(Canvas c) {
        float r = h * 0.024f;
        paint.setStyle(Paint.Style.FILL);
        for (Coin coin : coins) {
            float squash = Math.abs((float) Math.cos(clock * 4f + coin.phase));
            float rx = r * (0.25f + 0.75f * squash);
            paint.setColor(Util.withAlpha(COIN, 60));
            c.drawCircle(coin.x, coin.y, r * 1.45f, paint);
            paint.setColor(COIN_DARK);
            c.drawOval(coin.x - rx, coin.y - r, coin.x + rx, coin.y + r, paint);
            paint.setColor(COIN);
            c.drawOval(coin.x - rx * 0.8f, coin.y - r * 0.8f, coin.x + rx * 0.8f, coin.y + r * 0.8f, paint);
            if (squash > 0.45f) {
                text.setColor(COIN_DARK);
                text.setTextSize(r * 1.25f);
                c.save();
                c.scale(squash, 1f, coin.x, coin.y);
                drawCentered(c, "৳", coin.x, coin.y);
                c.restore();
            }
            paint.setColor(0xB0FFFFFF);
            c.drawCircle(coin.x - rx * 0.35f, coin.y - r * 0.4f, r * 0.18f, paint);
        }
    }

    private void drawHud(Canvas c) {
        float m = h * 0.045f;
        float pillH = h * 0.085f;
        text.setTextSize(pillH * 0.5f);

        String dist = Util.bn(meters()) + " মি";
        float distW = text.measureText(dist) + pillH * 0.9f;
        rect.set(m, m, m + distW, m + pillH);
        drawPill(c, rect);
        text.setColor(Color.WHITE);
        drawCentered(c, dist, rect.centerX(), rect.centerY());

        String coinText = Util.bn(coinCount);
        float coinW = text.measureText(coinText) + pillH * 1.5f;
        float left = rect.right + m * 0.4f;
        rect.set(left, m, left + coinW, m + pillH);
        drawPill(c, rect);
        float iconX = rect.left + pillH * 0.55f;
        drawCoinIcon(c, iconX, rect.centerY(), pillH * 0.3f);
        text.setColor(0xFFFFE082);
        drawCentered(c, coinText, (iconX + pillH * 0.35f + rect.right) / 2f, rect.centerY());

        // Pause button.
        float r = pillH * 0.55f;
        float cx = w - m - r;
        float cy = m + pillH / 2f;
        pauseButton.set(cx - r * 1.6f, cy - r * 1.6f, cx + r * 1.6f, cy + r * 1.6f);
        paint.setColor(0x66000000);
        c.drawCircle(cx, cy, r, paint);
        paint.setColor(Color.WHITE);
        c.drawRect(cx - r * 0.35f, cy - r * 0.38f, cx - r * 0.12f, cy + r * 0.38f, paint);
        c.drawRect(cx + r * 0.12f, cy - r * 0.38f, cx + r * 0.35f, cy + r * 0.38f, paint);
    }

    private void drawHints(Canvas c) {
        if (elapsed > HINT_TIME) {
            return;
        }
        float fade = Util.clamp((HINT_TIME - elapsed) / 1f, 0f, 1f);
        int alpha = (int) (fade * 255);
        float size = h * 0.05f;
        float y = h - h * 0.07f;

        paint.setColor(Color.argb((int) (fade * 40), 255, 255, 255));
        c.drawRect(0, 0, w * 0.3f, h, paint);
        paint.setColor(Color.argb((int) (fade * 120), 255, 255, 255));
        c.drawRect(w * 0.3f - h * 0.003f, h * 0.2f, w * 0.3f + h * 0.003f, groundY, paint);

        text.setTextSize(size);
        text.setColor(Color.argb(alpha, 255, 255, 255));
        drawCentered(c, "⬇ স্লাইড", w * 0.15f, y);
        drawCentered(c, "⬆ লাফ  (দুবার = ডাবল জাম্প)", w * 0.65f, y);
    }

    private void drawMenu(Canvas c) {
        c.drawRect(0, 0, w, h, shade);

        float titleY = h * 0.27f;
        float bob = (float) Math.sin(clock * 2.2f) * h * 0.008f;
        text.setTextSize(h * 0.16f);
        text.setShadowLayer(h * 0.012f, 0, h * 0.008f, 0x99000000);
        text.setColor(0xFFFFD54F);
        drawCentered(c, "দৌড়বাজ", w / 2f, titleY + bob);
        text.clearShadowLayer();

        text.setTextSize(h * 0.045f);
        text.setColor(0xE6FFFFFF);
        drawCentered(c, "যত দূর পারো দৌড়াও!", w / 2f, titleY + h * 0.11f);

        float bw = h * 0.62f;
        float bh = h * 0.13f;
        float pulse = 1f + 0.03f * (float) Math.sin(clock * 4f);
        primaryButton.set(w / 2f - bw / 2f * pulse, h * 0.5f - bh / 2f * pulse,
                w / 2f + bw / 2f * pulse, h * 0.5f + bh / 2f * pulse);
        drawButton(c, primaryButton, "▶  খেলো", ACCENT);

        text.setTextSize(h * 0.04f);
        if (best > 0) {
            text.setColor(0xFFFFE082);
            drawCentered(c, "সেরা স্কোর: " + Util.bn(best), w / 2f, h * 0.65f);
        }
        text.setColor(0xD0FFFFFF);
        text.setTextSize(h * 0.036f);
        drawCentered(c, "ডান দিকে ট্যাপ = লাফ   •   বাম দিকে ট্যাপ / নিচে সোয়াইপ = স্লাইড", w / 2f, h * 0.9f);

        drawSoundButton(c);
    }

    private void drawSoundButton(Canvas c) {
        float m = h * 0.045f;
        float r = h * 0.047f;
        float cx = w - m - r;
        float cy = m + r;
        soundButton.set(cx - r * 1.6f, cy - r * 1.6f, cx + r * 1.6f, cy + r * 1.6f);
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(0x66000000);
        c.drawCircle(cx, cy, r, paint);

        paint.setColor(Color.WHITE);
        path.reset();
        path.moveTo(cx - r * 0.5f, cy - r * 0.18f);
        path.lineTo(cx - r * 0.25f, cy - r * 0.18f);
        path.lineTo(cx + r * 0.08f, cy - r * 0.45f);
        path.lineTo(cx + r * 0.08f, cy + r * 0.45f);
        path.lineTo(cx - r * 0.25f, cy + r * 0.18f);
        path.lineTo(cx - r * 0.5f, cy + r * 0.18f);
        path.close();
        c.drawPath(path, paint);

        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeCap(Paint.Cap.ROUND);
        paint.setStrokeWidth(r * 0.1f);
        if (sfx.muted) {
            c.drawLine(cx + r * 0.22f, cy - r * 0.2f, cx + r * 0.55f, cy + r * 0.2f, paint);
            c.drawLine(cx + r * 0.22f, cy + r * 0.2f, cx + r * 0.55f, cy - r * 0.2f, paint);
        } else {
            rect.set(cx - r * 0.1f, cy - r * 0.32f, cx + r * 0.42f, cy + r * 0.32f);
            c.drawArc(rect, -50, 100, false, paint);
            rect.set(cx - r * 0.2f, cy - r * 0.55f, cx + r * 0.62f, cy + r * 0.55f);
            c.drawArc(rect, -50, 100, false, paint);
        }
        paint.setStyle(Paint.Style.FILL);
    }

    private void drawPaused(Canvas c) {
        paint.setColor(0x99000010);
        c.drawRect(0, 0, w, h, paint);

        text.setTextSize(h * 0.12f);
        text.setColor(Color.WHITE);
        drawCentered(c, "বিরতি", w / 2f, h * 0.3f);

        float bw = h * 0.6f;
        float bh = h * 0.12f;
        primaryButton.set(w / 2f - bw / 2f, h * 0.45f, w / 2f + bw / 2f, h * 0.45f + bh);
        drawButton(c, primaryButton, "▶  চালিয়ে যাও", GREEN);
        secondaryButton.set(w / 2f - bw / 2f, h * 0.62f, w / 2f + bw / 2f, h * 0.62f + bh);
        drawButton(c, secondaryButton, "মেনু", 0xFF546E7A);
    }

    private void drawGameOver(Canvas c) {
        float appear = Util.clamp(stateTime / 0.35f, 0f, 1f);
        float ease = 1f - (1f - appear) * (1f - appear);
        paint.setColor(Color.argb((int) (150 * ease), 0, 0, 16));
        c.drawRect(0, 0, w, h, paint);

        float pw = Math.min(w * 0.6f, h * 1.05f);
        float ph = h * 0.8f;
        float px = w / 2f - pw / 2f;
        float py = h * 0.1f + (1f - ease) * h * 0.3f;
        float corner = h * 0.05f;

        paint.setColor(0x40000000);
        rect.set(px, py + h * 0.015f, px + pw, py + ph + h * 0.015f);
        c.drawRoundRect(rect, corner, corner, paint);
        paint.setColor(0xFFFDFBF6);
        rect.set(px, py, px + pw, py + ph);
        c.drawRoundRect(rect, corner, corner, paint);
        paint.setColor(0xFFE53935);
        rect.set(px, py, px + pw, py + h * 0.15f);
        c.drawRoundRect(rect, corner, corner, paint);
        c.drawRect(px, py + h * 0.1f, px + pw, py + h * 0.15f, paint);

        text.setTextSize(h * 0.075f);
        text.setColor(Color.WHITE);
        drawCentered(c, "খেলা শেষ!", w / 2f, py + h * 0.075f);

        float rowY = py + h * 0.23f;
        float rowGap = h * 0.075f;
        drawStatRow(c, px, pw, rowY, "দূরত্ব", Util.bn(meters()) + " মি");
        drawStatRow(c, px, pw, rowY + rowGap, "কয়েন", "৳ " + Util.bn(coinCount));
        drawStatRow(c, px, pw, rowY + rowGap * 2, "মোট স্কোর", Util.bn(lastScore));

        text.setTextSize(h * 0.045f);
        if (newBest) {
            float pop = 1f + 0.06f * (float) Math.sin(clock * 6f);
            text.setTextSize(h * 0.05f * pop);
            text.setColor(ACCENT);
            drawCentered(c, "🏆 নতুন রেকর্ড!", w / 2f, rowY + rowGap * 3.1f);
        } else {
            text.setColor(0xFF78909C);
            drawCentered(c, "সেরা স্কোর: " + Util.bn(best), w / 2f, rowY + rowGap * 3.1f);
        }

        float gap = pw * 0.04f;
        float bw = (pw - gap * 3) / 2f;
        float bh = h * 0.11f;
        float by = py + ph - bh - h * 0.05f;
        secondaryButton.set(px + gap, by, px + gap + bw, by + bh);
        primaryButton.set(px + gap * 2 + bw, by, px + gap * 2 + bw * 2, by + bh);
        boolean ready = stateTime > 0.6f;
        drawButton(c, secondaryButton, "মেনু", ready ? 0xFF78909C : 0xFFB0BEC5);
        drawButton(c, primaryButton, "↻ আবার খেলো", ready ? GREEN : 0xFFA5D6A7);
    }

    private void drawStatRow(Canvas c, float px, float pw, float y, String label, String value) {
        float pad = pw * 0.1f;
        text.setTextSize(h * 0.05f);
        text.setColor(0xFF78909C);
        text.setTextAlign(Paint.Align.LEFT);
        drawCentered(c, label, px + pad, y);
        text.setTextAlign(Paint.Align.RIGHT);
        text.setColor(PANEL_TEXT);
        drawCentered(c, value, px + pw - pad, y);
        text.setTextAlign(Paint.Align.CENTER);
        paint.setColor(0xFFECEFF1);
        c.drawRect(px + pad, y + h * 0.035f, px + pw - pad, y + h * 0.038f, paint);
    }

    private void drawButton(Canvas c, RectF r, String label, int color) {
        float radius = r.height() / 2f;
        float depth = r.height() * 0.08f;
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(Util.darken(color, 0.3f));
        rect.set(r.left, r.top + depth, r.right, r.bottom + depth);
        c.drawRoundRect(rect, radius, radius, paint);
        paint.setColor(color);
        c.drawRoundRect(r, radius, radius, paint);
        paint.setColor(0x33FFFFFF);
        rect.set(r.left + radius * 0.4f, r.top + r.height() * 0.1f, r.right - radius * 0.4f, r.centerY());
        c.drawRoundRect(rect, radius * 0.5f, radius * 0.5f, paint);

        text.setTextSize(r.height() * 0.42f);
        text.setColor(Color.WHITE);
        drawCentered(c, label, r.centerX(), r.centerY());
    }

    private void drawPill(Canvas c, RectF r) {
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(0x73000000);
        c.drawRoundRect(r, r.height() / 2f, r.height() / 2f, paint);
    }

    private void drawCoinIcon(Canvas c, float cx, float cy, float r) {
        paint.setColor(COIN_DARK);
        c.drawCircle(cx, cy, r, paint);
        paint.setColor(COIN);
        c.drawCircle(cx, cy, r * 0.8f, paint);
        paint.setColor(0xB0FFFFFF);
        c.drawCircle(cx - r * 0.3f, cy - r * 0.35f, r * 0.2f, paint);
    }

    private void drawCentered(Canvas c, String s, float x, float cy) {
        Paint.FontMetrics fm = text.getFontMetrics();
        c.drawText(s, x, cy - (fm.ascent + fm.descent) / 2f, text);
    }

    // ---------------------------------------------------------------- input

    @Override
    public boolean onTouchEvent(MotionEvent e) {
        int action = e.getActionMasked();
        switch (action) {
            case MotionEvent.ACTION_DOWN:
            case MotionEvent.ACTION_POINTER_DOWN: {
                int idx = e.getActionIndex();
                float x = e.getX(idx);
                float y = e.getY(idx);
                if (action == MotionEvent.ACTION_DOWN) {
                    downX = x;
                    downY = y;
                    swipeUsed = false;
                }
                onPress(x, y);
                if (action == MotionEvent.ACTION_DOWN) {
                    performClick();
                }
                break;
            }
            case MotionEvent.ACTION_MOVE: {
                if (state == PLAYING && !swipeUsed) {
                    float dx = e.getX() - downX;
                    float dy = e.getY() - downY;
                    if (dy > h * 0.07f && dy > Math.abs(dx)) {
                        swipeUsed = true;
                        doSlide();
                    }
                }
                break;
            }
            default:
                break;
        }
        return true;
    }

    @Override
    public boolean performClick() {
        return super.performClick();
    }

    private void onPress(float x, float y) {
        switch (state) {
            case MENU:
                if (soundButton.contains(x, y)) {
                    sfx.muted = !sfx.muted;
                    prefs.edit().putBoolean("muted", sfx.muted).apply();
                } else {
                    startGame();
                }
                break;
            case PLAYING:
                if (pauseButton.contains(x, y)) {
                    setState(PAUSED);
                } else if (x < w * 0.3f) {
                    doSlide();
                } else {
                    doJump();
                }
                break;
            case PAUSED:
                if (secondaryButton.contains(x, y)) {
                    goToMenu();
                } else {
                    setState(PLAYING);
                }
                break;
            case OVER:
                if (stateTime < 0.6f) {
                    break;
                }
                if (secondaryButton.contains(x, y)) {
                    goToMenu();
                } else {
                    startGame();
                }
                break;
            default:
                break;
        }
    }

    private void doJump() {
        int kind = player.jump();
        if (kind == 1) {
            sfx.jump();
        } else if (kind == 2) {
            sfx.doubleJump();
            float cy = player.y - h * 0.1f;
            for (int i = 0; i < 12; i++) {
                double a = i * Math.PI * 2 / 12;
                float v = h * 0.45f;
                particles.spawn(player.x, cy, (float) Math.cos(a) * v, (float) Math.sin(a) * v,
                        0.3f, h * 0.008f, 0xE6FFFFFF, 0);
            }
        }
    }

    private void doSlide() {
        if (player.slide()) {
            sfx.slide();
        }
    }
}
