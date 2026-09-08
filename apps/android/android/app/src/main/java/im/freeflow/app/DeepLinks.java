package im.freeflow.app;

import java.util.Locale;

/**
 * Which incoming links the shell hands to the page, and how (ANDROID.md
 * phase 2). The page decides what a link means (packages/web/src/lib/
 * deepLink.ts); the shell only recognises the shapes it registered intent
 * filters for and delivers them verbatim.
 */
final class DeepLinks {
  private DeepLinks() {}

  /** flow:// anything, or the server's own /join/… and /invite/… pages over http(s). */
  static boolean isFlowLink(String url) {
    if (url == null) return false;
    String lower = url.trim().toLowerCase(Locale.ROOT);
    if (lower.startsWith("flow://")) return true;
    if (!(lower.startsWith("https://") || lower.startsWith("http://"))) return false;
    int pathStart = lower.indexOf('/', lower.indexOf("//") + 2);
    if (pathStart < 0) return false;
    String path = lower.substring(pathStart);
    return path.startsWith("/join/") || path.startsWith("/invite/");
  }

  /**
   * JavaScript the activity evaluates to hand a link to a page that is
   * already up: calls window.__flowOpenUrl(url) if the page installed it and
   * yields true only when the page took the link. The URL is embedded as a
   * JSON string literal so nothing in it can escape into code.
   */
  static String openUrlJs(String url) {
    return "(function(){try{return typeof window.__flowOpenUrl==='function'&&window.__flowOpenUrl("
        + jsonString(url)
        + ")===true;}catch(e){return false;}})()";
  }

  /** A JSON/JS string literal: quotes, backslashes, control characters, the
   * two line separators JS treats as newlines, and '<' (so "</script>" can
   * never appear) are escaped. */
  static String jsonString(String s) {
    StringBuilder sb = new StringBuilder(s.length() + 2).append('"');
    for (int i = 0; i < s.length(); i++) {
      char c = s.charAt(i);
      switch (c) {
        case '"': sb.append("\\\""); break;
        case '\\': sb.append("\\\\"); break;
        case '\n': sb.append("\\n"); break;
        case '\r': sb.append("\\r"); break;
        case '\t': sb.append("\\t"); break;
        case '<': sb.append("\\u003c"); break;
        case '\u2028': sb.append("\\u2028"); break;
        case '\u2029': sb.append("\\u2029"); break;
        default:
          if (c < 0x20) sb.append(String.format(Locale.ROOT, "\\u%04x", (int) c));
          else sb.append(c);
      }
    }
    return sb.append('"').toString();
  }
}
