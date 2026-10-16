package com.cakricircular.app;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ObjectAnimator;
import android.animation.PropertyValuesHolder;
import android.animation.ValueAnimator;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.animation.DecelerateInterpolator;
import android.view.animation.OvershootInterpolator;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.DownloadListener;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;

/**
 * চাকরি সার্কুলার — এক অ্যাক্টিভিটির হালকা নেটিভ অ্যাপ।
 * বাইরের লাইব্রেরি শুধু একটা: Firebase Cloud Messaging (নোটিফিকেশনের জন্য)।
 */
public class MainActivity extends Activity {

    static final String HOST = "cakricircular.com";
    static final String HOME = "https://" + HOST + "/?src=app";
    static final String UA_TAG = "CakriApp/2.0";
    static final String UA = UA_TAG + " (Android " + Build.VERSION.RELEASE + ")";
    static final String PKG = "com.cakricircular.app";

    private static final int TEAL = 0xFF0F766E;
    private static final int REQ_FILE = 7, REQ_NOTIFY = 8;

    private final Handler ui = new Handler(Looper.getMainLooper());
    private FrameLayout frame;
    private View topBar, progress, offline;
    private WebView web;
    private PullRefresh pull;
    private FrameLayout splash;
    private long splashStart;
    private boolean splashGone, pageReady;
    private ValueCallback<Uri[]> fileCb;
    private Object backCb;          // Android 13+ OnBackInvokedCallback
    private boolean backOn;
    private FrameLayout rootView;
    private int navInset;
    private long askedAt;

    // ------------------------------------------------------------------ lifecycle

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);

        FrameLayout root = new FrameLayout(this);
        rootView = root;
        root.setBackgroundColor(Color.WHITE);

        topBar = new View(this);
        topBar.setBackgroundColor(TEAL);
        root.addView(topBar, new FrameLayout.LayoutParams(-1, 0, Gravity.TOP));

        frame = new FrameLayout(this);
        root.addView(frame, new FrameLayout.LayoutParams(-1, -1));

        web = new WebView(this);
        web.setBackgroundColor(Color.WHITE);
        pull = new PullRefresh(this, web);
        pull.setListener(new PullRefresh.Listener() {
            @Override public void onRefresh() { autoRetry = 0; retry(); }
        });
        frame.addView(pull, new FrameLayout.LayoutParams(-1, -1));

        offline = buildOffline();
        offline.setVisibility(View.GONE);
        frame.addView(offline, new FrameLayout.LayoutParams(-1, -1));

        progress = new View(this);
        progress.setBackgroundColor(0xFF22B49C);
        progress.setPivotX(0);
        progress.setScaleX(0);
        frame.addView(progress, new FrameLayout.LayoutParams(-1, dp(3), Gravity.TOP));

        splash = buildSplash();
        root.addView(splash, new FrameLayout.LayoutParams(-1, -1));

        setContentView(root);
        edgeToEdge(root);
        setupWeb();

        String start = linkFrom(getIntent());
        if (state != null) web.restoreState(state);
        else web.loadUrl(start != null ? start : HOME);

        playSplash();
        // সাইট থেকে Firebase-এর তথ্য এনে নোটিফিকেশন চালু (প্রতিবার খোলায় হালনাগাদ)
        new Thread(new Runnable() { public void run() { loadConfig(getApplicationContext()); } }).start();
    }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        setIntent(i);
        String u = linkFrom(i);
        if (u != null) web.loadUrl(u);
    }

    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }
    @Override protected void onResume() { super.onResume(); web.onResume(); }
    @Override protected void onPause() { CookieManager.getInstance().flush(); web.onPause(); super.onPause(); }

    @Override
    protected void onDestroy() {
        ui.removeCallbacksAndMessages(null);
        if (web != null) { ((ViewGroup) web.getParent()).removeView(web); web.destroy(); }
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }

    /** নোটিফিকেশন বা শেয়ার করা লিংক থেকে খোলা হলে সেই পেজ */
    private static String linkFrom(Intent i) {
        Uri d = i == null ? null : i.getData();
        // Firebase নিজে দেখানো নোটিফিকেশনে চাপলে লিংক আসে extra হিসেবে
        if (d == null && i != null && i.getStringExtra("url") != null) d = Uri.parse(i.getStringExtra("url"));
        if (d == null || d.getHost() == null) return null;
        String h = d.getHost();
        return (h.equals(HOST) || h.endsWith("." + HOST)) ? d.toString() : null;
    }

    // ------------------------------------------------------------------ window

    private void edgeToEdge(final FrameLayout root) {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override public WindowInsets onApplyWindowInsets(View v, WindowInsets in) {
                int t = in.getSystemWindowInsetTop(), b = in.getSystemWindowInsetBottom();
                navInset = b;
                topBar.getLayoutParams().height = t;
                topBar.requestLayout();
                FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) frame.getLayoutParams();
                lp.setMargins(in.getSystemWindowInsetLeft(), t, in.getSystemWindowInsetRight(), b);
                frame.setLayoutParams(lp);
                return in.consumeSystemWindowInsets();
            }
        });
    }

    /** স্প্ল্যাশ শেষে নিচের নেভিগেশন বারে গাঢ় আইকন (সাদা পটভূমিতে) */
    private void lightNav() {
        if (Build.VERSION.SDK_INT >= 26) {
            View d = getWindow().getDecorView();
            d.setSystemUiVisibility(d.getSystemUiVisibility() | 0x10 /* LIGHT_NAVIGATION_BAR */);
        }
    }

    // ------------------------------------------------------------------ webview

    private void setupWeb() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setSupportMultipleWindows(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setUserAgentString(s.getUserAgentString() + " " + UA_TAG);
        s.setCacheMode(online() ? WebSettings.LOAD_DEFAULT : WebSettings.LOAD_CACHE_ELSE_NETWORK);
        CookieManager.getInstance().setAcceptCookie(true);
        web.addJavascriptInterface(new Bridge(), "CakriApp");
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);

        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, String url) {
                return handleLink(url);
            }
            @Override public void onPageFinished(WebView v, String url) {
                if (offline.getVisibility() != View.VISIBLE) autoRetry = 0;
                pull.done();
                pageReady = true;
                maybeHideSplash();
                updateBack();
            }
            @Override public void doUpdateVisitedHistory(WebView v, String url, boolean reload) {
                updateBack();
            }
            @SuppressWarnings("deprecation")
            @Override public void onReceivedError(WebView v, int code, String desc, String url) {
                // শুধু মূল পেজের ত্রুটিতে আসে
                showError(false);
            }
            @Override public void onReceivedHttpError(WebView v, WebResourceRequest r, WebResourceResponse res) {
                // সার্ভার ব্যস্ত (502/503/504) — কাঁচা nginx পেজের বদলে নিজের পেজ, নিজে থেকে আবার চেষ্টা
                if (r.isForMainFrame() && res.getStatusCode() >= 500) showError(true);
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView v, int p) {
                progress.animate().cancel();
                if (p >= 100) {
                    progress.animate().scaleX(1f).alpha(0f).setDuration(220).start();
                } else {
                    progress.setAlpha(1f);
                    progress.animate().scaleX(p / 100f).setDuration(160).start();
                }
                if (p >= 80) { pageReady = true; maybeHideSplash(); }
            }
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams fp) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                try { startActivityForResult(fp.createIntent(), REQ_FILE); }
                catch (ActivityNotFoundException e) { fileCb = null; return false; }
                return true;
            }
        });

        web.setDownloadListener(new DownloadListener() {
            @Override public void onDownloadStart(String url, String ua, String cd, String mime, long len) {
                openOutside(url);
            }
        });
    }

    /** সাইটের পেজ অ্যাপে, বাকি সব (PDF, অন্য সাইট, ফোন, হোয়াটসঅ্যাপ) বাইরের অ্যাপে */
    private boolean handleLink(String url) {
        Uri u = Uri.parse(url);
        String sc = u.getScheme() == null ? "" : u.getScheme().toLowerCase();
        String h = u.getHost() == null ? "" : u.getHost().toLowerCase();
        String path = u.getPath() == null ? "" : u.getPath().toLowerCase();
        if ((sc.equals("https") || sc.equals("http")) && (h.equals(HOST) || h.endsWith("." + HOST))
                && !path.endsWith(".pdf") && !path.startsWith("/v2admin")) {
            offline.setVisibility(View.GONE);
            return false;
        }
        if (sc.equals("intent")) {
            try {
                Intent i = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                i.addCategory(Intent.CATEGORY_BROWSABLE);
                i.setComponent(null);
                i.setSelector(null);
                startActivity(i);
            } catch (Exception e) {
                String fb = null;
                try { fb = Intent.parseUri(url, Intent.URI_INTENT_SCHEME).getStringExtra("browser_fallback_url"); }
                catch (Exception ignored) { }
                if (fb != null) openOutside(fb);
            }
            return true;
        }
        openOutside(url);
        return true;
    }

    private void openOutside(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Exception ignored) { }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == REQ_FILE && fileCb != null) {
            fileCb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data));
            fileCb = null;
            return;
        }
        super.onActivityResult(req, res, data);
    }

    /** Android 13+ এ নতুন ব্যাক সিস্টেম: পেছনে পেজ থাকলে ব্যাক = আগের পেজ */
    private void updateBack() {
        if (Build.VERSION.SDK_INT < 33) return;
        boolean want = web.canGoBack();
        if (want == backOn) return;
        try {
            Object disp = getClass().getMethod("getOnBackInvokedDispatcher").invoke(this);
            Class<?> cbCls = Class.forName("android.window.OnBackInvokedCallback");
            if (backCb == null) {
                backCb = Proxy.newProxyInstance(cbCls.getClassLoader(), new Class<?>[]{cbCls}, new InvocationHandler() {
                    @Override public Object invoke(Object p, Method m, Object[] a) {
                        if ("onBackInvoked".equals(m.getName())) {
                            if (web.canGoBack()) web.goBack();
                            updateBack();
                            return null;
                        }
                        if ("hashCode".equals(m.getName())) return System.identityHashCode(p);
                        if ("equals".equals(m.getName())) return p == a[0];
                        if ("toString".equals(m.getName())) return "CakriBack";
                        return null;
                    }
                });
            }
            if (want) disp.getClass().getMethod("registerOnBackInvokedCallback", int.class, cbCls).invoke(disp, 0, backCb);
            else disp.getClass().getMethod("unregisterOnBackInvokedCallback", cbCls).invoke(disp, backCb);
            backOn = want;
        } catch (Throwable ignored) { }
    }

    private int autoRetry;

    private void showError(boolean server) {
        if (pull != null) pull.done();
        ((TextView) offline.findViewWithTag("et")).setText(server ? "সার্ভার একটু ব্যস্ত" : "ইন্টারনেট সংযোগ নেই");
        ((TextView) offline.findViewWithTag("es")).setText(server
                ? "কয়েক সেকেন্ড পর নিজে থেকেই আবার চেষ্টা করছি…"
                : "মোবাইল ডেটা বা ওয়াই-ফাই চালু করে আবার চেষ্টা করুন");
        offline.setVisibility(View.VISIBLE);
        pageReady = true;
        maybeHideSplash();
        if (server && autoRetry < 3) {
            autoRetry++;
            ui.postDelayed(new Runnable() { public void run() {
                if (offline.getVisibility() == View.VISIBLE) retry();
            } }, 3000L * autoRetry);
        }
    }

    private void retry() {
        web.getSettings().setCacheMode(online() ? WebSettings.LOAD_DEFAULT : WebSettings.LOAD_CACHE_ELSE_NETWORK);
        offline.setVisibility(View.GONE);
        String u = web.getUrl();
        if (u == null || u.startsWith("data:") || u.startsWith("about:")) web.loadUrl(HOME); else web.reload();
    }

    // ------------------------------------------------------------------ সাইট থেকে ডাকা দুটো কাজ

    /** ফুটারের "অ্যাপ শেয়ার করুন" আর "রেটিং দিন" (সাইটের app.js ডাকে) */
    private class Bridge {
        @JavascriptInterface public void shareApp(final String text, final String url) {
            ui.post(new Runnable() { public void run() {
                Intent s = new Intent(Intent.ACTION_SEND).setType("text/plain")
                        .putExtra(Intent.EXTRA_TEXT, (text == null ? "" : text + "\n") + url);
                try { startActivity(Intent.createChooser(s, "অ্যাপ শেয়ার করুন")); } catch (Exception ignored) { }
            } });
        }
        @JavascriptInterface public void rate() {
            ui.post(new Runnable() { public void run() {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + PKG))
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                } catch (Exception e) {
                    openOutside("https://play.google.com/store/apps/details?id=" + PKG);
                }
            } });
        }
    }

    private boolean online() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        NetworkInfo n = cm == null ? null : cm.getActiveNetworkInfo();
        return n != null && n.isConnected();
    }

    // ------------------------------------------------------------------ splash

    private FrameLayout buildSplash() {
        FrameLayout s = new FrameLayout(this);
        // সাদা থেকে খুব হালকা সবুজ — লোগোর সাদা বৃত্তের সাথে মানানসই
        s.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[]{0xFFFFFFFF, 0xFFECF7F0}));
        s.setClickable(true);

        // কোণে দুটো নরম সবুজ আভা (ধীরে নড়ে)
        s.addView(glow(0x2E16A34A, "glowA"), glowLp(380, Gravity.TOP | Gravity.END, -120, -140));
        s.addView(glow(0x260F766E, "glowB"), glowLp(360, Gravity.BOTTOM | Gravity.START, -130, -120));

        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER_HORIZONTAL);
        FrameLayout.LayoutParams cp = new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER);
        cp.bottomMargin = dp(40);
        s.addView(col, cp);

        FrameLayout logoBox = new FrameLayout(this);
        col.addView(logoBox, new LinearLayout.LayoutParams(dp(200), dp(200)));

        View ring = new View(this);
        GradientDrawable rg = new GradientDrawable();
        rg.setShape(GradientDrawable.OVAL);
        rg.setStroke(dp(2), 0x6616A34A);
        ring.setBackground(rg);
        ring.setTag("ring");
        ring.setAlpha(0f);
        logoBox.addView(ring, new FrameLayout.LayoutParams(dp(140), dp(140), Gravity.CENTER));

        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.splash_logo);
        GradientDrawable lb = new GradientDrawable();
        lb.setShape(GradientDrawable.OVAL);
        lb.setColor(Color.WHITE);
        logo.setBackground(lb);
        logo.setElevation(dp(12));
        if (Build.VERSION.SDK_INT >= 28) { logo.setOutlineAmbientShadowColor(0xFF0E6E34); logo.setOutlineSpotShadowColor(0xFF0E6E34); }
        logo.setTag("logo");
        logoBox.addView(logo, new FrameLayout.LayoutParams(dp(140), dp(140), Gravity.CENTER));

        TextView title = new TextView(this);
        title.setText("চাকরি সার্কুলার");
        title.setTextColor(0xFF0B5D2E);
        title.setTextSize(30);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setTag("title");
        LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(-2, -2);
        tp.topMargin = dp(4);
        col.addView(title, tp);

        // ট্যাগলাইন — দুপাশে ছোট সবুজ দাগ
        LinearLayout tag = new LinearLayout(this);
        tag.setGravity(Gravity.CENTER_VERTICAL);
        tag.setTag("tag");
        tag.addView(dash(), new LinearLayout.LayoutParams(dp(18), dp(2)));
        TextView tx = new TextView(this);
        tx.setText("সঠিক তথ্য, আপনার সফলতা");
        tx.setTextColor(0xFF5B7065);
        tx.setTextSize(14.5f);
        LinearLayout.LayoutParams xp = new LinearLayout.LayoutParams(-2, -2);
        xp.setMargins(dp(10), 0, dp(10), 0);
        tag.addView(tx, xp);
        tag.addView(dash(), new LinearLayout.LayoutParams(dp(18), dp(2)));
        LinearLayout.LayoutParams gp = new LinearLayout.LayoutParams(-2, -2);
        gp.topMargin = dp(8);
        col.addView(tag, gp);

        // নিচে সরু লোডিং বার
        FrameLayout bar = new FrameLayout(this);
        GradientDrawable track = new GradientDrawable();
        track.setColor(0xFFDCEEE3);
        track.setCornerRadius(dp(2));
        bar.setBackground(track);
        bar.setClipToOutline(true);
        View fill = new View(this);
        GradientDrawable fg = new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT, new int[]{0xFF0F766E, 0xFF16A34A});
        fg.setCornerRadius(dp(2));
        fill.setBackground(fg);
        fill.setTag("fill");
        bar.addView(fill, new FrameLayout.LayoutParams(dp(48), -1));
        FrameLayout.LayoutParams bp = new FrameLayout.LayoutParams(dp(120), dp(3), Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        bp.bottomMargin = dp(84);
        s.addView(bar, bp);

        TextView site = new TextView(this);
        site.setText(HOST);
        site.setTextColor(0xFF7A8C83);
        site.setTextSize(12);
        site.setLetterSpacing(0.06f);
        FrameLayout.LayoutParams sp = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        sp.bottomMargin = dp(52);
        s.addView(site, sp);
        return s;
    }

    private View glow(int color, String tag) {
        View v = new View(this);
        GradientDrawable g = new GradientDrawable();
        g.setGradientType(GradientDrawable.RADIAL_GRADIENT);
        g.setColors(new int[]{color, color & 0x00FFFFFF});
        g.setGradientRadius(dp(190));
        v.setBackground(g);
        v.setTag(tag);
        return v;
    }

    private FrameLayout.LayoutParams glowLp(int size, int gravity, int dx, int dy) {
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(dp(size), dp(size), gravity);
        if ((gravity & Gravity.END) == Gravity.END) lp.rightMargin = dp(dx); else lp.leftMargin = dp(dx);
        if ((gravity & Gravity.BOTTOM) == Gravity.BOTTOM) lp.bottomMargin = dp(dy); else lp.topMargin = dp(dy);
        return lp;
    }

    private View dash() {
        View d = new View(this);
        GradientDrawable g = new GradientDrawable();
        g.setColor(0xFF16A34A);
        g.setCornerRadius(dp(1));
        d.setBackground(g);
        return d;
    }

    private void playSplash() {
        splashStart = System.currentTimeMillis();
        // সাদা পটভূমিতে স্ট্যাটাস/নেভিগেশন বারের আইকন গাঢ়
        View dv = getWindow().getDecorView();
        dv.setSystemUiVisibility(dv.getSystemUiVisibility() | 0x2000 /* LIGHT_STATUS_BAR */ | (Build.VERSION.SDK_INT >= 26 ? 0x10 : 0));

        View logo = splash.findViewWithTag("logo"), ring = splash.findViewWithTag("ring");
        View title = splash.findViewWithTag("title"), tag = splash.findViewWithTag("tag");

        logo.setScaleX(0.5f); logo.setScaleY(0.5f); logo.setAlpha(0f);
        logo.animate().scaleX(1f).scaleY(1f).alpha(1f).setDuration(700)
                .setInterpolator(new OvershootInterpolator(1.4f)).start();

        ObjectAnimator pulse = ObjectAnimator.ofPropertyValuesHolder(ring,
                PropertyValuesHolder.ofFloat("scaleX", 1f, 1.45f),
                PropertyValuesHolder.ofFloat("scaleY", 1f, 1.45f),
                PropertyValuesHolder.ofFloat("alpha", 1f, 0f));
        pulse.setDuration(1500);
        pulse.setStartDelay(550);
        pulse.setRepeatCount(ValueAnimator.INFINITE);
        pulse.start();

        // লেখা দুটো নিচ থেকে ভেসে ওঠে
        rise(title, 350);
        rise(tag, 560);

        // কোণের আভা ধীরে নড়ে
        drift(splash.findViewWithTag("glowA"), -18, 22);
        drift(splash.findViewWithTag("glowB"), 20, -18);

        // লোডিং বার বাঁ থেকে ডানে
        final View fill = splash.findViewWithTag("fill");
        ObjectAnimator run = ObjectAnimator.ofFloat(fill, "translationX", -dp(48), dp(120));
        run.setDuration(1100);
        run.setStartDelay(400);
        run.setInterpolator(new android.view.animation.AccelerateDecelerateInterpolator());
        run.setRepeatCount(ValueAnimator.INFINITE);
        run.start();

        // ধীর নেটে সর্বোচ্চ ৬ সেকেন্ড
        ui.postDelayed(new Runnable() { public void run() { pageReady = true; maybeHideSplash(); } }, 6000);
    }

    private void drift(View v, float dx, float dy) {
        ObjectAnimator a = ObjectAnimator.ofPropertyValuesHolder(v,
                PropertyValuesHolder.ofFloat("translationX", 0, dp(dx)),
                PropertyValuesHolder.ofFloat("translationY", 0, dp(dy)));
        a.setDuration(2600);
        a.setRepeatMode(ValueAnimator.REVERSE);
        a.setRepeatCount(ValueAnimator.INFINITE);
        a.setInterpolator(new android.view.animation.AccelerateDecelerateInterpolator());
        a.start();
    }

    private void rise(View v, long delay) {
        v.setAlpha(0f);
        v.setTranslationY(dp(26));
        v.animate().alpha(1f).translationY(0f).setStartDelay(delay).setDuration(560)
                .setInterpolator(new DecelerateInterpolator(1.8f)).start();
    }

    private void maybeHideSplash() {
        if (splashGone || !pageReady) return;
        long left = 1700 - (System.currentTimeMillis() - splashStart);
        if (left > 0) {
            ui.postDelayed(new Runnable() { public void run() { maybeHideSplash(); } }, left);
            return;
        }
        splashGone = true;
        splash.animate().alpha(0f).scaleX(1.06f).scaleY(1.06f).setDuration(320)
                .setListener(new AnimatorListenerAdapter() {
                    @Override public void onAnimationEnd(Animator a) {
                        ((ViewGroup) splash.getParent()).removeView(splash);
                        View dv = getWindow().getDecorView();
                        dv.setSystemUiVisibility(dv.getSystemUiVisibility() & ~0x2000);   // টিল বারে সাদা আইকন
                        lightNav();
                        ui.postDelayed(new Runnable() { public void run() { askNotify(); } }, 400);
                    }
                }).start();
    }

    // ------------------------------------------------------------------ offline

    private View buildOffline() {
        LinearLayout v = new LinearLayout(this);
        v.setOrientation(LinearLayout.VERTICAL);
        v.setGravity(Gravity.CENTER);
        v.setBackgroundColor(Color.WHITE);
        v.setPadding(dp(32), 0, dp(32), 0);
        v.setClickable(true);

        ImageView img = new ImageView(this);
        img.setImageResource(R.drawable.splash_logo);
        img.setAlpha(0.9f);
        v.addView(img, new LinearLayout.LayoutParams(dp(96), dp(96)));

        TextView t = new TextView(this);
        t.setText("ইন্টারনেট সংযোগ নেই");
        t.setTag("et");
        t.setTextColor(0xFF0F172A);
        t.setTextSize(20);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(-2, -2);
        tp.topMargin = dp(18);
        v.addView(t, tp);

        TextView s = new TextView(this);
        s.setText("মোবাইল ডেটা বা ওয়াই-ফাই চালু করে আবার চেষ্টা করুন");
        s.setTag("es");
        s.setTextColor(0xFF64748B);
        s.setTextSize(14);
        s.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(-2, -2);
        sp.topMargin = dp(6);
        v.addView(s, sp);

        TextView b = new TextView(this);
        b.setText("আবার চেষ্টা করুন");
        b.setTextColor(Color.WHITE);
        b.setTextSize(16);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setGravity(Gravity.CENTER);
        b.setPadding(dp(28), dp(13), dp(28), dp(13));
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT, new int[]{TEAL, 0xFF22B49C});
        bg.setCornerRadius(dp(28));
        b.setBackground(bg);
        b.setElevation(dp(4));
        b.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(final View x) {
                x.animate().scaleX(0.94f).scaleY(0.94f).setDuration(90).withEndAction(new Runnable() {
                    public void run() {
                        x.animate().scaleX(1f).scaleY(1f).setDuration(120).start();
                        autoRetry = 0;
                        retry();
                    }
                }).start();
            }
        });
        b.setTag("retry");
        LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(-2, -2);
        bp.topMargin = dp(26);
        v.addView(b, bp);
        return v;
    }

    // ------------------------------------------------------------------ notifications

    /** প্রথমবার খুললে একবার: আমরা সরকারি প্রতিষ্ঠান নই, তথ্যের উৎস কী (Google Play নীতি) */
    private void showDisclaimer() {
        if (isFinishing()) return;
        final SharedPreferences p = getSharedPreferences("cc", MODE_PRIVATE);
        if (p.getBoolean("disc_ok", false)) return;
        new AlertDialog.Builder(this, android.R.style.Theme_Material_Light_Dialog_Alert)
                .setTitle("গুরুত্বপূর্ণ তথ্য")
                .setMessage("চাকরি সার্কুলার কোনো সরকারি প্রতিষ্ঠান নয় এবং কোনো সরকারি সংস্থার সাথে যুক্ত নয়।\n\n"
                        + "সব বিজ্ঞপ্তি সংশ্লিষ্ট প্রতিষ্ঠানের অফিসিয়াল ওয়েবসাইট, সরকারি গেজেট ও জাতীয় পত্রিকায় "
                        + "প্রকাশিত বিজ্ঞপ্তি থেকে নেওয়া। প্রতিটি পোস্টে মূল উৎসের লিংক আছে।\n\n"
                        + "আবেদনের আগে অবশ্যই মূল বিজ্ঞপ্তি মিলিয়ে নিন।")
                .setCancelable(false)
                .setPositiveButton("বুঝেছি", new DialogInterface.OnClickListener() {
                    @Override public void onClick(DialogInterface d, int w) {
                        p.edit().putBoolean("disc_ok", true).apply();
                    }
                })
                .setNeutralButton("বিস্তারিত", new DialogInterface.OnClickListener() {
                    @Override public void onClick(DialogInterface d, int w) {
                        p.edit().putBoolean("disc_ok", true).apply();
                        web.loadUrl("https://" + HOST + "/disclaimer");
                    }
                })
                .show();
    }

    /** অ্যাপে ঢুকেই প্রথমে নোটিফিকেশনের অনুমতি (Android 13+) — একবার, না দিলে ৩ দিন পর আরেকবার; তারপর disclaimer */
    private void askNotify() {
        if (isFinishing()) return;
        String perm = "android.permission.POST_NOTIFICATIONS";
        if (Build.VERSION.SDK_INT < 33 || checkSelfPermission(perm) == PackageManager.PERMISSION_GRANTED) { showDisclaimer(); return; }
        // প্রথমবার, "এখন না" চাপলে ৩ দিন পর আবার — সর্বোচ্চ ৩ বার, এর বেশি বিরক্ত নয়
        SharedPreferences p = getSharedPreferences("cc", MODE_PRIVATE);
        int n = p.getInt("ask_n", 0);
        long last = p.getLong("ask_t", 0);
        if (n >= 3 || (n > 0 && System.currentTimeMillis() - last < 3L * 86400000L)) { showDisclaimer(); return; }
        p.edit().putInt("ask_n", n + 1).putLong("ask_t", System.currentTimeMillis()).apply();
        showNotifyIntro();
    }

    /** সিস্টেমের Allow আসার আগে — কেন চালু করবেন, সুন্দর করে বুঝিয়ে বলা পাতা */
    private void showNotifyIntro() {
        final FrameLayout dim = new FrameLayout(this);
        dim.setBackgroundColor(0x99081512);
        dim.setClickable(true);
        dim.setAlpha(0f);

        final LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER_HORIZONTAL);
        card.setPadding(dp(24), dp(14), dp(24), dp(20) + navInset);
        GradientDrawable cbg = new GradientDrawable();
        cbg.setColor(Color.WHITE);
        float r = dp(28);
        cbg.setCornerRadii(new float[]{r, r, r, r, 0, 0, 0, 0});
        card.setBackground(cbg);
        card.setElevation(dp(16));
        card.setClickable(true);
        dim.addView(card, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));

        View grip = new View(this);
        GradientDrawable gg = new GradientDrawable();
        gg.setColor(0xFFDDE5E2);
        gg.setCornerRadius(dp(3));
        grip.setBackground(gg);
        LinearLayout.LayoutParams gp = new LinearLayout.LayoutParams(dp(40), dp(5));
        gp.bottomMargin = dp(18);
        card.addView(grip, gp);

        // লোগো + কোণে ঘণ্টার ব্যাজ (দোলে)
        FrameLayout head = new FrameLayout(this);
        card.addView(head, new LinearLayout.LayoutParams(dp(92), dp(92)));
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.splash_logo);
        logo.setElevation(dp(6));
        GradientDrawable lb = new GradientDrawable();
        lb.setShape(GradientDrawable.OVAL);
        lb.setColor(Color.WHITE);
        logo.setBackground(lb);
        head.addView(logo, new FrameLayout.LayoutParams(dp(84), dp(84), Gravity.CENTER));
        final ImageView bell = new ImageView(this);
        bell.setImageResource(R.drawable.ic_bell);
        bell.setColorFilter(Color.WHITE);
        bell.setPadding(dp(7), dp(7), dp(7), dp(7));
        GradientDrawable bb = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{0xFFF59E0B, 0xFFF97316});
        bb.setShape(GradientDrawable.OVAL);
        bb.setStroke(dp(3), Color.WHITE);
        bell.setBackground(bb);
        bell.setElevation(dp(8));
        head.addView(bell, new FrameLayout.LayoutParams(dp(36), dp(36), Gravity.BOTTOM | Gravity.END));

        TextView title = new TextView(this);
        title.setText("নতুন চাকরির খবর মিস করবেন না");
        title.setTextColor(0xFF0F172A);
        title.setTextSize(21);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(-2, -2);
        tp.topMargin = dp(16);
        card.addView(title, tp);

        TextView sub = new TextView(this);
        sub.setText("নোটিফিকেশন চালু রাখলে নতুন সার্কুলার প্রকাশ হওয়ার সাথে সাথেই ফোনে জানিয়ে দেব।");
        sub.setTextColor(0xFF64748B);
        sub.setTextSize(14.5f);
        sub.setGravity(Gravity.CENTER);
        sub.setLineSpacing(0, 1.2f);
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(-2, -2);
        sp.topMargin = dp(6);
        card.addView(sub, sp);

        LinearLayout rows = new LinearLayout(this);
        rows.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable rb = new GradientDrawable();
        rb.setColor(0xFFF4FAF7);
        rb.setCornerRadius(dp(18));
        rb.setStroke(dp(1), 0xFFE3F0EA);
        rows.setBackground(rb);
        rows.setPadding(dp(14), dp(6), dp(14), dp(6));
        LinearLayout.LayoutParams rp = new LinearLayout.LayoutParams(-1, -2);
        rp.topMargin = dp(18);
        card.addView(rows, rp);
        final View[] items = {
                introRow(R.drawable.ic_bolt, "পোস্ট হওয়ার সাথে সাথেই নোটিফিকেশন"),
                introRow(R.drawable.ic_work, "সরকারি-বেসরকারি চাকরি, ভর্তি, রেজাল্ট ও নোটিশ"),
                introRow(R.drawable.ic_verified, "কোনো স্প্যাম নয় — যেকোনো সময় বন্ধ করা যায়")};
        for (View v : items) rows.addView(v);

        final TextView yes = new TextView(this);
        yes.setText("নোটিফিকেশন চালু করুন");
        yes.setTextColor(Color.WHITE);
        yes.setTextSize(16.5f);
        yes.setTypeface(Typeface.DEFAULT_BOLD);
        yes.setGravity(Gravity.CENTER);
        GradientDrawable yb = new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT, new int[]{TEAL, 0xFF16A34A});
        yb.setCornerRadius(dp(27));
        yes.setBackground(yb);
        yes.setElevation(dp(6));
        if (Build.VERSION.SDK_INT >= 28) { yes.setOutlineSpotShadowColor(0xFF16A34A); yes.setOutlineAmbientShadowColor(0xFF16A34A); }
        LinearLayout.LayoutParams yp = new LinearLayout.LayoutParams(-1, dp(54));
        yp.topMargin = dp(20);
        card.addView(yes, yp);

        TextView no = new TextView(this);
        no.setText("এখন না");
        no.setTextColor(0xFF64748B);
        no.setTextSize(15);
        no.setGravity(Gravity.CENTER);
        no.setPadding(dp(20), dp(12), dp(20), dp(4));
        card.addView(no, new LinearLayout.LayoutParams(-2, -2));

        rootView.addView(dim, new FrameLayout.LayoutParams(-1, -1));

        // ঢোকার অ্যানিমেশন: পেছনটা ঝাপসা হয়, কার্ড নিচ থেকে ওঠে, সারিগুলো একে একে, ঘণ্টা দোলে
        dim.animate().alpha(1f).setDuration(220).start();
        card.setTranslationY(dp(420));
        card.animate().translationY(0).setDuration(420).setInterpolator(new DecelerateInterpolator(2f)).start();
        for (int i = 0; i < items.length; i++) {
            items[i].setAlpha(0f);
            items[i].setTranslationY(dp(14));
            items[i].animate().alpha(1f).translationY(0).setStartDelay(320 + i * 110L).setDuration(360).start();
        }
        final ObjectAnimator ring = ObjectAnimator.ofFloat(bell, "rotation", 0, -18, 16, -12, 8, -4, 0);
        ring.setDuration(900);
        ring.setStartDelay(700);
        ring.setRepeatCount(ValueAnimator.INFINITE);
        ring.setRepeatMode(ValueAnimator.RESTART);
        ring.start();
        // বোতামে হালকা "শ্বাস" — চোখে পড়ে
        final ObjectAnimator breathe = ObjectAnimator.ofPropertyValuesHolder(yes,
                PropertyValuesHolder.ofFloat("scaleX", 1f, 1.03f), PropertyValuesHolder.ofFloat("scaleY", 1f, 1.03f));
        breathe.setDuration(900);
        breathe.setStartDelay(900);
        breathe.setRepeatMode(ValueAnimator.REVERSE);
        breathe.setRepeatCount(ValueAnimator.INFINITE);
        breathe.start();

        final Runnable close = new Runnable() {
            public void run() {
                ring.cancel();
                breathe.cancel();
                card.animate().translationY(card.getHeight() + dp(40)).setDuration(260).start();
                dim.animate().alpha(0f).setDuration(280).withEndAction(new Runnable() {
                    public void run() { rootView.removeView(dim); }
                }).start();
            }
        };
        yes.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                close.run();
                askedAt = System.currentTimeMillis();
                requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, REQ_NOTIFY);
            }
        });
        no.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                close.run();
                ui.postDelayed(new Runnable() { public void run() { showDisclaimer(); } }, 400);
            }
        });
    }

    private View introRow(int icon, String text) {
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, dp(9), 0, dp(9));
        ImageView ic = new ImageView(this);
        ic.setImageResource(icon);
        ic.setPadding(dp(8), dp(8), dp(8), dp(8));
        GradientDrawable ib = new GradientDrawable();
        ib.setShape(GradientDrawable.OVAL);
        ib.setColor(0xFFDDF3E7);
        ic.setBackground(ib);
        row.addView(ic, new LinearLayout.LayoutParams(dp(36), dp(36)));
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextColor(0xFF1E293B);
        t.setTextSize(14.5f);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, -2, 1f);
        lp.leftMargin = dp(12);
        row.addView(t, lp);
        return row;
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] res) {
        super.onRequestPermissionsResult(req, perms, res);
        if (req != REQ_NOTIFY) return;
        boolean denied = res.length == 0 || res[0] != PackageManager.PERMISSION_GRANTED;
        // ইউজার চালু করতে চাইলেন, কিন্তু আগে দুবার "Don't allow" দেওয়ায় সিস্টেম আর জিজ্ঞেস করেনি → সেটিংস খুলে দিই
        if (denied && System.currentTimeMillis() - askedAt < 500) {
            try {
                startActivity(new Intent("android.settings.APP_NOTIFICATION_SETTINGS")
                        .putExtra("android.provider.extra.APP_PACKAGE", getPackageName()));
                return;
            } catch (Exception ignored) { }
        }
        ui.postDelayed(new Runnable() { public void run() { showDisclaimer(); } }, 500);
    }

    // ------------------------------------------------------------------ Firebase

    /** সাইট থেকে Firebase-এর তথ্য এনে জমা রাখা ও চালু করা (পেছনের থ্রেডে) */
    static void loadConfig(Context c) {
        SharedPreferences sp = c.getSharedPreferences("cc", MODE_PRIVATE);
        HttpURLConnection h = null;
        try {
            h = (HttpURLConnection) new URL("https://" + HOST + "/api/app-config").openConnection();
            h.setConnectTimeout(12000);
            h.setReadTimeout(12000);
            h.setUseCaches(false);
            h.setRequestProperty("User-Agent", UA);
            if (h.getResponseCode() == 200) {
                InputStream in = h.getInputStream();
                ByteArrayOutputStream buf = new ByteArrayOutputStream();
                byte[] b = new byte[4096];
                for (int n; (n = in.read(b)) > 0; ) buf.write(b, 0, n);
                in.close();
                JSONObject o = new JSONObject(buf.toString("UTF-8"));
                JSONObject f = o.optJSONObject("fcm");
                sp.edit().putString("fcm", f == null ? "" : f.toString())
                        .putString("topic", f == null ? "jobs" : f.optString("topic", "jobs")).apply();
            }
        } catch (Exception ignored) {
        } finally {
            if (h != null) h.disconnect();
        }
        if (App.initFirebase(c)) subscribe(c);
        else fallback(c);
    }

    /** "jobs" টপিকে যুক্ত — নতুন খবর এলে সার্ভার একবারেই সবার কাছে পাঠায় */
    static void subscribe(final Context c) {
        try {
            if (!App.initFirebase(c)) return;
            String topic = c.getSharedPreferences("cc", MODE_PRIVATE).getString("topic", "jobs");
            FirebaseMessaging.getInstance().subscribeToTopic(topic).addOnCompleteListener(t -> {
                if (t.isSuccessful()) FeedJob.cancel(c);     // Firebase চলছে — বিকল্প চেক লাগবে না
                else fallback(c);
            });
        } catch (Exception e) {
            fallback(c);
        }
    }

    /** Google Play services নেই বা Firebase চালু হয়নি — বিকল্প ১৫ মিনিটের চেক */
    private static void fallback(final Context c) {
        FeedJob.schedule(c);
        new Thread(new Runnable() { public void run() { FeedJob.poll(c); } }).start();
    }

    private int dp(float v) { return Math.round(v * getResources().getDisplayMetrics().density); }
}
