// Skyke3D — launcher. Copyright (C) 2026 Noturno-Strange · SPDX-License-Identifier: GPL-3.0-only
package skyke3d.launcher;

import java.awt.Color;
import java.awt.Font;
import java.awt.FontFormatException;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.io.IOException;
import java.io.InputStream;

/** Cores e fontes da tela inicial do jogo (assets/app.css, #intro e .iBtn), para o launcher ter a mesma cara. */
final class Theme {
    private Theme() {}

    static final Color BG = new Color(0x0d0a14);
    static final Color PANEL = new Color(0x17121f);
    static final Color FG = new Color(0xf5ede0);
    static final Color FG_DIM = new Color(245, 237, 224, 160);
    static final Color FG_FAINT = new Color(245, 237, 224, 105);
    static final Color ORANGE = new Color(0xffb23e);
    static final Color CORAL = new Color(0xff8a5e);
    static final Color PINK = new Color(0xff5ea8);
    static final Color SKY = new Color(0x5bd6ff);
    static final Color INK = new Color(0x1a1208);
    static final Color GLASS = new Color(255, 255, 255, 20); // #ffffff14
    static final Color GLASS_HI = new Color(255, 255, 255, 34);
    static final Color LINE = new Color(255, 255, 255, 51); // #ffffff33
    static final Color LINE_SOFT = new Color(255, 255, 255, 31);
    static final Color OK = new Color(0x7ad06a);
    static final Color ERR = new Color(0xff6b6b);

    static final Font REGULAR = load("manrope-medium.ttf", Font.PLAIN);
    static final Font BOLD = load("manrope-bold.ttf", Font.BOLD);
    static final Font BLACK = load("manrope-extrabold.ttf", Font.BOLD);

    private static Font load(String name, int fallbackStyle) {
        try (InputStream in = Theme.class.getResourceAsStream("/skyke3d/launcher/" + name)) {
            if (in != null) return Font.createFont(Font.TRUETYPE_FONT, in).deriveFont(14f);
        } catch (IOException | FontFormatException e) {
            // cai para a fonte do sistema
        }
        return new Font(Font.SANS_SERIF, fallbackStyle, 14);
    }

    static Graphics2D smooth(java.awt.Graphics g) {
        Graphics2D g2 = (Graphics2D) g.create();
        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g2.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        g2.setRenderingHint(RenderingHints.KEY_FRACTIONALMETRICS, RenderingHints.VALUE_FRACTIONALMETRICS_ON);
        g2.setRenderingHint(RenderingHints.KEY_STROKE_CONTROL, RenderingHints.VALUE_STROKE_PURE);
        g2.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        return g2;
    }

    static Color alpha(Color c, int a) {
        return new Color(c.getRed(), c.getGreen(), c.getBlue(), Math.max(0, Math.min(255, a)));
    }
}
