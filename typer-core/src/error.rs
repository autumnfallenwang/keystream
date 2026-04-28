//! Error type for typer-core. Every fallible operation returns `Result<T>`.

use thiserror::Error;

#[derive(Debug, Error)]
pub enum TyperError {
    #[error("event source: could not create CGEventSource (state={state_id})")]
    EventSourceFailed { state_id: &'static str },

    #[error("keyboard event: could not create CGEvent for keycode {keycode}")]
    KeyboardEventFailed { keycode: u16 },

    #[error("I/O error on {path}: {source}")]
    Io {
        path: String,
        #[source]
        source: std::io::Error,
    },

    #[error("home directory not available")]
    HomeDirNotFound,
}

pub type Result<T> = std::result::Result<T, TyperError>;
