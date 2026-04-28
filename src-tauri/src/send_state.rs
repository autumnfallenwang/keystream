//! Shared state for the v2 send surface.
//!
//! Wraps `typer_core::SendControlFlag` so the `pause_send` and
//! `stop_send` Tauri commands can flip the flag from outside the
//! send loop running on a blocking task.

use typer_core::SendControlFlag;

#[derive(Default)]
pub struct SendState {
    pub control: SendControlFlag,
}
