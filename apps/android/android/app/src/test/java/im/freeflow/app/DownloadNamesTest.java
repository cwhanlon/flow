package im.freeflow.app;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class DownloadNamesTest {

  @Test
  public void keepsAnOrdinaryNameAndItsExtension() {
    assertEquals("Q3 report.pdf", DownloadNames.safe("Q3 report.pdf"));
    assertEquals("photo (1).jpeg", DownloadNames.safe("photo (1).jpeg"));
  }

  @Test
  public void stripsPathSeparatorsAndControlCharacters() {
    assertEquals("etcpasswd", DownloadNames.safe("../../etc/passwd"));
    assertEquals("ab.txt", DownloadNames.safe("ab.txt")); // a control character simply disappears
    assertEquals("dirfile.txt", DownloadNames.safe("dir\\file.txt"));
  }

  @Test
  public void collapsesWhitespaceAndHiddenFilePrefixes() {
    assertEquals("a b.txt", DownloadNames.safe("  a \t\n b.txt  "));
    assertEquals("bashrc", DownloadNames.safe("...bashrc"));
  }

  @Test
  public void fallsBackWhenNothingUsableIsLeft() {
    assertEquals(DownloadNames.FALLBACK, DownloadNames.safe(null));
    assertEquals(DownloadNames.FALLBACK, DownloadNames.safe(""));
    assertEquals(DownloadNames.FALLBACK, DownloadNames.safe("///"));
    assertEquals(DownloadNames.FALLBACK, DownloadNames.safe(" . . "));
  }

  @Test
  public void capsTheLength() {
    StringBuilder sb = new StringBuilder();
    for (int i = 0; i < 300; i++) sb.append('x');
    assertEquals(DownloadNames.MAX_LENGTH, DownloadNames.safe(sb.toString()).length());
  }
}
