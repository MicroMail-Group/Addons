use micromail_sdk::prelude::*;
use serde::Deserialize;

#[derive(Debug, Deserialize, Default)]
struct SpamConfig {
    #[serde(default = "default_threshold")]
    threshold: f64,
}

fn default_threshold() -> f64 {
    0.75
}

fn evaluate_email(email: InboundEmail, config: SpamConfig) -> HookOutput {
    let mut score = 0.0;
    let mut tags = Vec::new();

    // 1. Check DKIM authentication result injected by MicroMail
    if let Some(auth_results) = email.headers.get("Authentication-Results") {
        if auth_results.contains("dkim=pass") {
            tags.push("verified-sender".to_string());
            score -= 0.1;
        } else if auth_results.contains("dkim=fail") {
            tags.push("dkim-fail".to_string());
            score += 0.4;
        }
    }

    // 2. Keyword heuristic checks
    let content = format!("{} {}", email.subject, email.body_text).to_lowercase();
    let spam_phrases = [
        "cryptocurrency investment",
        "wire transfer immediately",
        "claim your prize",
        "nigerian prince",
        "viagra",
    ];

    for phrase in &spam_phrases {
        if content.contains(phrase) {
            tags.push("spam-keyword".to_string());
            score += 0.45;
        }
    }

    // 3. Decide action based on user-configured threshold
    if score >= config.threshold {
        HookOutput::spam(score).with_tags(tags)
    } else {
        HookOutput::accept().with_score(score).with_tags(tags)
    }
}

// Generate the WASI main() entrypoint
micromail_sdk::main_inbound_pre_store!(evaluate_email, SpamConfig);
