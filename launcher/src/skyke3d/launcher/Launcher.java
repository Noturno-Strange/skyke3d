// Skyke3D — launcher. Copyright (C) 2026 Noturno-Strange · SPDX-License-Identifier: GPL-3.0-only
package skyke3d.launcher;

import java.awt.BorderLayout;
import java.awt.Color;
import java.awt.Dimension;
import java.awt.Font;
import java.awt.GraphicsEnvironment;
import java.awt.GridBagConstraints;
import java.awt.GridBagLayout;
import java.awt.Image;
import java.awt.Insets;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import javax.imageio.ImageIO;
import javax.swing.BorderFactory;
import javax.swing.DefaultComboBoxModel;
import javax.swing.ImageIcon;
import javax.swing.JButton;
import javax.swing.JCheckBox;
import javax.swing.JComboBox;
import javax.swing.JFrame;
import javax.swing.JLabel;
import javax.swing.JPanel;
import javax.swing.JTextField;
import javax.swing.SwingConstants;
import javax.swing.SwingUtilities;
import javax.swing.SwingWorker;
import javax.swing.UIManager;
import javax.swing.WindowConstants;
import javax.swing.text.JTextComponent;

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
    private final JComboBox<String> server = new JComboBox<>();
    private final JTextField room = new JTextField(10);
    private final JCheckBox appWindow = new JCheckBox("Abrir em janela própria (sem abas nem barra de endereço)");
    private final JLabel status = new JLabel(" ");
    private final JButton play = new JButton("Jogar");
    private final JButton test = new JButton("Testar conexão");
    private final JButton forget = new JButton("Remover");
    private final JButton official = new JButton("Servidor oficial");

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
                    System.out.println("Skyke3D launcher " + version()); return;
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
                "      --versao             mostra a versão",
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
        try {
            UIManager.setLookAndFeel(UIManager.getSystemLookAndFeelClassName());
            SwingUtilities.updateComponentTreeUI(frame);
        } catch (Exception e) {
            // fica no visual padrão do Java
        }
        frame.setDefaultCloseOperation(WindowConstants.DISPOSE_ON_CLOSE);
        List<Image> icons = icons();
        if (!icons.isEmpty()) frame.setIconImages(icons);

        JPanel root = new JPanel(new BorderLayout(0, 12));
        root.setBorder(BorderFactory.createEmptyBorder(18, 20, 16, 20));

        JPanel header = new JPanel(new BorderLayout(12, 0));
        if (!icons.isEmpty()) {
            Image big = icons.get(icons.size() - 1).getScaledInstance(56, 56, Image.SCALE_SMOOTH);
            header.add(new JLabel(new ImageIcon(big)), BorderLayout.WEST);
        }
        JLabel title = new JLabel("<html><b style='font-size:15pt'>Skyke3D</b><br>Escolha o servidor e entre no jogo.</html>");
        header.add(title, BorderLayout.CENTER);
        root.add(header, BorderLayout.NORTH);

        JPanel form = new JPanel(new GridBagLayout());
        GridBagConstraints g = new GridBagConstraints();
        g.insets = new Insets(4, 0, 4, 8);
        g.anchor = GridBagConstraints.WEST;

        server.setEditable(true);
        server.setPrototypeDisplayValue("um.servidor.bem.comprido.com.br:8443");
        server.setToolTipText("Domínio do servidor do jogo, ex.: skyke3d.com.br, jogo.meusite.com, localhost:3000");
        refreshRecent(cfg.server);
        room.setText(cfg.room);
        room.setToolTipText("Opcional: código da sala para entrar direto nela");
        appWindow.setSelected(cfg.appWindow);
        appWindow.setToolTipText("Usa o Chrome, Edge, Brave ou Chromium instalado. Sem nenhum deles, abre no navegador padrão.");

        g.gridx = 0; g.gridy = 0; form.add(new JLabel("Domínio do servidor:"), g);
        g.gridx = 1; g.weightx = 1; g.fill = GridBagConstraints.HORIZONTAL; form.add(server, g);
        g.gridx = 2; g.weightx = 0; g.fill = GridBagConstraints.NONE; g.insets = new Insets(4, 0, 4, 0); form.add(forget, g);
        g.insets = new Insets(4, 0, 4, 8);
        g.gridx = 1; g.gridy = 1; form.add(official, g);
        g.gridx = 0; g.gridy = 2; form.add(new JLabel("Sala (opcional):"), g);
        g.gridx = 1; form.add(room, g);
        g.gridx = 0; g.gridy = 3; g.gridwidth = 3; form.add(appWindow, g);
        g.gridy = 4; g.fill = GridBagConstraints.HORIZONTAL; g.weightx = 1;
        status.setVerticalAlignment(SwingConstants.TOP);
        status.setPreferredSize(new Dimension(420, 40));
        form.add(status, g);
        root.add(form, BorderLayout.CENTER);

        JPanel buttons = new JPanel(new BorderLayout(8, 0));
        JLabel ver = new JLabel("v" + version());
        ver.setFont(ver.getFont().deriveFont(Font.PLAIN, ver.getFont().getSize2D() - 1f));
        ver.setForeground(Color.GRAY);
        buttons.add(ver, BorderLayout.WEST);
        JPanel right = new JPanel();
        right.add(test);
        play.setFont(play.getFont().deriveFont(Font.BOLD));
        right.add(play);
        buttons.add(right, BorderLayout.EAST);
        root.add(buttons, BorderLayout.SOUTH);

        play.addActionListener(e -> play());
        test.addActionListener(e -> test());
        forget.addActionListener(e -> forget());
        official.addActionListener(e -> {
            server.getEditor().setItem(defaultServer());
            info("Servidor oficial: " + defaultServer());
        });
        editor().addActionListener(e -> play()); // Enter no campo do domínio
        room.addActionListener(e -> play());
        frame.getRootPane().setDefaultButton(play);

        if (!GameOpener.hasChromium()) {
            appWindow.setSelected(false);
            appWindow.setEnabled(false);
            appWindow.setText("Abrir em janela própria (instale Chrome, Edge, Brave ou Chromium)");
        }

        frame.setContentPane(root);
        frame.pack();
        frame.setMinimumSize(frame.getSize());
        frame.setLocationRelativeTo(null);
        frame.setVisible(true);
        editor().requestFocusInWindow();
    }

    private JTextField editor() {
        return (JTextField) server.getEditor().getEditorComponent();
    }

    private String typed() {
        Object v = server.getEditor().getItem();
        return v == null ? "" : v.toString().trim();
    }

    private void refreshRecent(String selected) {
        List<String> items = new ArrayList<>(cfg.recent);
        String def = defaultServer();
        if (!items.contains(def)) items.add(def);
        server.setModel(new DefaultComboBoxModel<>(items.toArray(new String[0])));
        server.getEditor().setItem(selected);
        ((JTextComponent) server.getEditor().getEditorComponent()).setCaretPosition(selected.length());
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
            @Override
            protected ServerCheck.Result doInBackground() {
                return ServerCheck.check(a);
            }

            @Override
            protected void done() {
                busy(false);
                try {
                    ServerCheck.Result r = get();
                    if (r.ok) ok(r.message); else error(r.message);
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
        refreshRecent(a.display());
        busy(true);
        info("Abrindo " + a.origin() + "…");
        new SwingWorker<GameOpener.Result, Void>() {
            @Override
            protected GameOpener.Result doInBackground() throws Exception {
                return GameOpener.open(url, cfg.appWindow);
            }

            @Override
            protected void done() {
                busy(false);
                try {
                    get();
                    // o jogo abriu; o launcher fecha (os ajustes já foram salvos)
                    frame.dispose();
                } catch (Exception e) {
                    error("<html>Não deu para abrir o navegador. Abra este endereço:<br>" + escape(url) + "</html>");
                }
            }
        }.execute();
    }

    private void forget() {
        String s = typed();
        try {
            s = ServerAddress.parse(s).display();
        } catch (IllegalArgumentException e) {
            // remove do jeito que está escrito
        }
        if (s.equals(defaultServer())) {
            info("O servidor oficial fica sempre na lista.");
            return;
        }
        cfg.forget(s);
        if (cfg.server.equals(s)) cfg.server = "";
        saveQuietly(cfg);
        refreshRecent(cfg.recent.isEmpty() ? defaultServer() : cfg.recent.get(0));
        info("Removido da lista: " + s);
    }

    private void busy(boolean b) {
        play.setEnabled(!b);
        test.setEnabled(!b);
    }

    private void info(String m) {
        status.setForeground(UIManager.getColor("Label.foreground"));
        status.setText(m.startsWith("<html>") ? m : "<html>" + escape(m) + "</html>");
    }

    private void ok(String m) {
        status.setForeground(new Color(0x1b7f3a));
        status.setText("<html>" + escape(m) + "</html>");
    }

    private void error(String m) {
        status.setForeground(new Color(0xb3261e));
        status.setText(m.startsWith("<html>") ? m : "<html>" + escape(m) + "</html>");
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
