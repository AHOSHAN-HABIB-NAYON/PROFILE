package app.quizwar.bd;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.view.animation.AccelerateDecelerateInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.lang.ref.WeakReference;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * The ringing call on the lock screen, like WhatsApp: a small screen of its own (the app does not
 * start). Answer opens the app straight into the call; Decline tells the server and closes.
 */
public class IncomingCallActivity extends Activity {
    private static WeakReference<IncomingCallActivity> current = new WeakReference<>(null);
    private final Handler main = new Handler(Looper.getMainLooper());
    private String callId;
    private String url;
    private String decline;

    /** The call stopped ringing (answered elsewhere, cancelled, missed): close this screen. */
    static void closeIfOpen() {
        IncomingCallActivity a = current.get();
        if (a != null) a.runOnUiThread(a::finish);
    }

    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        current = new WeakReference<>(this);
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        // Edge to edge (Android 15 way): the background runs behind the status and navigation bars.
        androidx.core.view.WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        Intent in = getIntent();
        callId = in.getStringExtra("qw_call_id");
        url = in.getStringExtra("qw_call_url");
        decline = in.getStringExtra("qw_call_decline");
        final boolean en = in.getBooleanExtra("qw_call_en", false);
        final boolean video = in.getBooleanExtra("qw_call_video", false);
        String name = in.getStringExtra("qw_call_name");
        if (name == null) name = "QUIZ WAR";

        FrameLayout root = new FrameLayout(this);
        root.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[]{Color.parseColor("#15224A"), Color.parseColor("#0E1733"), Color.parseColor("#070C1C")}));

        // WhatsApp layout: name and "QUIZ WAR audio call" at the top, big photo in the middle.
        LinearLayout head = new LinearLayout(this);
        head.setOrientation(LinearLayout.VERTICAL);
        head.setGravity(Gravity.CENTER_HORIZONTAL);
        FrameLayout.LayoutParams headLp = new FrameLayout.LayoutParams(-1, -2, Gravity.TOP);
        headLp.topMargin = dp(64);
        headLp.leftMargin = dp(24);
        headLp.rightMargin = dp(24);
        root.addView(head, headLp);

        TextView who = new TextView(this);
        who.setText(name);
        who.setTextColor(Color.WHITE);
        who.setTextSize(30);
        who.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        who.setGravity(Gravity.CENTER);
        who.setSingleLine(true);
        who.setEllipsize(android.text.TextUtils.TruncateAt.END);
        head.addView(who, new LinearLayout.LayoutParams(-1, -2));

        TextView app = new TextView(this);
        app.setText(video ? (en ? "QUIZ WAR video call" : "QUIZ WAR ভিডিও কল") : (en ? "QUIZ WAR audio call" : "QUIZ WAR অডিও কল"));
        app.setTextColor(Color.parseColor("#B3FFFFFF"));
        app.setTextSize(16);
        app.setGravity(Gravity.CENTER);
        app.setCompoundDrawablePadding(dp(7));
        try {
            android.graphics.drawable.Drawable ic = getPackageManager().getApplicationIcon(getPackageName());
            ic.setBounds(0, 0, dp(18), dp(18));
            app.setCompoundDrawables(ic, null, null, null);
        } catch (Exception ignored) {
        }
        LinearLayout.LayoutParams appLp = new LinearLayout.LayoutParams(-2, -2);
        appLp.topMargin = dp(10);
        head.addView(app, appLp);

        FrameLayout avWrap = new FrameLayout(this);
        FrameLayout.LayoutParams wrapLp = new FrameLayout.LayoutParams(dp(230), dp(230), Gravity.CENTER);
        wrapLp.bottomMargin = dp(20);
        root.addView(avWrap, wrapLp);
        ImageView av = new ImageView(this);
        GradientDrawable avBg = new GradientDrawable();
        avBg.setShape(GradientDrawable.OVAL);
        avBg.setColor(Color.parseColor("#E0E7FF"));
        av.setBackground(avBg);
        av.setClipToOutline(true);
        av.setScaleType(ImageView.ScaleType.CENTER_CROP);
        avWrap.addView(av, new FrameLayout.LayoutParams(-1, -1));
        TextView initial = new TextView(this);
        initial.setText(name.substring(0, 1).toUpperCase());
        initial.setTextColor(Color.parseColor("#1D4ED8"));
        initial.setTextSize(80);
        initial.setTypeface(Typeface.DEFAULT_BOLD);
        initial.setGravity(Gravity.CENTER);
        avWrap.addView(initial, new FrameLayout.LayoutParams(-1, -1));

        // Decline · Answer · Message: three equal round buttons along the bottom.
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        row.setClipChildren(false);
        root.setClipChildren(false);
        FrameLayout.LayoutParams rowLp = new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM);
        rowLp.bottomMargin = dp(36);
        root.addView(row, rowLp);
        row.addView(swipe(en ? "Decline" : "কেটে দিন", "#EA0038", R.drawable.qw_ic_call_end, false, this::onDecline), new LinearLayout.LayoutParams(0, -2, 1));
        row.addView(swipe(en ? "Swipe up to accept" : "উপরে টেনে ধরুন", "#1DAA61", R.drawable.qw_ic_call, true, this::onAnswer), new LinearLayout.LayoutParams(0, -2, 1));
        row.addView(button(en ? "Message" : "মেসেজ", "#24FFFFFF", R.drawable.qw_ic_message, v -> onMessage()), new LinearLayout.LayoutParams(0, -2, 1));

        // Keep the name and the buttons clear of the system bars.
        androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            androidx.core.graphics.Insets bars = insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars());
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return insets;
        });
        setContentView(root);

        // Caller's picture (the ring does not wait for it).
        final String avatarUrl = in.getStringExtra("qw_call_avatar");
        new Thread(() -> {
            Bitmap b = QwCallNotifier.loadAvatarPublic(avatarUrl);
            if (b != null) main.post(() -> {
                av.setImageBitmap(b);
                initial.setVisibility(View.GONE);
            });
        }).start();
        // Stops ringing after 35 s like the notification.
        main.postDelayed(this::finish, 36_000);
    }

    /**
     * WhatsApp-style call buttons: slide up to answer (green) or to decline (red), so nothing
     * happens by accident in a pocket. The green one rises by itself now and then to show how;
     * a tap on either just nudges it and shows the hint.
     */
    private View swipe(String label, String color, int icon, boolean answer, Runnable action) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER_HORIZONTAL | Gravity.BOTTOM);
        box.setClipChildren(false);
        box.setClipToPadding(false);
        // Green: three chevrons above the button, glowing one after another.
        final LinearLayout arrows = new LinearLayout(this);
        arrows.setOrientation(LinearLayout.VERTICAL);
        arrows.setGravity(Gravity.CENTER_HORIZONTAL);
        if (answer) {
            for (int i = 0; i < 3; i++) {
                TextView a = new TextView(this);
                a.setText("⌃");
                a.setTextColor(Color.parseColor("#C4CCD1"));
                a.setTextSize(20);
                a.setIncludeFontPadding(false);
                a.setGravity(Gravity.CENTER);
                a.setAlpha(0.25f);
                arrows.addView(a, new LinearLayout.LayoutParams(-2, dp(24)));
                android.animation.ObjectAnimator g = android.animation.ObjectAnimator.ofFloat(a, "alpha", 0.2f, 1f, 0.2f);
                g.setDuration(1200);
                g.setStartDelay((2 - i) * 180L);
                g.setRepeatCount(android.animation.ValueAnimator.INFINITE);
                g.start();
            }
            LinearLayout.LayoutParams arLp = new LinearLayout.LayoutParams(-2, -2);
            arLp.bottomMargin = dp(26);
            box.addView(arrows, arLp);
        }

        final ImageView b = new ImageView(this);
        final GradientDrawable d = new GradientDrawable();
        d.setShape(GradientDrawable.OVAL);
        d.setColor(Color.parseColor(color));
        b.setBackground(d);
        b.setImageResource(icon);
        b.setScaleType(ImageView.ScaleType.CENTER);
        b.setElevation(0);
        b.setContentDescription(label);
        int size = dp(52);
        box.addView(b, new LinearLayout.LayoutParams(size, size));

        // Green rises by itself and drops back, then rests (like WhatsApp).
        android.animation.ObjectAnimator lift = null;
        if (answer) {
            android.animation.Keyframe k0 = android.animation.Keyframe.ofFloat(0f, 0f);
            android.animation.Keyframe k1 = android.animation.Keyframe.ofFloat(0.22f, -dp(44));
            android.animation.Keyframe k2 = android.animation.Keyframe.ofFloat(0.45f, 0f);
            android.animation.Keyframe k3 = android.animation.Keyframe.ofFloat(0.55f, -dp(8));
            android.animation.Keyframe k4 = android.animation.Keyframe.ofFloat(0.65f, 0f);
            android.animation.Keyframe k5 = android.animation.Keyframe.ofFloat(1f, 0f);
            k1.setInterpolator(new android.view.animation.DecelerateInterpolator());
            k2.setInterpolator(new android.view.animation.AccelerateInterpolator());
            lift = android.animation.ObjectAnimator.ofPropertyValuesHolder(b, android.animation.PropertyValuesHolder.ofKeyframe("translationY", k0, k1, k2, k3, k4, k5));
            lift.setDuration(2000);
            lift.setRepeatCount(android.animation.ValueAnimator.INFINITE);
            lift.setStartDelay(500);
            lift.start();
        }
        final android.animation.ObjectAnimator hint = lift;

        final TextView t = new TextView(this);
        t.setText(label);
        t.setTextColor(Color.parseColor("#C8FFFFFF"));
        t.setTextSize(12);
        t.setGravity(Gravity.CENTER);
        t.setSingleLine(true);
        t.setEllipsize(android.text.TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams tl = new LinearLayout.LayoutParams(-2, -2);
        tl.topMargin = dp(12);
        box.addView(t, tl);

        final int base = Color.parseColor(color);
        final float upAt = dp(answer ? 110 : 100);
        final float[] start = new float[1];
        b.setOnTouchListener((v, ev) -> {
            switch (ev.getActionMasked()) {
                case android.view.MotionEvent.ACTION_DOWN:
                    if (hint != null) hint.cancel();
                    v.setTranslationY(0);
                    start[0] = ev.getRawY();
                    v.animate().scaleX(1.12f).scaleY(1.12f).setDuration(120).start();
                    return true;
                case android.view.MotionEvent.ACTION_MOVE: {
                    float dy = Math.max(-upAt * 1.3f, Math.min(0f, ev.getRawY() - start[0]));
                    v.setTranslationY(dy);
                    float p = Math.min(1f, -dy / upAt);
                    d.setColor(blend(base, Color.WHITE, p * 0.18f));
                    arrows.setAlpha(1f - p);
                    return true;
                }
                case android.view.MotionEvent.ACTION_UP:
                case android.view.MotionEvent.ACTION_CANCEL: {
                    float dy = ev.getRawY() - start[0];
                    if (dy <= -upAt) {
                        v.performHapticFeedback(answer ? android.view.HapticFeedbackConstants.LONG_PRESS : android.view.HapticFeedbackConstants.VIRTUAL_KEY);
                        v.animate().translationY(-upAt * 1.6f).alpha(0f).setDuration(160).withEndAction(action).start();
                        return true;
                    }
                    // Not far enough (or a tap): small nudge up, spring back, show the hint.
                    d.setColor(base);
                    arrows.setAlpha(1f);
                    v.animate().translationY(-dp(18)).scaleX(1f).scaleY(1f).setDuration(140).withEndAction(() ->
                        v.animate().translationY(0).setDuration(260).setInterpolator(new android.view.animation.OvershootInterpolator(2.5f)).withEndAction(() -> {
                            if (hint != null) hint.start();
                        }).start()).start();
                    t.animate().scaleX(1.12f).scaleY(1.12f).setDuration(120).withEndAction(() -> t.animate().scaleX(1f).scaleY(1f).setDuration(120).start()).start();
                    return true;
                }
            }
            return false;
        });
        return box;
    }

    private static int blend(int ca, int cb, float p) {
        int r = (int) (Color.red(ca) + (Color.red(cb) - Color.red(ca)) * p);
        int g = (int) (Color.green(ca) + (Color.green(cb) - Color.green(ca)) * p);
        int bl = (int) (Color.blue(ca) + (Color.blue(cb) - Color.blue(ca)) * p);
        return Color.rgb(r, g, bl);
    }

    private View button(String label, String color, int icon, View.OnClickListener click) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER_HORIZONTAL);
        ImageView b = new ImageView(this);
        GradientDrawable d = new GradientDrawable();
        d.setShape(GradientDrawable.OVAL);
        d.setColor(Color.parseColor(color));
        b.setBackground(d);
        b.setImageResource(icon);
        b.setScaleType(ImageView.ScaleType.CENTER);
        b.setOnClickListener(click);
        b.setContentDescription(label);
        box.addView(b, new LinearLayout.LayoutParams(dp(52), dp(52)));
        TextView t = new TextView(this);
        t.setText(label);
        t.setTextSize(12);
        t.setTextColor(Color.parseColor("#C8FFFFFF"));
        LinearLayout.LayoutParams tl = new LinearLayout.LayoutParams(-2, -2);
        tl.topMargin = dp(12);
        box.addView(t, tl);
        return box;
    }

    private void onAnswer() {
        QwCallNotifier.cancel(this);
        Intent i = new Intent(this, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        i.putExtra("qw_call_action", "answer");
        i.putExtra("qw_call_id", callId);
        i.putExtra("qw_call_url", url);
        startActivity(i);
        finish();
    }

    /** Decline and open the chat with the caller (to send a quick message). */
    private void onMessage() {
        QwCallNotifier.cancel(this);
        QwCallNotifier.declineInBackground(this, callId, decline);
        Intent i = new Intent(this, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        i.putExtra("qw_call_action", "message");
        i.putExtra("qw_call_id", callId);
        i.putExtra("qw_call_url", url);
        startActivity(i);
        finish();
    }

    private void onDecline() {
        QwCallNotifier.cancel(this);
        QwCallNotifier.declineInBackground(this, callId, decline);
        finish();
    }

    @Override
    public void onBackPressed() {
        // Back just hides the screen; the call keeps ringing in the notification.
        moveTaskToBack(true);
    }

    @Override
    protected void onDestroy() {
        main.removeCallbacksAndMessages(null);
        if (current.get() == this) current = new WeakReference<>(null);
        super.onDestroy();
    }
}
