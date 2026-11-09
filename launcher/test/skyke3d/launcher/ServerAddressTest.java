// Skyke3D — testes do launcher. Copyright (C) 2026 Noturno-Strange · SPDX-License-Identifier: GPL-3.0-only
package skyke3d.launcher;

/** Testes sem dependências (roda no build.sh): java -cp build/classes:build/test skyke3d.launcher.ServerAddressTest */
public final class ServerAddressTest {
    private static int fails = 0;

    public static void main(String[] args) {
        origin("skyke3d.com.br", "https://skyke3d.com.br");
        origin("  SKYKE3D.com.br  ", "https://skyke3d.com.br");
        origin("skyke3d.com.br.", "https://skyke3d.com.br");
        origin("https://skyke3d.com.br/", "https://skyke3d.com.br");
        origin("https://skyke3d.com.br:443/sala?x=1#y", "https://skyke3d.com.br");
        origin("https://jogo.exemplo.com:8443", "https://jogo.exemplo.com:8443");
        origin("jogo.exemplo.com:8443", "https://jogo.exemplo.com:8443");
        origin("HTTP://jogo.exemplo.com", "http://jogo.exemplo.com");
        origin("localhost:3000", "http://localhost:3000");
        origin("localhost", "http://localhost");
        origin("127.0.0.1:3000", "http://127.0.0.1:3000");
        origin("192.168.0.10:3000", "http://192.168.0.10:3000");
        origin("https://localhost:3000", "https://localhost:3000");
        origin("http://[::1]:3000", "http://[::1]:3000");
        origin("ação.com.br", "https://xn--ao-siap.com.br");
        origin("8.8.8.8", "https://8.8.8.8");

        bad("");
        bad("   ");
        bad("ftp://skyke3d.com.br");
        bad("javascript:alert(1)");
        bad("file:///etc/passwd");
        bad("https://user:senha@skyke3d.com.br");
        bad("sky ke3d.com.br");
        bad("skyke3d..com.br");
        bad("-skyke3d.com.br");
        bad("skyke3d_com.br");
        bad("999.1.1.1");
        bad("1.2.3");
        bad("skyke3d.com.br:0");
        bad("skyke3d.com.br:70000");
        bad("https://");
        bad("data:text/html,oi");

        eq(ServerAddress.parse("skyke3d.com.br").display(), "skyke3d.com.br");
        eq(ServerAddress.parse("http://skyke3d.com.br").display(), "http://skyke3d.com.br");
        eq(ServerAddress.parse("localhost:3000").display(), "localhost:3000");
        eq(ServerAddress.parse("https://localhost:3000").display(), "https://localhost:3000");
        eq(ServerAddress.parse(ServerAddress.parse("jogo.exemplo.com:8443").display()).origin(), "https://jogo.exemplo.com:8443");

        eq(ServerAddress.parse("skyke3d.com.br").gameUrl(""), "https://skyke3d.com.br/");
        eq(ServerAddress.parse("skyke3d.com.br").gameUrl(null), "https://skyke3d.com.br/");
        eq(ServerAddress.parse("skyke3d.com.br").gameUrl(" abc12 "), "https://skyke3d.com.br/#sala=ABC12");
        try {
            ServerAddress.parse("skyke3d.com.br").gameUrl("a&b=c");
            fail("sala inválida aceita");
        } catch (IllegalArgumentException e) {
            // ok
        }
        check(!ServerAddress.validRoom("12345678901"), "sala com 11 caracteres");

        check(ServerAddress.parse("skyke3d.com.br").voiceWorks(), "voz em https");
        check(ServerAddress.parse("localhost:3000").voiceWorks(), "voz em localhost");
        check(!ServerAddress.parse("192.168.0.10:3000").voiceWorks(), "sem voz em http na rede local");
        check(!ServerAddress.parse("http://jogo.exemplo.com").voiceWorks(), "sem voz em http");

        if (fails > 0) {
            System.err.println(fails + " teste(s) falharam");
            System.exit(1);
        }
        System.out.println("ServerAddressTest: tudo certo");
    }

    private static void origin(String in, String want) {
        try {
            eq(ServerAddress.parse(in).origin(), want);
        } catch (IllegalArgumentException e) {
            fail("'" + in + "' recusado: " + e.getMessage());
        }
    }

    private static void bad(String in) {
        try {
            ServerAddress a = ServerAddress.parse(in);
            fail("'" + in + "' aceito como " + a.origin());
        } catch (IllegalArgumentException e) {
            // ok
        }
    }

    private static void eq(String got, String want) {
        if (!got.equals(want)) fail("esperava " + want + ", veio " + got);
    }

    private static void check(boolean b, String what) {
        if (!b) fail(what);
    }

    private static void fail(String m) {
        fails++;
        System.err.println("FALHOU: " + m);
    }
}
