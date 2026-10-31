fn main() {
    println!("cargo:rerun-if-env-changed=SKYKE_URL");
    tauri_build::build()
}
