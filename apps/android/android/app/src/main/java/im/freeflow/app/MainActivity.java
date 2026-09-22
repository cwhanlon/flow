package im.freeflow.app;

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.URLUtil;
import android.webkit.WebView;
import android.widget.Toast;
import com.getcapacitor.BridgeActivity;

/**
 * The shell around packages/web (docs/design/ANDROID.md). It is kept thin on
 * purpose: the page owns everything the web client owns on the desktop, and
 * reaches the shell only through the host seam — a document-start script for
 * boot (ShellBoot) and the FlowShell plugin after that. There is no
 * Android-only UI code.
 */
public class MainActivity extends BridgeActivity {

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    // Before super.onCreate: that is where the bridge is built and the page
    // loaded, and a plugin registered later is invisible to it.
    registerPlugin(FlowShellPlugin.class);
    super.onCreate(savedInstanceState);
    installDownloads();
  }

  /**
   * Downloads of http(s) URLs land in the system Downloads folder with a
   * notification, via DownloadManager — presigned file links the server
   * hands out, which need no auth header. Everything the web client fetches
   * with its own auth reaches the WebView as a blob: URL, which
   * DownloadManager cannot take; those go through FlowShellPlugin.saveFile
   * instead, called by the page (packages/web/src/lib/download.ts).
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

  /**
   * Capacitor inflates the WebView in super.onCreate and loads the page in
   * load(); in between is the one place a document-start script can be
   * registered before the first navigation, which is what makes the page's
   * credential reads synchronous (ShellBoot).
   */
  @Override
  protected void load() {
    WebView webView = findViewById(com.getcapacitor.android.R.id.webview);
    if (webView != null) {
      Secrets secrets = Secrets.get(this);
      Uri data = getIntent() == null ? null : getIntent().getData();
      String launchUrl = data != null && LinkPolicy.isFlowLink(data.toString()) ? data.toString() : null;
      String info = ShellBoot.infoJson(BuildConfig.VERSION_NAME, BuildConfig.FLOW_SERVER_URL, null);
      ShellBoot.install(webView, ShellBoot.script(info, secrets.load(), secrets.available(), launchUrl));
    }
    super.load();
  }

  /** singleTask: the bridge forwards this to every plugin (FlowShellPlugin.handleOnNewIntent). */
  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
  }
}
