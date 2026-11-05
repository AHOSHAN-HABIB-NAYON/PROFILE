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
        getWindow().setStatusBarColor(Color.parseColor("#1E3A8A"));
        getWindow().setNavigationBarColor(Color.parseColor("#0B1336"));

        Intent in = getIntent();
        callId = in.getStringExtra("qw_call_id");
        url = in.getStringExtra("qw_call_url");
        decline = in.getStringExtra("qw_call_decline");
        String name = in.getStringExtra("qw_call_name");
        if (name == null) name = "QUIZ WAR";

        FrameLayout root = new FrameLayout(this);
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[]{Color.parseColor("#2F5FE0"), Color.parseColor("#1E3A8A"), Color.parseColor("#0B1336")});
        root.setBackground(bg);

        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER_HORIZONTAL);
        FrameLayout.LayoutParams colLp = new FrameLayout.LayoutParams(-1, -2, Gravity.TOP);
        colLp.topMargin = dp(120);
        root.addView(col, colLp);

        TextView app = new TextView(this);
        app.setText("QUIZ WAR · অডিও কল");
        app.setTextColor(Color.parseColor("#CCFFFFFF"));
        app.setTextSize(14);
        col.addView(app);

        FrameLayout avWrap = new FrameLayout(this);
        LinearLayout.LayoutParams avLp = new LinearLayout.LayoutParams(dp(150), dp(150));
        avLp.topMargin = dp(36);
        col.addView(avWrap, avLp);
        View pulse = new View(this);
        GradientDrawable ring = new GradientDrawable();
        ring.setShape(GradientDrawable.OVAL);
        ring.setStroke(dp(2), Color.parseColor("#66FFFFFF"));
        pulse.setBackground(ring);
        avWrap.addView(pulse, new FrameLayout.LayoutParams(-1, -1));
        ScaleAnimation sa = new ScaleAnimation(0.85f, 1.15f, 0.85f, 1.15f, Animation.RELATIVE_TO_SELF, .5f, Animation.RELATIVE_TO_SELF, .5f);
        sa.setDuration(1100);
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
        FrameLayout.LayoutParams ivLp = new FrameLayout.LayoutParams(dp(120), dp(120), Gravity.CENTER);
        avWrap.addView(av, ivLp);
        TextView initial = new TextView(this);
        initial.setText(name.substring(0, 1).toUpperCase());
        initial.setTextColor(Color.parseColor("#1D4ED8"));
        initial.setTextSize(48);
        initial.setTypeface(Typeface.DEFAULT_BOLD);
        initial.setGravity(Gravity.CENTER);
        avWrap.addView(initial, new FrameLayout.LayoutParams(dp(120), dp(120), Gravity.CENTER));

        TextView who = new TextView(this);
        who.setText(name);
        who.setTextColor(Color.WHITE);
        who.setTextSize(30);
        who.setTypeface(Typeface.DEFAULT_BOLD);
        who.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams whoLp = new LinearLayout.LayoutParams(-2, -2);
        whoLp.topMargin = dp(24);
        col.addView(who, whoLp);
        TextView sub = new TextView(this);
        sub.setText("অডিও কল আসছে…");
        sub.setTextColor(Color.parseColor("#D9FFFFFF"));
        sub.setTextSize(16);
        LinearLayout.LayoutParams subLp = new LinearLayout.LayoutParams(-2, -2);
        subLp.topMargin = dp(6);
        col.addView(sub, subLp);

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER);
        FrameLayout.LayoutParams rowLp = new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM);
        rowLp.bottomMargin = dp(80);
        root.addView(row, rowLp);
        row.addView(button("কেটে দিন", "#EF4444", R.drawable.qw_ic_call_end, v -> onDecline()), new LinearLayout.LayoutParams(0, -2, 1));
        row.addView(button("ধরুন", "#22C55E", R.drawable.qw_ic_call, v -> onAnswer()), new LinearLayout.LayoutParams(0, -2, 1));

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
        box.addView(b, new LinearLayout.LayoutParams(dp(72), dp(72)));
        TextView t = new TextView(this);
        t.setText(label);
        t.setTextColor(Color.WHITE);
        t.setTextSize(14);
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
