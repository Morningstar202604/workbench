fn main() {
    // tauri-build 只对 tauri.conf.json 与 capabilities 声明 rerun-if-changed，
    // 图标不在其中：改了 icon.ico 却不会重新生成 resource.lib，
    // 打出来的 exe 会继续带旧图标（实测：新图标已生成，exe 里仍是旧的白角图标）。
    // 这里显式声明，保证换图标必然触发重编。
    for icon in [
        "icons/icon.ico",
        "icons/32x32.png",
        "icons/128x128.png",
        "icons/128x128@2x.png",
        "icons/256x256.png",
        "icons/icon.png",
    ] {
        if std::path::Path::new(icon).exists() {
            println!("cargo:rerun-if-changed={icon}");
        }
    }

    tauri_build::build()
}
