package io.github.oalwyn.weekendfetch;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

/**
 * "Share our weekend" → Instagram Stories (Meta's Sharing to Stories): opens Instagram's Story editor with the card as
 * the background. The person edits and posts there; nothing is posted for them. The event link is put on the clipboard
 * for Instagram's Link sticker. Same calls as the iPhone plugin (WFInstagramPlugin in ios/App/App/WFCalendarPlugin.swift).
 */
@CapacitorPlugin(name = "WFInstagram")
public class WFInstagramPlugin extends Plugin {
    private static final String ACTION = "com.instagram.share.ADD_TO_STORY";

    private Intent storyIntent(Uri uri, String appId) {
        Intent i = new Intent(ACTION);
        if (uri != null) i.setDataAndType(uri, "image/jpeg");
        i.putExtra("source_application", appId);
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        return i;
    }

    @PluginMethod
    public void available(PluginCall call) {
        Activity a = getActivity();
        Intent i = new Intent(ACTION);
        i.setType("image/jpeg");
        JSObject r = new JSObject();
        r.put("available", a != null && a.getPackageManager().resolveActivity(i, 0) != null);
        call.resolve(r);
    }

    @PluginMethod
    public void shareToStory(PluginCall call) {
        Activity a = getActivity();
        String appId = call.getString("appId", "");
        String path = call.getString("path", "");
        if (a == null || appId.isEmpty() || path.isEmpty()) { call.reject("missing image or app id", "BAD_INPUT"); return; }
        try {
            File f = new File(Uri.parse(path).getPath());
            Uri uri = FileProvider.getUriForFile(a, a.getPackageName() + ".fileprovider", f);
            Intent i = storyIntent(uri, appId);
            if (a.getPackageManager().resolveActivity(i, 0) == null) { call.reject("Instagram isn't installed", "NOT_INSTALLED"); return; }
            String link = call.getString("link", "");
            if (!link.isEmpty()) {
                ClipboardManager cm = (ClipboardManager) a.getSystemService(Context.CLIPBOARD_SERVICE);
                if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("Event link", link));
            }
            a.grantUriPermission("com.instagram.android", uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            a.startActivity(i);
            JSObject r = new JSObject();
            r.put("opened", true);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("couldn't open Instagram", "FAILED", e);
        }
    }
}
