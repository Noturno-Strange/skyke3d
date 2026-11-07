// Skyke3D — launcher. Copyright (C) 2026 Noturno-Strange · SPDX-License-Identifier: GPL-3.0-only
package skyke3d.launcher;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Cursor;
import java.awt.Dimension;
import java.awt.FontMetrics;
import java.awt.GradientPaint;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.Insets;
import java.awt.LinearGradientPaint;
import java.awt.event.FocusAdapter;
import java.awt.event.FocusEvent;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import java.awt.font.TextLayout;
import java.awt.geom.Path2D;
import java.awt.geom.RoundRectangle2D;

import javax.swing.JButton;
import javax.swing.JCheckBox;
import javax.swing.JComponent;
import javax.swing.JPanel;
import javax.swing.JTextField;
import javax.swing.border.EmptyBorder;

/** Componentes desenhados à mão com o visual da tela inicial do jogo (.iBtn, campos escuros, contorno laranja no foco). */
final class Ui {
    private Ui() {}

    enum Kind { PRIMARY, GLASS, CHIP, WINDOW }

    /** Desenha um ícone pequeno dentro de um quadrado de lado s, na cor atual. */
    interface Glyph {
        void paint(Graphics2D g, float x, float y, float s);
    }

    static final Glyph PLAY = (g, x, y, s) -> {
        Path2D.Float p = new Path2D.Float();
        p.moveTo(x + s * .18f, y + s * .08f);
        p.lineTo(x + s * .92f, y + s * .5f);
        p.lineTo(x + s * .18f, y + s * .92f);
        p.closePath();
        g.fill(p);
    };
    static final Glyph SIGNAL = (g, x, y, s) -> {
        float bw = s * .2f;
        for (int i = 0; i < 3; i++) {
            float bh = s * (.35f + .3f * i);
            g.fill(new RoundRectangle2D.Float(x + i * (bw + s * .14f), y + s - bh, bw, bh, bw * .6f, bw * .6f));
        }
    };
    static final Glyph STAR = (g, x, y, s) -> g.fill(sparkle(x + s / 2, y + s / 2, s / 2));
    static final Glyph CLOSE = (g, x, y, s) -> {
        g.setStroke(new BasicStroke(Math.max(1.6f, s * .14f), BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
        g.draw(new java.awt.geom.Line2D.Float(x + s * .2f, y + s * .2f, x + s * .8f, y + s * .8f));
        g.draw(new java.awt.geom.Line2D.Float(x + s * .8f, y + s * .2f, x + s * .2f, y + s * .8f));
    };
    static final Glyph MINIMIZE = (g, x, y, s) -> {
        g.setStroke(new BasicStroke(Math.max(1.6f, s * .14f), BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
        g.draw(new java.awt.geom.Line2D.Float(x + s * .2f, y + s * .55f, x + s * .8f, y + s * .55f));
    };

    /** Estrela de quatro pontas (o ✨ do logo). */
    static Path2D.Float sparkle(float cx, float cy, float r) {
        Path2D.Float p = new Path2D.Float();
        float k = r * .28f;
        p.moveTo(cx, cy - r);
        p.quadTo(cx + k * .3f, cy - k * .3f, cx + r, cy);
        p.quadTo(cx + k * .3f, cy + k * .3f, cx, cy + r);
        p.quadTo(cx - k * .3f, cy + k * .3f, cx - r, cy);
        p.quadTo(cx - k * .3f, cy - k * .3f, cx, cy - r);
        p.closePath();
        return p;
    }

    /** Botão no estilo .iBtn: laranja em degradê (Jogar), vidro (secundários), chip (servidores recentes) ou da janela. */
    static final class Button extends JButton {
        private static final long serialVersionUID = 1L;
        final Kind kind;
        private final transient Glyph glyph;
        private boolean closeHover;
        /** Chip com "×": chamado quando clicam no ×. */
        transient Runnable onClose;

        Button(String text, Kind kind, Glyph glyph) {
            super(text);
            this.kind = kind;
            this.glyph = glyph;
            setContentAreaFilled(false);
            setBorderPainted(false);
            setFocusPainted(false);
            setOpaque(false);
            setRolloverEnabled(true);
            setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
            float size = kind == Kind.PRIMARY ? 19f : kind == Kind.CHIP ? 12.5f : 14f;
            setFont((kind == Kind.PRIMARY ? Theme.BLACK : Theme.BOLD).deriveFont(size));
            setForeground(kind == Kind.PRIMARY ? Theme.INK : Theme.FG);
            MouseAdapter m = new MouseAdapter() {
                @Override
                public void mouseMoved(MouseEvent e) {
                    boolean h = onClose != null && e.getX() >= getWidth() - closeZone();
                    if (h != closeHover) { closeHover = h; repaint(); }
                }

                @Override
                public void mouseExited(MouseEvent e) {
                    closeHover = false;
                }

                @Override
                public void mouseReleased(MouseEvent e) {
                    if (onClose != null && e.getX() >= getWidth() - closeZone() && contains(e.getPoint())) {
                        getModel().setArmed(false); // não dispara a ação do chip
                        getModel().setPressed(false);
                        onClose.run();
                    }
                }
            };
            addMouseListener(m);
            addMouseMotionListener(m);
        }

        private int closeZone() {
            return 24;
        }

        @Override
        public Dimension getPreferredSize() {
            FontMetrics fm = getFontMetrics(getFont());
            int tw = getText().isEmpty() ? 0 : fm.stringWidth(getText());
            int gs = glyph == null ? 0 : (int) (fm.getAscent() * .72f);
            int gap = glyph != null && tw > 0 ? 9 : 0;
            switch (kind) {
                case PRIMARY: return new Dimension(Math.max(240, tw + gs + gap + 64), 54);
                case CHIP: return new Dimension(tw + gs + gap + 26 + (onClose != null ? 18 : 0), 30);
                case WINDOW: return new Dimension(34, 30);
                default: return new Dimension(tw + gs + gap + 36, 44);
            }
        }

        @Override
        public Dimension getMinimumSize() {
            return getPreferredSize();
        }

        @Override
        protected void paintComponent(Graphics g0) {
            Graphics2D g = Theme.smooth(g0);
            boolean hover = getModel().isRollover() && isEnabled(), press = getModel().isPressed();
            int w = getWidth(), h = getHeight();
            float lift = hover && !press && kind != Kind.WINDOW && kind != Kind.CHIP ? -1.5f : 0f;
            g.translate(0, lift);
            float arc = kind == Kind.CHIP ? h : kind == Kind.WINDOW ? 10 : 14;
            float pad = kind == Kind.PRIMARY ? 8 : 3; // espaço para o brilho e o contorno de foco
            RoundRectangle2D.Float shape = new RoundRectangle2D.Float(pad, pad, w - pad * 2, h - pad * 2 - Math.abs(lift), arc, arc);
            if (!isEnabled()) g.setComposite(java.awt.AlphaComposite.getInstance(java.awt.AlphaComposite.SRC_OVER, .55f));

            switch (kind) {
                case PRIMARY: {
                    // brilho (box-shadow: 0 8px 30px #ffb23e55)
                    for (int i = 8; i >= 1; i--) {
                        g.setColor(Theme.alpha(Theme.ORANGE, (hover ? 9 : 6)));
                        g.fill(new RoundRectangle2D.Float(pad - i, pad - i * .4f + 3, w - pad * 2 + i * 2, h - pad * 2 + i * 1.2f, arc + i, arc + i));
                    }
                    Color a = Theme.ORANGE, b = Theme.CORAL;
                    if (hover) { a = brighter(a); b = brighter(b); }
                    if (press) { a = a.darker(); b = b.darker(); }
                    g.setPaint(new GradientPaint(pad, 0, a, w - pad, 0, b));
                    g.fill(shape);
                    g.setColor(new Color(255, 255, 255, 60));
                    g.draw(new RoundRectangle2D.Float(pad + .5f, pad + .5f, w - pad * 2 - 1, h - pad * 2 - 1 - Math.abs(lift), arc, arc));
                    break;
                }
                case WINDOW: {
                    boolean close = glyph == CLOSE;
                    if (hover || press) {
                        g.setColor(close ? new Color(0xe5, 0x48, 0x4d, press ? 255 : 220) : Theme.GLASS_HI);
                        g.fill(shape);
                    }
                    break;
                }
                default: {
                    g.setColor(press ? Theme.alpha(Color.WHITE, 12) : hover ? Theme.GLASS_HI : Theme.GLASS);
                    g.fill(shape);
                    g.setColor(hover ? Theme.alpha(Color.WHITE, 80) : Theme.LINE);
                    g.draw(new RoundRectangle2D.Float(pad + .5f, pad + .5f, w - pad * 2 - 1, h - pad * 2 - 1, arc, arc));
                }
            }
            if (isFocusOwner() && kind != Kind.WINDOW) {
                g.setColor(Theme.ORANGE);
                g.setStroke(new BasicStroke(2f));
                g.draw(new RoundRectangle2D.Float(pad - 2.5f, pad - 2.5f, w - pad * 2 + 5, h - pad * 2 + 5 - Math.abs(lift), arc + 5, arc + 5));
            }

            // conteúdo: ícone + texto, centrado (no chip, alinhado à esquerda com o × no fim)
            FontMetrics fm = g.getFontMetrics(getFont());
            g.setFont(getFont());
            String text = getText();
            int tw = text.isEmpty() ? 0 : fm.stringWidth(text);
            float gs = kind == Kind.WINDOW ? 12 : glyph == null ? 0 : fm.getAscent() * .72f;
            float gap = glyph != null && tw > 0 ? 9 : 0;
            float total = tw + gs + gap;
            float x = kind == Kind.CHIP ? pad + 10 : (w - total) / 2f;
            float cy = (h - Math.abs(lift)) / 2f;
            g.setColor(getForeground());
            if (glyph != null) {
                Graphics2D gg = (Graphics2D) g.create();
                if (glyph == STAR) gg.setPaint(new GradientPaint(x, cy - gs / 2, Theme.ORANGE, x + gs, cy + gs / 2, Theme.PINK));
                if (kind == Kind.WINDOW && hover && glyph == CLOSE) gg.setColor(Color.WHITE);
                glyph.paint(gg, x, cy - gs / 2, gs);
                gg.dispose();
            }
            if (tw > 0) {
                TextLayout tl = new TextLayout(text, getFont(), g.getFontRenderContext());
                float ty = cy + (tl.getAscent() - tl.getDescent()) / 2f;
                g.drawString(text, x + gs + gap, ty);
            }
            if (onClose != null) {
                Graphics2D gc = (Graphics2D) g.create();
                gc.setColor(closeHover ? Theme.ERR : Theme.FG_FAINT);
                CLOSE.paint(gc, w - pad - 19, cy - 5, 10);
                gc.dispose();
            }
            g.dispose();
        }

        private static Color brighter(Color c) {
            return new Color(Math.min(255, (int) (c.getRed() * 1.06 + 8)), Math.min(255, (int) (c.getGreen() * 1.06 + 8)),
                    Math.min(255, (int) (c.getBlue() * 1.06 + 8)));
        }
    }

    /** Campo de texto escuro com cantos redondos, texto de exemplo e contorno laranja no foco. */
    static final class Field extends JTextField {
        private static final long serialVersionUID = 1L;
        private final String placeholder;

        Field(String placeholder) {
            this.placeholder = placeholder;
            setOpaque(false);
            setFont(Theme.BOLD.deriveFont(15f));
            setForeground(Theme.FG);
            setCaretColor(Theme.ORANGE);
            setSelectionColor(Theme.alpha(Theme.CORAL, 110));
            setSelectedTextColor(Theme.FG);
            setBorder(new EmptyBorder(11, 15, 11, 15));
            addFocusListener(new FocusAdapter() {
                @Override
                public void focusGained(FocusEvent e) {
                    repaint();
                }

                @Override
                public void focusLost(FocusEvent e) {
                    repaint();
                }
            });
            MouseAdapter hover = new MouseAdapter() {
                @Override
                public void mouseEntered(MouseEvent e) {
                    repaint();
                }

                @Override
                public void mouseExited(MouseEvent e) {
                    repaint();
                }
            };
            addMouseListener(hover);
        }

        @Override
        public Dimension getPreferredSize() {
            Dimension d = super.getPreferredSize();
            return new Dimension(d.width, Math.max(d.height, 46));
        }

        @Override
        protected void paintComponent(Graphics g0) {
            Graphics2D g = Theme.smooth(g0);
            int w = getWidth(), h = getHeight();
            RoundRectangle2D.Float r = new RoundRectangle2D.Float(1, 1, w - 2, h - 2, 14, 14);
            g.setColor(new Color(0x0d, 0x0a, 0x14, 170));
            g.fill(r);
            g.setColor(Theme.GLASS);
            g.fill(r);
            boolean hover = getMousePosition() != null;
            g.setStroke(new BasicStroke(isFocusOwner() ? 2f : 1f));
            g.setColor(isFocusOwner() ? Theme.ORANGE : hover ? Theme.alpha(Color.WHITE, 80) : Theme.LINE);
            g.draw(isFocusOwner() ? new RoundRectangle2D.Float(1.5f, 1.5f, w - 3, h - 3, 14, 14) : new RoundRectangle2D.Float(.5f, .5f, w - 1, h - 1, 14, 14));
            if (getText().isEmpty() && placeholder != null) {
                g.setFont(Theme.REGULAR.deriveFont(15f));
                g.setColor(Theme.FG_FAINT);
                Insets in = getInsets();
                FontMetrics fm = g.getFontMetrics();
                g.drawString(placeholder, in.left, (h - fm.getHeight()) / 2 + fm.getAscent());
            }
            g.dispose();
            super.paintComponent(g0);
        }
    }

    /** Chave liga/desliga com texto (no lugar do checkbox). */
    static final class Toggle extends JCheckBox {
        private static final long serialVersionUID = 1L;

        Toggle(String text) {
            super(text);
            setOpaque(false);
            setFocusPainted(false);
            setBorderPainted(false);
            setContentAreaFilled(false);
            setRolloverEnabled(true);
            setFont(Theme.BOLD.deriveFont(13.5f));
            setForeground(Theme.FG);
            setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
            setBorder(new EmptyBorder(4, 2, 4, 2));
            setIcon(new javax.swing.Icon() {
                @Override
                public void paintIcon(java.awt.Component c, Graphics g0, int x, int y) {
                    Graphics2D g = Theme.smooth(g0);
                    boolean on = isSelected();
                    RoundRectangle2D.Float track = new RoundRectangle2D.Float(x + 1, y + 1, 38, 22, 22, 22);
                    if (on) g.setPaint(new GradientPaint(x, 0, Theme.ORANGE, x + 40, 0, Theme.CORAL));
                    else g.setColor(getModel().isRollover() ? Theme.GLASS_HI : Theme.GLASS);
                    if (!isEnabled()) g.setComposite(java.awt.AlphaComposite.getInstance(java.awt.AlphaComposite.SRC_OVER, .45f));
                    g.fill(track);
                    g.setColor(on ? new Color(255, 255, 255, 70) : Theme.LINE);
                    g.draw(track);
                    float kx = on ? x + 19 : x + 4;
                    g.setColor(on ? Theme.INK : Theme.FG);
                    g.fill(new java.awt.geom.Ellipse2D.Float(kx, y + 4, 16, 16));
                    if (isFocusOwner()) {
                        g.setColor(Theme.ORANGE);
                        g.setStroke(new BasicStroke(2f));
                        g.draw(new RoundRectangle2D.Float(x - 2, y - 2, 44, 28, 28, 28));
                    }
                    g.dispose();
                }

                @Override
                public int getIconWidth() {
                    return 42;
                }

                @Override
                public int getIconHeight() {
                    return 26;
                }
            });
            setIconTextGap(10);
        }

        @Override
        protected void paintComponent(Graphics g) {
            super.paintComponent(Theme.smooth(g));
        }
    }

    /** Painel de vidro (cartão) com cantos redondos. */
    static final class Card extends JPanel {
        private static final long serialVersionUID = 1L;

        Card(java.awt.LayoutManager l) {
            super(l);
            setOpaque(false);
            setBorder(new EmptyBorder(18, 20, 16, 20));
        }

        @Override
        protected void paintComponent(Graphics g0) {
            Graphics2D g = Theme.smooth(g0);
            int w = getWidth(), h = getHeight();
            g.setColor(new Color(0x17, 0x12, 0x1f, 175));
            g.fill(new RoundRectangle2D.Float(0, 0, w, h, 22, 22));
            g.setColor(Theme.LINE_SOFT);
            g.draw(new RoundRectangle2D.Float(.5f, .5f, w - 1, h - 1, 22, 22));
            g.dispose();
        }
    }

    /** "✨ Skyke3D" com o degradê laranja → rosa → azul do logo do jogo. */
    static final class Logo extends JComponent {
        private static final long serialVersionUID = 1L;
        private final java.awt.Font font = Theme.BLACK.deriveFont(46f);

        Logo() {
            setOpaque(false);
        }

        @Override
        public Dimension getPreferredSize() {
            FontMetrics fm = getFontMetrics(font);
            return new Dimension(fm.stringWidth("Skyke3D") + 70, fm.getAscent() + fm.getDescent() + 4);
        }

        @Override
        protected void paintComponent(Graphics g0) {
            Graphics2D g = Theme.smooth(g0);
            FontMetrics fm = g.getFontMetrics(font);
            int tw = fm.stringWidth("Skyke3D"), sp = 58;
            float x = (getWidth() - tw - sp) / 2f, base = fm.getAscent();
            // estrelas do ✨: uma grande e uma pequena, douradas
            float s = fm.getAscent() * .5f;
            g.setPaint(new GradientPaint(x, 0, new Color(0xffe27a), x + sp, base, Theme.ORANGE));
            g.fill(sparkle(x + s * .95f, base - s * .85f, s * .78f));
            g.fill(sparkle(x + s * .32f, base - s * 1.62f, s * .36f));
            g.fill(sparkle(x + s * .45f, base - s * .1f, s * .3f));
            // sombra suave e texto em degradê
            g.setFont(font);
            g.setColor(new Color(0, 0, 0, 90));
            g.drawString("Skyke3D", x + sp, base + 3);
            g.setPaint(new LinearGradientPaint(x + sp, 0, x + sp + tw, 0, new float[] { 0f, .5f, 1f },
                    new Color[] { Theme.ORANGE, Theme.PINK, Theme.SKY }));
            g.drawString("Skyke3D", x + sp, base);
            g.dispose();
        }
    }
}
