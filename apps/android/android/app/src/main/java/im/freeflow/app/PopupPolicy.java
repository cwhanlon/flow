package im.freeflow.app;

import java.util.Locale;

/** Which popup targets the shell hands to the system browser. */
final class PopupPolicy {
  private PopupPolicy() {}

  /**
   * http(s) only, and never our own origin: the app itself is served from
   * https://localhost, and a same-origin popup handed to Chrome would open a
   * page Chrome cannot reach. `about:blank` — what window.open() with no URL
   * yields — is dropped too.
   */
  static boolean shouldOpenExternally(String url) {
    if (url == null) return false;
    String lower = url.trim().toLowerCase(Locale.ROOT);
    if (!(lower.startsWith("https://") || lower.startsWith("http://"))) return false;
    String rest = lower.substring(lower.indexOf("//") + 2);
    String host = rest.split("[/?#:]", 2)[0];
    return !host.equals("localhost") && !host.isEmpty();
  }
}
