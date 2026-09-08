package im.freeflow.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class DeepLinksTest {

  @Test
  public void recognisesTheSchemeAndTheServersOwnPages() {
    assertTrue(DeepLinks.isFlowLink("flow://signin?code=abc"));
    assertTrue(DeepLinks.isFlowLink("FLOW://invite/tok"));
    assertTrue(DeepLinks.isFlowLink("https://app.freeflow.im/join/acme/tok"));
    assertTrue(DeepLinks.isFlowLink("https://app.freeflow.im/invite/tok"));
    assertTrue(DeepLinks.isFlowLink("http://192.168.86.20:8787/join/acme/tok"));
  }

  @Test
  public void leavesEveryOtherLinkToTheBrowser() {
    assertFalse(DeepLinks.isFlowLink("https://app.freeflow.im/"));
    assertFalse(DeepLinks.isFlowLink("https://app.freeflow.im/download/mac"));
    assertFalse(DeepLinks.isFlowLink("https://app.freeflow.im"));
    assertFalse(DeepLinks.isFlowLink("mailto:x@y"));
    assertFalse(DeepLinks.isFlowLink(""));
    assertFalse(DeepLinks.isFlowLink(null));
  }

  @Test
  public void embedsTheUrlAsAStringLiteralNothingCanEscape() {
    assertEquals("\"flow://signin?code=abc\"", DeepLinks.jsonString("flow://signin?code=abc"));
    assertEquals("\"a\\\"b\\\\c\\nd\"", DeepLinks.jsonString("a\"b\\c\nd"));
    assertEquals("\"\\u003c/script>\"", DeepLinks.jsonString("</script>"));
    assertEquals("\"x\\u2028y\\u0001\"", DeepLinks.jsonString("x\u2028y\u0001"));
  }

  @Test
  public void probeCallsTheBridgeAndNeverThrows() {
    String js = DeepLinks.openUrlJs("flow://signin?code=1");
    assertTrue(js.contains("window.__flowOpenUrl(\"flow://signin?code=1\")"));
    assertTrue(js.contains("catch(e){return false;}"));
    assertTrue(js.startsWith("(function(){"));
    assertTrue(js.endsWith("})()"));
  }
}
