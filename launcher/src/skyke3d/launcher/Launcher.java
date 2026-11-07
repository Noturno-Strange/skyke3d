// Skyke3D — launcher. Copyright (C) 2026 Noturno-Strange · SPDX-License-Identifier: GPL-3.0-only
package skyke3d.launcher;

import java.awt.BorderLayout;
import java.awt.Color;
import java.awt.Component;
import java.awt.Dimension;
import java.awt.FlowLayout;
import java.awt.GraphicsEnvironment;
import java.awt.GridBagConstraints;
import java.awt.GridBagLayout;
import java.awt.Image;
import java.awt.Insets;
import java.awt.Point;
import java.awt.event.KeyEvent;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import java.awt.event.WindowAdapter;
import java.awt.event.WindowEvent;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import javax.imageio.ImageIO;
import javax.swing.BorderFactory;
import javax.swing.Box;
import javax.swing.BoxLayout;
import javax.swing.ImageIcon;
import javax.swing.JComponent;
import javax.swing.JFrame;
import javax.swing.JLabel;
import javax.swing.JPanel;
import javax.swing.KeyStroke;
import javax.swing.SwingConstants;
import javax.swing.SwingUtilities;
import javax.swing.SwingWorker;
import javax.swing.ToolTipManager;
import javax.swing.UIManager;
import javax.swing.WindowConstants;

/**
 * Launcher do Skyke3D: escolhe o domínio do servidor (o oficial ou qualquer outro que rode este projeto), testa a conexão
 * e abre o jogo. Um .jar só, sem dependências, para Windows, macOS e Linux (Java 11 ou mais novo).
 *
 * Linha de comando: java -jar skyke3d-launcher.jar [--servidor DOMINIO] [--sala CODIGO] [--jogar] [--navegador] [--testar]
 */
public final class Launcher {
    private static String defaultServer;
    private static String version;

    private final Config cfg;
    private final JFrame frame = new JFrame("Skyke3D");
    private final Space space = new Space(new BorderLayout());
    private final Ui.Field server = new Ui.Field("skyke3d.com.br, jogo.meusite.com, localhost:3000…");
    private final Ui.Field room = new Ui.Field("código");
    private final Ui.Toggle appWindow = new Ui.Toggle("Janela própria");
    private final JLabel status = new JLabel(" ");
    private final JLabel statusDot = new JLabel();
    private final JPanel chips = new JPanel(new FlowLayout(FlowLayout.LEFT, 6, 0));
    private final Ui.Button play = new Ui.Button("Jogar", Ui.Kind.PRIMARY, Ui.PLAY);
    private final Ui.Button test = new Ui.Button("Testar", Ui.Kind.GLASS, Ui.SIGNAL);
    private final Ui.Button download = new Ui.Button("Baixar o launcher oficial", Ui.Kind.GLASS, Ui.DOWN);

    private Launcher(Config cfg) {
        this.cfg = cfg;
    }

    public static void main(String[] args) {
        String srv = null, sala = null;
        boolean jogar = false, navegador = false, testar = false;
        for (int i = 0; i < args.length; i++) {
            String a = args[i];
            switch (a) {
                case "--servidor": case "--server": case "-s":
                    srv = next(args, ++i, a); break;
                case "--sala": case "--room": case "-r":
                    sala = next(args, ++i, a); break;
                case "--jogar": case "--play":
                    jogar = true; break;
                case "--navegador": case "--browser":
                    navegador = true; break;
                case "--testar": case "--test":
                    testar = true; break;
                case "--versao": case "--version":
                    System.out.println("Skyke3D launcher " + version() + (LauncherPolicy.ownSha256() == null ? "" : "\nSHA-256 " + LauncherPolicy.ownSha256())); return;
                case "--ajuda": case "--help": case "-h":
                    usage(); return;
                default:
                    if (a.startsWith("-")) { System.err.println("Opção desconhecida: " + a); usage(); System.exit(2); }
                    srv = a; // java -jar skyke3d-launcher.jar meu.servidor.com
            }
        }
        Config cfg = Config.load();
        if (srv != null) cfg.server = srv.trim();
        if (sala != null) cfg.room = sala.trim();
        if (navegador) cfg.appWindow = false;
        if (cfg.server.isEmpty()) cfg.server = defaultServer();

        if (testar || jogar || GraphicsEnvironment.isHeadless()) {
            System.exit(cli(cfg, testar, jogar || !testar));
            return;
        }
        SwingUtilities.invokeLater(() -> new Launcher(cfg).show());
    }

    private static String next(String[] args, int i, String opt) {
        if (i >= args.length) { System.err.println("Falta o valor de " + opt); System.exit(2); }
        return args[i];
    }

    private static void usage() {
        System.out.println(String.join("\n",
                "Skyke3D launcher " + version(),
                "",
                "Uso: java -jar skyke3d-launcher.jar [opções] [domínio]",
                "",
                "Sem opções, abre a janela do launcher.",
                "  -s, --servidor DOMÍNIO   servidor do jogo (ex.: skyke3d.com.br, meu.servidor:8443, localhost:3000)",
                "  -r, --sala CÓDIGO        entra direto na sala com este código",
                "      --jogar              abre o jogo sem mostrar o launcher",
                "      --navegador          abre no navegador padrão (em vez da janela própria)",
                "      --testar             só testa a conexão com o servidor e sai",
                "      --versao             mostra a versão (e o SHA-256 deste arquivo)",
                "",
                "Os ajustes ficam em " + Config.dir().resolve("launcher.properties")));
    }

    /** Modo sem janela: testa e/ou abre o jogo. Retorna o código de saída. */
    private static int cli(Config cfg, boolean testar, boolean jogar) {
        ServerAddress a;
        String url;
        try {
            a = ServerAddress.parse(cfg.server);
            url = a.gameUrl(cfg.room);
        } catch (IllegalArgumentException e) {
            System.err.println(e.getMessage());
            return 2;
        }
        if (testar) {
            ServerCheck.Result r = ServerCheck.check(a);
            (r.ok ? System.out : System.err).println(a.origin() + ": " + r.message);
            if (!r.ok) return 1;
        }
        String why = refusal(LauncherPolicy.check(a));
        if (why != null) {
            System.err.println(why + " " + LauncherPolicy.OFFICIAL_PAGE);
            return 3;
        }
        if (!jogar) return 0;
        if (GraphicsEnvironment.isHeadless()) {
            System.err.println("Sem tela para abrir o jogo. Abra no navegador: " + url);
            return 1;
        }
        try {
            GameOpener.Result r = GameOpener.open(url, cfg.appWindow);
            cfg.server = a.display();
            cfg.remember(a.display());
            saveQuietly(cfg);
            System.out.println((r == GameOpener.Result.APP_WINDOW ? "Abrindo em janela própria: " : "Abrindo no navegador: ") + url);
            return 0;
        } catch (IOException e) {
            System.err.println("Não deu para abrir o navegador. Abra este endereço: " + url);
            return 1;
        }
    }

    private void show() {
        UIManager.put("ToolTip.background", Theme.PANEL);
        UIManager.put("ToolTip.foreground", Theme.FG);
        UIManager.put("ToolTip.font", Theme.REGULAR.deriveFont(12.5f));
        UIManager.put("ToolTip.border", BorderFactory.createCompoundBorder(BorderFactory.createLineBorder(Theme.LINE),
                BorderFactory.createEmptyBorder(5, 8, 5, 8)));
        ToolTipManager.sharedInstance().setInitialDelay(450);

        frame.setUndecorated(true);
        frame.setDefaultCloseOperation(WindowConstants.DISPOSE_ON_CLOSE);
        frame.setBackground(Theme.BG);
        List<Image> icons = icons();
        if (!icons.isEmpty()) frame.setIconImages(icons);

        space.setBorder(BorderFactory.createLineBorder(Theme.LINE_SOFT));
        space.add(titleBar(), BorderLayout.NORTH);

        JPanel content = new JPanel();
        content.setOpaque(false);
        content.setLayout(new BoxLayout(content, BoxLayout.Y_AXIS));
        content.setBorder(BorderFactory.createEmptyBorder(4, 36, 22, 36));

        Ui.Logo logo = new Ui.Logo();
        content.add(center(logo));
        JLabel sub = new JLabel("Escolha o servidor e entre no jogo.");
        sub.setFont(Theme.BOLD.deriveFont(15f));
        sub.setForeground(Theme.FG_DIM);
        content.add(center(sub));
        content.add(Box.createVerticalStrut(22));
        content.add(center(card()));
        content.add(Box.createVerticalStrut(18));
        content.add(center(play));
        content.add(Box.createVerticalStrut(10));
        JLabel foot = new JLabel("Launcher v" + version() + "  ·  Gratuito e de código aberto  ·  GPL-3.0");
        String h = LauncherPolicy.ownSha256();
        foot.setToolTipText(h == null ? "Build local (sem .jar)" : "SHA-256 deste arquivo: " + h);
        foot.setFont(Theme.REGULAR.deriveFont(12f));
        foot.setForeground(Theme.FG_FAINT);
        content.add(center(foot));
        space.add(content, BorderLayout.CENTER);

        play.addActionListener(e -> play());
        test.addActionListener(e -> test());
        server.addActionListener(e -> play()); // Enter no domínio
        room.addActionListener(e -> play());
        server.getDocument().addDocumentListener(new javax.swing.event.DocumentListener() {
            @Override
            public void insertUpdate(javax.swing.event.DocumentEvent e) {
                markChips();
            }

            @Override
            public void removeUpdate(javax.swing.event.DocumentEvent e) {
                markChips();
            }

            @Override
            public void changedUpdate(javax.swing.event.DocumentEvent e) {
                markChips();
            }
        });
        frame.getRootPane().setDefaultButton(play);
        frame.getRootPane().registerKeyboardAction(e -> frame.dispose(), KeyStroke.getKeyStroke(KeyEvent.VK_ESCAPE, 0),
                JComponent.WHEN_IN_FOCUSED_WINDOW);

        server.setText(cfg.server);
        room.setText(cfg.room);
        appWindow.setSelected(cfg.appWindow);
        if (!GameOpener.hasChromium()) {
            appWindow.setSelected(false);
            appWindow.setEnabled(false);
            appWindow.setToolTipText("Instale Chrome, Edge, Brave ou Chromium para abrir o jogo numa janela própria.");
        }
        refreshChips();
        info("Pronto para jogar em " + shown(cfg.server) + ".");

        drag(space);
        frame.setContentPane(space);
        frame.pack();
        frame.setLocationRelativeTo(null);
        frame.addWindowListener(new WindowAdapter() {
            @Override
            public void windowIconified(WindowEvent e) {
                space.stop();
            }

            @Override
            public void windowDeiconified(WindowEvent e) {
                space.start();
            }

            @Override
            public void windowClosed(WindowEvent e) {
                space.stop();
            }
        });
        frame.setVisible(true);
        space.start();
        server.requestFocusInWindow();
        server.setCaretPosition(server.getText().length());
    }

    private JPanel titleBar() {
        JPanel bar = new JPanel(new BorderLayout());
        bar.setOpaque(false);
        bar.setBorder(BorderFactory.createEmptyBorder(8, 14, 0, 8));
        JLabel name = new JLabel("LAUNCHER");
        name.setFont(Theme.BLACK.deriveFont(11f));
        name.setForeground(Theme.FG_FAINT);
        List<Image> icons = icons();
        if (!icons.isEmpty()) name.setIcon(new ImageIcon(icons.get(0).getScaledInstance(18, 18, Image.SCALE_SMOOTH)));
        name.setIconTextGap(8);
        bar.add(name, BorderLayout.CENTER); // no centro: ganha a largura que sobra (no oeste o texto era cortado)
        JPanel win = new JPanel(new FlowLayout(FlowLayout.RIGHT, 2, 0));
        win.setOpaque(false);
        Ui.Button min = new Ui.Button("", Ui.Kind.WINDOW, Ui.MINIMIZE);
        min.setToolTipText("Minimizar");
        min.setFocusable(false);
        min.addActionListener(e -> frame.setState(JFrame.ICONIFIED));
        Ui.Button close = new Ui.Button("", Ui.Kind.WINDOW, Ui.CLOSE);
        close.setToolTipText("Fechar (Esc)");
        close.setFocusable(false);
        close.addActionListener(e -> frame.dispose());
        win.add(min);
        win.add(close);
        bar.add(win, BorderLayout.EAST);
        return bar;
    }

    private JPanel card() {
        Ui.Card card = new Ui.Card(new GridBagLayout());
        GridBagConstraints g = new GridBagConstraints();
        g.gridx = 0;
        g.gridy = 0;
        g.anchor = GridBagConstraints.WEST;
        g.fill = GridBagConstraints.HORIZONTAL;
        g.gridwidth = 2;
        card.add(caption("SERVIDOR"), g);

        g.gridy = 1;
        g.gridwidth = 1;
        g.weightx = 1;
        g.insets = new Insets(6, 0, 0, 8);
        server.setToolTipText("Domínio do servidor do jogo: o oficial ou outro que rode o Skyke3D");
        card.add(server, g);
        g.gridx = 1;
        g.weightx = 0;
        g.fill = GridBagConstraints.NONE;
        g.insets = new Insets(6, 0, 0, 0);
        test.setToolTipText("Confere se o endereço é um servidor do Skyke3D");
        card.add(test, g);

        g.gridx = 0;
        g.gridy = 2;
        g.gridwidth = 2;
        g.fill = GridBagConstraints.HORIZONTAL;
        g.insets = new Insets(10, 0, 0, 0);
        chips.setOpaque(false);
        chips.setBorder(BorderFactory.createEmptyBorder(0, -6, 0, 0));
        card.add(chips, g);

        g.gridy = 3;
        g.insets = new Insets(16, 0, 0, 0);
        card.add(caption("SALA (OPCIONAL)"), g);

        JPanel row = new JPanel(new BorderLayout(14, 0));
        row.setOpaque(false);
        room.setColumns(8);
        room.setToolTipText("Código da sala para entrar direto nela (letras e números)");
        room.setPreferredSize(new Dimension(150, 46));
        row.add(room, BorderLayout.WEST);
        appWindow.setToolTipText("Abre o jogo no Chrome, Edge, Brave ou Chromium em modo aplicativo, sem abas nem barra de endereço");
        row.add(appWindow, BorderLayout.CENTER);
        g.gridy = 4;
        g.insets = new Insets(6, 0, 0, 0);
        card.add(row, g);

        JPanel st = new JPanel(new BorderLayout(8, 0));
        st.setOpaque(false);
        statusDot.setVerticalAlignment(SwingConstants.TOP);
        statusDot.setBorder(BorderFactory.createEmptyBorder(5, 0, 0, 0));
        st.add(statusDot, BorderLayout.WEST);
        status.setFont(Theme.BOLD.deriveFont(13f));
        status.setVerticalAlignment(SwingConstants.TOP);
        status.setPreferredSize(new Dimension(380, 38));
        st.add(status, BorderLayout.CENTER);
        g.gridy = 5;
        g.insets = new Insets(16, 0, 0, 0);
        card.add(st, g);

        // aparece só quando o servidor recusa este launcher (versão velha ou arquivo que não é o oficial)
        download.setVisible(false);
        download.setToolTipText(LauncherPolicy.OFFICIAL_PAGE);
        download.addActionListener(e -> {
            try {
                GameOpener.browse(LauncherPolicy.OFFICIAL_PAGE);
            } catch (IOException x) {
                error("Abra no navegador: " + LauncherPolicy.OFFICIAL_PAGE);
            }
        });
        g.gridy = 6;
        g.fill = GridBagConstraints.NONE;
        g.insets = new Insets(8, 0, 0, 0);
        card.add(download, g);
        g.fill = GridBagConstraints.HORIZONTAL;

        card.width = 540;
        card.setMaximumSize(new Dimension(540, Integer.MAX_VALUE));
        return card;
    }

    private static JLabel caption(String text) {
        JLabel l = new JLabel(text);
        l.setFont(Theme.BLACK.deriveFont(11.5f));
        l.setForeground(Theme.FG_DIM);
        return l;
    }

    private static JComponent center(JComponent c) {
        c.setAlignmentX(Component.CENTER_ALIGNMENT);
        if (c instanceof JLabel) ((JLabel) c).setHorizontalAlignment(SwingConstants.CENTER);
        // texto: largura livre (centrado pelo próprio JLabel); a medida do texto varia com a escala do sistema e cortava o fim
        int w = c instanceof Ui.Card ? 540 : c instanceof JLabel ? Integer.MAX_VALUE : c.getPreferredSize().width;
        c.setMaximumSize(new Dimension(w, c instanceof Ui.Card ? Integer.MAX_VALUE : c.getPreferredSize().height));
        return c;
    }

    /** Janela sem moldura do sistema: arrasta pelo fundo. */
    private void drag(JComponent c) {
        MouseAdapter m = new MouseAdapter() {
            private Point from;

            @Override
            public void mousePressed(MouseEvent e) {
                from = e.getLocationOnScreen();
                Point p = frame.getLocation();
                from.translate(-p.x, -p.y);
            }

            @Override
            public void mouseDragged(MouseEvent e) {
                if (from == null) return;
                Point p = e.getLocationOnScreen();
                frame.setLocation(p.x - from.x, p.y - from.y);
            }
        };
        c.addMouseListener(m);
        c.addMouseMotionListener(m);
        for (Component k : c.getComponents())
            if (k instanceof JPanel || k instanceof JLabel && !(k == status)) drag((JComponent) k);
    }

    private String typed() {
        return server.getText().trim();
    }

    private static String shown(String s) {
        return s == null || s.isEmpty() ? defaultServer() : s;
    }

    /** Atalhos: o servidor oficial (★) e os recentes (com × para tirar da lista). */
    private void refreshChips() {
        chips.removeAll();
        Ui.Button off = new Ui.Button("Oficial", Ui.Kind.CHIP, Ui.STAR);
        off.setToolTipText(defaultServer());
        off.putClientProperty("server", defaultServer());
        off.addActionListener(e -> use(defaultServer()));
        chips.add(off);
        int n = 0;
        for (String r : cfg.recent) {
            if (r.equals(defaultServer())) continue;
            if (n++ == 4) break;
            String label = r.length() > 24 ? r.substring(0, 23) + "…" : r;
            Ui.Button c = new Ui.Button(label, Ui.Kind.CHIP, null);
            c.setToolTipText(r + "  ·  clique no × para tirar da lista");
            c.putClientProperty("server", r);
            c.addActionListener(e -> use(r));
            c.onClose = () -> forget(r);
            chips.add(c);
        }
        markChips();
        chips.revalidate();
        chips.repaint();
    }

    private void markChips() {
        String cur;
        try {
            cur = ServerAddress.parse(typed()).display();
        } catch (IllegalArgumentException e) {
            cur = typed();
        }
        for (Component c : chips.getComponents()) {
            if (!(c instanceof Ui.Button)) continue;
            Ui.Button b = (Ui.Button) c;
            b.setForeground(cur.equals(b.getClientProperty("server")) ? Theme.ORANGE : Theme.FG);
        }
    }

    private void use(String s) {
        server.setText(s);
        server.requestFocusInWindow();
        server.setCaretPosition(s.length());
        info("Servidor: " + s);
    }

    /** Lê o domínio e a sala; mostra o erro e devolve null se não der. */
    private ServerAddress address() {
        try {
            ServerAddress a = ServerAddress.parse(typed());
            if (!ServerAddress.validRoom(room.getText())) throw new IllegalArgumentException("O código da sala tem só letras e números (até 10).");
            return a;
        } catch (IllegalArgumentException e) {
            error(e.getMessage());
            return null;
        }
    }

    private void test() {
        ServerAddress a = address();
        if (a == null) return;
        busy(true);
        info("Testando " + a.origin() + "…");
        new SwingWorker<ServerCheck.Result, Void>() {
            private LauncherPolicy.Result policy;

            @Override
            protected ServerCheck.Result doInBackground() {
                ServerCheck.Result r = ServerCheck.check(a);
                if (r.ok) policy = LauncherPolicy.check(a);
                return r;
            }

            @Override
            protected void done() {
                busy(false);
                try {
                    ServerCheck.Result r = get();
                    if (!r.ok) error(r.message);
                    else if (!refused(policy)) ok(r.message);
                } catch (Exception e) {
                    error("Não deu para testar a conexão.");
                }
            }
        }.execute();
    }

    private void play() {
        if (!play.isEnabled()) return;
        ServerAddress a = address();
        if (a == null) return;
        String url = a.gameUrl(room.getText());
        cfg.server = a.display();
        cfg.room = room.getText().trim();
        cfg.appWindow = appWindow.isSelected();
        cfg.remember(a.display());
        saveQuietly(cfg);
        server.setText(a.display());
        refreshChips();
        busy(true);
        info("Abrindo " + a.origin() + "…");
        new SwingWorker<GameOpener.Result, Void>() {
            private LauncherPolicy.Result policy;

            @Override
            protected GameOpener.Result doInBackground() throws Exception {
                // o servidor aceita este launcher? (versão mínima e, se configurado, só os .jar oficiais)
                policy = LauncherPolicy.check(a);
                if (policy.status == LauncherPolicy.Status.OUTDATED || policy.status == LauncherPolicy.Status.UNOFFICIAL) return null;
                return GameOpener.open(url, cfg.appWindow);
            }

            @Override
            protected void done() {
                busy(false);
                try {
                    if (get() == null) {
                        refused(policy);
                        return;
                    }
                    // o jogo abriu; o launcher fecha (os ajustes já foram salvos)
                    frame.dispose();
                } catch (Exception e) {
                    error("Não deu para abrir o navegador. Abra este endereço: " + url);
                }
            }
        }.execute();
    }

    /** Mostra a recusa do servidor (e o botão de download oficial); devolve true quando recusou. */
    private boolean refused(LauncherPolicy.Result p) {
        String why = refusal(p);
        if (download.isVisible() != (why != null)) {
            download.setVisible(why != null);
            // a janela cresce (ou volta) para o botão caber, sem sair do lugar
            Point at = frame.getLocation();
            frame.pack();
            frame.setLocation(at);
        }
        if (why != null) error(why);
        return why != null;
    }

    static String refusal(LauncherPolicy.Result p) {
        if (p == null) return null;
        if (p.status == LauncherPolicy.Status.OUTDATED)
            return "Este launcher (v" + version() + ") está desatualizado: o servidor pede a v" + p.min + " ou mais nova. Baixe o launcher oficial.";
        if (p.status == LauncherPolicy.Status.UNOFFICIAL)
            return "Este servidor só aceita o launcher oficial, e este arquivo não é um deles. Baixe o launcher oficial.";
        return null;
    }

    private void forget(String s) {
        cfg.forget(s);
        if (cfg.server.equals(s)) cfg.server = "";
        saveQuietly(cfg);
        refreshChips();
        info("Removido da lista: " + s);
    }

    private void busy(boolean b) {
        play.setEnabled(!b);
        test.setEnabled(!b);
    }

    private void info(String m) {
        say(m, Theme.FG_DIM, Theme.SKY);
    }

    private void ok(String m) {
        say(m, Theme.OK, Theme.OK);
    }

    private void error(String m) {
        say(m, Theme.ERR, Theme.ERR);
    }

    private void say(String m, Color text, Color dot) {
        status.setForeground(text);
        status.setText("<html>" + escape(m) + "</html>");
        statusDot.setIcon(new javax.swing.Icon() {
            @Override
            public void paintIcon(Component c, java.awt.Graphics g0, int x, int y) {
                java.awt.Graphics2D g = Theme.smooth(g0);
                g.setColor(Theme.alpha(dot, 60));
                g.fillOval(x, y, 10, 10);
                g.setColor(dot);
                g.fillOval(x + 2, y + 2, 6, 6);
                g.dispose();
            }

            @Override
            public int getIconWidth() {
                return 10;
            }

            @Override
            public int getIconHeight() {
                return 10;
            }
        });
    }

    private static String escape(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    private static void saveQuietly(Config cfg) {
        try {
            cfg.save();
        } catch (IOException e) {
            System.err.println("Não deu para salvar os ajustes: " + e.getMessage());
        }
    }

    private static List<Image> icons() {
        List<Image> out = new ArrayList<>();
        for (String n : new String[] { "icon-32.png", "icon-128.png" }) {
            try (InputStream in = Launcher.class.getResourceAsStream("/skyke3d/launcher/" + n)) {
                if (in != null) out.add(ImageIO.read(in));
            } catch (IOException e) {
                // sem ícone
            }
        }
        return out;
    }

    /** Servidor padrão: o oficial, ou o que foi gravado no .jar na hora de compilar (SKYKE_URL=... ./build.sh). */
    static String defaultServer() {
        if (defaultServer == null) {
            String s = resource("default-server.txt");
            try {
                defaultServer = ServerAddress.parse(s == null || s.isEmpty() ? "skyke3d.com.br" : s).display();
            } catch (IllegalArgumentException e) {
                defaultServer = "skyke3d.com.br";
            }
        }
        return defaultServer;
    }

    static String version() {
        if (version == null) {
            String v = resource("version.txt");
            version = v == null || v.isEmpty() ? "dev" : v;
        }
        return version;
    }

    private static String resource(String name) {
        try (InputStream in = Launcher.class.getResourceAsStream("/skyke3d/launcher/" + name)) {
            return in == null ? null : new String(in.readAllBytes(), StandardCharsets.UTF_8).trim();
        } catch (IOException e) {
            return null;
        }
    }
}
