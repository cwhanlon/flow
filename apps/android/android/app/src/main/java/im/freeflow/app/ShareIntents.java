package im.freeflow.app;

import android.content.Intent;
import java.util.List;

/**
 * The share target (ANDROID.md phase 5): what another app's share sheet hands
 * us (ACTION_SEND / ACTION_SEND_MULTIPLE) becomes one JSON payload for the
 * page (packages/web/src/lib/share.ts), which shows the channel picker. The
 * shell resolves what it alone can — the content URIs' display names, types
 * and sizes — and carries the rest verbatim. Pure so it is unit-testable; the
 * activity does the ContentResolver work.
 */
final class ShareIntents {
  private ShareIntents() {}

  /** One shared file as the provider describes it. */
  static final class Item {
    final String uri;
    final String name;
    final String mimeType;
    final long size;

    Item(String uri, String name, String mimeType, long size) {
      this.uri = uri;
      this.name = name;
      this.mimeType = mimeType;
      this.size = size;
    }
  }

  static boolean isShare(String action) {
    return Intent.ACTION_SEND.equals(action) || Intent.ACTION_SEND_MULTIPLE.equals(action);
  }

  /**
   * The payload, or null when there is nothing to share: no text and no
   * files. Only content:// URIs are carried — those are the ones the sending
   * app granted us; a file:// or http URL in EXTRA_STREAM is not ours to read.
   */
  static String payloadJson(CharSequence text, CharSequence subject, List<Item> items) {
    StringBuilder files = new StringBuilder();
    int n = 0;
    if (items != null) {
      for (Item it : items) {
        if (it == null || it.uri == null || !it.uri.startsWith("content://")) continue;
        if (n++ > 0) files.append(',');
        files.append("{\"uri\":").append(DeepLinks.jsonString(it.uri))
            .append(",\"name\":").append(DeepLinks.jsonString(it.name == null ? "" : it.name))
            .append(",\"mimeType\":").append(DeepLinks.jsonString(it.mimeType == null ? "" : it.mimeType))
            .append(",\"size\":").append(it.size < 0 ? -1 : it.size)
            .append('}');
      }
    }
    String t = text == null ? "" : text.toString();
    String s = subject == null ? "" : subject.toString();
    if (t.trim().isEmpty() && n == 0) return null;
    return "{\"text\":" + (t.trim().isEmpty() ? "null" : DeepLinks.jsonString(t))
        + ",\"subject\":" + (s.trim().isEmpty() ? "null" : DeepLinks.jsonString(s))
        + ",\"files\":[" + files + "]}";
  }

  /**
   * JavaScript the activity evaluates to hand a share to a page that is
   * already up: window.__flowShare(payload), true only when the page took it.
   * The payload is passed as parsed JSON, never spliced into code.
   */
  static String openShareJs(String payloadJson) {
    return "(function(){try{return typeof window.__flowShare==='function'&&window.__flowShare(JSON.parse("
        + DeepLinks.jsonString(payloadJson)
        + "))===true;}catch(e){return false;}})()";
  }
}
