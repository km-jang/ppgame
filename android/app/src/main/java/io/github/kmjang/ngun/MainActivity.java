package io.github.kmjang.ngun;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * 뿅뿅 놀이터: 저장소 최상위의 웹 게임 모음(index.html, common/, game/, snake/, jump/, runner/)을
 * 앱 안(assets/www/)에 넣고 WebView 하나로 보여 준다.
 *
 * 주소는 https://appassets.androidplatform.net/assets/www/index.html 이다 (WebViewAssetLoader).
 * 진짜 https 주소처럼 보이므로 상대 링크(game/index.html, ../index.html)와 localStorage가
 * 웹과 똑같이 동작하고, 기록은 앱을 다시 설치하지 않는 한 남는다.
 *
 * 서비스 워커(sw.js): 앱 안에서는 필요 없다(파일이 이미 기기에 있다). 페이지가 등록을 시도하면
 * sw.js 요청에 404를 돌려 등록이 조용히 실패하게 한다. 웹 코드는 register(...).catch()로 받는다.
 */
public class MainActivity extends Activity {

    static final String HOST = "appassets.androidplatform.net";
    static final String HOME = "https://" + HOST + "/assets/www/index.html";
    static final int BG = Color.rgb(0x05, 0x07, 0x0f);
    static final int MAX_SAVE_CHARS = 8 * 1024 * 1024;

    private WebView web;
    private WebViewAssetLoader loader;
    // 기록 불러오기의 "파일 고르기": 고른 파일을 웹 페이지에 돌려줄 자리
    private ValueCallback<Uri[]> fileCallback;
    private static final int PICK_FILE = 41;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().getDecorView().setBackgroundColor(BG);

        loader = new WebViewAssetLoader.Builder()
                .setDomain(HOST)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        blockServiceWorkers();

        web = new WebView(this);
        setupWebView(web);
        setContentView(web, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        hideSystemBars();

        web.loadUrl(HOME);
    }

    private void setupWebView(WebView w) {
        w.setBackgroundColor(BG);
        w.setOverScrollMode(View.OVER_SCROLL_NEVER);
        w.setVerticalScrollBarEnabled(false);
        w.setHorizontalScrollBarEnabled(false);
        // 길게 눌러도 글자 선택·메뉴가 뜨지 않게 (아이가 오래 누르는 게임이 많다)
        w.setLongClickable(false);
        w.setHapticFeedbackEnabled(false);
        w.setOnLongClickListener(v -> true);

        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setTextZoom(100);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);

        w.addJavascriptInterface(new AppBridge(), "AndroidApp");
        w.setWebChromeClient(new WebChromeClient() {
            // <input type=file>을 누르면 기기의 파일 고르기 화면을 연다.
            // accept에 image/*가 있으면(보호자 화면의 아이 사진) 사진만 보이게, 아니면(기록 불러오기용 .json) 모든 파일.
            // 카메라 권한은 쓰지 않는다: 사진은 갤러리에서 고른다
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                boolean photo = wantsImage(params);
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType(photo ? "image/*" : "*/*");
                try {
                    startActivityForResult(Intent.createChooser(pick, photo ? "사진 고르기" : "기록 파일 고르기"), PICK_FILE);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    Toast.makeText(MainActivity.this, "파일을 고를 수 없어요. 코드를 붙여 넣어 주세요", Toast.LENGTH_LONG).show();
                    return false;
                }
                return true;
            }
        });
        w.setWebViewClient(new GameClient());
        w.setDownloadListener((url, userAgent, contentDisposition, mimeType, length) ->
                saveBlobDownload(url, mimeType));
    }

    /** 파일 고르기 요청의 accept 목록에 image/* (또는 image/로 시작하는 종류)가 있는가 */
    static boolean wantsImage(WebChromeClient.FileChooserParams params) {
        String[] types = params == null ? null : params.getAcceptTypes();
        if (types == null) return false;
        for (String t : types) {
            if (t == null) continue;
            for (String one : t.split(",")) {
                if (one.trim().toLowerCase().startsWith("image/")) return true;
            }
        }
        return false;
    }

    /** 서비스 워커 스크립트 요청에 404를 돌려 등록이 조용히 실패하게 한다 (API 24+). */
    private void blockServiceWorkers() {
        try {
            ServiceWorkerController.getInstance().setServiceWorkerClient(new ServiceWorkerClient() {
                @Override
                public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
                    return notFound();
                }
            });
        } catch (Throwable ignored) {
            // 일부 기기의 WebView가 지원하지 않으면 그냥 둔다. 등록은 어차피 실패한다
        }
    }

    static WebResourceResponse notFound() {
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-store");
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", headers,
                new ByteArrayInputStream(new byte[0]));
    }

    static boolean isOurs(Uri u) {
        return u != null && HOST.equals(u.getHost());
    }

    private final class GameClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri u = request.getUrl();
            if (isOurs(u)) {
                String path = u.getPath();
                if (path != null && path.endsWith("/sw.js")) return notFound();
                return loader.shouldInterceptRequest(u);
            }
            return null; // 구글 글꼴 같은 바깥 부품은 인터넷에서 그대로 받는다
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri u = request.getUrl();
            if (isOurs(u)) return false;
            String scheme = u.getScheme();
            if ("about".equals(scheme) || "blob".equals(scheme) || "data".equals(scheme)) return false;
            // 앱 밖 주소로는 WebView가 떠나지 않는다. 사용자가 누른 http(s) 링크만 인터넷 앱으로 연다
            if (("http".equals(scheme) || "https".equals(scheme))
                    && request.isForMainFrame() && request.hasGesture()) {
                openExternal(u);
            }
            return true;
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            // 화면 그리는 부분이 멈추면 앱 전체가 꺼지지 않게 새로 띄운다 (API 26+에서만 불린다)
            if (view == web) {
                ViewGroup parent = (ViewGroup) view.getParent();
                if (parent != null) parent.removeView(view);
                view.destroy();
                web = null;
                recreate();
            }
            return true;
        }
    }

    private void openExternal(Uri u) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, u);
            i.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(i);
        } catch (ActivityNotFoundException ignored) {
            // 열 앱이 없으면 아무것도 하지 않는다
        }
    }

    /**
     * 웹에서 부르는 창구. 이 두 가지 말고는 없다.
     * window.AndroidApp.isApp() → true
     * window.AndroidApp.saveText(파일이름, 글) → 다운로드 폴더에 저장, 성공하면 true
     */
    private final class AppBridge {
        @JavascriptInterface
        public boolean isApp() {
            return true;
        }

        @JavascriptInterface
        public boolean saveText(String fileName, String text) {
            return writeText(fileName, text);
        }
    }

    /** 웹이 Blob 링크로 내려받기를 하면(앱 창구를 안 쓴 경우) 그 내용을 읽어 saveText로 넘긴다. */
    private void saveBlobDownload(String url, String mimeType) {
        if (web == null || url == null || !url.startsWith("blob:")) return;
        String ext = (mimeType != null && mimeType.contains("json")) ? ".json" : ".txt";
        String name = "ppyong-record-" + System.currentTimeMillis() + ext;
        String js = "(function(){try{fetch(" + JSONObject.quote(url) + ").then(function(r){return r.text();})"
                + ".then(function(t){window.AndroidApp.saveText(" + JSONObject.quote(name) + ",t);})"
                + ".catch(function(){});}catch(e){}})();";
        web.evaluateJavascript(js, null);
    }

    static String cleanName(String fileName) {
        String n = fileName == null ? "" : fileName.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        while (n.startsWith(".")) n = n.substring(1);
        if (n.isEmpty()) n = "ppyong-record.json";
        if (n.length() > 80) n = n.substring(n.length() - 80);
        return n;
    }

    private boolean writeText(String fileName, String text) {
        if (text == null || text.length() > MAX_SAVE_CHARS) {
            toast(R.string.save_failed);
            return false;
        }
        String name = cleanName(fileName);
        String mime = name.toLowerCase().endsWith(".json") ? "application/json" : "text/plain";
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                ContentResolver cr = getContentResolver();
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                v.put(MediaStore.MediaColumns.IS_PENDING, 1);
                Uri uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (uri == null) throw new IllegalStateException("insert failed");
                try (OutputStream os = cr.openOutputStream(uri)) {
                    if (os == null) throw new IllegalStateException("no stream");
                    os.write(bytes);
                } catch (Exception e) {
                    cr.delete(uri, null, null);
                    throw e;
                }
                v.clear();
                v.put(MediaStore.MediaColumns.IS_PENDING, 0);
                cr.update(uri, v, null, null);
                toast(R.string.saved_downloads);
            } else {
                File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (dir == null) throw new IllegalStateException("no dir");
                if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("mkdirs failed");
                try (FileOutputStream os = new FileOutputStream(new File(dir, name))) {
                    os.write(bytes);
                }
                toast(R.string.saved_app_folder);
            }
            return true;
        } catch (Exception e) {
            toast(R.string.save_failed);
            return false;
        }
    }

    private void toast(int resId) {
        runOnUiThread(() -> Toast.makeText(this, resId, Toast.LENGTH_LONG).show());
    }

    // 전체 화면: 위 상태 줄과 아래 버튼 줄을 숨기고, 가장자리를 밀면 잠깐 나온다
    @SuppressWarnings("deprecation")
    private void hideSystemBars() {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemBars();
        if (web != null) {
            web.resumeTimers();
            web.onResume();
        }
    }

    @Override
    protected void onPause() {
        // 다른 앱으로 가면 소리·타이머를 멈춘다 (웹 쪽도 visibilitychange로 소리를 멈춘다)
        if (web != null) {
            web.onPause();
            web.pauseTimers();
        }
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            ViewGroup parent = (ViewGroup) web.getParent();
            if (parent != null) parent.removeView(web);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    /**
     * 뒤로 가기: 먼저 웹에 물어본다 (window.AndroidBack 이 있고 true를 돌려주면 웹이 처리한 것).
     * 아니면 이전 화면으로, 이전 화면이 없으면 첫 화면에서 "놀이를 끝낼까요?"를 묻는다.
     */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web == null) {
            super.onBackPressed();
            return;
        }
        web.evaluateJavascript(
                "(function(){try{return !!(window.AndroidBack&&window.AndroidBack());}catch(e){return false;}})()",
                value -> {
                    if ("true".equals(value)) return;
                    defaultBack();
                });
    }

    private void defaultBack() {
        if (web == null) {
            finish();
            return;
        }
        if (web.canGoBack()) {
            web.goBack();
            return;
        }
        String url = web.getUrl();
        boolean onHub = url == null || url.equals(HOME)
                || url.startsWith(HOME + "?") || url.startsWith(HOME + "#")
                || url.equals("https://" + HOST + "/assets/www/");
        if (!onHub) {
            web.loadUrl(HOME);
            return;
        }
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setMessage(R.string.exit_question)
                .setPositiveButton(R.string.exit_yes, (d, which) -> finish())
                .setNegativeButton(R.string.exit_no, null)
                .show();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == PICK_FILE) {
            if (fileCallback != null) {
                Uri[] result = null;
                if (resultCode == RESULT_OK && data != null && data.getData() != null) result = new Uri[] { data.getData() };
                fileCallback.onReceiveValue(result);
                fileCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }
}
