package com.caviot.studio;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import java.nio.charset.StandardCharsets;
import org.junit.Test;

public class TemplateKindsTest {
    private static byte[] binaryStl(int triangles) {
        byte[] b = new byte[512];
        b[80] = (byte) triangles; b[81] = (byte) (triangles >> 8);
        return b;
    }

    @Test public void keepsKnownExtensions() {
        assertEquals("sleeve.STL", TemplateKinds.nameWithExtension("sleeve.STL", new byte[0], 0, 0));
        assertEquals("a.obj", TemplateKinds.nameWithExtension("a.obj", new byte[0], 0, 0));
        assertEquals("a.3mf", TemplateKinds.nameWithExtension("a.3mf", new byte[0], 0, 0));
    }

    @Test public void sniffsBinaryStlWithoutExtension() {
        assertEquals("download.stl", TemplateKinds.nameWithExtension("download", binaryStl(10), 512, 84 + 10 * 50));
        assertNull(TemplateKinds.nameWithExtension("download", binaryStl(10), 512, 9999));
    }

    @Test public void sniffsAsciiStlObjAnd3mf() {
        byte[] ascii = "solid x\n facet normal 0 0 1\n".getBytes(StandardCharsets.US_ASCII);
        assertEquals("x.stl", TemplateKinds.nameWithExtension("x.bin", ascii, ascii.length, ascii.length));
        byte[] obj = "# scan\nv 0 0 0\nv 1 0 0\n".getBytes(StandardCharsets.US_ASCII);
        assertEquals("scan.obj", TemplateKinds.nameWithExtension("scan", obj, obj.length, obj.length));
        byte[] zip = { 'P', 'K', 3, 4, 0, 0 };
        assertEquals("m.3mf", TemplateKinds.nameWithExtension("m", zip, zip.length, 6));
    }

    @Test public void refusesOtherFiles() {
        byte[] png = { (byte) 0x89, 'P', 'N', 'G', 0, 0, 0, 0 };
        assertNull(TemplateKinds.nameWithExtension("photo.png", png, png.length, 8));
        assertNull(TemplateKinds.nameWithExtension("x", new byte[2], 2, 2));
    }
}
