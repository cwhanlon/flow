package im.freeflow.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class DownloadPolicyTest {

  @Test
  public void handsHttpAndHttpsToDownloadManager() {
    assertTrue(DownloadPolicy.isDownloadable("https://objects.example/file.pdf?sig=1"));
    assertTrue(DownloadPolicy.isDownloadable("http://192.168.86.20:8787/v1/files/x"));
    assertTrue(DownloadPolicy.isDownloadable("  HTTPS://Objects.Example/File.PDF"));
  }

  @Test
  public void dropsWhatDownloadManagerCannotFetch() {
    assertFalse(DownloadPolicy.isDownloadable("blob:https://localhost/3f2a-…"));
    assertFalse(DownloadPolicy.isDownloadable("data:application/pdf;base64,AAAA"));
    assertFalse(DownloadPolicy.isDownloadable("capacitor://localhost/x"));
    assertFalse(DownloadPolicy.isDownloadable("javascript:alert(1)"));
    assertFalse(DownloadPolicy.isDownloadable(""));
    assertFalse(DownloadPolicy.isDownloadable(null));
  }
}
