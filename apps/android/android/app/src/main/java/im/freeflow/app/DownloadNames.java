package im.freeflow.app;

/** File names the page hands us are user-typed upload names; make them safe to write. */
final class DownloadNames {
  private DownloadNames() {}

  static final String FALLBACK = "download";
  static final int MAX_LENGTH = 200;

  /**
   * Strips path separators and control characters, collapses whitespace,
   * trims leading dots (no hidden files) and length, and falls back to a
   * plain name when nothing usable is left. Keeps the extension the user
   * gave; MediaStore adds none of its own.
   */
  static String safe(String name) {
    if (name == null) return FALLBACK;
    String s = name.replaceAll("[\\\\/\\p{Cntrl}]", "").replaceAll("\\s+", " ");
    // Leading dots and blanks go together, repeatedly: " . . " must not
    // survive as "." — the loop-once version did exactly that.
    s = s.replaceAll("^[.\\s]+", "").trim();
    if (s.length() > MAX_LENGTH) s = s.substring(0, MAX_LENGTH).trim();
    return s.isEmpty() ? FALLBACK : s;
  }
}
