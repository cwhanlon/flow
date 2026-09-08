package im.freeflow.app;

import java.util.Locale;

/** Which WebView download requests the shell hands to DownloadManager. */
final class DownloadPolicy {
  private DownloadPolicy() {}

  /**
   * DownloadManager fetches the URL itself, from outside the WebView, so it
   * can only take something it can reach: http(s). A blob: or data: URL lives
   * inside the page and is meaningless to it — those are dropped rather than
   * enqueued as a guaranteed failure.
   */
  static boolean isDownloadable(String url) {
    if (url == null) return false;
    String lower = url.trim().toLowerCase(Locale.ROOT);
    return lower.startsWith("https://") || lower.startsWith("http://");
  }
}
