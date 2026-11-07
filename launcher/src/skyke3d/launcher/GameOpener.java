// Skyke3D — launcher. Copyright (C) 2026 Noturno-Strange · SPDX-License-Identifier: GPL-3.0-only
package skyke3d.launcher;

import java.awt.Desktop;
import java.io.File;
import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/**
 * Abre o jogo. O Skyke3D é um jogo de navegador (three.js + WebGL + Web Audio), então o "cliente" usa o motor de um navegador
 * já instalado: com "janela própria", um navegador Chromium (Chrome, Edge, Brave, Chromium, Vivaldi, Opera) abre o jogo em
 * modo aplicativo, sem abas nem barra de endereço, com um perfil só do launcher; sem isso (ou sem nenhum deles), abre no
 * navegador padrão do computador.
 */
public final class GameOpener {
    private GameOpener() {}

    public enum Result { APP_WINDOW, DEFAULT_BROWSER }

    private static final String OS = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
    private static final boolean WIN = OS.contains("win"), MAC = OS.contains("mac");

    public static Result open(String url, boolean appWindow) throws IOException {
        URI uri = URI.create(url);
        if (!"https".equals(uri.getScheme()) && !"http".equals(uri.getScheme())) throw new IOException("endereço não é http(s)");
        if (appWindow) {
            Path browser = findChromium();
            if (browser != null) {
                Path profile = Config.dir().resolve("janela");
                Files.createDirectories(profile);
                List<String> cmd = new ArrayList<>(Arrays.asList(
                        browser.toString(),
                        "--app=" + url,
                        "--user-data-dir=" + profile,
                        "--window-size=1280,800",
                        "--no-first-run",
                        "--no-default-browser-check",
                        "--autoplay-policy=no-user-gesture-required"));
                start(cmd);
                return Result.APP_WINDOW;
            }
        }
        openDefault(uri);
        return Result.DEFAULT_BROWSER;
    }

    public static boolean hasChromium() {
        return findChromium() != null;
    }

    /** Abre uma página no navegador padrão (só https). */
    public static void browse(String url) throws IOException {
        URI uri = URI.create(url);
        if (!"https".equals(uri.getScheme())) throw new IOException("só https");
        openDefault(uri);
    }

    private static void openDefault(URI uri) throws IOException {
        if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
            try {
                Desktop.getDesktop().browse(uri);
                return;
            } catch (IOException | UnsupportedOperationException | SecurityException e) {
                // cai para o comando do sistema
            }
        }
        String u = uri.toASCIIString();
        if (WIN) start(Arrays.asList("rundll32", "url.dll,FileProtocolHandler", u));
        else if (MAC) start(Arrays.asList("open", u));
        else start(Arrays.asList("xdg-open", u));
    }

    private static void start(List<String> cmd) throws IOException {
        ProcessBuilder pb = new ProcessBuilder(cmd);
        File devNull = new File(WIN ? "NUL" : "/dev/null");
        pb.redirectOutput(ProcessBuilder.Redirect.appendTo(devNull));
        pb.redirectError(ProcessBuilder.Redirect.appendTo(devNull));
        pb.redirectInput(ProcessBuilder.Redirect.from(devNull));
        pb.start();
    }

    static Path findChromium() {
        List<Path> c = new ArrayList<>();
        if (WIN) {
            String[] roots = { System.getenv("ProgramFiles"), System.getenv("ProgramFiles(x86)"), System.getenv("LOCALAPPDATA") };
            String[] rel = {
                "Google\\Chrome\\Application\\chrome.exe",
                "Microsoft\\Edge\\Application\\msedge.exe",
                "BraveSoftware\\Brave-Browser\\Application\\brave.exe",
                "Chromium\\Application\\chrome.exe",
                "Vivaldi\\Application\\vivaldi.exe",
                "Programs\\Opera\\opera.exe",
            };
            for (String r : rel) for (String root : roots) if (root != null && !root.isEmpty()) c.add(Paths.get(root, r));
        } else if (MAC) {
            String[] apps = {
                "Google Chrome.app/Contents/MacOS/Google Chrome",
                "Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
                "Brave Browser.app/Contents/MacOS/Brave Browser",
                "Chromium.app/Contents/MacOS/Chromium",
                "Vivaldi.app/Contents/MacOS/Vivaldi",
                "Opera.app/Contents/MacOS/Opera",
            };
            for (String a : apps) {
                c.add(Paths.get("/Applications", a));
                c.add(Paths.get(System.getProperty("user.home", ""), "Applications", a));
            }
        } else {
            String[] names = {
                "google-chrome", "google-chrome-stable", "microsoft-edge", "microsoft-edge-stable", "brave-browser", "brave",
                "chromium", "chromium-browser", "vivaldi", "vivaldi-stable", "opera",
            };
            String path = System.getenv("PATH");
            String[] dirs = (path == null ? "/usr/bin:/usr/local/bin" : path).split(File.pathSeparator);
            // só pastas absolutas do PATH: uma entrada relativa (".", "bin") faria o launcher rodar um "chrome" da pasta atual
            for (String n : names) for (String d : dirs) if (!d.isEmpty() && Paths.get(d).isAbsolute()) c.add(Paths.get(d, n));
            c.add(Paths.get("/var/lib/flatpak/exports/bin/com.google.Chrome"));
            c.add(Paths.get("/var/lib/flatpak/exports/bin/org.chromium.Chromium"));
            c.add(Paths.get("/var/lib/flatpak/exports/bin/com.brave.Browser"));
            c.add(Paths.get("/var/lib/flatpak/exports/bin/com.microsoft.Edge"));
        }
        for (Path p : c) if (Files.isRegularFile(p) && Files.isExecutable(p)) return p;
        return null;
    }
}
