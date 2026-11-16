use micromail_sdk::prelude::*;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct AntivirusConfig {
    #[serde(default = "default_block_executables")]
    block_executables: bool,
    #[serde(default = "default_action")]
    action_on_threat: String, // "reject" or "spam"
}

impl Default for AntivirusConfig {
    fn default() -> Self {
        Self {
            block_executables: true,
            action_on_threat: "reject".to_string(),
        }
    }
}

fn default_block_executables() -> bool {
    true
}

fn default_action() -> String {
    "reject".to_string()
}

// Dangerous executable file extensions commonly used for malware delivery
const RISKY_EXTENSIONS: &[&str] = &[
    ".exe", ".bat", ".cmd", ".scr", ".vbs", ".js", ".hta", ".pif",
    ".cpl", ".iso", ".img", ".jar", ".wsf", ".ps1", ".reg",
];

// Standard EICAR anti-virus test signature
const EICAR_SIGNATURE: &str = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

fn scan_email_for_threats(email: InboundEmail, config: AntivirusConfig) -> HookOutput {
    let mut threat_detected = false;
    let mut threat_tags = Vec::new();

    // 1. Scan for EICAR anti-virus test file signature in email body
    if email.body_text.contains(EICAR_SIGNATURE) {
        threat_detected = true;
        threat_tags.push("virus-detected:EICAR-Test-Signature".to_string());
    }

    // 2. Scan attachments for dangerous extensions & evasion techniques
    for att in &email.attachments {
        let name_lower = att.filename.to_lowercase();

        // Check dangerous extensions
        if config.block_executables {
            for ext in RISKY_EXTENSIONS {
                if name_lower.ends_with(ext) {
                    threat_detected = true;
                    threat_tags.push(format!("blocked-executable:{}", ext));
                    break;
                }
            }

            // Check double extensions evasion (e.g., "invoice.pdf.exe" or "doc.docx.scr")
            let parts: Vec<&str> = name_lower.split('.').collect();
            if parts.len() > 2 {
                let last_ext = format!(".{}", parts.last().unwrap_or(&""));
                let prev_ext = parts[parts.len() - 2];
                if RISKY_EXTENSIONS.contains(&last_ext.as_str())
                    && (prev_ext == "pdf" || prev_ext == "doc" || prev_ext == "docx" || prev_ext == "xls")
                {
                    threat_detected = true;
                    threat_tags.push("evasion:double-extension".to_string());
                }
            }
        }
    }

    // 3. Output decision
    if threat_detected {
        if config.action_on_threat == "reject" {
            // Hard reject with SMTP 550 error
            HookOutput::reject()
                .with_tags(threat_tags)
                .with_tag("malware-blocked")
        } else {
            // Quarantine into Spam folder
            HookOutput::spam(1.0)
                .with_tags(threat_tags)
                .with_tag("malware-quarantine")
        }
    } else {
        // Clean email - deliver to INBOX
        HookOutput::accept().with_tag("antivirus-clean")
    }
}

// Generate the WASI main() function handling stdin/stdout JSON
micromail_sdk::main_inbound_pre_store!(scan_email_for_threats, AntivirusConfig);
