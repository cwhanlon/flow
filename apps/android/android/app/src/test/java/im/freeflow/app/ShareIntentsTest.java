package im.freeflow.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.Collections;
import org.junit.Test;

public class ShareIntentsTest {

  @Test
  public void onlyTheTwoShareActionsCount() {
    assertTrue(ShareIntents.isShare("android.intent.action.SEND"));
    assertTrue(ShareIntents.isShare("android.intent.action.SEND_MULTIPLE"));
    assertFalse(ShareIntents.isShare("android.intent.action.VIEW"));
    assertFalse(ShareIntents.isShare("android.intent.action.MAIN"));
    assertFalse(ShareIntents.isShare(null));
  }

  @Test
  public void aBrowserShareIsSubjectAndText() {
    String json = ShareIntents.payloadJson("https://example.com/a", "Example", Collections.emptyList());
    assertEquals("{\"text\":\"https://example.com/a\",\"subject\":\"Example\",\"files\":[]}", json);
  }

  @Test
  public void filesCarryWhatTheProviderSaid() {
    ShareIntents.Item photo = new ShareIntents.Item("content://media/external/images/1", "IMG_1.jpg", "image/jpeg", 1234);
    ShareIntents.Item unknown = new ShareIntents.Item("content://docs/7", null, null, -5);
    String json = ShareIntents.payloadJson(null, null, Arrays.asList(photo, unknown));
    assertEquals(
        "{\"text\":null,\"subject\":null,\"files\":["
            + "{\"uri\":\"content://media/external/images/1\",\"name\":\"IMG_1.jpg\",\"mimeType\":\"image/jpeg\",\"size\":1234},"
            + "{\"uri\":\"content://docs/7\",\"name\":\"\",\"mimeType\":\"\",\"size\":-1}]}",
        json);
  }

  @Test
  public void onlyGrantedContentUrisAreCarried() {
    ShareIntents.Item file = new ShareIntents.Item("file:///sdcard/x.txt", "x.txt", "text/plain", 3);
    ShareIntents.Item web = new ShareIntents.Item("https://example.com/x.pdf", "x.pdf", "application/pdf", 3);
    assertNull(ShareIntents.payloadJson("", " ", Arrays.asList(file, web, null)));
    assertEquals(
        "{\"text\":\"hi\",\"subject\":null,\"files\":[]}",
        ShareIntents.payloadJson("hi", null, Arrays.asList(file, web)));
  }

  @Test
  public void nothingToShareIsNull() {
    assertNull(ShareIntents.payloadJson(null, null, null));
    assertNull(ShareIntents.payloadJson("   ", "Subject alone", Collections.emptyList()));
  }

  @Test
  public void textIsAStringLiteralNothingCanEscape() {
    String json = ShareIntents.payloadJson("a\"b</script>\n", null, null);
    assertEquals("{\"text\":\"a\\\"b\\u003c/script>\\n\",\"subject\":null,\"files\":[]}", json);
  }

  @Test
  public void probeParsesThePayloadInsideThePage() {
    String js = ShareIntents.openShareJs("{\"text\":\"x\"}");
    assertTrue(js.startsWith("(function(){try{return typeof window.__flowShare==='function'&&window.__flowShare(JSON.parse("));
    assertTrue(js.contains("\"{\\\"text\\\":\\\"x\\\"}\""));
    assertTrue(js.endsWith("))===true;}catch(e){return false;}})()"));
  }
}
