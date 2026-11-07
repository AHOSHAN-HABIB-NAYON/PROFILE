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
import android.view.animation.Animation;
import android.view.animation.ScaleAnimation;
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
        getWindow().setStatusBarColor(Color.parseColor("#15224A"));
        getWindow().setNavigationBarColor(Color.parseColor("#070C1C"));

        Intent in = getIntent();
        callId = in.getStringExtra("qw_call_id");
        url = in.getStringExtra("qw_call_url");
        decline = in.getStringExtra("qw_call_decline");
        final boolean en = in.getBooleanExtra("qw_call_en", false);
        final boolean video = in.getBooleanExtra("qw_call_video", false);
        String name = in.getStringExtra("qw_call_name");
        if (name == null) name = "QUIZ WAR";

        FrameLayout root = new FrameLayout(this);
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[]{Color.parseColor("#15224A"), Color.parseColor("#0E1733"), Color.parseColor("#070C1C")});
        root.setBackground(bg);

        // Name and "QUIZ WAR audio call" at the top, centred (like a phone call).
        LinearLayout head = new LinearLayout(this);
        head.setOrientation(LinearLayout.VERTICAL);
        head.setGravity(Gravity.CENTER_HORIZONTAL);
        FrameLayout.LayoutParams headLp = new FrameLayout.LayoutParams(-1, -2, Gravity.TOP);
        headLp.topMargin = dp(110);
        headLp.leftMargin = dp(24);
        headLp.rightMargin = dp(24);
        root.addView(head, headLp);

        TextView who = new TextView(this);
        who.setText(name);
        who.setTextColor(Color.WHITE);
        who.setTextSize(30);
        who.setTypeface(Typeface.DEFAULT_BOLD);
        who.setGravity(Gravity.CENTER);
        who.setSingleLine(true);
        who.setEllipsize(android.text.TextUtils.TruncateAt.END);
        head.addView(who, new LinearLayout.LayoutParams(-1, -2));

        TextView app = new TextView(this);
        app.setText(video ? (en ? "QUIZ WAR video call" : "QUIZ WAR ভিডিও কল") : (en ? "QUIZ WAR audio call" : "QUIZ WAR অডিও কল"));
        app.setTextColor(Color.parseColor("#B3FFFFFF"));
        app.setTextSize(15);
        app.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams appLp = new LinearLayout.LayoutParams(-1, -2);
        appLp.topMargin = dp(8);
        head.addView(app, appLp);

        // Big round picture in the middle with a soft pulse.
        FrameLayout avWrap = new FrameLayout(this);
        FrameLayout.LayoutParams wrapLp = new FrameLayout.LayoutParams(dp(250), dp(250), Gravity.CENTER);
        wrapLp.topMargin = dp(10);
        root.addView(avWrap, wrapLp);
        View pulse = new View(this);
        GradientDrawable ring = new GradientDrawable();
        ring.setShape(GradientDrawable.OVAL);
        ring.setColor(Color.parseColor("#1AFFFFFF"));
        pulse.setBackground(ring);
        avWrap.addView(pulse, new FrameLayout.LayoutParams(-1, -1));
        ScaleAnimation sa = new ScaleAnimation(0.86f, 1f, 0.86f, 1f, Animation.RELATIVE_TO_SELF, .5f, Animation.RELATIVE_TO_SELF, .5f);
        sa.setDuration(1200);
        sa.setRepeatMode(Animation.REVERSE);
        sa.setRepeatCount(Animation.INFINITE);
        sa.setInterpolator(new AccelerateDecelerateInterpolator());
        pulse.startAnimation(sa);

        ImageView av = new ImageView(this);
        GradientDrawable avBg = new GradientDrawable();
        avBg.setShape(GradientDrawable.OVAL);
        avBg.setColor(Color.parseColor("#E0E7FF"));
        av.setBackground(avBg);
        av.setScaleType(ImageView.ScaleType.CENTER_CROP);
        avWrap.addView(av, new FrameLayout.LayoutParams(dp(210), dp(210), Gravity.CENTER));
        TextView initial = new TextView(this);
        initial.setText(name.substring(0, 1).toUpperCase());
        initial.setTextColor(Color.parseColor("#1D4ED8"));
        initial.setTextSize(72);
        initial.setTypeface(Typeface.DEFAULT_BOLD);
        initial.setGravity(Gravity.CENTER);
        avWrap.addView(initial, new FrameLayout.LayoutParams(dp(210), dp(210), Gravity.CENTER));

        // Decline · Answer · Message, evenly spaced, normal phone-button size.
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        row.setClipChildren(false);
        root.setClipChildren(false);
        FrameLayout.LayoutParams rowLp = new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM);
        rowLp.bottomMargin = dp(48);
        rowLp.leftMargin = dp(16);
        rowLp.rightMargin = dp(16);
        root.addView(row, rowLp);
        row.addView(button(en ? "Decline" : "কেটে দিন", "#E11D48", R.drawable.qw_ic_call_end, v -> onDecline()), new LinearLayout.LayoutParams(0, -2, 1));
        row.addView(swipeAnswer(en), new LinearLayout.LayoutParams(0, -2, 1));
        row.addView(button(en ? "Message" : "মেসেজ", "#2B3550", R.drawable.qw_ic_message, v -> onMessage()), new LinearLayout.LayoutParams(0, -2, 1));

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
     * WhatsApp-style answer: a green call button that you slide up to answer (down to decline).
     * A slide can't happen by accident in a pocket; a tap just shows the hint.
     */
    private View swipeAnswer(boolean en) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER_HORIZONTAL);
        box.setClipChildren(false);
        box.setClipToPadding(false);
        // Three chevrons above the button, glowing one after another.
        LinearLayout arrows = new LinearLayout(this);
        arrows.setOrientation(LinearLayout.VERTICAL);
        arrows.setGravity(Gravity.CENTER_HORIZONTAL);
        for (int i = 0; i < 3; i++) {
            TextView a = new TextView(this);
            a.setText("\u2303");
            a.setTextColor(Color.WHITE);
            a.setTextSize(22);
            a.setIncludeFontPadding(false);
            a.setGravity(Gravity.CENTER);
            a.setAlpha(0.25f);
            arrows.addView(a, new LinearLayout.LayoutParams(-2, dp(16)));
            android.animation.ObjectAnimator g = android.animation.ObjectAnimator.ofFloat(a, "alpha", 0.2f, 1f, 0.2f);
            g.setDuration(1200);
            g.setStartDelay((2 - i) * 180L);
            g.setRepeatCount(android.animation.ValueAnimator.INFINITE);
            g.start();
        }
        LinearLayout.LayoutParams arLp = new LinearLayout.LayoutParams(-2, -2);
        arLp.bottomMargin = dp(8);
        box.addView(arrows, arLp);

        final ImageView b = new ImageView(this);
        GradientDrawable d = new GradientDrawable();
        d.setShape(GradientDrawable.OVAL);
        d.setColor(Color.parseColor("#16A34A"));
        b.setBackground(d);
        b.setImageResource(R.drawable.qw_ic_call);
        b.setScaleType(ImageView.ScaleType.CENTER);
        b.setElevation(dp(10));
        b.setContentDescription(en ? "Slide up to answer" : "ধরতে উপরে টানুন");
        box.addView(b, new LinearLayout.LayoutParams(dp(76), dp(76)));
        // Gentle bounce so people see it moves.
        final android.animation.ObjectAnimator bounce = android.animation.ObjectAnimator.ofFloat(b, "translationY", 0f, -dp(10), 0f);
        bounce.setDuration(1300);
        bounce.setRepeatCount(android.animation.ValueAnimator.INFINITE);
        bounce.setInterpolator(new AccelerateDecelerateInterpolator());
        bounce.start();

        final TextView t = new TextView(this);
        t.setText(en ? "Slide up to answer" : "ধরতে উপরে টানুন");
        t.setTextColor(Color.parseColor("#D9FFFFFF"));
        t.setTextSize(13);
        LinearLayout.LayoutParams tl = new LinearLayout.LayoutParams(-2, -2);
        tl.topMargin = dp(10);
        box.addView(t, tl);

        final float upAt = dp(110), downAt = dp(90);
        final float[] start = new float[1];
        b.setOnTouchListener((v, ev) -> {
            switch (ev.getActionMasked()) {
                case android.view.MotionEvent.ACTION_DOWN:
                    bounce.cancel();
                    start[0] = ev.getRawY();
                    v.animate().scaleX(1.12f).scaleY(1.12f).setDuration(120).start();
                    return true;
                case android.view.MotionEvent.ACTION_MOVE: {
                    float dy = ev.getRawY() - start[0];
                    dy = Math.max(-upAt * 1.3f, Math.min(downAt * 1.2f, dy));
                    v.setTranslationY(dy);
                    float p = Math.min(1f, Math.abs(dy) / (dy < 0 ? upAt : downAt));
                    ((GradientDrawable) v.getBackground()).setColor(dy > 0 ? blend("#16A34A", "#E11D48", p) : Color.parseColor("#16A34A"));
                    arrows.setAlpha(1f - p);
                    return true;
                }
                case android.view.MotionEvent.ACTION_UP:
                case android.view.MotionEvent.ACTION_CANCEL: {
                    float dy = ev.getRawY() - start[0];
                    if (dy <= -upAt) {
                        v.performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS);
                        v.animate().translationY(-upAt * 1.6f).alpha(0f).setDuration(160).withEndAction(this::onAnswer).start();
                        return true;
                    }
                    if (dy >= downAt) {
                        v.performHapticFeedback(android.view.HapticFeedbackConstants.VIRTUAL_KEY);
                        onDecline();
                        return true;
                    }
                    // Not far enough: spring back and show the hint.
                    v.animate().translationY(0).scaleX(1f).scaleY(1f).setDuration(220).setInterpolator(new android.view.animation.OvershootInterpolator()).withEndAction(bounce::start).start();
                    ((GradientDrawable) v.getBackground()).setColor(Color.parseColor("#16A34A"));
                    arrows.setAlpha(1f);
                    t.animate().scaleX(1.1f).scaleY(1.1f).setDuration(120).withEndAction(() -> t.animate().scaleX(1f).scaleY(1f).setDuration(120).start()).start();
                    return true;
                }
            }
            return false;
        });
        return box;
    }

    private static int blend(String a, String b, float p) {
        int ca = Color.parseColor(a), cb = Color.parseColor(b);
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
        b.setElevation(dp(6));
        b.setOnClickListener(click);
        b.setContentDescription(label);
        box.addView(b, new LinearLayout.LayoutParams(dp(64), dp(64)));
        TextView t = new TextView(this);
        t.setText(label);
        t.setTextColor(Color.WHITE);
        t.setTextSize(13);
        t.setTextColor(Color.parseColor("#D9FFFFFF"));
        LinearLayout.LayoutParams tl = new LinearLayout.LayoutParams(-2, -2);
        tl.topMargin = dp(10);
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
