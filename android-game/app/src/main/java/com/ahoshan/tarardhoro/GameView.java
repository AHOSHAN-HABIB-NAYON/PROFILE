package com.ahoshan.tarardhoro;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Shader;
import android.view.MotionEvent;
import android.view.View;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.Random;

/**
 * "তারা ধরো" — drag the basket to catch falling stars and dodge the bombs.
 * A missed star or a caught bomb costs one life; the game speeds up over time.
 */
public class GameView extends View {

    private static final int STATE_READY = 0;
    private static final int STATE_PLAYING = 1;
    private static final int STATE_OVER = 2;

    private static final int MAX_LIVES = 3;
    private static final float BOMB_CHANCE = 0.25f;

    private static class Item {
        float x;
        float y;
        float radius;
        float speedFactor;
        float spin;
        boolean bomb;
    }

    private final Random random = new Random();
    private final ArrayList<Item> items = new ArrayList<>();
    private final SharedPreferences prefs;

    private final Paint fillPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint textPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint backgroundPaint = new Paint();
    private final Path starPath = new Path();
    private final RectF rect = new RectF();

    private float[] skyDotX = new float[0];
    private float[] skyDotY = new float[0];
    private float[] skyDotPhase = new float[0];

    private int state = STATE_READY;
    private int score;
    private int best;
    private int lives;
    private float elapsed;
    private float spawnTimer;
    private float overTimer;
    private float hitFlash;
    private float catchFlash;
    private float clock;

    private float playerX;
    private float playerWidth;
    private float playerHeight;
    private float playerTop;

    private boolean running;
    private long lastFrameNanos;

    public GameView(Context context) {
        super(context);
        prefs = context.getSharedPreferences("game", Context.MODE_PRIVATE);
        best = prefs.getInt("best", 0);
        textPaint.setTextAlign(Paint.Align.CENTER);
        textPaint.setColor(Color.WHITE);
        buildStarPath();
    }

    /** A five-pointed star with outer radius 1, centred on the origin. */
    private void buildStarPath() {
        starPath.reset();
        for (int i = 0; i < 10; i++) {
            double angle = -Math.PI / 2 + i * Math.PI / 5;
            float r = (i % 2 == 0) ? 1f : 0.45f;
            float px = (float) (Math.cos(angle) * r);
            float py = (float) (Math.sin(angle) * r);
            if (i == 0) {
                starPath.moveTo(px, py);
            } else {
                starPath.lineTo(px, py);
            }
        }
        starPath.close();
    }

    public void resume() {
        running = true;
        lastFrameNanos = 0;
        invalidate();
    }

    public void pause() {
        running = false;
    }

    @Override
    protected void onSizeChanged(int w, int h, int oldw, int oldh) {
        super.onSizeChanged(w, h, oldw, oldh);
        playerWidth = w * 0.24f;
        playerHeight = w * 0.07f;
        playerTop = h - playerHeight - h * 0.06f;
        playerX = w / 2f;

        backgroundPaint.setShader(new LinearGradient(0, 0, 0, h,
                Color.rgb(11, 13, 46), Color.rgb(45, 27, 92), Shader.TileMode.CLAMP));

        int count = 70;
        skyDotX = new float[count];
        skyDotY = new float[count];
        skyDotPhase = new float[count];
        for (int i = 0; i < count; i++) {
            skyDotX[i] = random.nextFloat() * w;
            skyDotY[i] = random.nextFloat() * h;
            skyDotPhase[i] = random.nextFloat() * 6.28f;
        }
    }

    private void startGame() {
        items.clear();
        score = 0;
        lives = MAX_LIVES;
        elapsed = 0;
        spawnTimer = 0;
        hitFlash = 0;
        catchFlash = 0;
        playerX = getWidth() / 2f;
        state = STATE_PLAYING;
    }

    private void endGame() {
        state = STATE_OVER;
        overTimer = 0;
        if (score > best) {
            best = score;
            prefs.edit().putInt("best", best).apply();
        }
    }

    // ---------------------------------------------------------------- update

    private void update(float dt) {
        clock += dt;
        hitFlash = Math.max(0, hitFlash - dt);
        catchFlash = Math.max(0, catchFlash - dt);

        if (state == STATE_OVER) {
            overTimer += dt;
            return;
        }
        if (state != STATE_PLAYING) {
            return;
        }

        int w = getWidth();
        int h = getHeight();
        elapsed += dt;

        float fallSpeed = h * Math.min(0.32f + elapsed * 0.012f, 0.95f);
        float spawnInterval = Math.max(0.32f, 0.9f - elapsed * 0.012f);

        spawnTimer -= dt;
        if (spawnTimer <= 0) {
            spawnTimer = spawnInterval;
            Item item = new Item();
            item.radius = w * (0.04f + random.nextFloat() * 0.02f);
            item.x = item.radius + random.nextFloat() * (w - 2 * item.radius);
            item.y = -item.radius;
            item.speedFactor = 0.8f + random.nextFloat() * 0.5f;
            item.spin = random.nextFloat() * 360f;
            item.bomb = random.nextFloat() < BOMB_CHANCE;
            items.add(item);
        }

        float basketLeft = playerX - playerWidth / 2f;
        float basketRight = playerX + playerWidth / 2f;

        Iterator<Item> it = items.iterator();
        while (it.hasNext()) {
            Item item = it.next();
            item.y += fallSpeed * item.speedFactor * dt;
            item.spin += dt * 120f;

            boolean touchesBasket = item.y + item.radius >= playerTop
                    && item.y - item.radius <= playerTop + playerHeight
                    && item.x >= basketLeft - item.radius * 0.5f
                    && item.x <= basketRight + item.radius * 0.5f;

            if (touchesBasket) {
                it.remove();
                if (item.bomb) {
                    loseLife();
                } else {
                    score++;
                    catchFlash = 0.25f;
                }
            } else if (item.y - item.radius > h) {
                it.remove();
                if (!item.bomb) {
                    loseLife();
                }
            }
        }
    }

    private void loseLife() {
        lives--;
        hitFlash = 0.35f;
        if (lives <= 0) {
            endGame();
        }
    }

    // ------------------------------------------------------------------ draw

    @Override
    protected void onDraw(Canvas canvas) {
        long now = System.nanoTime();
        float dt = lastFrameNanos == 0 ? 0 : (now - lastFrameNanos) / 1_000_000_000f;
        lastFrameNanos = now;
        if (running) {
            update(Math.min(dt, 0.05f));
        }

        int w = getWidth();
        int h = getHeight();

        canvas.drawRect(0, 0, w, h, backgroundPaint);
        drawSky(canvas);

        for (Item item : items) {
            if (item.bomb) {
                drawBomb(canvas, item);
            } else {
                drawStar(canvas, item.x, item.y, item.radius, item.spin, Color.rgb(255, 213, 79));
            }
        }

        drawBasket(canvas);

        if (hitFlash > 0) {
            fillPaint.setColor(Color.argb((int) (hitFlash / 0.35f * 110), 255, 40, 40));
            canvas.drawRect(0, 0, w, h, fillPaint);
        }

        if (state == STATE_PLAYING) {
            drawHud(canvas);
        } else if (state == STATE_READY) {
            drawReadyScreen(canvas);
        } else {
            drawHud(canvas);
            drawGameOverScreen(canvas);
        }

        if (running) {
            postInvalidateOnAnimation();
        }
    }

    private void drawSky(Canvas canvas) {
        for (int i = 0; i < skyDotX.length; i++) {
            float twinkle = 0.5f + 0.5f * (float) Math.sin(clock * 2f + skyDotPhase[i]);
            fillPaint.setColor(Color.argb((int) (60 + 140 * twinkle), 255, 255, 255));
            canvas.drawCircle(skyDotX[i], skyDotY[i], 1.5f + twinkle * 1.5f, fillPaint);
        }
    }

    private void drawStar(Canvas canvas, float x, float y, float radius, float rotation, int color) {
        fillPaint.setColor(Color.argb(60, Color.red(color), Color.green(color), Color.blue(color)));
        canvas.drawCircle(x, y, radius * 1.3f, fillPaint);

        canvas.save();
        canvas.translate(x, y);
        canvas.rotate(rotation);
        canvas.scale(radius, radius);
        fillPaint.setColor(color);
        canvas.drawPath(starPath, fillPaint);
        canvas.restore();
    }

    private void drawBomb(Canvas canvas, Item item) {
        float r = item.radius;
        fillPaint.setColor(Color.rgb(40, 40, 48));
        canvas.drawCircle(item.x, item.y, r, fillPaint);
        fillPaint.setColor(Color.rgb(90, 90, 104));
        canvas.drawCircle(item.x - r * 0.35f, item.y - r * 0.35f, r * 0.25f, fillPaint);

        fillPaint.setColor(Color.rgb(140, 110, 80));
        canvas.drawRect(item.x - r * 0.12f, item.y - r * 1.3f, item.x + r * 0.12f, item.y - r * 0.85f, fillPaint);

        boolean sparkOn = ((int) (clock * 12)) % 2 == 0;
        fillPaint.setColor(sparkOn ? Color.rgb(255, 87, 34) : Color.rgb(255, 193, 7));
        canvas.drawCircle(item.x, item.y - r * 1.4f, r * 0.22f, fillPaint);
    }

    private void drawBasket(Canvas canvas) {
        float left = playerX - playerWidth / 2f;
        float right = playerX + playerWidth / 2f;
        float corner = playerHeight * 0.4f;

        int color = catchFlash > 0 ? Color.rgb(129, 199, 132) : Color.rgb(79, 195, 247);
        fillPaint.setColor(color);
        rect.set(left, playerTop, right, playerTop + playerHeight);
        canvas.drawRoundRect(rect, corner, corner, fillPaint);

        fillPaint.setColor(Color.argb(90, 255, 255, 255));
        rect.set(left + corner, playerTop + playerHeight * 0.15f,
                right - corner, playerTop + playerHeight * 0.35f);
        canvas.drawRoundRect(rect, corner, corner, fillPaint);
    }

    private void drawHud(Canvas canvas) {
        int w = getWidth();
        float size = w * 0.06f;
        float top = getHeight() * 0.05f + size;

        textPaint.setTextSize(size);
        textPaint.setFakeBoldText(true);
        textPaint.setTextAlign(Paint.Align.LEFT);
        textPaint.setColor(Color.WHITE);
        canvas.drawText("স্কোর: " + toBangla(score), w * 0.05f, top, textPaint);

        float heartSize = size * 0.42f;
        for (int i = 0; i < MAX_LIVES; i++) {
            float cx = w * 0.93f - i * heartSize * 2.6f;
            drawHeart(canvas, cx, top - size * 0.35f, heartSize,
                    i < lives ? Color.rgb(239, 83, 80) : Color.argb(70, 255, 255, 255));
        }
        textPaint.setTextAlign(Paint.Align.CENTER);
    }

    private void drawHeart(Canvas canvas, float cx, float cy, float s, int color) {
        fillPaint.setColor(color);
        canvas.drawCircle(cx - s * 0.5f, cy, s * 0.55f, fillPaint);
        canvas.drawCircle(cx + s * 0.5f, cy, s * 0.55f, fillPaint);
        Path p = new Path();
        p.moveTo(cx - s * 1.03f, cy + s * 0.15f);
        p.lineTo(cx + s * 1.03f, cy + s * 0.15f);
        p.lineTo(cx, cy + s * 1.25f);
        p.close();
        canvas.drawPath(p, fillPaint);
    }

    private void drawReadyScreen(Canvas canvas) {
        int w = getWidth();
        int h = getHeight();
        dim(canvas);

        float bounce = (float) Math.sin(clock * 3f) * w * 0.015f;
        drawStar(canvas, w / 2f, h * 0.27f + bounce, w * 0.12f, clock * 30f, Color.rgb(255, 213, 79));

        textPaint.setFakeBoldText(true);
        textPaint.setColor(Color.WHITE);
        textPaint.setTextSize(w * 0.13f);
        canvas.drawText("তারা ধরো!", w / 2f, h * 0.45f, textPaint);

        textPaint.setFakeBoldText(false);
        textPaint.setTextSize(w * 0.05f);
        textPaint.setColor(Color.rgb(220, 220, 240));
        canvas.drawText("আঙুল দিয়ে ঝুড়ি ডানে-বামে সরাও", w / 2f, h * 0.54f, textPaint);
        canvas.drawText("তারা ধরলে +১ পয়েন্ট", w / 2f, h * 0.59f, textPaint);
        canvas.drawText("বোমা থেকে দূরে থাকো!", w / 2f, h * 0.64f, textPaint);

        if (best > 0) {
            textPaint.setColor(Color.rgb(255, 213, 79));
            canvas.drawText("সেরা স্কোর: " + toBangla(best), w / 2f, h * 0.71f, textPaint);
        }

        drawTapHint(canvas, "শুরু করতে ট্যাপ করো");
    }

    private void drawGameOverScreen(Canvas canvas) {
        int w = getWidth();
        int h = getHeight();
        dim(canvas);

        textPaint.setFakeBoldText(true);
        textPaint.setColor(Color.rgb(239, 83, 80));
        textPaint.setTextSize(w * 0.12f);
        canvas.drawText("খেলা শেষ!", w / 2f, h * 0.35f, textPaint);

        textPaint.setColor(Color.WHITE);
        textPaint.setTextSize(w * 0.08f);
        canvas.drawText("স্কোর: " + toBangla(score), w / 2f, h * 0.47f, textPaint);

        textPaint.setFakeBoldText(false);
        textPaint.setTextSize(w * 0.06f);
        textPaint.setColor(Color.rgb(255, 213, 79));
        String bestLine = (score == best && score > 0)
                ? "নতুন রেকর্ড! 🎉"
                : "সেরা স্কোর: " + toBangla(best);
        canvas.drawText(bestLine, w / 2f, h * 0.55f, textPaint);

        if (overTimer > 0.8f) {
            drawTapHint(canvas, "আবার খেলতে ট্যাপ করো");
        }
    }

    private void drawTapHint(Canvas canvas, String text) {
        int w = getWidth();
        float pulse = 0.6f + 0.4f * (float) Math.sin(clock * 4f);
        textPaint.setFakeBoldText(true);
        textPaint.setTextSize(w * 0.06f);
        textPaint.setColor(Color.argb((int) (255 * pulse), 255, 255, 255));
        canvas.drawText(text, w / 2f, getHeight() * 0.82f, textPaint);
    }

    private void dim(Canvas canvas) {
        fillPaint.setColor(Color.argb(140, 0, 0, 0));
        canvas.drawRect(0, 0, getWidth(), getHeight(), fillPaint);
    }

    private static String toBangla(int number) {
        String digits = Integer.toString(number);
        StringBuilder out = new StringBuilder(digits.length());
        for (int i = 0; i < digits.length(); i++) {
            char c = digits.charAt(i);
            out.append(c >= '0' && c <= '9' ? (char) ('০' + (c - '0')) : c);
        }
        return out.toString();
    }

    // ----------------------------------------------------------------- input

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        int action = event.getActionMasked();
        if (action == MotionEvent.ACTION_DOWN) {
            if (state == STATE_READY || (state == STATE_OVER && overTimer > 0.8f)) {
                startGame();
                performClick();
                return true;
            }
        }
        if (state == STATE_PLAYING
                && (action == MotionEvent.ACTION_DOWN || action == MotionEvent.ACTION_MOVE)) {
            float half = playerWidth / 2f;
            playerX = Math.max(half, Math.min(getWidth() - half, event.getX()));
        }
        return true;
    }

    @Override
    public boolean performClick() {
        return super.performClick();
    }
}
