fn main() {
  println!("cargo:rerun-if-changed=../dist/index.html");
  println!("cargo:rerun-if-changed=../dist/data_tables.js");
  println!("cargo:rerun-if-changed=../dist/assets/engine_data.js");
  println!("cargo:rerun-if-changed=../dist/version.json");
  tauri_build::build()
}
