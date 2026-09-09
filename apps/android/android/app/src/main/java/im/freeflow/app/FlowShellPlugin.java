package im.freeflow.app;

import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.Intent;
import android.media.AudioManager;
import android.content.ContentValues;
import android.content.Context;
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

/**
 * What the web client asks the shell for (packages/web/src/lib/download.ts).
 * One method so far: save bytes the page already holds — a file it fetched
 * with its own auth — into the device's Downloads, since the WebView cannot
 * download a blob: URL by itself.
 */
@CapacitorPlugin(name = "FlowShell")
public class FlowShellPlugin extends Plugin {

  /**
   * A link the app was launched (or resumed) with before the page could take
   * it — MainActivity parks it here, the page collects it once at boot.
   */
  private static volatile String pendingUrl;

  static void setPendingUrl(String url) {
    pendingUrl = url;
  }

  /** A share the app was launched with (ANDROID.md phase 5); same parking. */
  private static volatile String pendingShare;

  static void setPendingShare(String payloadJson) {
    pendingShare = payloadJson;
  }

  @PluginMethod
  public void consumeShare(PluginCall call) {
    JSObject ret = new JSObject();
    String json = pendingShare;
    pendingShare = null;
    try {
      if (json == null) ret.put("payload", JSObject.NULL);
      else ret.put("payload", new JSObject(json));
    } catch (org.json.JSONException e) {
      ret.put("payload", JSObject.NULL);
    }
    call.resolve(ret);
  }

  @PluginMethod
  public void consumeLaunchUrl(PluginCall call) {
    JSObject ret = new JSObject();
    String url = pendingUrl;
    pendingUrl = null;
    if (url == null) ret.put("url", JSObject.NULL);
    else ret.put("url", url);
    call.resolve(ret);
  }

  /**
   * The system browser, as a Chrome Custom Tab when one is available: what the
   * app uses for Google sign-in, which will not run inside a WebView. Only
   * http(s) — the page never gets to launch arbitrary intents.
   */
  @PluginMethod
  public void openExternal(PluginCall call) {
    String url = call.getString("url");
    if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) {
      call.reject("url must be http(s)");
      return;
    }
    Uri uri = Uri.parse(url);
    try {
      new CustomTabsIntent.Builder().build().launchUrl(getContext(), uri);
    } catch (ActivityNotFoundException e) {
      Intent view = new Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getContext().startActivity(view);
    }
    call.resolve();
  }

  /**
   * The page's one huddle signal (ANDROID.md phase 4): a call started or
   * ended. Start = a foreground service with the microphone type (the call
   * survives backgrounding) plus the speaker route; stop = both undone.
   */
  @PluginMethod
  public void setHuddleActive(PluginCall call) {
    Boolean active = call.getBoolean("active");
    if (active == null) {
      call.reject("active is required");
      return;
    }
    if (active) HuddleService.start(getContext(), call.getString("title"));
    else HuddleService.stop(getContext());
    call.resolve();
  }

  /** Speaker vs earpiece for call audio. */
  @PluginMethod
  public void setSpeaker(PluginCall call) {
    Boolean on = call.getBoolean("on");
    if (on == null) {
      call.reject("on is required");
      return;
    }
    AudioManager audio = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
    if (audio == null) {
      call.reject("no audio service");
      return;
    }
    audio.setSpeakerphoneOn(on);
    call.resolve();
  }

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

  /**
   * Android 10+: MediaStore's Downloads collection — no storage permission,
   * shows up in Files and the Downloads app, survives uninstall. Older
   * releases: the app's own external Downloads directory, which also needs no
   * permission but is app-private; the public folder would want
   * WRITE_EXTERNAL_STORAGE and a runtime prompt, which is not worth it for
   * the API 24–28 tail.
   */
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
}
