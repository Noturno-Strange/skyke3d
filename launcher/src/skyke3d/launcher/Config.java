// Skyke3D — launcher. Copyright (C) 2026 Noturno-Strange · SPDX-License-Identifier: GPL-3.0-only
package skyke3d.launcher;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Properties;

/**
 * Ajustes do launcher num arquivo de texto (launcher.properties): o último servidor, os recentes, a sala e o modo de abrir.
 * Windows: %APPDATA%\Skyke3D · macOS: ~/Library/Application Support/Skyke3D · Linux: $XDG_CONFIG_HOME/skyke3d (~/.config/skyke3d).
 */
public final class Config {
    public static final int MAX_RECENT = 8;

    public String server = "";
    public String room = "";
    public boolean appWindow = true;
    public final List<String> recent = new ArrayList<>();

    private final Path file;

    private Config(Path file) {
        this.file = file;
    }

    public static Path dir() {
        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        String home = System.getProperty("user.home", ".");
        if (os.contains("win")) {
            String appData = System.getenv("APPDATA");
            return Paths.get(appData != null && !appData.isEmpty() ? appData : home, "Skyke3D");
        }
        if (os.contains("mac")) return Paths.get(home, "Library", "Application Support", "Skyke3D");
        String xdg = System.getenv("XDG_CONFIG_HOME");
        return Paths.get(xdg != null && xdg.startsWith("/") ? xdg : Paths.get(home, ".config").toString(), "skyke3d");
    }

    public static Config load() {
        Config c = new Config(dir().resolve("launcher.properties"));
        Properties p = new Properties();
        if (Files.isRegularFile(c.file)) {
            try (InputStream in = Files.newInputStream(c.file)) {
                p.load(new java.io.InputStreamReader(in, StandardCharsets.UTF_8));
            } catch (IOException | IllegalArgumentException e) {
                p.clear(); // arquivo estragado: começa do zero
            }
        }
        c.server = p.getProperty("server", "").trim();
        c.room = p.getProperty("room", "").trim();
        c.appWindow = !"false".equals(p.getProperty("appWindow", "true"));
        for (int i = 0; i < MAX_RECENT; i++) {
            String r = p.getProperty("recent." + i, "").trim();
            if (!r.isEmpty() && !c.recent.contains(r)) c.recent.add(r);
        }
        return c;
    }

    /** Coloca o servidor no topo dos recentes. */
    public void remember(String server) {
        recent.remove(server);
        recent.add(0, server);
        while (recent.size() > MAX_RECENT) recent.remove(recent.size() - 1);
    }

    public void forget(String server) {
        recent.remove(server);
    }

    public void save() throws IOException {
        Properties p = new Properties();
        p.setProperty("server", server);
        p.setProperty("room", room);
        p.setProperty("appWindow", Boolean.toString(appWindow));
        for (int i = 0; i < recent.size(); i++) p.setProperty("recent." + i, recent.get(i));
        Files.createDirectories(file.getParent());
        Path tmp = file.resolveSibling("launcher.properties.tmp");
        try (OutputStream out = Files.newOutputStream(tmp);
                java.io.Writer w = new java.io.OutputStreamWriter(out, StandardCharsets.UTF_8)) {
            p.store(w, "Skyke3D launcher");
        }
        try {
            Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
        }
    }
}
