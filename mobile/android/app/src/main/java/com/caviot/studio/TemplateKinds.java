package com.caviot.studio;

import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * Decides whether an opened file is a template Caviot can read. Android file managers often send
 * STL as application/octet-stream and sometimes drop the extension, so the first bytes are checked too.
 * Pure Java, no Android types, so it is unit tested on the JVM (app/src/test).
 */
final class TemplateKinds {
    private TemplateKinds() {}

    /** Returns the name to load (with a .stl/.obj/.3mf extension), or null if it is not a template. */
    static String nameWithExtension(String name, byte[] head, int headLen, long size) {
        String safe = name == null || name.isEmpty() ? "template" : name;
        String lower = safe.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".stl") || lower.endsWith(".obj") || lower.endsWith(".3mf")) return safe;
        String sniffed = sniff(head, headLen, size);
        if (sniffed == null) return null;
        int dot = safe.lastIndexOf('.');
        String base = dot > 0 ? safe.substring(0, dot) : safe;
        return base + "." + sniffed;
    }

    static String sniff(byte[] head, int headLen, long size) {
        if (head == null || headLen < 4) return null;
        if (head[0] == 'P' && head[1] == 'K' && head[2] == 3 && head[3] == 4) return "3mf";
        if (headLen >= 84 && size >= 84) {
            long count = (head[80] & 0xffL) | ((head[81] & 0xffL) << 8) | ((head[82] & 0xffL) << 16) | ((head[83] & 0xffL) << 24);
            if (count > 0 && size == 84 + count * 50) return "stl";
        }
        String text = new String(head, 0, headLen, StandardCharsets.ISO_8859_1).trim();
        if (text.startsWith("solid") && text.contains("facet")) return "stl";
        for (String line : text.split("\n")) {
            String t = line.trim();
            if (t.startsWith("v ") || t.startsWith("vn ") || t.startsWith("f ")) return "obj";
        }
        return null;
    }
}
