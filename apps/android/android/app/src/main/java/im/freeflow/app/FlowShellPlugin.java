package im.freeflow.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.widget.Toast;
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
