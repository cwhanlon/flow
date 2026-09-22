package im.freeflow.app;

import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.widget.Toast;
import androidx.browser.customtabs.CustomTabsIntent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.Locale;

/**
 * The write half of the host seam (docs/specs/desktop-electron.md, "Bridge
 * contract"): what the page asks the shell to do after boot. The read half —
 * info and the credential snapshot — went in at document start (ShellBoot),
 * so nothing here needs to be synchronous. The page's adapter
 * (packages/web/src/lib/hostAndroid.ts) turns these into the same
 * FlowDesktopBridge shape the Electron preload exposes.
 */
@CapacitorPlugin(name = "FlowShell")
public class FlowShellPlugin extends Plugin {

  /** `flow://…` links the OS handed the app: retained until the page's
   * listener is up, so a cold-start link is never lost. */
  static final String EVENT_DEEP_LINK = "deepLink";

  @Override
  public void load() {
    // The intent the activity was created with — a launcher tap has no data.
    deliver(getActivity() == null ? null : getActivity().getIntent());
  }

  /** singleTask: a link while the app is alive arrives here, not in load(). */
  @Override
  protected void handleOnNewIntent(Intent intent) {
    super.handleOnNewIntent(intent);
    deliver(intent);
  }

  private void deliver(Intent intent) {
    Uri data = intent == null ? null : intent.getData();
    if (data == null || !LinkPolicy.isFlowLink(data.toString())) return;
    JSObject payload = new JSObject();
    payload.put("url", data.toString());
    notifyListeners(EVENT_DEEP_LINK, payload, true);
  }

  // -- secrets -----------------------------------------------------------

  @PluginMethod
  public void secretSet(PluginCall call) {
    String key = call.getString("key");
    String value = call.getString("value");
    if (key == null || key.isEmpty() || value == null) {
      call.reject("key and value are required");
      return;
    }
    Secrets.get(getContext()).set(key, value);
    call.resolve();
  }

  @PluginMethod
  public void secretDelete(PluginCall call) {
    String key = call.getString("key");
    if (key == null || key.isEmpty()) {
      call.reject("key is required");
      return;
    }
    Secrets.get(getContext()).delete(key);
    call.resolve();
  }

  // -- downloads ---------------------------------------------------------

  /**
   * Save bytes the page already holds — a file it fetched with its own auth,
   * which reaches the WebView as a blob: URL that nothing native can fetch
   * (ANDROID.md phase 1; packages/web/src/lib/download.ts) — into the
   * device's Downloads, under the name the page gave, made safe.
   */
  @PluginMethod
  public void saveFile(PluginCall call) {
    String name = call.getString("name");
    String mimeType = call.getString("mimeType", "application/octet-stream");
    String data = call.getString("data");
    if (name == null || data == null) {
      call.reject("name and data are required");
      return;
    }
    byte[] bytes;
    try {
      bytes = Base64.decode(data, Base64.DEFAULT);
    } catch (IllegalArgumentException e) {
      call.reject("data is not base64");
      return;
    }
    String fileName = DownloadNames.safe(name);
    try {
      Uri uri = save(getContext(), fileName, mimeType, bytes);
      JSObject ret = new JSObject();
      ret.put("uri", uri.toString());
      Toast.makeText(getContext(), "Saved " + fileName + " to Downloads", Toast.LENGTH_SHORT).show();
      call.resolve(ret);
    } catch (IOException e) {
      call.reject("could not save: " + e.getMessage());
    }
  }

  /** MediaStore's Downloads collection (API 29+: no storage permission);
   * the app's own external Downloads directory before that. */
  static Uri save(Context context, String fileName, String mimeType, byte[] bytes) throws IOException {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      ContentResolver resolver = context.getContentResolver();
      ContentValues values = new ContentValues();
      values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
      values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
      values.put(MediaStore.Downloads.IS_PENDING, 1);
      Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
      if (uri == null) throw new IOException("MediaStore refused the insert");
      try (OutputStream out = resolver.openOutputStream(uri)) {
        if (out == null) throw new IOException("no output stream for " + uri);
        out.write(bytes);
      }
      values.clear();
      values.put(MediaStore.Downloads.IS_PENDING, 0);
      resolver.update(uri, values, null, null);
      return uri;
    }
    File dir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
    if (dir == null) throw new IOException("external storage unavailable");
    if (!dir.exists() && !dir.mkdirs()) throw new IOException("could not create " + dir);
    File file = new File(dir, fileName);
    try (FileOutputStream out = new FileOutputStream(file)) {
      out.write(bytes);
    }
    return Uri.fromFile(file);
  }

  // -- links -------------------------------------------------------------

  /**
   * The system browser, as a Chrome Custom Tab when one is available: Google
   * sign-in, another server's sign-in and Slack consent all go out this way
   * and come back as a `flow://` link. Only http(s) and mailto (LinkPolicy).
   */
  @PluginMethod
  public void openExternal(PluginCall call) {
    String url = call.getString("url");
    if (!LinkPolicy.isOpenableExternally(url)) {
      call.reject("only http(s) and mailto links open externally");
      return;
    }
    Uri uri = Uri.parse(url.trim());
    try {
      if (uri.getScheme() != null && uri.getScheme().toLowerCase(Locale.ROOT).equals("mailto")) {
        Intent mail = new Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(mail);
      } else {
        new CustomTabsIntent.Builder().build().launchUrl(getContext(), uri);
      }
      call.resolve();
    } catch (ActivityNotFoundException e) {
      call.reject("nothing on this device opens " + uri.getScheme() + " links");
    }
  }
}
