package com.caviot.studio;

import android.app.Activity;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * "Open with Caviot" and "Share to Caviot" for STL, OBJ and 3MF.
 * Android hands us a content:// URI that is only readable while the grant lasts, so the bytes are
 * copied into cache/caviot-open on a background thread. The page then loads the copy as the sleeve
 * template through the same importTemplateFile() path the iPhone app and the website use.
 */
final class OpenedFiles {
    static final String TAG = "CaviotOpen";
    static final String ACTION_PICK_TEMPLATE = "com.caviot.studio.PICK_TEMPLATE";
    static final String ACTION_EXPORT_FOLDER = "com.caviot.studio.EXPORT_FOLDER";
    static final long MAX_BYTES = 100L * 1024 * 1024;

    interface Listener { void onFilesReady(); void onShortcut(String action); }

    private static final List<String[]> pending = new ArrayList<>();
    private static final List<String> pendingShortcuts = new ArrayList<>();
    private static final ExecutorService io = Executors.newSingleThreadExecutor();
    private static Listener listener;

    private OpenedFiles() {}

    static synchronized void setListener(Listener l) { listener = l; }

    static synchronized List<String[]> take() {
        List<String[]> out = new ArrayList<>(pending);
        pending.clear();
        return out;
    }

    static synchronized List<String> takeShortcuts() {
        List<String> out = new ArrayList<>(pendingShortcuts);
        pendingShortcuts.clear();
        return out;
    }

    static void receive(Activity activity, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (ACTION_PICK_TEMPLATE.equals(action) || ACTION_EXPORT_FOLDER.equals(action)) {
            Listener l;
            synchronized (OpenedFiles.class) { pendingShortcuts.add(action); l = listener; }
            if (l != null) l.onShortcut(action);
            intent.setAction(Intent.ACTION_MAIN);
            return;
        }
        Set<Uri> uris = new LinkedHashSet<>();
        if (Intent.ACTION_VIEW.equals(action) && intent.getData() != null) uris.add(intent.getData());
        if (Intent.ACTION_SEND.equals(action) || Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            Uri one = streamExtra(intent);
            if (one != null) uris.add(one);
            ArrayList<Uri> many = streamListExtra(intent);
            if (many != null) uris.addAll(many);
            ClipData clip = intent.getClipData();
            if (clip != null) for (int i = 0; i < clip.getItemCount(); i++) {
                Uri u = clip.getItemAt(i).getUri();
                if (u != null) uris.add(u);
            }
        }
        if (uris.isEmpty()) return;
        // Consume the intent so a rotation or process restore does not import the same file twice.
        intent.setAction(Intent.ACTION_MAIN);
        intent.setData(null);
        final ContentResolver resolver = activity.getContentResolver();
        final File dir = new File(activity.getCacheDir(), "caviot-open");
        for (final Uri uri : uris) io.execute(() -> copy(resolver, dir, uri));
    }

    static void receiveUri(Activity activity, Uri uri) {
        final ContentResolver resolver = activity.getContentResolver();
        final File dir = new File(activity.getCacheDir(), "caviot-open");
        io.execute(() -> copy(resolver, dir, uri));
    }

    @SuppressWarnings("deprecation")
    private static Uri streamExtra(Intent intent) {
        if (Build.VERSION.SDK_INT >= 33) return intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class);
        Object value = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        return value instanceof Uri ? (Uri) value : null;
    }

    @SuppressWarnings("deprecation")
    private static ArrayList<Uri> streamListExtra(Intent intent) {
        try {
            if (Build.VERSION.SDK_INT >= 33) return intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri.class);
            return intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
        } catch (ClassCastException e) {
            return null;
        }
    }

    private static void copy(ContentResolver resolver, File dir, Uri uri) {
        String name = displayName(resolver, uri);
        File target = null;
        try {
            if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("cache folder");
            byte[] head = new byte[512];
            int headLen;
            target = new File(dir, UUID.randomUUID() + ".part");
            long total = 0;
            try (InputStream in = resolver.openInputStream(uri); OutputStream out = new FileOutputStream(target)) {
                if (in == null) throw new IllegalStateException("no stream");
                byte[] buf = new byte[256 * 1024];
                int n;
                headLen = 0;
                while ((n = in.read(buf)) > 0) {
                    if (headLen < head.length) {
                        int take = Math.min(n, head.length - headLen);
                        System.arraycopy(buf, 0, head, headLen, take);
                        headLen += take;
                    }
                    total += n;
                    if (total > MAX_BYTES) throw new IllegalStateException("larger than 100 MB");
                    out.write(buf, 0, n);
                }
            }
            String fixed = TemplateKinds.nameWithExtension(name, head, headLen, total);
            if (fixed == null) {
                deliver(new String[] { "", name, "Caviot opens STL, OBJ and 3MF files as sleeve templates. This file is not one of those." });
                target.delete();
                return;
            }
            File finalFile = new File(dir, UUID.randomUUID() + "-" + fixed);
            if (!target.renameTo(finalFile)) throw new IllegalStateException("rename");
            deliver(new String[] { finalFile.getAbsolutePath(), fixed, "" });
        } catch (Exception e) {
            Log.w(TAG, "Could not read " + uri, e);
            if (target != null) target.delete();
            deliver(new String[] { "", name, "Could not read the file: " + e.getMessage() });
        }
    }

    private static void deliver(String[] entry) {
        Listener l;
        synchronized (OpenedFiles.class) {
            pending.add(entry);
            l = listener;
        }
        if (l != null) l.onFilesReady();
    }

    private static String displayName(ContentResolver resolver, Uri uri) {
        String name = null;
        if ("content".equals(uri.getScheme())) {
            try (Cursor c = resolver.query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
                if (c != null && c.moveToFirst() && !c.isNull(0)) name = c.getString(0);
            } catch (Exception ignored) { }
        }
        if (name == null) name = uri.getLastPathSegment();
        if (name == null) name = "template";
        name = name.substring(name.lastIndexOf('/') + 1).replaceAll("[^A-Za-z0-9._ -]+", "_").trim();
        if (name.isEmpty()) name = "template";
        if (name.length() > 100) name = name.substring(name.length() - 100);
        return name.toLowerCase(Locale.ROOT).equals(name) ? name : name;
    }
}
