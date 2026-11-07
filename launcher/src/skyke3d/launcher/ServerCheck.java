// Skyke3D — launcher. Copyright (C) 2026 Noturno-Strange · SPDX-License-Identifier: GPL-3.0-only
package skyke3d.launcher;

import java.io.IOException;
import java.io.InputStream;
import java.net.ConnectException;
import java.net.URI;
import java.net.UnknownHostException;
import java.net.http.HttpClient;
import java.net.http.HttpConnectTimeoutException;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

import javax.net.ssl.SSLException;

/** Confere se o endereço responde e se é mesmo um servidor do Skyke3D (a página inicial tem "Skyke3D" no título). */
public final class ServerCheck {
    private ServerCheck() {}

    public static final class Result {
        public final boolean ok;
        public final String message;

        Result(boolean ok, String message) {
            this.ok = ok;
            this.message = message;
        }
    }

    public static Result check(ServerAddress a) {
        HttpClient client = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1) // em http, o pedido de HTTP/2 (Upgrade: h2c) cai no WebSocket do servidor e volta 400
                .connectTimeout(Duration.ofSeconds(6))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .proxy(java.net.ProxySelector.getDefault())
                .build();
        HttpRequest req = HttpRequest.newBuilder(URI.create(a.origin() + "/"))
                .timeout(Duration.ofSeconds(10))
                .header("User-Agent", "Skyke3D-Launcher/" + Launcher.version())
                .header("Accept", "text/html")
                .GET()
                .build();
        try {
            HttpResponse<InputStream> r = client.send(req, HttpResponse.BodyHandlers.ofInputStream());
            String head;
            try (InputStream in = r.body()) {
                head = new String(in.readNBytes(64 * 1024), StandardCharsets.UTF_8);
            }
            int st = r.statusCode();
            if (st >= 500) return new Result(false, "O servidor respondeu com erro (" + st + "). Tente de novo daqui a pouco.");
            if (st >= 400) return new Result(false, "O endereço respondeu " + st + ": não parece um servidor do Skyke3D.");
            if (!head.contains("Skyke3D")) return new Result(false, "O endereço responde, mas não parece um servidor do Skyke3D.");
            String note = a.voiceWorks() ? "" : " Sem https, o navegador não libera o microfone (a voz não funciona).";
            return new Result(true, "Servidor do Skyke3D encontrado." + note);
        } catch (UnknownHostException e) {
            return new Result(false, "Domínio não encontrado. Confira o endereço.");
        } catch (HttpConnectTimeoutException e) {
            return new Result(false, "O servidor não respondeu a tempo.");
        } catch (HttpTimeoutException e) {
            return new Result(false, "O servidor demorou demais para responder.");
        } catch (ConnectException e) {
            return new Result(false, causeIs(e, UnknownHostException.class)
                    ? "Domínio não encontrado. Confira o endereço."
                    : "Não deu para conectar (servidor desligado ou porta errada?).");
        } catch (SSLException e) {
            return new Result(false, "Falha no certificado https do servidor.");
        } catch (IOException e) {
            if (causeIs(e, UnknownHostException.class)) return new Result(false, "Domínio não encontrado. Confira o endereço.");
            if (causeIs(e, SSLException.class)) return new Result(false, "Falha no certificado https do servidor.");
            return new Result(false, "Não deu para conectar: " + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return new Result(false, "Teste cancelado.");
        } catch (IllegalArgumentException e) {
            return new Result(false, "Endereço inválido.");
        }
    }

    private static boolean causeIs(Throwable t, Class<? extends Throwable> k) {
        for (Throwable c = t; c != null; c = c.getCause()) if (k.isInstance(c)) return true;
        return false;
    }
}
