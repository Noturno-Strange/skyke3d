// Skyke3D — testes do launcher. Copyright (C) 2026 Noturno-Strange · SPDX-License-Identifier: GPL-3.0-only
package skyke3d.launcher;

/** O que o servidor aceita de launcher: versão mínima e .jar oficiais (LauncherPolicy.decide, sem rede). */
public final class LauncherPolicyTest {
    private static int fails = 0;

    public static void main(String[] args) {
        String h1 = "a".repeat(64), h2 = "b".repeat(64);
        eq(LauncherPolicy.decide("{\"v\":1,\"min\":\"1.1.0\",\"latest\":\"1.2.0\"}", "1.1.0", null).status, LauncherPolicy.Status.OK);
        eq(LauncherPolicy.decide("{\"min\":\"1.1.0\"}", "1.0.9", null).status, LauncherPolicy.Status.OUTDATED);
        eq(LauncherPolicy.decide("{\"min\":\"1.10.0\"}", "1.9.9", null).status, LauncherPolicy.Status.OUTDATED);
        eq(LauncherPolicy.decide("{\"min\":\"1.1.0\"}", "2.0.0", null).status, LauncherPolicy.Status.OK);
        // build local (sem versão) não é barrado pela versão
        eq(LauncherPolicy.decide("{\"min\":\"9.0.0\"}", "dev", null).status, LauncherPolicy.Status.OK);
        // com a lista de .jar oficiais: só eles passam (build local, sem .jar, também não)
        String withHashes = "{\"min\":\"1.0.0\",\"sha256\":[\"" + h1 + "\",\"" + h2.toUpperCase() + "\"]}";
        eq(LauncherPolicy.decide(withHashes, "1.1.0", h1).status, LauncherPolicy.Status.OK);
        eq(LauncherPolicy.decide(withHashes, "1.1.0", h2).status, LauncherPolicy.Status.OK);
        eq(LauncherPolicy.decide(withHashes, "1.1.0", "c".repeat(64)).status, LauncherPolicy.Status.UNOFFICIAL);
        eq(LauncherPolicy.decide(withHashes, "1.1.0", null).status, LauncherPolicy.Status.UNOFFICIAL);
        // lixo do servidor não vira recusa (nem trava ninguém)
        eq(LauncherPolicy.decide("{\"min\":\"abc\",\"sha256\":[\"xyz\"]}", "1.1.0", null).status, LauncherPolicy.Status.OK);
        eq(LauncherPolicy.decide("<html>", "1.1.0", null).status, LauncherPolicy.Status.OK);
        if (LauncherPolicy.compare("1.2.3", "1.2.3") != 0 || LauncherPolicy.compare("1.2.10", "1.2.9") <= 0) fail("compare");
        // o download é sempre o oficial, em https
        if (!LauncherPolicy.OFFICIAL_PAGE.startsWith("https://github.com/Noturno-Strange/skyke3d/")) fail("página oficial");
        if (fails > 0) {
            System.err.println(fails + " teste(s) falharam");
            System.exit(1);
        }
        System.out.println("LauncherPolicyTest: tudo certo");
    }

    private static void eq(Object got, Object want) {
        if (!got.equals(want)) fail("esperava " + want + ", veio " + got);
    }

    private static void fail(String m) {
        fails++;
        System.err.println("FALHOU: " + m);
    }
}
