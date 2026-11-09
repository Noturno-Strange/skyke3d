// Skyke3D — launcher. Copyright (C) 2026 Noturno-Strange · SPDX-License-Identifier: GPL-3.0-only
package skyke3d.launcher;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * O que o servidor do jogo aceita de launcher (`/launcher.json`): a versão mínima e, quando o operador configura, o SHA-256 dos
 * .jar oficiais. Abaixo do mínimo ou com um .jar que não é um dos oficiais, o launcher não abre o jogo e manda baixar o oficial.
 *
 * O link de download NUNCA vem do servidor: qualquer pessoa pode digitar o domínio de um servidor de terceiros, que poderia
 * apontar para um arquivo malicioso. O launcher abre só o endereço oficial abaixo (Releases do projeto no GitHub, em https).
 *
 * Limite honesto: quem roda o jogo é o navegador, então isto protege quem usa o launcher (versão velha ou arquivo alterado no
 * caminho), mas não impede alguém de modificar o próprio launcher para pular a conferência.
 */
public final class LauncherPolicy {
    private LauncherPolicy() {}

    /** Página oficial de download (fixa: nunca vem do servidor). */
    public static final String OFFICIAL_PAGE = "https://github.com/Noturno-Strange/skyke3d/releases/latest";

    public enum Status { OK, OUTDATED, UNOFFICIAL, UNKNOWN }

    public static final class Result {
        public final Status status;
        public final String min;
        public final String latest;

        Result(Status status, String min, String latest) {
            this.status = status;
            this.min = min;
            this.latest = latest;
        }
    }

    private static final Pattern VER = Pattern.compile("^\\d{1,4}\\.\\d{1,4}\\.\\d{1,4}$");
    private static final Pattern HEX64 = Pattern.compile("^[0-9a-f]{64}$");
    private static String ownHash;
    private static boolean hashed;

    /** Consulta o servidor. Sem resposta (servidor antigo, sem a rota, ou fora do ar), devolve UNKNOWN e o launcher segue. */
    public static Result check(ServerAddress a) {
        String body;
        try {
            HttpClient client = HttpClient.newBuilder()
                    .version(HttpClient.Version.HTTP_1_1)
                    .connectTimeout(Duration.ofSeconds(6))
                    .followRedirects(HttpClient.Redirect.NEVER)
                    .proxy(java.net.ProxySelector.getDefault())
                    .build();
            HttpRequest req = HttpRequest.newBuilder(URI.create(a.origin() + "/launcher.json"))
                    .timeout(Duration.ofSeconds(8))
                    .header("User-Agent", "Skyke3D-Launcher/" + Launcher.version())
                    .header("Accept", "application/json")
                    .GET()
                    .build();
            HttpResponse<InputStream> r = client.send(req, HttpResponse.BodyHandlers.ofInputStream());
            try (InputStream in = r.body()) {
                body = new String(in.readNBytes(16 * 1024), StandardCharsets.UTF_8);
            }
            if (r.statusCode() != 200) return new Result(Status.UNKNOWN, "", "");
        } catch (IOException | IllegalArgumentException e) {
            return new Result(Status.UNKNOWN, "", "");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return new Result(Status.UNKNOWN, "", "");
        }
        return decide(body, Launcher.version(), ownSha256());
    }

    /** A decisão, separada da rede para os testes. */
    static Result decide(String json, String mine, String myHash) {
        String min = str(json, "min"), latest = str(json, "latest");
        if (!VER.matcher(min).matches()) min = "";
        if (!VER.matcher(latest).matches()) latest = "";
        // build local ("dev") não tem versão: só os .jar publicados comparam versão
        if (!min.isEmpty() && VER.matcher(mine).matches() && compare(mine, min) < 0) return new Result(Status.OUTDATED, min, latest);
        List<String> hashes = hashes(json);
        if (!hashes.isEmpty() && (myHash == null || !hashes.contains(myHash))) return new Result(Status.UNOFFICIAL, min, latest);
        return new Result(Status.OK, min, latest);
    }

    /** Compara versões x.y.z. */
    static int compare(String a, String b) {
        String[] x = a.split("\\."), y = b.split("\\.");
        for (int i = 0; i < 3; i++) {
            int d = Integer.compare(Integer.parseInt(x[i]), Integer.parseInt(y[i]));
            if (d != 0) return d;
        }
        return 0;
    }

    /** O SHA-256 do .jar que está rodando (null quando roda fora de um .jar, num build local). */
    public static synchronized String ownSha256() {
        if (hashed) return ownHash;
        hashed = true;
        try {
            Path p = Paths.get(Launcher.class.getProtectionDomain().getCodeSource().getLocation().toURI());
            if (!Files.isRegularFile(p) || !p.toString().toLowerCase(Locale.ROOT).endsWith(".jar")) return null;
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            try (InputStream in = Files.newInputStream(p)) {
                byte[] buf = new byte[65536];
                for (int n; (n = in.read(buf)) > 0;) md.update(buf, 0, n);
            }
            StringBuilder sb = new StringBuilder();
            for (byte b : md.digest()) sb.append(String.format("%02x", b));
            ownHash = sb.toString();
        } catch (Exception e) {
            ownHash = null;
        }
        return ownHash;
    }

    /** Lê um campo de texto simples do JSON (o servidor manda um objeto pequeno e plano; sem biblioteca de JSON). */
    private static String str(String json, String key) {
        Matcher m = Pattern.compile("\"" + key + "\"\\s*:\\s*\"([^\"\\\\]{0,64})\"").matcher(json);
        return m.find() ? m.group(1) : "";
    }

    private static List<String> hashes(String json) {
        List<String> out = new ArrayList<>();
        Matcher m = Pattern.compile("\"sha256\"\\s*:\\s*\\[([^\\]]{0,8000})\\]").matcher(json);
        if (!m.find()) return out;
        Matcher h = Pattern.compile("\"([^\"]*)\"").matcher(m.group(1));
        while (h.find()) {
            String v = h.group(1).toLowerCase(Locale.ROOT);
            if (HEX64.matcher(v).matches()) out.add(v);
        }
        return out;
    }
}
