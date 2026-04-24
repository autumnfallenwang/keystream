//! Shared state for the `send_with_chunked_verify` command.
//!
//! - `cancel` — cooperative cancel flag. `send_with_chunked_verify`
//!   checks it between chunks; future `stop_send` command (task 28)
//!   flips it.
//! - `ack` — single-slot mpsc sender. The orchestrator holds the
//!   receiver locally and awaits it on chunk-fail; `continue_after_fail`
//!   pushes into the sender. Mutex-wrapped so only one send session
//!   is live at a time (v1 UX disables Send during an ongoing send).

use serde::{Deserialize, Serialize};
use std::sync::atomic::AtomicBool;
use tokio::sync::{mpsc, Mutex};

/// Decision the frontend sends via `continue_after_fail` after a
/// `chunk-fail` event, per Q10. Corresponds to the UI's three buttons.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ContinueAction {
    /// Mark the chunk failed-acked, advance to the next chunk.
    Skip,
    /// Abort the whole send.
    Stop,
    /// Re-verify the same chunk after the user fixed AVD manually.
    Retry,
}

#[derive(Default)]
pub struct SendState {
    pub cancel: AtomicBool,
    pub ack: Mutex<Option<mpsc::Sender<ContinueAction>>>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn continue_action_serializes_as_camel_case() {
        // The frontend expects "skip", "stop", "retry" — rename_all = "camelCase".
        assert_eq!(
            serde_json::to_string(&ContinueAction::Skip).unwrap(),
            "\"skip\""
        );
        assert_eq!(
            serde_json::to_string(&ContinueAction::Stop).unwrap(),
            "\"stop\""
        );
        assert_eq!(
            serde_json::to_string(&ContinueAction::Retry).unwrap(),
            "\"retry\""
        );
    }

    #[test]
    fn continue_action_deserializes_from_camel_case() {
        let action: ContinueAction = serde_json::from_str("\"skip\"").unwrap();
        assert_eq!(action, ContinueAction::Skip);
        let action: ContinueAction = serde_json::from_str("\"retry\"").unwrap();
        assert_eq!(action, ContinueAction::Retry);
    }
}
