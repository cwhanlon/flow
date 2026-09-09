package im.freeflow.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class PopupPolicyTest {

  @Test
  public void handsWebPopupsToTheBrowser() {
    assertTrue(PopupPolicy.shouldOpenExternally("https://docs.example.com/page?x=1"));
    assertTrue(PopupPolicy.shouldOpenExternally("http://192.168.86.20:8787/join/acme/tok"));
    assertTrue(PopupPolicy.shouldOpenExternally("  HTTPS://Example.com  "));
  }

  @Test
  public void neverHandsOverOurOwnOriginOrNonWebSchemes() {
    assertFalse(PopupPolicy.shouldOpenExternally("https://localhost/"));
    assertFalse(PopupPolicy.shouldOpenExternally("https://localhost:443/x"));
    assertFalse(PopupPolicy.shouldOpenExternally("capacitor://localhost/x"));
    assertFalse(PopupPolicy.shouldOpenExternally("about:blank"));
    assertFalse(PopupPolicy.shouldOpenExternally("javascript:void(0)"));
    assertFalse(PopupPolicy.shouldOpenExternally("https://"));
    assertFalse(PopupPolicy.shouldOpenExternally(""));
    assertFalse(PopupPolicy.shouldOpenExternally(null));
  }

  @Test
  public void huddleNotificationTextIsTidyAndBounded() {
    assertEquals(HuddleService.DEFAULT_TEXT, HuddleService.notificationText(null));
    assertEquals(HuddleService.DEFAULT_TEXT, HuddleService.notificationText("   "));
    assertEquals("Huddle in #general", HuddleService.notificationText("  Huddle  in\n#general "));
    String longTitle = new String(new char[80]).replace('\0', 'x');
    String text = HuddleService.notificationText(longTitle);
    assertEquals(60, text.length());
    assertTrue(text.endsWith("…"));
  }
}
