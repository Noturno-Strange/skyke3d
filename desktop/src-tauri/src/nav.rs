// Skyke3D — para onde a janela do jogo pode navegar. Copyright (C) 2026 Noturno-Strange · SPDX-License-Identifier: GPL-3.0-only
//
// Só depende do crate `url` (não do Tauri), para ser testado sozinho: `cargo test` num crate que inclua este arquivo.
use url::Url;

/// Mesmo esquema, mesmo host e mesma porta.
pub fn same_site(a: &Url, b: &Url) -> bool {
    a.scheme() == b.scheme() && a.host_str() == b.host_str() && a.port_or_known_default() == b.port_or_known_default()
}

/// A janela pode abrir `u` dentro dela? Só o próprio site do jogo (`home`), `about:blank` e `blob:` criados pelo próprio site
/// (o endereço de um blob leva a origem de quem o criou: `blob:https://jogo.exemplo.com/<uuid>`).
/// `data:` não: uma página de dados navegável dentro da janela é um jeito de montar uma tela falsa com a aparência do jogo.
/// O resto (https, http, mailto) o chamador abre no navegador do computador, nunca aqui.
pub fn allowed(u: &Url, home: &Url) -> bool {
    if same_site(u, home) {
        return true;
    }
    match u.scheme() {
        "about" => u.as_str() == "about:blank",
        "blob" => Url::parse(u.path()).map_or(false, |inner| same_site(&inner, home)),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn u(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    #[test]
    fn o_proprio_site_pode() {
        let home = u("https://jogo.exemplo.com/");
        assert!(allowed(&u("https://jogo.exemplo.com/profile#abc"), &home));
        assert!(allowed(&u("https://jogo.exemplo.com:443/x"), &home));
        assert!(allowed(&u("about:blank"), &home));
    }

    #[test]
    fn outros_sites_e_esquemas_nao_abrem_na_janela() {
        let home = u("https://jogo.exemplo.com/");
        for s in [
            "https://exemplo.com/",
            "https://jogo.exemplo.com.evil.example/",
            "http://jogo.exemplo.com/",
            "https://jogo.exemplo.com:8443/",
            "https://evil.example/",
            "mailto:a@b.c",
            "javascript:alert(1)",
            "file:///etc/passwd",
            "ftp://jogo.exemplo.com/",
            "about:srcdoc",
            "about:config",
        ] {
            assert!(!allowed(&u(s), &home), "{s}");
        }
    }

    #[test]
    fn data_nao_abre_na_janela() {
        let home = u("https://jogo.exemplo.com/");
        assert!(!allowed(&u("data:text/html,<h1>Entre com sua senha</h1>"), &home));
        assert!(!allowed(&u("data:text/html;base64,PGgxPng8L2gxPg=="), &home));
    }

    #[test]
    fn blob_so_se_foi_criado_pelo_proprio_site() {
        let home = u("https://jogo.exemplo.com/");
        assert!(allowed(&u("blob:https://jogo.exemplo.com/6f1c2d3e-0000-4000-8000-000000000000"), &home));
        assert!(!allowed(&u("blob:https://evil.example/6f1c2d3e-0000-4000-8000-000000000000"), &home));
        assert!(!allowed(&u("blob:null/6f1c2d3e-0000-4000-8000-000000000000"), &home));
        assert!(!allowed(&u("blob:http://jogo.exemplo.com/x"), &home));
        assert!(!allowed(&u("blob:data:text/html,x"), &home));
    }
}
