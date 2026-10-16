package com.cakricircular.app;

import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.animation.DecelerateInterpolator;
import android.view.animation.LinearInterpolator;
import android.view.animation.OvershootInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;

/**
 * নিচে টেনে রিফ্রেশ — লাইব্রেরি ছাড়া।
 * পেজের একদম উপরে থাকলে নিচে টানলে গোল আইকন নামে, যথেষ্ট টেনে ছাড়লে রিফ্রেশ।
 */
public class PullRefresh extends FrameLayout {

    public interface Listener { void onRefresh(); }

    private final View child;
    private final ImageView ball;
    private final int slop, size, trigger, max, rest;
    private float downX, downY, pull;
    private boolean atTop, dragging, refreshing;
    private Listener listener;
    private ObjectAnimator spin;

    public PullRefresh(Context c, View scrollChild) {
        super(c);
        child = scrollChild;
        float d = c.getResources().getDisplayMetrics().density;
        slop = ViewConfiguration.get(c).getScaledTouchSlop();
        size = Math.round(40 * d);
        trigger = Math.round(80 * d);
        max = Math.round(130 * d);
        rest = Math.round(60 * d);

        addView(child, new LayoutParams(-1, -1));

        ball = new ImageView(c);
        ball.setImageResource(R.drawable.ic_refresh);
        int p = Math.round(9 * d);
        ball.setPadding(p, p, p, p);
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(Color.WHITE);
        ball.setBackground(bg);
        ball.setElevation(6 * d);
        ball.setTranslationY(-size);
        ball.setAlpha(0f);
        addView(ball, new LayoutParams(size, size, Gravity.TOP | Gravity.CENTER_HORIZONTAL));
    }

    public void setListener(Listener l) { listener = l; }

    /** পেজ লোড শেষ হলে ডাকতে হবে */
    public void done() {
        if (!refreshing) return;
        refreshing = false;
        if (spin != null) spin.cancel();
        ball.animate().translationY(-size).alpha(0f).scaleX(0.6f).scaleY(0.6f).setDuration(260)
                .setInterpolator(new DecelerateInterpolator()).start();
    }

    @Override
    public boolean onInterceptTouchEvent(MotionEvent e) {
        if (refreshing) return false;
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                downX = e.getX();
                downY = e.getY();
                atTop = !child.canScrollVertically(-1);
                dragging = false;
                break;
            case MotionEvent.ACTION_MOVE:
                float dy = e.getY() - downY, dx = Math.abs(e.getX() - downX);
                if (atTop && !child.canScrollVertically(-1) && dy > slop * 1.5f && dy > dx * 1.6f) {
                    dragging = true;
                    downY = e.getY();
                    ball.animate().cancel();
                    ball.setScaleX(1f);
                    ball.setScaleY(1f);
                    return true;
                }
                if (dy < -slop) atTop = false;
                break;
        }
        return false;
    }

    @Override
    public boolean onTouchEvent(MotionEvent e) {
        if (!dragging) return super.onTouchEvent(e);
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_MOVE:
                float raw = Math.max(0, e.getY() - downY);
                // যত টানবেন তত ধীরে নামবে (রাবারের মতো)
                pull = max * (1f - (float) Math.exp(-raw / (max * 1.2f)));
                float f = Math.min(1f, pull / trigger);
                ball.setTranslationY(pull - size);
                ball.setAlpha(0.3f + 0.7f * f);
                ball.setRotation(pull * 2.2f);
                ball.setImageAlpha(f >= 1f ? 255 : 150);
                return true;
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                dragging = false;
                if (pull >= trigger && e.getActionMasked() == MotionEvent.ACTION_UP) start();
                else ball.animate().translationY(-size).alpha(0f).setDuration(220).start();
                pull = 0;
                return true;
        }
        return true;
    }

    private void start() {
        refreshing = true;
        ball.setImageAlpha(255);
        ball.animate().translationY(rest - size / 2f).setDuration(260)
                .setInterpolator(new OvershootInterpolator(1.4f)).start();
        spin = ObjectAnimator.ofFloat(ball, "rotation", ball.getRotation(), ball.getRotation() + 360f);
        spin.setDuration(700);
        spin.setInterpolator(new LinearInterpolator());
        spin.setRepeatCount(ValueAnimator.INFINITE);
        spin.start();
        if (listener != null) listener.onRefresh();
        // কোনো কারণে লোড শেষ না হলেও ১২ সেকেন্ডে থেমে যাবে
        postDelayed(new Runnable() { public void run() { done(); } }, 12000);
    }
}
