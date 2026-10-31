// Skyke3D — aplicativo para Linux (Tauri), pacote .rpm.
// Copyright (C) 2026 Noturno-Strange · SPDX-License-Identifier: GPL-3.0-only
//
// Uma janela que abre o site do jogo (o mesmo de sempre, sempre atualizado). O endereço vem de SKYKE_URL na hora de compilar
// (padrão: o servidor local de desenvolvimento). A página não recebe nenhuma permissão do Tauri: só navega no próprio site;
// links para outros endereços (GitHub, Discord, Termos externos...) abrem no navegador do computador.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;
use url::Url;

const GAME_URL: &str = match option_env!("SKYKE_URL") {
    Some(u) => u,
    None => "http://localhost:3000/",
};

fn same_site(a: &Url, b: &Url) -> bool {
    a.scheme() == b.scheme() && a.host_str() == b.host_str() && a.port_or_known_default() == b.port_or_known_default()
}

fn main() {
    let game: Url = GAME_URL.parse().expect("SKYKE_URL inválido");
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            let handle = app.handle().clone();
            let home = game.clone();
            let win = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(game.clone()))
                .title("Skyke3D")
                .inner_size(1280.0, 800.0)
                .min_inner_size(360.0, 480.0)
                .on_navigation(move |u| {
                    if same_site(u, &home) || u.scheme() == "about" || u.scheme() == "blob" || u.scheme() == "data" {
                        return true;
                    }
                    if u.scheme() == "https" || u.scheme() == "http" || u.scheme() == "mailto" {
                        let _ = handle.opener().open_url(u.as_str(), None::<&str>);
                    }
                    false
                })
                .build()?;
            #[cfg(target_os = "linux")]
            linux_media(&win, game.clone());
            #[cfg(not(target_os = "linux"))]
            let _ = &win;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erro ao abrir o Skyke3D");
}

// Linux (WebKitGTK): liga microfone e WebRTC para o chat de voz e aceita o pedido de microfone só quando vem do site do jogo.
#[cfg(target_os = "linux")]
fn linux_media(win: &tauri::WebviewWindow, game: Url) {
    let _ = win.with_webview(move |w| {
        use webkit2gtk::glib::prelude::*;
        use webkit2gtk::{PermissionRequestExt, SettingsExt, UserMediaPermissionRequest, WebViewExt};
        let wv = w.inner();
        if let Some(s) = WebViewExt::settings(&wv) {
            s.set_enable_media_stream(true);
            s.set_enable_webrtc(true);
        }
        wv.connect_permission_request(move |v, req| {
            let from_game = v.uri().and_then(|u| Url::parse(u.as_str()).ok()).map_or(false, |u| same_site(&u, &game));
            if req.is::<UserMediaPermissionRequest>() {
                if from_game { req.allow() } else { req.deny() }
                return true;
            }
            false
        });
    });
}
