package com.caviot.studio;

import android.app.Activity;
import android.app.ActivityManager;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.util.Log;
import android.view.Display;
import android.view.Window;
import android.view.WindowManager;

import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileWriter;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Same JS name and core methods as the iOS plugin, plus Android-only export folder and frame rate. */
@CapacitorPlugin(name = "CaviotNative")
public class CaviotNativePlugin extends Plugin implements OpenedFiles.Listener {
    private static final String PREFS = "caviot";
    private static final String KEY_FOLDER = "exportFolder";
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private String pendingExportPath;
    private String pendingExportName;

    @Override
    public void load() {
        OpenedFiles.setListener(this);
        if (smoke()) {
            appendSmoke("{\"stage\":\"launch\",\"native\":true,\"platform\":\"android\",\"at\":" + System.currentTimeMillis() + "}");
        }
    }

    @Override
    protected void handleOnDestroy() { OpenedFiles.setListener(null); }

    @Override public void onFilesReady() { notifyListeners("templateFileReady", new JSObject()); }

    @Override public void onShortcut(String action) {
        JSObject data = new JSObject();
        data.put("action", action);
        notifyListeners("shortcut", data);
    }

    private boolean smoke() {
        Activity a = getActivity();
        return a != null && a.getIntent() != null && a.getIntent().getBooleanExtra("caviotSmoke", false);
    }

    @PluginMethod
    public void getLaunchFlags(PluginCall call) {
        ActivityManager am = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
        ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
        am.getMemoryInfo(mi);
        JSObject r = new JSObject();
        r.put("smoke", smoke());
        r.put("platform", "android");
        r.put("availableMemory", mi.availMem);
        r.put("physicalMemory", mi.totalMem);
        r.put("memoryClassMb", am.getLargeMemoryClass());
        r.put("lowRamDevice", am.isLowRamDevice());
        r.put("maxRefreshRate", maxRefreshRate());
        r.put("sdk", Build.VERSION.SDK_INT);
        r.put("exportFolder", folderLabel());
        call.resolve(r);
    }

    @PluginMethod
    public void report(PluginCall call) {
        String json = call.getString("json", "{}");
        Log.i("CAVIOT_SMOKE", json);
        appendSmoke(json);
        call.resolve();
    }

    private void appendSmoke(String json) {
        try (FileWriter w = new FileWriter(new File(getContext().getFilesDir(), "caviot-smoke.jsonl"), true)) {
            w.write(json + "\n");
        } catch (Exception e) { Log.w("CAVIOT_SMOKE", "write", e); }
    }

    @PluginMethod
    public void takePendingFiles(PluginCall call) {
        JSArray files = new JSArray();
        for (String[] f : OpenedFiles.take()) {
            JSObject o = new JSObject();
            o.put("path", f[0]);
            o.put("name", f[1]);
            if (!f[2].isEmpty()) o.put("error", f[2]);
            files.put(o);
        }
        JSArray shortcuts = new JSArray();
        for (String s : OpenedFiles.takeShortcuts()) shortcuts.put(s);
        JSObject r = new JSObject();
        r.put("files", files);
        r.put("shortcuts", shortcuts);
        call.resolve(r);
    }

    // ---------- Frame rate: ask for the panel's top rate only while a finger is on the model ----------

    private float maxRefreshRate() {
        Activity a = getActivity();
        if (a == null) return 60f;
        Display d = Build.VERSION.SDK_INT >= 30 ? a.getDisplay() : a.getWindowManager().getDefaultDisplay();
        if (d == null) return 60f;
        float best = d.getRefreshRate();
        if (Build.VERSION.SDK_INT >= 23) for (Display.Mode m : d.getSupportedModes()) best = Math.max(best, m.getRefreshRate());
        return best;
    }

    @PluginMethod
    public void setHighRefresh(PluginCall call) {
        final boolean high = Boolean.TRUE.equals(call.getBoolean("high", false));
        final Activity a = getActivity();
        if (a == null || Build.VERSION.SDK_INT < 23) { call.resolve(); return; }
        a.runOnUiThread(() -> {
            Window w = a.getWindow();
            WindowManager.LayoutParams lp = w.getAttributes();
            Display d = Build.VERSION.SDK_INT >= 30 ? a.getDisplay() : a.getWindowManager().getDefaultDisplay();
            int modeId = 0;
            float rate = 0f;
            if (high && d != null) {
                Display.Mode cur = d.getMode();
                for (Display.Mode m : d.getSupportedModes()) {
                    if (m.getPhysicalWidth() == cur.getPhysicalWidth() && m.getPhysicalHeight() == cur.getPhysicalHeight()
                            && m.getRefreshRate() > rate) { rate = m.getRefreshRate(); modeId = m.getModeId(); }
                }
            }
            lp.preferredDisplayModeId = modeId; // 0 = let the system pick (saves battery when idle)
            lp.preferredRefreshRate = rate;
            w.setAttributes(lp);
            JSObject r = new JSObject();
            r.put("rate", rate);
            call.resolve(r);
        });
    }

    // ---------- Exports: a remembered folder (Storage Access Framework), Save as, or Share ----------

    private SharedPreferences prefs() { return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    private Uri folderUri() {
        String s = prefs().getString(KEY_FOLDER, null);
        if (s == null) return null;
        Uri u = Uri.parse(s);
        for (android.content.UriPermission p : getContext().getContentResolver().getPersistedUriPermissions()) {
            if (p.getUri().equals(u) && p.isWritePermission()) return u;
        }
        prefs().edit().remove(KEY_FOLDER).apply();
        return null;
    }

    private String folderLabel() {
        Uri u = folderUri();
        if (u == null) return null;
        DocumentFile f = DocumentFile.fromTreeUri(getContext(), u);
        String n = f != null ? f.getName() : null;
        return n != null ? n : "your folder";
    }

    /** path: absolute file in cache written by the page; name; mime. */
    @PluginMethod
    public void saveExport(PluginCall call) {
        String path = call.getString("path");
        String name = call.getString("name", "caviot-export.stl");
        if (path == null || !new File(path).isFile()) { call.reject("The export file is missing."); return; }
        pendingExportPath = path;
        pendingExportName = name;
        Uri folder = folderUri();
        if (folder != null && !Boolean.TRUE.equals(call.getBoolean("ask", false))) { writeIntoFolder(call, folder); return; }
        final Activity a = getActivity();
        a.runOnUiThread(() -> {
            String[] items = folder != null
                ? new String[] { "Save to “" + folderLabel() + "”", "Save as…", "Change export folder…", "Share…" }
                : new String[] { "Save as…", "Always save to a folder…", "Share…" };
            new AlertDialog.Builder(a)
                .setTitle("Save " + name)
                .setItems(items, (dlg, which) -> {
                    String choice = items[which];
                    if (choice.startsWith("Save to")) writeIntoFolder(call, folder);
                    else if (choice.startsWith("Save as")) createDocument(call, name, call.getString("mime", "application/octet-stream"));
                    else if (choice.startsWith("Always") || choice.startsWith("Change")) pickFolder(call);
                    else { JSObject r = new JSObject(); r.put("action", "share"); call.resolve(r); }
                })
                .setOnCancelListener(d -> { JSObject r = new JSObject(); r.put("cancelled", true); call.resolve(r); })
                .show();
        });
    }

    @PluginMethod
    public void chooseExportFolder(PluginCall call) { pendingExportPath = null; pickFolder(call); }

    @PluginMethod
    public void pickTemplate(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        startActivityForResult(call, i, "onTemplatePicked");
    }

    @ActivityCallback
    private void onTemplatePicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            JSObject r = new JSObject(); r.put("cancelled", true); call.resolve(r); return;
        }
        OpenedFiles.receiveUri(getActivity(), result.getData().getData());
        call.resolve();
    }

    private void pickFolder(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        i.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivityForResult(call, i, "onFolderPicked");
    }

    @ActivityCallback
    private void onFolderPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            JSObject r = new JSObject(); r.put("cancelled", true); call.resolve(r); return;
        }
        Uri tree = data.getData();
        try {
            getContext().getContentResolver().takePersistableUriPermission(tree,
                Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        } catch (SecurityException e) { call.reject("Android did not allow Caviot to keep using that folder."); return; }
        prefs().edit().putString(KEY_FOLDER, tree.toString()).apply();
        if (pendingExportPath != null) writeIntoFolder(call, tree);
        else { JSObject r = new JSObject(); r.put("folder", folderLabel()); call.resolve(r); }
    }

    private void createDocument(PluginCall call, String name, String mime) {
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType(mime);
        i.putExtra(Intent.EXTRA_TITLE, name);
        startActivityForResult(call, i, "onDocumentCreated");
    }

    @ActivityCallback
    private void onDocumentCreated(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            JSObject r = new JSObject(); r.put("cancelled", true); call.resolve(r); return;
        }
        final Uri target = data.getData();
        io.execute(() -> copyTo(call, target, "picked", null));
    }

    private void writeIntoFolder(PluginCall call, Uri tree) {
        io.execute(() -> {
            DocumentFile dir = DocumentFile.fromTreeUri(getContext(), tree);
            if (dir == null || !dir.canWrite()) { call.reject("Caviot can no longer write to that folder. Pick it again."); return; }
            String name = pendingExportName;
            DocumentFile existing = dir.findFile(name);
            if (existing != null) {
                int dot = name.lastIndexOf('.');
                String base = dot > 0 ? name.substring(0, dot) : name, ext = dot > 0 ? name.substring(dot) : "";
                for (int n = 2; n < 1000 && dir.findFile(name) != null; n++) name = base + "-" + n + ext;
            }
            DocumentFile f = dir.createFile("application/octet-stream", name);
            if (f == null) { call.reject("Could not create the file in that folder."); return; }
            copyTo(call, f.getUri(), "folder", dir.getName());
        });
    }

    private void copyTo(PluginCall call, Uri target, String where, String folderName) {
        File src = new File(pendingExportPath);
        try (InputStream in = new FileInputStream(src);
             OutputStream out = getContext().getContentResolver().openOutputStream(target, "wt")) {
            if (out == null) throw new IllegalStateException("no output stream");
            byte[] buf = new byte[512 * 1024];
            int n;
            long total = 0;
            while ((n = in.read(buf)) > 0) { out.write(buf, 0, n); total += n; }
            if (total != src.length()) throw new IllegalStateException("short write");
            JSObject r = new JSObject();
            r.put("saved", true);
            r.put("where", where);
            r.put("bytes", total);
            if (folderName != null) r.put("folder", folderName);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Could not save the export: " + e.getMessage());
        } finally {
            //noinspection ResultOfMethodCallIgnored
            src.delete();
        }
    }
}
