package im.freeflow.app;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Message;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.browser.customtabs.CustomTabsIntent;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;

/**
 * Capacitor's chrome client plus popups (ANDROID.md phase 4).
 *
 * A mini app lives in a sandboxed iframe that is allowed to open popups
 * (MINI_APPS.md), and `window.open` from there reaches the WebView as
 * onCreateWindow. There is no second WebView to hand it, so the popup goes to
 * the system browser — the same place a target=_blank link already goes.
 * Without this override the request is silently dropped.
 *
 * The URL is not part of the request: the WebView expects to be handed a
 * WebView to load it into. A throwaway one receives that navigation, reports
 * the URL, and is destroyed.
 */
public class FlowWebChromeClient extends BridgeWebChromeClient {
  private final Context context;

  public FlowWebChromeClient(Bridge bridge) {
    super(bridge);
    this.context = bridge.getContext();
  }

  @Override
  public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
    if (resultMsg == null || !(resultMsg.obj instanceof WebView.WebViewTransport)) return false;
    WebView probe = new WebView(context);
    probe.setWebViewClient(new WebViewClient() {
      @Override
      public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
        String url = request.getUrl().toString();
        if (PopupPolicy.shouldOpenExternally(url)) openExternally(url);
        v.post(v::destroy);
        return true;
      }
    });
    ((WebView.WebViewTransport) resultMsg.obj).setWebView(probe);
    resultMsg.sendToTarget();
    return true;
  }

  private void openExternally(String url) {
    Uri uri = Uri.parse(url);
    try {
      new CustomTabsIntent.Builder().build().launchUrl(context, uri);
    } catch (ActivityNotFoundException e) {
      context.startActivity(new Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
    }
  }
}
