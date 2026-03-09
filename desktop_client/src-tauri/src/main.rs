//! OpenDesk AI Desktop Client — Binary Entry Point
//!
//! This simply delegates to the library's `run()` function.
//! All application logic is in lib.rs.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    opendesk_desktop_client_lib::run();
}
