// Skyke3D — launcher. Copyright (C) 2026 Noturno-Strange · SPDX-License-Identifier: GPL-3.0-only
package skyke3d.launcher;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.LayoutManager;
import java.awt.MultipleGradientPaint;
import java.awt.RadialGradientPaint;
import java.awt.geom.Ellipse2D;
import java.awt.geom.Line2D;
import java.awt.geom.Point2D;
import java.util.Random;

import javax.swing.JPanel;
import javax.swing.Timer;

/**
 * Fundo do launcher: o mesmo céu da tela inicial do jogo (assets/intro.js), com estrelas passando, brilhos roxo e azul e os
 * seis planetas dos mundos atravessando devagar. Desenhado por código, como no jogo. Pausa quando a janela some.
 */
final class Space extends JPanel {
    private static final long serialVersionUID = 1L;
    // cores dos seis mundos (PL em assets/intro.js): claro e escuro de cada planeta
    private static final int[][] PL = {
        { 0x7ad06a, 0x1e5a2a }, { 0xe8c870, 0x7a5a22 }, { 0x5ad0a0, 0x1a5a4a },
        { 0xe0a868, 0x7a4a1e }, { 0x6ad0c8, 0x1a4a5a }, { 0xb8e070, 0x3a6a2a },
    };
    private static final int STARS = 170;

    private final Random rnd = new Random();
    private final double[] sx = new double[STARS], sy = new double[STARS], sz = new double[STARS];
    private final Timer timer;
    private final long t0 = System.nanoTime();
    private long last = t0;

    Space(LayoutManager layout) {
        super(layout);
        setOpaque(true);
        setBackground(Theme.BG);
        for (int i = 0; i < STARS; i++) {
            sx[i] = r(-1, 1);
            sy[i] = r(-1, 1);
            sz[i] = r(.03, 1);
        }
        timer = new Timer(33, e -> repaint());
        timer.setCoalesce(true);
    }

    void start() {
        last = System.nanoTime();
        timer.start();
    }

    void stop() {
        timer.stop();
    }

    private double r(double a, double b) {
        return a + rnd.nextDouble() * (b - a);
    }

    private static double clamp(double v, double a, double b) {
        return Math.max(a, Math.min(b, v));
    }

    @Override
    protected void paintComponent(Graphics g0) {
        Graphics2D g = Theme.smooth(g0);
        int w = getWidth(), h = getHeight();
        long now = System.nanoTime();
        double t = (now - t0) / 1e9, dt = Math.min(.1, (now - last) / 1e9);
        last = now;
        g.setColor(Theme.BG);
        g.fillRect(0, 0, w, h);
        double m = Math.max(w, h), u = Math.min(w, h);
        glow(g, w * (.3 + .05 * Math.sin(t * .2)), h * .35, m * .6, new Color(0x5b, 0x2a, 0x8a, 0x40));
        glow(g, w * (.72 + .05 * Math.cos(t * .17)), h * .65, m * .55, new Color(0x1f, 0x5a, 0x9a, 0x38));

        // estrelas vindo na direção de quem olha (traços curtos, mais fortes quando perto)
        double sp = .06, cx = w / 2.0, cy = h / 2.0, f = m * .55;
        g.setStroke(new BasicStroke(1f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
        Line2D.Double ln = new Line2D.Double();
        for (int i = 0; i < STARS; i++) {
            double pz = sz[i] + sp * .035;
            sz[i] -= sp * dt;
            if (sz[i] <= .02) { reset(i); continue; }
            double x = cx + sx[i] / sz[i] * f * .5, y = cy + sy[i] / sz[i] * f * .5;
            if (x < -20 || x > w + 20 || y < -20 || y > h + 20) { reset(i); continue; }
            double a = clamp(1.15 - sz[i], .15, 1);
            g.setColor(new Color(255, 244, 225, (int) (a * 255)));
            g.setStroke(new BasicStroke((float) clamp(1.8 - sz[i] * 1.4, .6, 1.8), BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
            ln.setLine(cx + sx[i] / pz * f * .5, cy + sy[i] / pz * f * .5, x, y);
            g.draw(ln);
        }

        // planetas atravessando da direita para a esquerda
        for (int i = 0; i < PL.length; i++) {
            double k = ((t * .028 + (double) i / PL.length) % 1 + 1) % 1;
            double x = w * 1.15 - k * w * 1.3, y = h * (.5 + .3 * Math.sin(i * 1.9 + t * .25));
            double rr = u * (.05 + .028 * (i % 3)), al = .55 * clamp(Math.min(k, 1 - k) * 8, 0, 1);
            if (al <= .01) continue;
            Color lo = new Color(PL[i][0]), hi = new Color(PL[i][1]);
            glow(g, x, y, rr * 2.4, Theme.alpha(lo, (int) (0x44 * al)));
            g.setPaint(new RadialGradientPaint(new Point2D.Double(x - rr * .4, y - rr * .4), (float) (rr * 1.4),
                    new float[] { 0f, 1f }, new Color[] { Theme.alpha(lo, (int) (255 * al)), Theme.alpha(hi, (int) (255 * al)) }));
            g.fill(new Ellipse2D.Double(x - rr, y - rr, rr * 2, rr * 2));
            if (i % 2 == 1) {
                Graphics2D gr = (Graphics2D) g.create();
                gr.rotate(-.35, x, y);
                gr.setColor(Theme.alpha(lo, (int) (0x99 * al)));
                gr.setStroke(new BasicStroke((float) Math.max(2, rr * .1)));
                gr.draw(new Ellipse2D.Double(x - rr * 1.7, y - rr * .38, rr * 3.4, rr * .76));
                gr.dispose();
            }
        }

        // sombra nas bordas (.iShade)
        g.setPaint(new RadialGradientPaint(new Point2D.Double(w * .5, h * .55), (float) (m * .75), new float[] { 0f, 1f },
                new Color[] { Theme.alpha(Theme.BG, 0), Theme.alpha(Theme.BG, 0xb8) }, MultipleGradientPaint.CycleMethod.NO_CYCLE));
        g.fillRect(0, 0, w, h);
        g.dispose();
    }

    private void reset(int i) {
        sx[i] = r(-1, 1);
        sy[i] = r(-1, 1);
        sz[i] = 1;
    }

    private static void glow(Graphics2D g, double x, double y, double r, Color c) {
        if (r <= 0) return;
        g.setPaint(new RadialGradientPaint(new Point2D.Double(x, y), (float) r, new float[] { 0f, 1f },
                new Color[] { c, Theme.alpha(c, 0) }));
        g.fill(new Ellipse2D.Double(x - r, y - r, r * 2, r * 2));
    }
}
