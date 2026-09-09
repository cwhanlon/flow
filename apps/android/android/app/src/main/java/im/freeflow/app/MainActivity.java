package im.freeflow.app;

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.provider.OpenableColumns;
import android.webkit.URLUtil;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;
import java.util.List;

/**
 * The shell around packages/web (docs/design/ANDROID.md, phase 1). Everything
 * the WebView cannot do for the web client lives here, and it is kept thin on
 * purpose: the page owns navigation state, the shell only asks it questions.
 */
public class MainActivity extends BridgeActivity {

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    // Before super.onCreate: that is where the bridge is built and the page
    // loaded, and a plugin registered later is invisible to it.
    registerPlugin(FlowShellPlugin.class);
    super.onCreate(savedInstanceState);
    installBackHandling();
    installDownloads();
    installPopups();
    // A link the app was launched with: the page is not up yet, so park it for
    // the page to collect at boot (FlowShell.consumeLaunchUrl).
    deliverLink(getIntent(), true);
    // Likewise something shared into the app; not again on a re-creation,
    // which would post the same share twice.
    if (savedInstanceState == null) deliverShare(getIntent(), true);
  }

  /** singleTask: a link while the app is alive arrives here, not in onCreate. */
  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    deliverLink(intent, false);
    deliverShare(intent, false);
  }

  /**
   * Hand a flow:// or App Link to the page (packages/web/src/lib/deepLink.ts):
   * straight into the running page when it has the bridge installed, parked
   * otherwise. The page decides what the link means; the shell only carries it.
   */
  private void deliverLink(Intent intent, boolean coldStart) {
    Uri data = intent == null ? null : intent.getData();
    if (data == null || !DeepLinks.isFlowLink(data.toString())) return;
    String url = data.toString();
    WebView webView = getBridge() == null ? null : getBridge().getWebView();
    if (coldStart || webView == null) {
      FlowShellPlugin.setPendingUrl(url);
      return;
    }
    webView.evaluateJavascript(DeepLinks.openUrlJs(url), result -> {
      if (!"true".equals(result)) FlowShellPlugin.setPendingUrl(url);
    });
  }

  /**
   * Something shared from another app (ANDROID.md phase 5): text, a link,
   * photos, a video, documents. The shell describes the files — the page has
   * no ContentResolver — and hands the lot to the page, which shows the
   * channel picker (packages/web/src/lib/share.ts) and later reads the bytes
   * through Capacitor's local server. Parked like a link when the page is
   * not up yet.
   */
  private void deliverShare(Intent intent, boolean coldStart) {
    if (intent == null || !ShareIntents.isShare(intent.getAction())) return;
    List<ShareIntents.Item> items = new ArrayList<>();
    if (Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction())) {
      ArrayList<Uri> uris = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
      if (uris != null) for (Uri u : uris) if (u != null) items.add(describe(u));
    } else {
      Uri u = intent.getParcelableExtra(Intent.EXTRA_STREAM);
      if (u != null) items.add(describe(u));
    }
    String json = ShareIntents.payloadJson(
        intent.getCharSequenceExtra(Intent.EXTRA_TEXT), intent.getCharSequenceExtra(Intent.EXTRA_SUBJECT), items);
    if (json == null) return;
    WebView webView = getBridge() == null ? null : getBridge().getWebView();
    if (coldStart || webView == null) {
      FlowShellPlugin.setPendingShare(json);
      return;
    }
    webView.evaluateJavascript(ShareIntents.openShareJs(json), result -> {
      if (!"true".equals(result)) FlowShellPlugin.setPendingShare(json);
    });
  }

  /** Display name, type and size as the provider reports them. */
  private ShareIntents.Item describe(Uri uri) {
    String name = null;
    long size = -1;
    String type = getContentResolver().getType(uri);
    try (Cursor c = getContentResolver().query(
        uri, new String[] {OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}, null, null, null)) {
      if (c != null && c.moveToFirst()) {
        int n = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
        int sz = c.getColumnIndex(OpenableColumns.SIZE);
        if (n >= 0) name = c.getString(n);
        if (sz >= 0 && !c.isNull(sz)) size = c.getLong(sz);
      }
    } catch (RuntimeException ignored) {
      // A provider that refuses the query still serves the bytes.
    }
    if (name == null || name.isEmpty()) {
      String last = uri.getLastPathSegment();
      name = last == null || last.isEmpty() ? "shared-file" : last;
    }
    return new ShareIntents.Item(uri.toString(), name, type, size);
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
   * window.open from the page or a mini-app iframe (ANDROID.md phase 4): with
   * multiple windows unsupported the WebView drops it silently; supported, it
   * asks FlowWebChromeClient, which sends the URL to the system browser.
   */
  private void installPopups() {
    WebView webView = getBridge() == null ? null : getBridge().getWebView();
    if (webView == null) return;
    webView.getSettings().setSupportMultipleWindows(true);
    webView.setWebChromeClient(new FlowWebChromeClient(getBridge()));
  }

  /**
   * Downloads of http(s) URLs land in the system Downloads folder with a
   * notification, via DownloadManager — presigned file links the server hands
   * out, which need no auth header. Everything the web client fetches with
   * its own auth reaches the WebView as a blob: URL, which DownloadManager
   * cannot take; those go through FlowShellPlugin.saveFile instead, called by
   * the page (packages/web/src/lib/download.ts).
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
