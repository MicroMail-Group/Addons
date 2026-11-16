//! # MicroMail Rust SDK
//!
//! Build lightweight, memory-safe, sandboxed backend addons for MicroMail.
//! Compiled with target `wasm32-wasip1`.

use std::collections::HashMap;
use std::io::{self, Read};
use serde::{Deserialize, Serialize, de::DeserializeOwned};

/// Possible actions returned by an inbound hook to MicroMail.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Action {
    /// Deliver message normally into recipient's INBOX.
    Accept,
    /// Quarantine message into recipient's Spam folder.
    Spam,
    /// Reject message at SMTP connection level with an SMTP 550 error.
    Reject,
}

impl Default for Action {
    fn default() -> Self {
        Action::Accept
    }
}

/// Attachment metadata passed to hook.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttachmentData {
    pub filename: String,
    pub content_type: String,
    pub size: i64,
    pub path: String,
}

/// Inbound email payload passed from MicroMail host.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InboundEmail {
    pub from: String,
    pub to: Vec<String>,
    pub subject: String,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    #[serde(default)]
    pub body_text: String,
    #[serde(default)]
    pub raw_blob_path: Option<String>,
    #[serde(default)]
    pub attachments: Vec<AttachmentData>,
}

/// Incoming hook event container.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookInput<TConfig = serde_json::Value> {
    pub hook: String,
    pub config: TConfig,
    pub email: InboundEmail,
}

/// Hook execution result returned to MicroMail host via stdout.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookOutput {
    pub action: Action,
    pub spam_score: f64,
    #[serde(default)]
    pub tags: Vec<String>,
}

impl HookOutput {
    /// Create an accept decision (normal inbox delivery).
    pub fn accept() -> Self {
        Self {
            action: Action::Accept,
            spam_score: 0.0,
            tags: Vec::new(),
        }
    }

    /// Route to Spam folder with given score (0.0 to 1.0).
    pub fn spam(score: f64) -> Self {
        Self {
            action: Action::Spam,
            spam_score: score.clamp(0.0, 1.0),
            tags: vec!["spam".to_string()],
        }
    }

    /// Hard reject with SMTP 550.
    pub fn reject() -> Self {
        Self {
            action: Action::Reject,
            spam_score: 1.0,
            tags: vec!["rejected-by-policy".to_string()],
        }
    }

    /// Add a tag to the email in MicroMail.
    pub fn with_tag(mut self, tag: impl Into<String>) -> Self {
        self.tags.push(tag.into());
        self
    }

    /// Add multiple tags.
    pub fn with_tags<I, S>(mut self, tags: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        for t in tags {
            self.tags.push(t.into());
        }
        self
    }

    /// Override the spam score.
    pub fn with_score(mut self, score: f64) -> Self {
        self.spam_score = score.clamp(0.0, 1.0);
        self
    }
}

/// Main entry point helper for MicroMail backend WASI modules.
///
/// Reads JSON from stdin, executes `handler(email, config)`, and writes
/// `HookOutput` JSON to stdout.
pub fn run_inbound_pre_store<C, F>(handler: F)
where
    C: DeserializeOwned + Default,
    F: FnOnce(InboundEmail, C) -> HookOutput,
{
    let mut stdin_buffer = Vec::new();
    if let Err(e) = io::stdin().read_to_end(&mut stdin_buffer) {
        eprintln!("[micromail-sdk] Stdin read error: {}", e);
        write_fallback();
        return;
    }

    let input: HookInput<C> = match serde_json::from_slice(&stdin_buffer) {
        Ok(inp) => inp,
        Err(e) => {
            eprintln!("[micromail-sdk] JSON parse error: {}", e);
            write_fallback();
            return;
        }
    };

    let output = handler(input.email, input.config);
    if let Err(e) = serde_json::to_writer(io::stdout(), &output) {
        eprintln!("[micromail-sdk] Stdout serialization error: {}", e);
    }
}

fn write_fallback() {
    let fallback = HookOutput::accept();
    let _ = serde_json::to_writer(io::stdout(), &fallback);
}

/// Macro for quick single-line main() setup:
///
/// ```rust,ignore
/// use micromail_sdk::prelude::*;
///
/// fn my_hook(email: InboundEmail, config: MyConfig) -> HookOutput {
///     HookOutput::accept().with_tag("inspected")
/// }
///
/// micromail_sdk::main_inbound_pre_store!(my_hook, MyConfig);
/// ```
#[macro_export]
macro_rules! main_inbound_pre_store {
    ($handler:path, $config_type:ty) => {
        fn main() {
            $crate::run_inbound_pre_store::<$config_type, _>($handler);
        }
    };
    ($handler:path) => {
        fn main() {
            $crate::run_inbound_pre_store::<serde_json::Value, _>($handler);
        }
    };
}

pub mod prelude {
    pub use super::{
        Action, HookInput, HookOutput, InboundEmail, run_inbound_pre_store,
    };
    pub use crate::main_inbound_pre_store;
}
