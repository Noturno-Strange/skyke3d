// Skyke3D — launcher. Copyright (C) 2026 Noturno-Strange · SPDX-License-Identifier: GPL-3.0-only
package skyke3d.launcher;

import java.net.IDN;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Endereço do servidor do jogo, digitado pela pessoa: "skyke3d.com.br", "https://meu.servidor:8443/", "localhost:3000"...
 * Vira sempre só a origem (esquema, host e porta), sem caminho, consulta, usuário ou senha.
 * Sem esquema, usa https; para endereços locais (localhost, 127.x, 10.x, 192.168.x, 172.16–31.x, *.local) usa http.
 */
public final class ServerAddress {
    private static final Pattern HOST = Pattern.compile("^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$");
    private static final Pattern IPV4 = Pattern.compile("^(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})$");
    private static final Pattern ROOM = Pattern.compile("^[A-Za-z0-9]{1,10}$");

    public final String scheme;
    public final String host;
    public final int port; // -1 = porta padrão do esquema

    private ServerAddress(String scheme, String host, int port) {
        this.scheme = scheme;
        this.host = host;
        this.port = port;
    }

    public static ServerAddress parse(String input) {
        if (input == null) throw new IllegalArgumentException("Digite o domínio do servidor.");
        String s = input.trim();
        if (s.isEmpty()) throw new IllegalArgumentException("Digite o domínio do servidor.");
        if (s.length() > 300) throw new IllegalArgumentException("Endereço longo demais.");
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c <= ' ' || c == 0x7f) throw new IllegalArgumentException("O endereço não pode ter espaços.");
        }
        boolean hasScheme = s.matches("(?i)^[a-z][a-z0-9+.-]*://.*");
        if (!hasScheme && s.contains(":") && !s.matches("^[^:/]+:\\d+(/.*)?$") && !s.startsWith("["))
            throw new IllegalArgumentException("Endereço inválido.");
        if (!hasScheme) s = "x://" + s;
        // domínio com acento (ação.com.br): o URI do Java não aceita; vira punycode antes
        int a0 = s.indexOf("://") + 3, a1 = a0;
        while (a1 < s.length() && "/?#".indexOf(s.charAt(a1)) < 0) a1++;
        String auth = s.substring(a0, a1);
        if (!auth.chars().allMatch(c -> c < 0x80) && !auth.contains("@") && !auth.startsWith("[")) {
            int colon = auth.lastIndexOf(':');
            String h = colon < 0 ? auth : auth.substring(0, colon), rest = colon < 0 ? "" : auth.substring(colon);
            try {
                h = IDN.toASCII(h, IDN.USE_STD3_ASCII_RULES);
            } catch (IllegalArgumentException e) {
                throw new IllegalArgumentException("Domínio inválido.");
            }
            s = s.substring(0, a0) + h + rest + s.substring(a1);
        }
        URI u;
        try {
            u = new URI(s);
        } catch (URISyntaxException e) {
            throw new IllegalArgumentException("Endereço inválido.");
        }
        String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase(Locale.ROOT);
        if (hasScheme && !scheme.equals("https") && !scheme.equals("http"))
            throw new IllegalArgumentException("Use um endereço https:// (ou http:// para servidor local).");
        if (u.getRawUserInfo() != null) throw new IllegalArgumentException("O endereço não pode ter usuário ou senha.");
        String rawHost = u.getHost();
        if (rawHost == null || rawHost.isEmpty()) throw new IllegalArgumentException("Endereço inválido.");
        String host;
        if (rawHost.startsWith("[")) {
            host = rawHost.toLowerCase(Locale.ROOT); // IPv6 literal
        } else {
            String h = rawHost.endsWith(".") ? rawHost.substring(0, rawHost.length() - 1) : rawHost;
            try {
                host = IDN.toASCII(h, IDN.USE_STD3_ASCII_RULES).toLowerCase(Locale.ROOT);
            } catch (IllegalArgumentException e) {
                throw new IllegalArgumentException("Domínio inválido.");
            }
            if (!HOST.matcher(host).matches()) throw new IllegalArgumentException("Domínio inválido.");
            java.util.regex.Matcher m = IPV4.matcher(host);
            if (m.matches()) {
                for (int i = 1; i <= 4; i++)
                    if (Integer.parseInt(m.group(i)) > 255) throw new IllegalArgumentException("Endereço IP inválido.");
            } else if (host.matches(".*\\.[0-9]+$") || host.matches("^[0-9]+$")) {
                throw new IllegalArgumentException("Domínio inválido.");
            }
        }
        int port = u.getPort();
        if (port == 0 || port > 65535) throw new IllegalArgumentException("Porta inválida.");
        if (!hasScheme) scheme = isLocal(host) ? "http" : "https";
        if ((scheme.equals("https") && port == 443) || (scheme.equals("http") && port == 80)) port = -1;
        return new ServerAddress(scheme, host, port);
    }

    /** Endereço da própria máquina ou da rede local (o navegador só libera o microfone em https ou em localhost). */
    public static boolean isLocal(String host) {
        if (host.equals("localhost") || host.endsWith(".localhost") || host.endsWith(".local") || host.equals("[::1]")) return true;
        java.util.regex.Matcher m = IPV4.matcher(host);
        if (!m.matches()) return false;
        int a = Integer.parseInt(m.group(1)), b = Integer.parseInt(m.group(2));
        return a == 127 || a == 10 || (a == 192 && b == 168) || (a == 172 && b >= 16 && b <= 31);
    }

    /** Microfone e voz funcionam? Só em https ou em localhost (contexto seguro do navegador). */
    public boolean voiceWorks() {
        return scheme.equals("https") || host.equals("localhost") || host.endsWith(".localhost") || host.equals("[::1]") || host.startsWith("127.");
    }

    public String origin() {
        return scheme + "://" + host + (port == -1 ? "" : ":" + port);
    }

    /** O que mostrar e guardar: sem "https://" quando é o padrão. */
    public String display() {
        boolean defaultScheme = scheme.equals(isLocal(host) ? "http" : "https");
        return (defaultScheme ? "" : scheme + "://") + host + (port == -1 ? "" : ":" + port);
    }

    /** Endereço da página do jogo, com o código da sala (opcional) para já entrar nela. */
    public String gameUrl(String room) {
        String r = room == null ? "" : room.trim();
        if (r.isEmpty()) return origin() + "/";
        if (!ROOM.matcher(r).matches()) throw new IllegalArgumentException("O código da sala tem só letras e números (até 10).");
        return origin() + "/#sala=" + r.toUpperCase(Locale.ROOT);
    }

    public static boolean validRoom(String room) {
        String r = room == null ? "" : room.trim();
        return r.isEmpty() || ROOM.matcher(r).matches();
    }

    @Override
    public String toString() {
        return origin();
    }
}
