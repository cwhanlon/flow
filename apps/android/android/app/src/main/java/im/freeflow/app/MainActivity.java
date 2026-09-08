package im.freeflow.app;

import android.app.DownloadManager;
import android.content.Context;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.URLUtil;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

/**
 * The shell around packages/web (docs/design/ANDROID.md, phase 1). Everything
 * the WebView cannot do for the web client lives here, and it is kept thin on
 * purpose: the page owns navigation state, the shell only asks it questions.
 */
public class MainActivity extends BridgeActivity {

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    installBackHandling();
    installDownloads();
  }

  /**
   * Hardware back: ask the page first (window.__flowBack — thread, side panel,
   * drawer), and only when it has nothing to close send the app to the
   * background, the way every chat app does. Never finish(): the next tap on
   * the launcher should land where the user left off, socket and all.
   *
   * Registered after super.onCreate so it sits above Capacitor's own callback
   * in the dispatcher and takes precedence.
   */
  private void installBackHandling() {
    getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
      @Override
      public void handleOnBackPressed() {
        WebView webView = getBridge() == null ? null : getBridge().getWebView();
        if (webView == null) {
          moveTaskToBack(true);
          return;
        }
        webView.evaluateJavascript(BackBridge.PROBE_JS, result -> {
          if (!BackBridge.pageConsumed(result)) moveTaskToBack(true);
        });
      }
    });
  }

  /**
   * Downloads land in the system Downloads folder with a notification, via
   * DownloadManager. Only http(s) URLs qualify — presigned file links the
   * server hands out — which need no auth header; the web client fetches
   * everything authenticated itself and hands the WebView blob: URLs, which
   * DownloadManager cannot take (a phase-1 gap noted in apps/android/README.md).
   */
  private void installDownloads() {
    WebView webView = getBridge() == null ? null : getBridge().getWebView();
    if (webView == null) return;
    webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
      if (!DownloadPolicy.isDownloadable(url)) return;
      String fileName = URLUtil.guessFileName(url, contentDisposition, mimeType);
      DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
      request.setMimeType(mimeType);
      request.setTitle(fileName);
      request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
      request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
      DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
      if (dm == null) return;
      dm.enqueue(request);
      Toast.makeText(this, "Downloading " + fileName, Toast.LENGTH_SHORT).show();
    });
  }
}
